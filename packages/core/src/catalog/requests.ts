import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { loadAgentAuthorization } from '../authorization/authorizations.js';
import { assertBuyerAction } from '../authorization/policy.js';
import { deliveryAddress, isoDate, moneyString } from '../authorization/schemas.js';
import { authorizationBudgetSummary } from '../authorization/budget.js';
import { inTransaction, type Executor } from '../db.js';
import { actorRef, requireAdmin, type Actor } from '../identity/actor.js';
import { CATEGORY_IDS, attributeConstraints, validateConstraints } from './categories.js';
import { findMatches, type SearchOptionsInput } from './search.js';

/**
 * Necesidad privada del comprador (`create_request`). Guardarla no contacta proveedores:
 * está permitido incluso en "solo búsqueda" (brief §3).
 */
export const requestCriteria = z.object({
  category: z.enum(CATEGORY_IDS),
  requiredAttributes: attributeConstraints.default({}),
  quantity: z.number().int().positive(),
  unit: z.string().trim().min(1).max(30).default('unit'),
  deliveryAddress,
  deliverBy: isoDate,
  maxTotal: moneyString.optional(),
});

export const createRequestInput = z
  .object({
    authorizationId: z.uuid().optional(),
    criteria: requestCriteria.optional(),
    preferences: z
      .object({
        preferredMaterials: z.array(z.string()).max(10).optional(),
        notes: z.string().trim().max(1000).optional(),
      })
      .optional(),
  })
  .refine((v) => v.authorizationId || v.criteria, {
    message: 'Indica criteria o una authorizationId de la que tomarlos',
  });
export type CreateRequestInput = z.input<typeof createRequestInput>;
export type RequestCriteria = z.output<typeof requestCriteria>;

export interface RequestView {
  id: string;
  status: 'open' | 'closed' | 'cancelled' | 'expired';
  authorizationId: string | null;
  category: string;
  criteria: RequestCriteria;
  preferences: unknown;
  createdBy: { agentId: string | null; userId: string | null };
  createdAt: Date;
}

function assertCanBuy(actor: Actor): void {
  if (actor.kind === 'agent') assertBuyerAction(actor, 'save_request');
  else requireAdmin(actor);
}

function toView(row: typeof schema.purchaseRequests.$inferSelect): RequestView {
  return {
    id: row.id,
    status: row.status,
    authorizationId: row.authorizationId,
    category: row.category,
    criteria: row.criteria as RequestCriteria,
    preferences: row.preferences,
    createdBy: { agentId: row.agentId, userId: row.createdByUserId },
    createdAt: row.createdAt,
  };
}

export async function createRequest(
  db: Executor,
  actor: Actor,
  input: CreateRequestInput,
  now = new Date(),
): Promise<RequestView> {
  assertCanBuy(actor);
  const data = createRequestInput.parse(input);
  return inTransaction(db, async (tx) => {
    let criteria: RequestCriteria;
    if (data.authorizationId) {
      if (actor.kind !== 'agent') {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Solo un agente vincula solicitudes a su autorización',
        );
      }
      // Los criterios obligatorios salen de la autorización; el agente no puede ampliarlos.
      const auth = await loadAgentAuthorization(tx, actor, data.authorizationId, now, false);
      const budget = await authorizationBudgetSummary(tx, auth.id);
      criteria = {
        category: auth.category as RequestCriteria['category'],
        requiredAttributes: auth.requiredAttributes,
        quantity: data.criteria?.quantity ?? auth.quantityMax,
        unit: auth.unit,
        deliveryAddress: auth.deliveryAddress,
        deliverBy: auth.deliverBy,
        maxTotal: budget.available,
      };
    } else {
      criteria = data.criteria!;
    }
    validateConstraints(criteria.category, criteria.requiredAttributes);

    const [row] = await tx
      .insert(schema.purchaseRequests)
      .values({
        buyerOrgId: actor.orgId,
        agentId: actor.kind === 'agent' ? actor.agentId : null,
        createdByUserId: actor.kind === 'user' ? actor.userId : null,
        authorizationId: data.authorizationId ?? null,
        category: criteria.category,
        criteria,
        preferences: data.preferences ?? null,
      })
      .returning();
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'request.created',
      resourceType: 'purchase_request',
      resourceId: row!.id,
      outcome: 'succeeded',
      details: { authorizationId: data.authorizationId ?? null },
    });
    return toView(row!);
  });
}

/** Un agente solo accede a las solicitudes que creó; el dueño ve las de su organización. */
async function loadOwnRequest(db: Executor, actor: Actor, requestId: string) {
  if (!z.uuid().safeParse(requestId).success)
    throw new DomainError('NOT_FOUND', 'Solicitud no encontrada');
  const conditions = [
    eq(schema.purchaseRequests.id, requestId),
    eq(schema.purchaseRequests.buyerOrgId, actor.orgId),
  ];
  if (actor.kind === 'agent') conditions.push(eq(schema.purchaseRequests.agentId, actor.agentId));
  const [row] = await db
    .select()
    .from(schema.purchaseRequests)
    .where(and(...conditions));
  if (!row) throw new DomainError('NOT_FOUND', 'Solicitud no encontrada');
  return row;
}

export async function getRequest(
  db: Executor,
  actor: Actor,
  requestId: string,
): Promise<RequestView> {
  assertCanBuy(actor);
  return toView(await loadOwnRequest(db, actor, requestId));
}

export async function listRequests(db: Executor, actor: Actor): Promise<RequestView[]> {
  assertCanBuy(actor);
  const conditions = [eq(schema.purchaseRequests.buyerOrgId, actor.orgId)];
  if (actor.kind === 'agent') conditions.push(eq(schema.purchaseRequests.agentId, actor.agentId));
  const rows = await db
    .select()
    .from(schema.purchaseRequests)
    .where(and(...conditions))
    .orderBy(desc(schema.purchaseRequests.createdAt));
  return rows.map(toView);
}

export async function cancelRequest(
  db: Executor,
  actor: Actor,
  requestId: string,
): Promise<RequestView> {
  assertCanBuy(actor);
  return inTransaction(db, async (tx) => {
    const row = await loadOwnRequest(tx, actor, requestId);
    if (row.status !== 'open')
      throw new DomainError('INVALID_STATE', `La solicitud está ${row.status}`);
    const [updated] = await tx
      .update(schema.purchaseRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.purchaseRequests.id, row.id))
      .returning();
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'request.cancelled',
      resourceType: 'purchase_request',
      resourceId: row.id,
      outcome: 'succeeded',
    });
    return toView(updated!);
  });
}

/** Repite la búsqueda con los criterios guardados de una solicitud propia. */
export async function findMatchesForRequest(
  db: Executor,
  actor: Actor,
  requestId: string,
  options: SearchOptionsInput = {},
  now = new Date(),
) {
  const request = await getRequest(db, actor, requestId);
  const c = request.criteria;
  const result = await findMatches(
    db,
    actor,
    {
      category: c.category,
      requiredAttributes: c.requiredAttributes,
      quantity: c.quantity,
      deliveryState: c.deliveryAddress.state,
      deliverBy: c.deliverBy,
      maxTotal: c.maxTotal,
    },
    options,
    now,
  );
  return { requestId: request.id, ...result };
}
