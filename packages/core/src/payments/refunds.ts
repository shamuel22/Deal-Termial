import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { moneyString } from '../authorization/schemas.js';
import { assertBuyerAction } from '../authorization/policy.js';
import { inTransaction, type Executor } from '../db.js';
import { actorRef, requireAdmin, requireSellerScope, type Actor } from '../identity/actor.js';
import { gt, subMoney, toMoney } from '../money.js';
import { notify } from '../notifications/notify.js';
import { GatewayRejectedError, GatewayUnknownError, type PaymentGateway } from './gateway.js';

/**
 * Devoluciones (brief §9, §10, §15 criterio 14). El comprador solicita; el proveedor, con la
 * facultad `approve_refunds`, autoriza y la plataforma ejecuta en PayPal en su nombre.
 * Un reembolso confirmado se registra aparte y no restaura el presupuesto delegado.
 */

export const requestRefundInput = z.object({
  amount: moneyString.optional(),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type RequestRefundInput = z.input<typeof requestRefundInput>;

type RefundRow = typeof schema.refunds.$inferSelect;

export interface RefundView {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  status: RefundRow['status'];
  reason: string | null;
  paypalRefundId: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function view(r: RefundRow): RefundView {
  return {
    id: r.id,
    orderId: r.orderId,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    reason: r.reason,
    paypalRefundId: r.paypalRefundId,
    failureMessage: r.failureMessage,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** `request_refund`: solicita revisión de una devolución sobre un pedido pagado. */
export async function requestRefund(
  db: Executor,
  actor: Actor,
  orderId: string,
  input: RequestRefundInput,
): Promise<RefundView> {
  if (actor.kind === 'agent') assertBuyerAction(actor, 'execute_payment');
  else requireAdmin(actor);
  const data = requestRefundInput.parse(input);
  if (!z.uuid().safeParse(orderId).success)
    throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
  return inTransaction(db, async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.buyerOrgId, actor.orgId)))
      .for('no key update');
    if (!order || (actor.kind === 'agent' && order.acceptedByAgentId !== actor.agentId)) {
      throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
    }
    if (data.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(schema.refunds)
        .where(
          and(
            eq(schema.refunds.orderId, order.id),
            eq(schema.refunds.requestId, `client:${data.idempotencyKey}`),
          ),
        );
      if (existing) return view(existing);
    }
    if (order.status !== 'paid')
      throw new DomainError('INVALID_STATE', 'Solo se reembolsan pedidos pagados');
    const [payment] = await tx
      .select()
      .from(schema.paymentAttempts)
      .where(
        and(
          eq(schema.paymentAttempts.orderId, order.id),
          eq(schema.paymentAttempts.status, 'completed'),
        ),
      );
    if (!payment?.paypalCaptureId)
      throw new DomainError('INVALID_STATE', 'El pedido no tiene una captura PayPal');

    const [committed] = await tx
      .select({ total: sql<string>`coalesce(sum(${schema.refunds.amount}), 0)` })
      .from(schema.refunds)
      .where(and(eq(schema.refunds.orderId, order.id), ne(schema.refunds.status, 'failed')));
    const refundable = subMoney(payment.amount, committed?.total ?? '0');
    const amount = data.amount ?? refundable;
    if (!gt(amount, '0') || gt(amount, refundable)) {
      throw new DomainError('VALIDATION_FAILED', `Importe reembolsable disponible: ${refundable}`, {
        refundable,
        requested: toMoney(amount),
      });
    }
    const [refund] = await tx
      .insert(schema.refunds)
      .values({
        orderId: order.id,
        paymentAttemptId: payment.id,
        amount: toMoney(amount),
        currency: payment.currency,
        reason: data.reason,
        requestedByAgentId: actor.kind === 'agent' ? actor.agentId : null,
        requestedByUserId: actor.kind === 'user' ? actor.userId : null,
        requestId: data.idempotencyKey ? `client:${data.idempotencyKey}` : randomUUID(),
      })
      .returning();
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'refund.requested',
      resourceType: 'refund',
      resourceId: refund!.id,
      outcome: 'succeeded',
      details: { orderId: order.id, amount: refund!.amount, reason: data.reason },
    });
    await notify(tx, {
      orgId: order.supplierOrgId,
      kind: 'refund.requested',
      title: 'Solicitud de devolución',
      body: `El comprador solicita devolver ${refund!.amount} ${refund!.currency}: ${data.reason}`,
      resourceType: 'refund',
      resourceId: refund!.id,
    });
    return view(refund!);
  });
}

