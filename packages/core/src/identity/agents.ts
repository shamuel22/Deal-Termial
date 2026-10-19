import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { inTransaction, type Executor, type Tx } from '../db.js';
import {
  requireAdmin,
  type Actor,
  type AgentActor,
  type BuyerLevel,
  type SellerScope,
} from './actor.js';
import { randomToken, sha256 } from './secrets.js';

export const BUYER_LEVELS = ['search_only', 'negotiate', 'full_autonomy'] as const;
export const SELLER_SCOPES = [
  'publish_offers',
  'submit_quotes',
  'accept_terms',
  'approve_refunds',
] as const;

export const accessInput = z.object({
  buyerLevel: z.enum(BUYER_LEVELS).nullable(),
  sellerScopes: z.array(z.enum(SELLER_SCOPES)).max(SELLER_SCOPES.length).default([]),
});
export type AccessInput = z.input<typeof accessInput>;

export const createAgentInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  access: accessInput,
});
export type CreateAgentInput = z.input<typeof createAgentInput>;

export interface AgentView {
  id: string;
  name: string;
  description: string | null;
  disabledAt: Date | null;
  access: {
    version: number;
    buyerLevel: BuyerLevel | null;
    sellerScopes: SellerScope[];
    grantedAt: Date;
    grantedByUserId: string;
  };
  credentials: Array<{
    id: string;
    keyPrefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
  }>;
}

export interface IssuedCredential {
  credentialId: string;
  keyPrefix: string;
  /** Secreto completo. Solo se devuelve en el momento de emitirlo. */
  apiKey: string;
}

const KEY_PREFIX = 'dtk_';

/** Carga un agente de la organización del actor; si es de otra organización, NOT_FOUND. */
async function findOwnAgent(db: Executor, orgId: string, agentId: string) {
  if (!z.uuid().safeParse(agentId).success) {
    throw new DomainError('NOT_FOUND', 'Agente no encontrado');
  }
  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.orgId, orgId)));
  if (!agent) throw new DomainError('NOT_FOUND', 'Agente no encontrado');
  return agent;
}

async function currentGrant(db: Executor, agentId: string) {
  const [grant] = await db
    .select()
    .from(schema.agentAccessGrants)
    .where(
      and(
        eq(schema.agentAccessGrants.agentId, agentId),
        isNull(schema.agentAccessGrants.supersededAt),
      ),
    );
  return grant;
}

export async function createAgent(
  db: Executor,
  actor: Actor,
  input: CreateAgentInput,
): Promise<AgentView> {
  const admin = requireAdmin(actor);
  const data = createAgentInput.parse(input);
  const agentId = await inTransaction(db, async (tx) => {
    const [agent] = await tx
      .insert(schema.agents)
      .values({
        orgId: admin.orgId,
        name: data.name,
        description: data.description ?? null,
        createdByUserId: admin.userId,
      })
      .returning({ id: schema.agents.id });
    await tx.insert(schema.agentAccessGrants).values({
      agentId: agent!.id,
      orgId: admin.orgId,
      version: 1,
      buyerLevel: data.access.buyerLevel,
      sellerScopes: data.access.sellerScopes,
      grantedByUserId: admin.userId,
    });
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'agent.created',
      resourceType: 'agent',
      resourceId: agent!.id,
      outcome: 'succeeded',
      details: { access: data.access },
    });
    return agent!.id;
  });
  return getAgent(db, actor, agentId);
}

export async function listAgents(db: Executor, actor: Actor): Promise<AgentView[]> {
  const admin = requireAdmin(actor);
  const agents = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.orgId, admin.orgId))
    .orderBy(desc(schema.agents.createdAt));
  return Promise.all(agents.map((a) => getAgent(db, actor, a.id)));
}

export async function getAgent(db: Executor, actor: Actor, agentId: string): Promise<AgentView> {
  const admin = requireAdmin(actor);
  const agent = await findOwnAgent(db, admin.orgId, agentId);
  const grant = await currentGrant(db, agent.id);
  if (!grant) throw new Error(`Agente ${agent.id} sin concesión vigente`);
  const credentials = await db
    .select({
      id: schema.agentCredentials.id,
      keyPrefix: schema.agentCredentials.keyPrefix,
      createdAt: schema.agentCredentials.createdAt,
      lastUsedAt: schema.agentCredentials.lastUsedAt,
      revokedAt: schema.agentCredentials.revokedAt,
    })
    .from(schema.agentCredentials)
    .where(eq(schema.agentCredentials.agentId, agent.id))
    .orderBy(desc(schema.agentCredentials.createdAt));
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    disabledAt: agent.disabledAt,
    access: {
      version: grant.version,
      buyerLevel: grant.buyerLevel,
      sellerScopes: grant.sellerScopes,
      grantedAt: grant.createdAt,
      grantedByUserId: grant.grantedByUserId,
    },
    credentials,
  };
}

/**
 * Cambia nivel y facultades creando una nueva versión de la concesión. Solo el dueño o un
 * administrador con sesión; un agente nunca puede modificar su propio acceso.
 */
