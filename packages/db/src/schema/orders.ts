import { char, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, money, tstz, updatedAt } from './columns.js';
import {
  deliveryStatus,
  orderStatus,
  paymentMode,
  paymentStatus,
  refundStatus,
  reservationStatus,
} from './enums.js';
import { paymentConnections, purchaseAuthorizations } from './authorization.js';
import { offers } from './catalog.js';
import { quotes } from './negotiation.js';
import { agents, organizations, users } from './identity.js';

/**
 * Pedido: un proveedor, una cotización aceptada. Los estados comercial, financiero y de entrega
 * son independientes. `terms` congela todas las condiciones aceptadas.
 */
export const orders = pgTable(
  'orders',
  {
    id: id(),
    buyerOrgId: uuid('buyer_org_id')
      .notNull()
      .references(() => organizations.id),
    supplierOrgId: uuid('supplier_org_id')
      .notNull()
      .references(() => organizations.id),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id),
    authorizationId: uuid('authorization_id').references(() => purchaseAuthorizations.id),
    authorizationVersion: integer('authorization_version'),
    // Quién aceptó: el agente (autonomía total) o el dueño desde el portal.
    acceptedByAgentId: uuid('accepted_by_agent_id').references(() => agents.id),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id),
    // Nivel del agente al aceptar, para auditoría.
    acceptedWithLevel: text('accepted_with_level'),
    status: orderStatus('status').notNull(),
    paymentMode: paymentMode('payment_mode').notNull(),
    deliveryStatus: deliveryStatus('delivery_status').notNull().default('not_shipped'),
    total: money('total').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    payeeMerchantId: text('payee_merchant_id'),
    terms: jsonb('terms').notNull(),
    // Incidencia que requiere resolución expresa (p. ej. pago tardío tras vencer el stock).
    incident: text('incident'),
    acceptedAt: tstz('accepted_at').notNull(),
    paidAt: tstz('paid_at'),
    cancelledAt: tstz('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Una cotización solo puede generar un pedido: base de la idempotencia de aceptación.
    uniqueIndex('orders_quote_uq').on(t.quoteId),
    index('orders_buyer_idx').on(t.buyerOrgId, t.status),
    index('orders_supplier_idx').on(t.supplierOrgId, t.status),
  ],
);

/** Intento de pago. `requestId` es la clave de idempotencia enviada a PayPal. */
export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    mode: paymentMode('mode').notNull(),
    status: paymentStatus('status').notNull().default('created'),
    amount: money('amount').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    payeeMerchantId: text('payee_merchant_id').notNull(),
    paymentConnectionId: uuid('payment_connection_id').references(() => paymentConnections.id),
    requestId: text('request_id').notNull(),
    paypalOrderId: text('paypal_order_id'),
    paypalCaptureId: text('paypal_capture_id'),
    paypalDebugId: text('paypal_debug_id'),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payment_attempts_request_uq').on(t.requestId),
    uniqueIndex('payment_attempts_paypal_order_uq').on(t.paypalOrderId),
    index('payment_attempts_order_idx').on(t.orderId, t.status),
  ],
);

/** Reembolso vinculado a un pago. Confirmarlo no restaura el presupuesto delegado. */
export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    paymentAttemptId: uuid('payment_attempt_id')
      .notNull()
      .references(() => paymentAttempts.id),
    amount: money('amount').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    status: refundStatus('status').notNull().default('requested'),
    reason: text('reason'),
    requestedByAgentId: uuid('requested_by_agent_id').references(() => agents.id),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
    authorizedByAgentId: uuid('authorized_by_agent_id').references(() => agents.id),
    authorizedByUserId: uuid('authorized_by_user_id').references(() => users.id),
    requestId: text('request_id').notNull(),
    paypalRefundId: text('paypal_refund_id'),
    failureMessage: text('failure_message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('refunds_request_uq').on(t.requestId),
    index('refunds_order_idx').on(t.orderId),
  ],
);

/** Reserva de stock previa a ejecutar la compra; caduca si el pago no llega a tiempo. */
export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: id(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    quantity: integer('quantity').notNull(),
    status: reservationStatus('status').notNull().default('active'),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('stock_reservations_order_uq').on(t.orderId),
    index('stock_reservations_offer_idx').on(t.offerId, t.status),
  ],
);

/**
 * Reserva de presupuesto. Cuenta contra el encargo y contra el límite mensual de la organización.
 * active = reservado (incluye pagos en curso o inciertos), consumed = pago confirmado, released = liberado.
 */
export const budgetReservations = pgTable(
  'budget_reservations',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    authorizationId: uuid('authorization_id').references(() => purchaseAuthorizations.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    amount: money('amount').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    // Mes UTC al que se imputa, formato YYYY-MM.
    period: char('period', { length: 7 }).notNull(),
    status: reservationStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('budget_reservations_order_uq').on(t.orderId),
    index('budget_reservations_authorization_idx').on(t.authorizationId, t.status),
    index('budget_reservations_period_idx').on(t.orgId, t.period, t.status),
  ],
);
