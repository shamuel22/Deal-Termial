import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { validateConstraints, type AttributeConstraints } from '../catalog/categories.js';
import { inTransaction, type Executor, type Tx } from '../db.js';
import { requireAdmin, type Actor, type AgentActor } from '../identity/actor.js';
import { authorizationBudgetSummary, monthlyBudgetSummary, type BudgetSummary } from './budget.js';
import type { AuthorizationSnapshot } from './policy.js';
import {
  authorizationTerms,
  createAuthorizationInput,
  monthlyLimitInput,
  type AuthorizationTerms,
  type AuthorizationTermsInput,
  type CreateAuthorizationInput,
  type DeliveryAddress,
  type MonthlyLimitInput,
} from './schemas.js';

type AuthorizationStatus = AuthorizationSnapshot['status'];

export interface AuthorizationView {
  id: string;
  agentId: string;
  status: AuthorizationStatus;
  version: number;
  terms: {
    mandate: string;
    category: string;
    requiredAttributes: AttributeConstraints;
    quantityMin: number;
    quantityMax: number;
    unit: string;
    allowedSupplierOrgIds: string[] | null;
    budgetTotal: string;
    currency: string;
    deliveryAddress: DeliveryAddress;
    deliverBy: string;
    expiresAt: Date;
  };
  grantedByUserId: string;
  budget: BudgetSummary;
  createdAt: Date;
  revokedAt: Date | null;
}

function assertUuid(value: string, what: string): void {
  if (!z.uuid().safeParse(value).success)
    throw new DomainError('NOT_FOUND', `${what} no encontrada`);
}

function checkTerms(terms: AuthorizationTerms, now: Date): void {
  validateConstraints(terms.category, terms.requiredAttributes);
  if (terms.expiresAt.getTime() <= now.getTime()) {
    throw new DomainError('VALIDATION_FAILED', 'La autorización debe vencer en el futuro', {
      field: 'expiresAt',
    });
  }
}

function versionValues(
  authorizationId: string,
  version: number,
  userId: string,
  level: 'search_only' | 'negotiate' | 'full_autonomy',
  t: AuthorizationTerms,
) {
  return {
    authorizationId,
    version,
    grantedByUserId: userId,
    level,
    mandate: t.mandate,
    category: t.category,
    requiredAttributes: t.requiredAttributes,
    quantityMin: t.quantityMin,
    quantityMax: t.quantityMax,
    unit: t.unit,
    allowedSupplierOrgIds: t.allowedSupplierOrgIds,
    budgetTotal: t.budgetTotal,
    currency: t.currency,
    deliveryAddress: t.deliveryAddress,
    deliverBy: t.deliverBy,
    expiresAt: t.expiresAt,
  };
}

/** Nivel de compra vigente de un agente de la organización; null si no compra. */
async function agentBuyerLevel(tx: Executor, orgId: string, agentId: string) {
  const [row] = await tx
    .select({
      disabledAt: schema.agents.disabledAt,
      buyerLevel: schema.agentAccessGrants.buyerLevel,
    })
    .from(schema.agents)
    .innerJoin(schema.agentAccessGrants, eq(schema.agentAccessGrants.agentId, schema.agents.id))
    .where(
      and(
        eq(schema.agents.id, agentId),
        eq(schema.agents.orgId, orgId),
        isNull(schema.agentAccessGrants.supersededAt),
      ),
    );
  if (!row) throw new DomainError('NOT_FOUND', 'Agente no encontrado');
  if (row.disabledAt) throw new DomainError('INVALID_STATE', 'El agente está deshabilitado');
  return row.buyerLevel;
}

