import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { schema } from '@deal/db';
import type { Executor } from '../db.js';

export interface AuditEntry {
  orgId: string | null;
  actorType: 'user' | 'agent' | 'system' | 'paypal' | 'operator';
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: 'allowed' | 'denied' | 'succeeded' | 'failed';
  details?: Record<string, unknown>;
}

/**
 * Registra un evento de auditoría. Debe llamarse dentro de la misma transacción que la
 * operación auditada, para que no exista una sin la otra.
 */
export async function audit(db: Executor, entry: AuditEntry): Promise<void> {
  await db.insert(schema.auditEvents).values({
    orgId: entry.orgId,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    outcome: entry.outcome,
    details: entry.details ?? null,
  });
}

export interface ActivityFilter {
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  limit?: number;
  before?: Date;
}

/**
 * Consola de actividad del dueño (brief §11, §13): eventos de auditoría de su organización,
 * con el actor resuelto a un nombre legible.
 */
export async function listActivity(db: Executor, orgId: string, filter: ActivityFilter = {}) {
  const conditions = [eq(schema.auditEvents.orgId, orgId)];
  if (filter.resourceType)
    conditions.push(eq(schema.auditEvents.resourceType, filter.resourceType));
  if (filter.resourceId) conditions.push(eq(schema.auditEvents.resourceId, filter.resourceId));
  if (filter.actorId) conditions.push(eq(schema.auditEvents.actorId, filter.actorId));
  if (filter.before) conditions.push(lt(schema.auditEvents.createdAt, filter.before));
  const rows = await db
    .select()
    .from(schema.auditEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500));

  const agentIds = [
    ...new Set(rows.filter((r) => r.actorType === 'agent' && r.actorId).map((r) => r.actorId!)),
  ];
  const userIds = [
    ...new Set(rows.filter((r) => r.actorType === 'user' && r.actorId).map((r) => r.actorId!)),
  ];
  const [agents, users] = await Promise.all([
    agentIds.length
      ? db
          .select({ id: schema.agents.id, name: schema.agents.name })
          .from(schema.agents)
          .where(inArray(schema.agents.id, agentIds))
      : [],
    userIds.length
      ? db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(inArray(schema.users.id, userIds))
      : [],
  ]);
  const names = new Map([...agents, ...users].map((x) => [x.id, x.name]));
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt,
    actor: {
      type: r.actorType,
      id: r.actorId,
      name: r.actorId
        ? (names.get(r.actorId) ?? null)
        : r.actorType === 'paypal'
          ? 'PayPal'
          : 'System',
    },
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    outcome: r.outcome,
    details: r.details,
  }));
}