async function loadSupplierRefund(db: Executor, actor: Actor, refundId: string, lock: boolean) {
  if (!z.uuid().safeParse(refundId).success)
    throw new DomainError('NOT_FOUND', 'Reembolso no encontrado');
  const query = db
    .select({ refund: schema.refunds, order: schema.orders, payment: schema.paymentAttempts })
    .from(schema.refunds)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.refunds.orderId))
    .innerJoin(
      schema.paymentAttempts,
      eq(schema.paymentAttempts.id, schema.refunds.paymentAttemptId),
    )
    .where(and(eq(schema.refunds.id, refundId), eq(schema.orders.supplierOrgId, actor.orgId)));
  const [row] = lock ? await query.for('no key update', { of: schema.refunds }) : await query;
  if (!row) throw new DomainError('NOT_FOUND', 'Reembolso no encontrado');
  return row;
}

/** Ejecuta en PayPal un reembolso autorizado y aplica el resultado. */
async function dispatchRefund(
  db: Executor,
  gateway: PaymentGateway,
  refundId: string,
): Promise<RefundRow> {
  const [row] = await db
    .select({ refund: schema.refunds, payment: schema.paymentAttempts })
    .from(schema.refunds)
    .innerJoin(
      schema.paymentAttempts,
      eq(schema.paymentAttempts.id, schema.refunds.paymentAttemptId),
    )
    .where(eq(schema.refunds.id, refundId));
  const { refund, payment } = row!;
  let patch: Partial<RefundRow>;
  try {
    const result = refund.paypalRefundId
      ? await gateway.getRefund(refund.paypalRefundId, payment.payeeMerchantId)
      : await gateway.refundCapture({
          captureId: payment.paypalCaptureId!,
          amount: refund.amount,
          currency: refund.currency,
          requestId: refund.requestId,
          payeeMerchantId: payment.payeeMerchantId,
          note: refund.reason ?? undefined,
        });
    patch = {
      paypalRefundId: result.id,
      status:
        result.status === 'COMPLETED'
          ? 'completed'
          : result.status === 'FAILED' || result.status === 'CANCELLED'
            ? 'failed'
            : 'processing',
    };
  } catch (error) {
    if (error instanceof GatewayRejectedError)
      patch = { status: 'failed', failureMessage: `${error.code}: ${error.message}` };
    else if (error instanceof GatewayUnknownError)
      patch = { status: 'processing', failureMessage: error.message };
    else throw error;
  }
  return inTransaction(db, async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.id, refundId))
      .for('no key update');
    if (current!.status === 'completed' || current!.status === 'failed') return current!;
    const [updated] = await tx
      .update(schema.refunds)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.refunds.id, refundId))
      .returning();
    if (updated!.status === 'completed' || updated!.status === 'failed') {
      const [order] = await tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, updated!.orderId));
      await audit(tx, {
        orgId: order!.buyerOrgId,
        actorType: 'paypal',
        actorId: null,
        action: `refund.${updated!.status}`,
        resourceType: 'refund',
        resourceId: refundId,
        outcome: updated!.status === 'completed' ? 'succeeded' : 'failed',
        details: {
          orderId: order!.id,
          amount: updated!.amount,
          paypalRefundId: updated!.paypalRefundId,
        },
      });
      for (const orgId of [order!.buyerOrgId, order!.supplierOrgId]) {
        await notify(tx, {
          orgId,
          kind: `refund.${updated!.status}`,
          title: updated!.status === 'completed' ? 'Devolución completada' : 'La devolución falló',
          body: `${updated!.amount} ${updated!.currency}${updated!.failureMessage ? ` — ${updated!.failureMessage}` : ''}`,
          resourceType: 'refund',
          resourceId: refundId,
        });
      }
    }
    return updated!;
  });
}

