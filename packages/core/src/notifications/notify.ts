import { schema } from '@deal/db';
import type { Executor } from '../db.js';

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
