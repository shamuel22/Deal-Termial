import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { inTransaction, type Executor } from '../db.js';
import { requireAdmin, type Actor, type AgentActor } from '../identity/actor.js';
import { BUYER_LEVELS, getAgent, setAgentAccess } from '../identity/agents.js';
import { amendAuthorization, createAuthorization } from './authorizations.js';
import { authorizationTerms, type AuthorizationTermsInput } from './schemas.js';

/**
 * Un agente puede solicitar cambios de permisos para revisión, pero no aprobarlos ni
 * ampliar sus propios límites (brief §4). La aprobación la hace el dueño desde el portal.
 */
export const changeRequestInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('new_authorization'),
    terms: authorizationTerms,
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    kind: z.literal('amend_authorization'),
    authorizationId: z.uuid(),
    terms: authorizationTerms,
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    kind: z.literal('change_level'),
    buyerLevel: z.enum(BUYER_LEVELS),
    reason: z.string().trim().max(1000).optional(),
  }),
]);
export type ChangeRequestInput = z.input<typeof changeRequestInput>;

export async function submitChangeRequest(
  db: Executor,
  actor: AgentActor,
  input: ChangeRequestInput,
): Promise<{ id: string; status: 'pending' }> {
  const data = changeRequestInput.parse(input);
  return inTransaction(db, async (tx) => {
    if (data.kind === 'amend_authorization') {
      const [own] = await tx
        .select({ id: schema.purchaseAuthorizations.id })
        .from(schema.purchaseAuthorizations)
        .where(
          and(
            eq(schema.purchaseAuthorizations.id, data.authorizationId),
            eq(schema.purchaseAuthorizations.agentId, actor.agentId),
          ),
        );
      if (!own) throw new DomainError('NOT_FOUND', 'Authorization not found');
    }
    const [row] = await tx
      .insert(schema.authorizationChangeRequests)
      .values({
        orgId: actor.orgId,
        agentId: actor.agentId,
        authorizationId: data.kind === 'amend_authorization' ? data.authorizationId : null,
        // Se guarda la entrada original (sin transformar) para mostrarla al dueño.
        proposal: input as unknown as Record<string, unknown>,
        reason: data.reason ?? null,
      })
      .returning({ id: schema.authorizationChangeRequests.id });
    await audit(tx, {
      orgId: actor.orgId,
      actorType: 'agent',
      actorId: actor.agentId,
      action: 'change_request.submitted',
      resourceType: 'authorization_change_request',
      resourceId: row!.id,
      outcome: 'succeeded',
      details: { kind: data.kind },
    });
    return { id: row!.id, status: 'pending' as const };
  });
}

export async function listChangeRequests(db: Executor, actor: Actor) {
  const conditions = [eq(schema.authorizationChangeRequests.orgId, actor.orgId)];
  if (actor.kind === 'agent') {
    conditions.push(eq(schema.authorizationChangeRequests.agentId, actor.agentId));
  } else {
    requireAdmin(actor);
  }
  return db
    .select()
    .from(schema.authorizationChangeRequests)
    .where(and(...conditions))
    .orderBy(desc(schema.authorizationChangeRequests.createdAt));
}

async function loadPending(db: Executor, orgId: string, requestId: string) {
  if (!z.uuid().safeParse(requestId).success) {
    throw new DomainError('NOT_FOUND', 'Request not found');
  }
  const [row] = await db
    .select()
    .from(schema.authorizationChangeRequests)
    .where(
      and(
        eq(schema.authorizationChangeRequests.id, requestId),
        eq(schema.authorizationChangeRequests.orgId, orgId),
      ),
    );
  if (!row) throw new DomainError('NOT_FOUND', 'Request not found');
  if (row.status !== 'pending') {
    throw new DomainError(
      'INVALID_STATE',
      `The request was already ${row.status === 'approved' ? 'approved' : 'rejected'}`,
    );
  }
  return row;
}

/** El dueño aprueba la solicitud tal como fue propuesta; se aplica con su autoridad. */
export async function approveChangeRequest(
  db: Executor,
  actor: Actor,
  requestId: string,
  now = new Date(),
): Promise<{ id: string; status: 'approved'; result: unknown }> {
  const admin = requireAdmin(actor);
  return inTransaction(db, async (tx) => {
    const request = await loadPending(tx, admin.orgId, requestId);
    const proposal = changeRequestInput.parse(request.proposal);
    // Los términos se reaplican desde la entrada original guardada (fechas como texto ISO).
    const rawTerms = (request.proposal as { terms?: AuthorizationTermsInput }).terms;
    let result: unknown;
    if (proposal.kind === 'new_authorization') {
      result = await createAuthorization(
        tx,
        admin,
        { agentId: request.agentId, terms: rawTerms! },
        now,
      );
    } else if (proposal.kind === 'amend_authorization') {
      result = await amendAuthorization(tx, admin, proposal.authorizationId, rawTerms!, now);
    } else {
      const current = await getAgent(tx, admin, request.agentId);
      result = await setAgentAccess(tx, admin, request.agentId, {
        buyerLevel: proposal.buyerLevel,
        sellerScopes: current.access.sellerScopes,
      });
    }
    await tx
      .update(schema.authorizationChangeRequests)
      .set({ status: 'approved', reviewedByUserId: admin.userId, reviewedAt: now })
      .where(eq(schema.authorizationChangeRequests.id, request.id));
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'change_request.approved',
      resourceType: 'authorization_change_request',
      resourceId: request.id,
      outcome: 'succeeded',
      details: { kind: proposal.kind },
    });
    return { id: request.id, status: 'approved' as const, result };
  });
}

export async function rejectChangeRequest(
  db: Executor,
  actor: Actor,
  requestId: string,
  now = new Date(),
): Promise<{ id: string; status: 'rejected' }> {
  const admin = requireAdmin(actor);
  return inTransaction(db, async (tx) => {
    const request = await loadPending(tx, admin.orgId, requestId);
    await tx
      .update(schema.authorizationChangeRequests)
      .set({ status: 'rejected', reviewedByUserId: admin.userId, reviewedAt: now })
      .where(eq(schema.authorizationChangeRequests.id, request.id));
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'change_request.rejected',
      resourceType: 'authorization_change_request',
      resourceId: request.id,
      outcome: 'succeeded',
    });
    return { id: request.id, status: 'rejected' as const };
  });
}
