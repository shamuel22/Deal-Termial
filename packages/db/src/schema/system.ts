import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz } from './columns.js';
import { actorType, webhookStatus } from './enums.js';
import { organizations, users } from './identity.js';

/**
 * Evento de auditoría. Debe permitir responder: qué se autorizó, quién actuó,
 * por qué se permitió y qué ocurrió con el pago (brief §11).
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    orgId: uuid('org_id').references(() => organizations.id),
    actorType: actorType('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    // Resultado de la verificación: allowed/denied y motivos.
    outcome: text('outcome').notNull(),
    details: jsonb('details'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_events_org_time_idx').on(t.orgId, t.createdAt),
    index('audit_events_resource_idx').on(t.resourceType, t.resourceId),
  ],
);

/** Claves de idempotencia de escrituras: un reintento devuelve la respuesta original. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: id(),
    // Ámbito: agente u organización que usó la clave.
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    operation: text('operation').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response'),
    completedAt: tstz('completed_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('idempotency_keys_uq').on(t.scope, t.key)],
);

/** Webhooks PayPal recibidos; `eventId` único absorbe duplicados. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    resourceId: text('resource_id'),
    payload: jsonb('payload').notNull(),
    status: webhookStatus('status').notNull().default('received'),
    error: text('error'),
    receivedAt: createdAt(),
    processedAt: tstz('processed_at'),
  },
  (t) => [
    uniqueIndex('webhook_events_event_uq').on(t.eventId),
    index('webhook_events_resource_idx').on(t.resourceId),
  ],
);

/** Notificaciones dentro del producto. */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id').references(() => users.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    readAt: tstz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_org_idx').on(t.orgId, t.readAt)],
);
