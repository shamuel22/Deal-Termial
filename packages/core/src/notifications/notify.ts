import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import type { Executor } from '../db.js';
import type { Actor } from '../identity/actor.js';

export interface NotificationInput {
  orgId: string;
  userId?: string | null;
  kind: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
}

/** Notificación dentro del producto para una organización (o un usuario concreto). */
export async function notify(db: Executor, n: NotificationInput): Promise<void> {
  await db.insert(schema.notifications).values({
    orgId: n.orgId,
    userId: n.userId ?? null,
    kind: n.kind,
    title: n.title,
    body: n.body,
    resourceType: n.resourceType ?? null,
    resourceId: n.resourceId ?? null,
  });
}

/** Notificaciones de la organización (las dirigidas a otro usuario no se muestran). */
export async function listNotifications(
  db: Executor,
  actor: Actor,
  options: { unreadOnly?: boolean; limit?: number } = {},
) {
  const conditions = [
    eq(schema.notifications.orgId, actor.orgId),
    actor.kind === 'user'
      ? or(isNull(schema.notifications.userId), eq(schema.notifications.userId, actor.userId))!
      : isNull(schema.notifications.userId),
  ];
  if (options.unreadOnly) conditions.push(isNull(schema.notifications.readAt));
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(Math.min(options.limit ?? 50, 200));
  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.orgId, actor.orgId), isNull(schema.notifications.readAt)));
  return { unread: unread?.count ?? 0, items: rows };
}

export async function markNotificationsRead(
  db: Executor,
  actor: Actor,
  ids: string[] | 'all',
): Promise<void> {
  const conditions = [
    eq(schema.notifications.orgId, actor.orgId),
    isNull(schema.notifications.readAt),
  ];
  if (ids !== 'all') {
    const valid = ids.filter((id) => z.uuid().safeParse(id).success);
    if (valid.length === 0) return;
    conditions.push(inArray(schema.notifications.id, valid));
  }
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}