export async function setAgentAccess(
  db: Executor,
  actor: Actor,
  agentId: string,
  input: AccessInput,
): Promise<AgentView> {
  const admin = requireAdmin(actor);
  const data = accessInput.parse(input);
  await inTransaction(db, async (tx) => {
    const agent = await findOwnAgent(tx, admin.orgId, agentId);
    // Bloquea el agente para serializar cambios concurrentes de acceso.
    await tx
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(eq(schema.agents.id, agent.id))
      .for('no key update');
    const previous = await currentGrant(tx, agent.id);
    if (!previous) throw new Error(`Agente ${agent.id} sin concesión vigente`);
    await tx
      .update(schema.agentAccessGrants)
      .set({ supersededAt: new Date() })
      .where(eq(schema.agentAccessGrants.id, previous.id));
    await tx.insert(schema.agentAccessGrants).values({
      agentId: agent.id,
      orgId: admin.orgId,
      version: previous.version + 1,
      buyerLevel: data.buyerLevel,
      sellerScopes: data.sellerScopes,
      grantedByUserId: admin.userId,
    });
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'agent.access_changed',
      resourceType: 'agent',
      resourceId: agent.id,
      outcome: 'succeeded',
      details: {
        from: {
          version: previous.version,
          buyerLevel: previous.buyerLevel,
          sellerScopes: previous.sellerScopes,
        },
        to: {
          version: previous.version + 1,
          buyerLevel: data.buyerLevel,
          sellerScopes: data.sellerScopes,
        },
      },
    });
  });
  return getAgent(db, actor, agentId);
}

export async function issueCredential(
  db: Executor,
  actor: Actor,
  agentId: string,
): Promise<IssuedCredential> {
  const admin = requireAdmin(actor);
  return inTransaction(db, async (tx) => {
    const agent = await findOwnAgent(tx, admin.orgId, agentId);
    if (agent.disabledAt) throw new DomainError('INVALID_STATE', 'El agente está deshabilitado');
    const prefix = `${KEY_PREFIX}${randomToken(6)}`;
    const apiKey = `${prefix}_${randomToken(32)}`;
    const [credential] = await tx
      .insert(schema.agentCredentials)
      .values({ agentId: agent.id, keyPrefix: prefix, keyHash: sha256(apiKey) })
      .returning({ id: schema.agentCredentials.id });
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'agent.credential_issued',
      resourceType: 'agent',
      resourceId: agent.id,
      outcome: 'succeeded',
      details: { credentialId: credential!.id, keyPrefix: prefix },
    });
    return { credentialId: credential!.id, keyPrefix: prefix, apiKey };
  });
}

export async function revokeCredential(
  db: Executor,
  actor: Actor,
  agentId: string,
  credentialId: string,
): Promise<void> {
  const admin = requireAdmin(actor);
  await inTransaction(db, async (tx) => {
    const agent = await findOwnAgent(tx, admin.orgId, agentId);
    if (!z.uuid().safeParse(credentialId).success) {
      throw new DomainError('NOT_FOUND', 'Credencial no encontrada');
    }
    const revoked = await tx
      .update(schema.agentCredentials)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.agentCredentials.id, credentialId),
          eq(schema.agentCredentials.agentId, agent.id),
          isNull(schema.agentCredentials.revokedAt),
        ),
      )
      .returning({ id: schema.agentCredentials.id });
    if (revoked.length === 0) throw new DomainError('NOT_FOUND', 'Credencial no encontrada');
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'agent.credential_revoked',
      resourceType: 'agent',
      resourceId: agent.id,
      outcome: 'succeeded',
      details: { credentialId },
    });
  });
}

/** Deshabilita el agente y revoca todas sus credenciales. */
export async function disableAgent(db: Executor, actor: Actor, agentId: string): Promise<void> {
  const admin = requireAdmin(actor);
  await inTransaction(db, async (tx: Tx) => {
    const agent = await findOwnAgent(tx, admin.orgId, agentId);
    const now = new Date();
    await tx
      .update(schema.agents)
      .set({ disabledAt: now, updatedAt: now })
      .where(eq(schema.agents.id, agent.id));
    await tx
      .update(schema.agentCredentials)
      .set({ revokedAt: now })
      .where(
        and(
          eq(schema.agentCredentials.agentId, agent.id),
          isNull(schema.agentCredentials.revokedAt),
        ),
      );
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'agent.disabled',
      resourceType: 'agent',
      resourceId: agent.id,
      outcome: 'succeeded',
    });
  });
}

/**
 * Resuelve una credencial de agente al actor correspondiente, con la concesión vigente
 * en este momento. Falla si la credencial está revocada o el agente deshabilitado.
 */
export async function resolveAgentKey(db: Executor, apiKey: string): Promise<AgentActor> {
  if (!apiKey.startsWith(KEY_PREFIX)) {
    throw new DomainError('UNAUTHENTICATED', 'Credencial de agente inválida');
  }
  const [row] = await db
    .select({
      credentialId: schema.agentCredentials.id,
      agentId: schema.agents.id,
      orgId: schema.agents.orgId,
    })
    .from(schema.agentCredentials)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.agentCredentials.agentId))
    .where(
      and(
        eq(schema.agentCredentials.keyHash, sha256(apiKey)),
        isNull(schema.agentCredentials.revokedAt),
        isNull(schema.agents.disabledAt),
      ),
    );
  if (!row) throw new DomainError('UNAUTHENTICATED', 'Credencial de agente inválida o revocada');
  const grant = await currentGrant(db, row.agentId);
  if (!grant) throw new DomainError('UNAUTHENTICATED', 'El agente no tiene acceso vigente');
  await db
    .update(schema.agentCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.agentCredentials.id, row.credentialId));
  return {
    kind: 'agent',
    agentId: row.agentId,
    orgId: row.orgId,
    credentialId: row.credentialId,
    grant: {
      id: grant.id,
      version: grant.version,
      buyerLevel: grant.buyerLevel,
      sellerScopes: grant.sellerScopes,
    },
  };
}
