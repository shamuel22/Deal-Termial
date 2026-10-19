import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@deal/db';
import { audit } from '../audit/audit.js';
import { consumeBudget } from '../authorization/budget.js';
import { inTransaction, type Executor, type Tx } from '../db.js';
import { compareMoney } from '../money.js';
import { notify } from '../notifications/notify.js';
import type { GatewayOrder } from './gateway.js';

/**
 * Aplicación de resultados financieros a intentos de pago y pedidos. Idempotente y monótona:
 * un intento completado nunca retrocede, de modo que webhooks duplicados o fuera de orden
 * y reconciliaciones repetidas no alteran un resultado ya registrado (brief §12).
 */

export type AttemptRow = typeof schema.paymentAttempts.$inferSelect;

const FINAL = ['completed', 'failed'] as const;

async function lockAttempt(tx: Tx, attemptId: string): Promise<AttemptRow> {
  const [attempt] = await tx
    .select()
    .from(schema.paymentAttempts)
    .where(eq(schema.paymentAttempts.id, attemptId))
    .for('no key update');
  if (!attempt) throw new Error(`Intento de pago ${attemptId} inexistente`);
  return attempt;
}

/** Registra datos de PayPal (ids) y un estado no final. Nunca degrada un estado final. */
export async function markAttempt(
  db: Executor,
  attemptId: string,
  patch: Partial<
    Pick<
      AttemptRow,
      | 'status'
      | 'paypalOrderId'
      | 'paypalCaptureId'
      | 'paypalDebugId'
      | 'failureCode'
      | 'failureMessage'
    >
  >,
): Promise<AttemptRow> {
  return inTransaction(db, async (tx) => {
    const attempt = await lockAttempt(tx, attemptId);
    if ((FINAL as readonly string[]).includes(attempt.status)) return attempt;
    const [updated] = await tx
      .update(schema.paymentAttempts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.paymentAttempts.id, attemptId))
      .returning();
    return updated!;
  });
}

/** Fallo definitivo del intento. El pedido sigue pendiente de pago (el dueño puede pagar manualmente). */
export async function failAttempt(
  db: Executor,
  attemptId: string,
  failure: { code: string; message: string; debugId?: string | null; requiresAction?: boolean },
): Promise<AttemptRow> {
  return inTransaction(db, async (tx) => {
    const attempt = await lockAttempt(tx, attemptId);
    if ((FINAL as readonly string[]).includes(attempt.status)) return attempt;
    const status = failure.requiresAction ? 'requires_action' : 'failed';
    const [updated] = await tx
      .update(schema.paymentAttempts)
      .set({
        status,
        failureCode: failure.code,
        failureMessage: failure.message,
        paypalDebugId: failure.debugId ?? attempt.paypalDebugId,
        updatedAt: new Date(),
      })
      .where(eq(schema.paymentAttempts.id, attemptId))
      .returning();
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, attempt.orderId));
    await audit(tx, {
      orgId: order!.buyerOrgId,
      actorType: 'paypal',
      actorId: null,
      action: status === 'failed' ? 'payment.failed' : 'payment.requires_action',
      resourceType: 'order',
      resourceId: order!.id,
      outcome: 'failed',
      details: {
        attemptId,
        mode: attempt.mode,
        code: failure.code,
        message: failure.message,
        debugId: failure.debugId ?? null,
      },
    });
    await notify(tx, {
      orgId: order!.buyerOrgId,
      kind: 'payment.failed',
      title: status === 'failed' ? 'El pago no se completó' : 'PayPal requiere una acción',
      body: `${failure.message}. El pedido sigue pendiente de pago; puedes completarlo desde el portal.`,
      resourceType: 'order',
      resourceId: order!.id,
    });
    return updated!;
  });
}

/**
 * Aplica una orden de PayPal con captura. Verifica importe, moneda y beneficiario contra el
 * intento (criterio 9); marca el pedido pagado, consume presupuesto y stock. Un pago que llega
 * con el pedido ya vencido o cancelado se registra como incidencia (brief §11).
 */