/** Marca como vencidas las autorizaciones activas cuya fecha ya pasó. */
export async function expireAuthorizations(db: Executor, now: Date): Promise<number> {
  const due = await db
    .select({ id: schema.purchaseAuthorizations.id })
    .from(schema.purchaseAuthorizations)
    .innerJoin(
      schema.purchaseAuthorizationVersions,
      and(
        eq(schema.purchaseAuthorizationVersions.authorizationId, schema.purchaseAuthorizations.id),
        eq(
          schema.purchaseAuthorizationVersions.version,
          schema.purchaseAuthorizations.currentVersion,
        ),
      ),
    )
    .where(
      and(
        eq(schema.purchaseAuthorizations.status, 'active'),
        lte(schema.purchaseAuthorizationVersions.expiresAt, now),
      ),
    );
  if (due.length === 0) return 0;
  await db
    .update(schema.purchaseAuthorizations)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        inArray(
          schema.purchaseAuthorizations.id,
          due.map((d) => d.id),
        ),
        eq(schema.purchaseAuthorizations.status, 'active'),
      ),
    );
  return due.length;
}

async function loadRow(db: Executor, orgId: string, authorizationId: string, lock = false) {
  assertUuid(authorizationId, 'Autorización');
  const query = db
    .select({ auth: schema.purchaseAuthorizations, version: schema.purchaseAuthorizationVersions })
    .from(schema.purchaseAuthorizations)
    .innerJoin(
      schema.purchaseAuthorizationVersions,
      and(
        eq(schema.purchaseAuthorizationVersions.authorizationId, schema.purchaseAuthorizations.id),
        eq(
          schema.purchaseAuthorizationVersions.version,
          schema.purchaseAuthorizations.currentVersion,
        ),
      ),
    )
    .where(
      and(
        eq(schema.purchaseAuthorizations.id, authorizationId),
        eq(schema.purchaseAuthorizations.orgId, orgId),
      ),
    );
  const [row] = lock
    ? await query.for('no key update', { of: schema.purchaseAuthorizations })
    : await query;
  if (!row) throw new DomainError('NOT_FOUND', 'Autorización no encontrada');
  return row;
}

type Row = Awaited<ReturnType<typeof loadRow>>;

function effectiveStatus(row: Row, now: Date): AuthorizationStatus {
  if (row.auth.status === 'active' && row.version.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return row.auth.status;
}

function toSnapshot(row: Row, now: Date): AuthorizationSnapshot {
  return {
    id: row.auth.id,
    status: effectiveStatus(row, now),
    agentId: row.auth.agentId,
    version: row.version.version,
    category: row.version.category,
    requiredAttributes: row.version.requiredAttributes as AttributeConstraints,
    quantityMin: row.version.quantityMin,
    quantityMax: row.version.quantityMax,
    unit: row.version.unit,
    allowedSupplierOrgIds: row.version.allowedSupplierOrgIds,
    budgetTotal: row.version.budgetTotal,
    currency: row.version.currency,
    deliveryAddress: row.version.deliveryAddress as DeliveryAddress,
    deliverBy: row.version.deliverBy,
    expiresAt: row.version.expiresAt,
  };
}

async function toView(db: Executor, row: Row, now: Date): Promise<AuthorizationView> {
  const snap = toSnapshot(row, now);
  return {
    id: snap.id,
    agentId: snap.agentId,
    status: snap.status,
    version: snap.version,
    terms: {
      mandate: row.version.mandate,
      category: snap.category,
      requiredAttributes: snap.requiredAttributes,
      quantityMin: snap.quantityMin,
      quantityMax: snap.quantityMax,
      unit: snap.unit,
      allowedSupplierOrgIds: snap.allowedSupplierOrgIds,
      budgetTotal: snap.budgetTotal,
      currency: snap.currency,
      deliveryAddress: snap.deliveryAddress,
      deliverBy: snap.deliverBy,
      expiresAt: snap.expiresAt,
    },
    grantedByUserId: row.version.grantedByUserId,
    budget: await authorizationBudgetSummary(db, snap.id),
    createdAt: row.auth.createdAt,
    revokedAt: row.auth.revokedAt,
  };
}

export async function createAuthorization(
  db: Executor,
  actor: Actor,
  input: CreateAuthorizationInput,
  now = new Date(),
): Promise<AuthorizationView> {
  const admin = requireAdmin(actor);
  const data = createAuthorizationInput.parse(input);
  checkTerms(data.terms, now);
  const id = await inTransaction(db, async (tx) => {
    const level = await agentBuyerLevel(tx, admin.orgId, data.agentId);
    if (!level) {
      throw new DomainError('LEVEL_INSUFFICIENT', 'El agente no tiene facultades de compra', {
        agentId: data.agentId,
      });
    }
    const [auth] = await tx
      .insert(schema.purchaseAuthorizations)
      .values({ orgId: admin.orgId, agentId: data.agentId, status: 'active', currentVersion: 1 })
      .returning({ id: schema.purchaseAuthorizations.id });
    await tx
      .insert(schema.purchaseAuthorizationVersions)
      .values(versionValues(auth!.id, 1, admin.userId, level, data.terms));
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'authorization.created',
      resourceType: 'purchase_authorization',
      resourceId: auth!.id,
      outcome: 'succeeded',
      details: { agentId: data.agentId, level, budgetTotal: data.terms.budgetTotal },
    });
    return auth!.id;
  });
  return getAuthorization(db, actor, id, now);
}

