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