export async function settleGatewayOrder(
  db: Executor,
  attemptId: string,
  result: GatewayOrder,
  now = new Date(),
): Promise<AttemptRow> {
  const capture = result.capture;
  if (!capture) {
    return markAttempt(db, attemptId, { paypalOrderId: result.id });
  }
  if (capture.status === 'PENDING') {
    return markAttempt(db, attemptId, {
      status: 'processing',
      paypalOrderId: result.id,
      paypalCaptureId: capture.id,
    });
  }
  if (capture.status !== 'COMPLETED') {
    await markAttempt(db, attemptId, { paypalOrderId: result.id, paypalCaptureId: capture.id });
    return failAttempt(db, attemptId, {
      code: `CAPTURE_${capture.status}`,
      message: `Captura ${capture.status}`,
    });
  }

  return inTransaction(db, async (tx) => {
    // Orden de bloqueo global: pedido → intento.
    const [ref] = await tx
      .select({ orderId: schema.paymentAttempts.orderId })
      .from(schema.paymentAttempts)
      .where(eq(schema.paymentAttempts.id, attemptId));
    if (!ref) throw new Error(`Intento de pago ${attemptId} inexistente`);
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, ref.orderId))
      .for('no key update');
    if (!order) throw new Error(`Pedido ${ref.orderId} inexistente`);
    const attempt = await lockAttempt(tx, attemptId);
    if (attempt.status === 'completed') return attempt;

    const incidents: string[] = [];
    if (
      capture.amount === null ||
      compareMoney(capture.amount, attempt.amount) !== 0 ||
      capture.currency !== attempt.currency ||
      result.payeeMerchantId !== attempt.payeeMerchantId
    ) {
      incidents.push(
        `Discrepancia en el cobro: esperado ${attempt.amount} ${attempt.currency} a ${attempt.payeeMerchantId}, ` +
          `PayPal informa ${capture.amount} ${capture.currency} a ${result.payeeMerchantId}`,
      );
    }
    if (order.status !== 'pending_payment' && order.status !== 'paid') {
      incidents.push(
        `Pago recibido con el pedido en estado ${order.status}; requiere resolución expresa`,
      );
    }

    const [updated] = await tx
      .update(schema.paymentAttempts)
      .set({
        status: 'completed',
        paypalOrderId: result.id,
        paypalCaptureId: capture.id,
        updatedAt: now,
      })
      .where(eq(schema.paymentAttempts.id, attempt.id))
      .returning();

    // Stock: la reserva activa pasa a consumida y se descuenta del stock informado.
    const [stock] = await tx
      .select()
      .from(schema.stockReservations)
      .where(eq(schema.stockReservations.orderId, order.id))
      .for('no key update');
    if (stock?.status === 'active') {
      await tx
        .update(schema.stockReservations)
        .set({ status: 'consumed', updatedAt: now })
        .where(eq(schema.stockReservations.id, stock.id));
      await tx
        .update(schema.offers)
        .set({
          stockAvailable: sql`greatest(${schema.offers.stockAvailable} - ${stock.quantity}, 0)`,
          updatedAt: now,
        })
        .where(eq(schema.offers.id, stock.offerId));
    } else if (stock && stock.status !== 'consumed') {
      incidents.push('La reserva de stock ya no estaba activa; disponibilidad no garantizada');
    }

    await consumeBudget(tx, order.id, now);
    const incident = incidents.length > 0 ? incidents.join(' · ') : order.incident;
    await tx
      .update(schema.orders)
      .set({ status: 'paid', paidAt: order.paidAt ?? now, incident, updatedAt: now })
      .where(eq(schema.orders.id, order.id));

    await audit(tx, {
      orgId: order.buyerOrgId,
      actorType: 'paypal',
      actorId: null,
      action: 'payment.completed',
      resourceType: 'order',
      resourceId: order.id,
      outcome: 'succeeded',
      details: {
        attemptId: attempt.id,
        mode: attempt.mode,
        paypalOrderId: result.id,
        paypalCaptureId: capture.id,
        amount: capture.amount,
        currency: capture.currency,
        payeeMerchantId: result.payeeMerchantId,
        incidents,
      },
    });
    for (const orgId of [order.buyerOrgId, order.supplierOrgId]) {
      await notify(tx, {
        orgId,
        kind: incidents.length > 0 ? 'payment.completed_with_incident' : 'payment.completed',
        title: incidents.length > 0 ? 'Pago confirmado con incidencia' : 'Pago confirmado',
        body: `PayPal confirmó ${capture.amount} ${capture.currency} (captura ${capture.id}).${incidents.length > 0 ? ` ${incidents.join(' · ')}` : ''}`,
        resourceType: 'order',
        resourceId: order.id,
      });
    }
    return updated!;
  });
}

/** Intentos en curso que bloquean un nuevo cobro del mismo pedido. */
export async function activeAttempt(
  tx: Executor,
  orderId: string,
): Promise<AttemptRow | undefined> {
  const [row] = await tx
    .select()
    .from(schema.paymentAttempts)
    .where(
      and(
        eq(schema.paymentAttempts.orderId, orderId),
        sql`${schema.paymentAttempts.status} in ('created', 'processing', 'unknown', 'completed', 'requires_action')`,
      ),
    )
    .orderBy(sql`${schema.paymentAttempts.createdAt} desc`)
    .limit(1);
  return row;
}