/** `approve_refund`: el proveedor autoriza y la plataforma ejecuta la devolución en PayPal. */
export async function approveRefund(
  db: Executor,
  gateway: PaymentGateway,
  actor: Actor,
  refundId: string,
): Promise<RefundView> {
  requireSellerScope(actor, 'approve_refunds');
  await inTransaction(db, async (tx) => {
    const { refund } = await loadSupplierRefund(tx, actor, refundId, true);
    if (refund.status !== 'requested') return;
    await tx
      .update(schema.refunds)
      .set({
        status: 'authorized',
        authorizedByAgentId: actor.kind === 'agent' ? actor.agentId : null,
        authorizedByUserId: actor.kind === 'user' ? actor.userId : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.refunds.id, refund.id));
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'refund.authorized',
      resourceType: 'refund',
      resourceId: refund.id,
      outcome: 'succeeded',
    });
  });
  const { refund } = await loadSupplierRefund(db, actor, refundId, false);
  if (refund.status === 'authorized' || refund.status === 'processing') {
    return view(await dispatchRefund(db, gateway, refundId));
  }
  return view(refund);
}

/** El proveedor rechaza la solicitud; queda registrada como fallida con el motivo. */
export async function rejectRefund(
  db: Executor,
  actor: Actor,
  refundId: string,
  reason: string,
): Promise<RefundView> {
  requireSellerScope(actor, 'approve_refunds');
  const message = z.string().trim().min(1).max(500).parse(reason);
  return inTransaction(db, async (tx) => {
    const { refund, order } = await loadSupplierRefund(tx, actor, refundId, true);
    if (refund.status !== 'requested')
      throw new DomainError('INVALID_STATE', `El reembolso está ${refund.status}`);
    const [updated] = await tx
      .update(schema.refunds)
      .set({
        status: 'failed',
        failureMessage: `Rechazado por el proveedor: ${message}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.refunds.id, refund.id))
      .returning();
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'refund.rejected',
      resourceType: 'refund',
      resourceId: refund.id,
      outcome: 'succeeded',
      details: { reason: message },
    });
    await notify(tx, {
      orgId: order.buyerOrgId,
      kind: 'refund.rejected',
      title: 'Devolución rechazada por el proveedor',
      body: message,
      resourceType: 'refund',
      resourceId: refund.id,
    });
    return view(updated!);
  });
}

/** Reembolsos de un pedido, visibles para comprador y proveedor. */
export async function listRefunds(
  db: Executor,
  actor: Actor,
  orderId: string,
): Promise<RefundView[]> {
  if (!z.uuid().safeParse(orderId).success)
    throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order || (order.buyerOrgId !== actor.orgId && order.supplierOrgId !== actor.orgId)) {
    throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
  }
  const rows = await db
    .select()
    .from(schema.refunds)
    .where(eq(schema.refunds.orderId, orderId))
    .orderBy(desc(schema.refunds.createdAt));
  return rows.map(view);
}

/** Reembolsos del proveedor pendientes de decisión. */
export async function listPendingRefunds(db: Executor, actor: Actor): Promise<RefundView[]> {
  requireSellerScope(actor, 'approve_refunds');
  const rows = await db
    .select({ refund: schema.refunds })
    .from(schema.refunds)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.refunds.orderId))
    .where(
      and(eq(schema.orders.supplierOrgId, actor.orgId), eq(schema.refunds.status, 'requested')),
    )
    .orderBy(desc(schema.refunds.createdAt));
  return rows.map((r) => view(r.refund));
}

/** Reconciliación de reembolsos en curso. */
export async function reconcileRefunds(db: Executor, gateway: PaymentGateway): Promise<number> {
  const rows = await db
    .select({ id: schema.refunds.id })
    .from(schema.refunds)
    .where(inArray(schema.refunds.status, ['authorized', 'processing']));
  for (const { id } of rows) {
    await dispatchRefund(db, gateway, id).catch(() => undefined);
  }
  return rows.length;
}

/** Aplica un reembolso conocido por su id de PayPal (webhooks). */
export async function reconcileRefundByPayPalId(
  db: Executor,
  gateway: PaymentGateway,
  paypalRefundId: string,
) {
  const [row] = await db
    .select({ id: schema.refunds.id })
    .from(schema.refunds)
    .where(eq(schema.refunds.paypalRefundId, paypalRefundId));
  if (row) await dispatchRefund(db, gateway, row.id);
  return Boolean(row);
}
