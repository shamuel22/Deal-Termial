import { and, eq, inArray, lte } from 'drizzle-orm';
import { schema } from '@deal/db';
import { audit } from '../audit/audit.js';
import type { Executor } from '../db.js';
import type { PaymentGateway } from './gateway.js';
import { attemptByPayPalOrder, reconcileAttempt } from './payments.js';
import { reconcileRefundByPayPalId } from './refunds.js';
import { refreshSellerByMerchantId } from './sellers.js';

/**
 * Webhooks de PayPal (brief §12): se verifican antes de llegar aquí, se guardan una sola vez por
 * `event_id` (los duplicados se ignoran) y nunca se aplica su contenido a ciegas: cada evento
 * dispara una consulta del estado real en PayPal, así que el orden de llegada no importa.
 */

export interface WebhookEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  resource?: Record<string, unknown>;
}

/** Guarda el evento. Devuelve false si ya se había recibido (duplicado). */
export async function recordWebhook(
  db: Executor,
  event: WebhookEvent,
): Promise<{ id: string; isNew: boolean }> {
  const inserted = await db
    .insert(schema.webhookEvents)
    .values({
      eventId: event.id,
      eventType: event.event_type,
      resourceId: typeof event.resource?.id === 'string' ? event.resource.id : null,
      payload: event,
    })
    .onConflictDoNothing({ target: schema.webhookEvents.eventId })
    .returning({ id: schema.webhookEvents.id });
  if (inserted.length > 0) return { id: inserted[0]!.id, isNew: true };
  const [existing] = await db
    .select({ id: schema.webhookEvents.id })
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.eventId, event.id));
  return { id: existing!.id, isNew: false };
}

function relatedOrderId(resource: Record<string, unknown> | undefined): string | null {
  const related = (
    resource?.supplementary_data as { related_ids?: { order_id?: string } } | undefined
  )?.related_ids;
  return related?.order_id ?? null;
}

/** Procesa un evento guardado. Idempotente: se puede repetir sin efectos duplicados. */
export async function processWebhook(
  db: Executor,
  gateway: PaymentGateway,
  webhookId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.id, webhookId));
  if (!row || row.status === 'processed' || row.status === 'ignored') return;
  const event = row.payload as WebhookEvent;
  const resource = event.resource;
  let handled = true;
  try {
    if (
      event.event_type.startsWith('CHECKOUT.ORDER.') ||
      event.event_type.startsWith('PAYMENT.CAPTURE.')
    ) {
      const isRefund =
        event.event_type === 'PAYMENT.CAPTURE.REFUNDED' ||
        event.event_type === 'PAYMENT.CAPTURE.REVERSED';
      if (isRefund && typeof resource?.id === 'string') {
        handled = await reconcileRefundByPayPalId(db, gateway, resource.id);
      } else {
        const paypalOrderId = event.event_type.startsWith('CHECKOUT.ORDER.')
          ? (resource?.id as string | undefined)
          : relatedOrderId(resource);
        const attempt = paypalOrderId ? await attemptByPayPalOrder(db, paypalOrderId) : undefined;
        if (attempt) await reconcileAttempt(db, gateway, attempt.id);
        else handled = false;
      }
    } else if (event.event_type.startsWith('PAYMENT.REFUND.') && typeof resource?.id === 'string') {
      handled = await reconcileRefundByPayPalId(db, gateway, resource.id);
    } else if (event.event_type.startsWith('MERCHANT.')) {
      const merchantId = (resource?.merchant_id as string | undefined) ?? null;
      handled = merchantId
        ? Boolean(await refreshSellerByMerchantId(db, gateway, merchantId))
        : false;
    } else if (
      event.event_type === 'VAULT.PAYMENT-TOKEN.DELETED' &&
      typeof resource?.id === 'string'
    ) {
      const revoked = await db
        .update(schema.paymentConnections)
        .set({
          status: 'revoked',
          revokedAt: new Date(),
          updatedAt: new Date(),
          lastError: 'Token eliminado en PayPal',
        })
        .where(eq(schema.paymentConnections.paymentTokenId, resource.id))
        .returning({ orgId: schema.paymentConnections.orgId });
      for (const { orgId } of revoked) {
        await audit(db, {
          orgId,
          actorType: 'paypal',
          actorId: null,
          action: 'payment_connection.revoked',
          resourceType: 'payment_connection',
          resourceId: resource.id,
          outcome: 'succeeded',
        });
      }
      handled = revoked.length > 0;
    } else {
      handled = false;
    }
    await db
      .update(schema.webhookEvents)
      .set({ status: handled ? 'processed' : 'ignored', processedAt: new Date(), error: null })
      .where(eq(schema.webhookEvents.id, webhookId));
  } catch (error) {
    await db
      .update(schema.webhookEvents)
      .set({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
      .where(eq(schema.webhookEvents.id, webhookId));
    throw error;
  }
}

/** Reintenta eventos fallidos o que quedaron sin procesar. */
export async function retryWebhooks(
  db: Executor,
  gateway: PaymentGateway,
  now: Date,
): Promise<number> {
  const rows = await db
    .select({ id: schema.webhookEvents.id })
    .from(schema.webhookEvents)
    .where(
      and(
        inArray(schema.webhookEvents.status, ['received', 'failed']),
        lte(schema.webhookEvents.receivedAt, new Date(now.getTime() - 30_000)),
      ),
    );
  for (const { id } of rows) await processWebhook(db, gateway, id).catch(() => undefined);
  return rows.length;
}