/** Modifica condiciones creando una versión nueva. Los pedidos ya aceptados conservan la suya. */
export async function amendAuthorization(
  db: Executor,
  actor: Actor,
  authorizationId: string,
  input: AuthorizationTermsInput,
  now = new Date(),
): Promise<AuthorizationView> {
  const admin = requireAdmin(actor);
  const terms = authorizationTerms.parse(input);
  checkTerms(terms, now);
  await inTransaction(db, async (tx) => {
    const row = await loadRow(tx, admin.orgId, authorizationId, true);
    const status = effectiveStatus(row, now);
    if (status === 'revoked') {
      throw new DomainError(
        'AUTHORIZATION_REVOKED',
        'Una autorización revocada no se puede modificar',
      );
    }
    const level = await agentBuyerLevel(tx, admin.orgId, row.auth.agentId);
    if (!level)
      throw new DomainError('LEVEL_INSUFFICIENT', 'El agente no tiene facultades de compra');
    const version = row.auth.currentVersion + 1;
    await tx
      .insert(schema.purchaseAuthorizationVersions)
      .values(versionValues(row.auth.id, version, admin.userId, level, terms));
    // Ampliar plazo o presupuesto reactiva una autorización vencida o agotada.
    await tx
      .update(schema.purchaseAuthorizations)
      .set({ currentVersion: version, status: 'active', updatedAt: now })
      .where(eq(schema.purchaseAuthorizations.id, row.auth.id));
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'authorization.amended',
      resourceType: 'purchase_authorization',
      resourceId: row.auth.id,
      outcome: 'succeeded',
      details: {
        fromVersion: row.auth.currentVersion,
        toVersion: version,
        budgetTotal: terms.budgetTotal,
      },
    });
  });
  return getAuthorization(db, actor, authorizationId, now);
}

/**
 * Revoca la autorización: bloquea nuevas aceptaciones y pagos no despachados. Las operaciones
 * financieras ya enviadas siguen su reconciliación (brief §10).
 */
export async function revokeAuthorization(
  db: Executor,
  actor: Actor,
  authorizationId: string,
  now = new Date(),
): Promise<AuthorizationView> {
  const admin = requireAdmin(actor);
  await inTransaction(db, async (tx) => {
    const row = await loadRow(tx, admin.orgId, authorizationId, true);
    if (row.auth.status === 'revoked') return;
    await tx
      .update(schema.purchaseAuthorizations)
      .set({ status: 'revoked', revokedAt: now, revokedByUserId: admin.userId, updatedAt: now })
      .where(eq(schema.purchaseAuthorizations.id, row.auth.id));
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'authorization.revoked',
      resourceType: 'purchase_authorization',
      resourceId: row.auth.id,
      outcome: 'succeeded',
    });
  });
  return getAuthorization(db, actor, authorizationId, now);
}

export async function getAuthorization(
  db: Executor,
  actor: Actor,
  authorizationId: string,
  now = new Date(),
): Promise<AuthorizationView> {
  const row = await loadRow(db, actor.orgId, authorizationId);
  if (actor.kind === 'agent' && row.auth.agentId !== actor.agentId) {
    throw new DomainError('NOT_FOUND', 'Autorización no encontrada');
  }
  if (actor.kind === 'user') requireAdmin(actor);
  return toView(db, row, now);
}

export async function listAuthorizations(
  db: Executor,
  actor: Actor,
  filter: { agentId?: string } = {},
  now = new Date(),
): Promise<AuthorizationView[]> {
  const conditions = [eq(schema.purchaseAuthorizations.orgId, actor.orgId)];
  if (actor.kind === 'agent') {
    conditions.push(eq(schema.purchaseAuthorizations.agentId, actor.agentId));
  } else {
    requireAdmin(actor);
    if (filter.agentId) {
      assertUuid(filter.agentId, 'Agente');
      conditions.push(eq(schema.purchaseAuthorizations.agentId, filter.agentId));
    }
  }
  const ids = await db
    .select({ id: schema.purchaseAuthorizations.id })
    .from(schema.purchaseAuthorizations)
    .where(and(...conditions))
    .orderBy(desc(schema.purchaseAuthorizations.createdAt));
  return Promise.all(
    ids.map(async ({ id }) => toView(db, await loadRow(db, actor.orgId, id), now)),
  );
}

/**
 * Carga la autorización que un agente invoca para comprar, verificando que sea suya.
 * Con `lock`, bloquea la fila para serializar aceptación y pago con revocaciones concurrentes.
 */
export async function loadAgentAuthorization(
  tx: Tx,
  actor: AgentActor,
  authorizationId: string,
  now: Date,
  lock = true,
): Promise<AuthorizationSnapshot> {
  const row = await loadRow(tx, actor.orgId, authorizationId, lock);
  if (row.auth.agentId !== actor.agentId) {
    throw new DomainError('NOT_FOUND', 'Autorización no encontrada');
  }
  return toSnapshot(row, now);
}

/** Carga cualquier autorización de la organización (uso interno: revisión del dueño, pagos). */
export async function loadAuthorizationSnapshot(
  tx: Executor,
  orgId: string,
  authorizationId: string,
  now: Date,
  lock = false,
): Promise<AuthorizationSnapshot> {
  return toSnapshot(await loadRow(tx, orgId, authorizationId, lock), now);
}

export async function setMonthlyLimit(
  db: Executor,
  actor: Actor,
  input: MonthlyLimitInput,
): Promise<{ monthlySpendLimit: string | null }> {
  const admin = requireAdmin(actor);
  const data = monthlyLimitInput.parse(input);
  await inTransaction(db, async (tx) => {
    await tx
      .update(schema.organizations)
      .set({ monthlySpendLimit: data.monthlySpendLimit, updatedAt: new Date() })
      .where(eq(schema.organizations.id, admin.orgId));
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'organization.monthly_limit_set',
      resourceType: 'organization',
      resourceId: admin.orgId,
      outcome: 'succeeded',
      details: { monthlySpendLimit: data.monthlySpendLimit },
    });
  });
  return { monthlySpendLimit: data.monthlySpendLimit };
}

/** Estado de autorización visible para el agente (herramienta get_authorization_status). */
export async function getAgentAuthorizationStatus(
  db: Executor,
  actor: AgentActor,
  now = new Date(),
) {
  const [authorizations, monthly, financial] = await Promise.all([
    listAuthorizations(db, actor, {}, now),
    monthlyBudgetSummary(db, actor.orgId, now),
    db
      .select({
        scope: schema.paymentConnections.scope,
        payeeMerchantId: schema.paymentConnections.payeeMerchantId,
      })
      .from(schema.paymentConnections)
      .where(
        and(
          eq(schema.paymentConnections.orgId, actor.orgId),
          eq(schema.paymentConnections.status, 'active'),
        ),
      ),
  ]);
  return {
    agent: {
      agentId: actor.agentId,
      buyerLevel: actor.grant.buyerLevel,
      sellerScopes: actor.grant.sellerScopes,
      accessVersion: actor.grant.version,
    },
    // Sin identificadores de token: solo si existe autorización financiera y su alcance.
    financialAuthorization: {
      active: financial.length > 0,
      scopes: financial.map((f) =>
        f.scope === 'platform' ? 'platform' : `merchant:${f.payeeMerchantId}`,
      ),
    },
    monthlyBudget: monthly,
    authorizations,
  };
}
