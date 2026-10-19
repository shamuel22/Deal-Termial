import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { loadAuthorizationSnapshot } from '../authorization/authorizations.js';
import { releaseBudget, reserveBudget } from '../authorization/budget.js';
import {
  assertBuyerAction,
  assertNoViolations,
  evaluatePurchase,
  type AuthorizationSnapshot,
  type PurchaseTerms,
} from '../authorization/policy.js';
import type { DeliveryAddress } from '../authorization/schemas.js';
import { inTransaction, type Executor, type Tx } from '../db.js';
import {
  actorRef,
  requireAdmin,
  type Actor,
  type AgentActor,
  type UserActor,
} from '../identity/actor.js';
import { notify } from '../notifications/notify.js';
import { withIdempotency } from './idempotency.js';

/**
 * Aceptación de cotizaciones y pedidos (brief §3, §5 paso 7, §10, §11).
 * Un pedido = un proveedor + una cotización aceptada. Estados comercial, financiero y de entrega
 * independientes. La aceptación reserva stock y presupuesto en la misma transacción.
 */

/** Tiempo que se retiene el stock mientras se completa el pago. */
export const STOCK_HOLD_MS = 60 * 60 * 1000;

export const acceptQuoteInput = z.object({
  negotiationId: z.uuid(),
  /** Versión exacta que se acepta: evita aceptar una cotización distinta de la revisada. */
  quoteId: z.uuid(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type AcceptQuoteInput = z.input<typeof acceptQuoteInput>;

type OrderRow = typeof schema.orders.$inferSelect;
type QuoteRow = typeof schema.quotes.$inferSelect;

export interface OrderView {
  id: string;
  status: OrderRow['status'];
  paymentMode: OrderRow['paymentMode'];
  deliveryStatus: OrderRow['deliveryStatus'];
  buyer: { orgId: string; name: string };
  supplier: { orgId: string; name: string };
  total: string;
  currency: string;
  terms: OrderTerms;
  acceptedBy: { agentId: string | null; userId: string | null; level: string | null };
  authorization: { id: string; version: number } | null;
  stockReservation: { status: string; expiresAt: Date } | null;
  budgetReservation: { status: string; amount: string } | null;
  payment: {
    status: string;
    paypalOrderId: string | null;
    paypalCaptureId: string | null;
    updatedAt: Date;
  } | null;
  incident: string | null;
  acceptedAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
}

/** Condiciones congeladas en el momento de aceptar. */
export interface OrderTerms {
  negotiationId: string;
  quoteId: string;
  quoteVersion: number;
  offerId: string;
  offerVersion: number;
  product: Record<string, unknown>;
  quantity: number;
  unit: string;
  listUnitPrice: string;
  unitPrice: string;
  subtotal: string;
  discountTotal: string;
  shipping: string;
  tax: string;
  total: string;
  currency: string;
  deliveryAddress: DeliveryAddress;
  deliverBy: string;
}

function termsOf(quote: QuoteRow, offerId: string): OrderTerms {
  return {
    negotiationId: quote.negotiationId,
    quoteId: quote.id,
    quoteVersion: quote.version,
    offerId,
    offerVersion: quote.offerVersion,
    product: quote.productSnapshot as Record<string, unknown>,
    quantity: quote.quantity,
    unit: quote.unit,
    listUnitPrice: quote.listUnitPrice,
    unitPrice: quote.unitPrice,
    subtotal: quote.subtotal,
    discountTotal: quote.discountTotal,
    shipping: quote.shipping,
    tax: quote.tax,
    total: quote.total,
    currency: quote.currency,
    deliveryAddress: quote.deliveryAddress as DeliveryAddress,
    deliverBy: quote.deliverBy,
  };
}

export function purchaseTermsOf(terms: OrderTerms, supplierOrgId: string): PurchaseTerms {
  const product = terms.product as { category?: string; attributes?: Record<string, unknown> };
  return {
    supplierOrgId,
    category: String(product.category),
    productAttributes: product.attributes ?? {},
    quantity: terms.quantity,
    unit: terms.unit,
    currency: terms.currency,
    total: terms.total,
    deliveryAddress: terms.deliveryAddress,
    deliverBy: terms.deliverBy,
  };
}

interface Loaded {
  negotiation: typeof schema.negotiations.$inferSelect;
  request: typeof schema.purchaseRequests.$inferSelect;
  quote: QuoteRow;
}

/**
 * Carga y bloquea lo necesario para aceptar, en orden fijo para evitar interbloqueos:
 * organización compradora → autorización → oferta → negociación.
 */
async function lockForAcceptance(tx: Tx, actor: Actor, negotiationId: string, quoteId: string) {
  await tx
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, actor.orgId))
    .for('no key update');

  const [row] = await tx
    .select({ negotiation: schema.negotiations, request: schema.purchaseRequests })
    .from(schema.negotiations)
    .innerJoin(
      schema.purchaseRequests,
      eq(schema.purchaseRequests.id, schema.negotiations.requestId),
    )
    .where(
      and(
        eq(schema.negotiations.id, negotiationId),
        eq(schema.negotiations.buyerOrgId, actor.orgId),
      ),
    );
  if (!row || (actor.kind === 'agent' && row.request.agentId !== actor.agentId)) {
    throw new DomainError('NOT_FOUND', 'Negociación no encontrada');
  }
  if (row.request.authorizationId) {
    await tx
      .select({ id: schema.purchaseAuthorizations.id })
      .from(schema.purchaseAuthorizations)
      .where(eq(schema.purchaseAuthorizations.id, row.request.authorizationId))
      .for('no key update');
  }
  const [offer] = await tx
    .select()
    .from(schema.offers)
    .where(eq(schema.offers.id, row.negotiation.offerId))
    .for('no key update');
  const [negotiation] = await tx
    .select()
    .from(schema.negotiations)
    .where(eq(schema.negotiations.id, negotiationId))
    .for('no key update');
  const [quote] = await tx
    .select()
    .from(schema.quotes)
    .where(and(eq(schema.quotes.id, quoteId), eq(schema.quotes.negotiationId, negotiationId)));
  if (!quote) throw new DomainError('NOT_FOUND', 'Cotización no encontrada');
  return { negotiation: negotiation!, request: row.request, quote, offer: offer! };
}

/** Pedido ya creado para esa cotización (reintento): se devuelve el mismo. */
async function existingOrder(tx: Executor, quoteId: string, buyerOrgId: string) {
  const [order] = await tx
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.quoteId, quoteId), eq(schema.orders.buyerOrgId, buyerOrgId)));
  return order;
}

function assertQuoteAcceptable(loaded: Loaded, offerStatus: string, now: Date): void {
  const { negotiation, quote } = loaded;
  if (quote.kind !== 'quote') {
    throw new DomainError(
      'QUOTE_NOT_ACCEPTABLE',
      'Solo se acepta una cotización del proveedor, no una contrapropuesta',
    );
  }
  if (quote.status === 'superseded' || quote.version !== negotiation.latestVersion) {
    throw new DomainError('QUOTE_SUPERSEDED', 'Existe una versión más reciente de la negociación', {
      latestVersion: negotiation.latestVersion,
      quoteVersion: quote.version,
    });
  }
  if (quote.status === 'expired' || quote.expiresAt.getTime() <= now.getTime()) {
    throw new DomainError('QUOTE_EXPIRED', 'La cotización venció; solicita una nueva', {
      expiresAt: quote.expiresAt.toISOString(),
    });
  }
  if (
    quote.status !== 'proposed' ||
    !['awaiting_buyer', 'pending_owner_review'].includes(negotiation.status)
  ) {
    throw new DomainError(
      'QUOTE_NOT_ACCEPTABLE',
      `La cotización no se puede aceptar (estado ${quote.status})`,
    );
  }
  if (offerStatus !== 'active') {
    throw new DomainError('QUOTE_NOT_ACCEPTABLE', 'El proveedor retiró la oferta');
  }
}

async function reserveStock(
  tx: Tx,
  offer: typeof schema.offers.$inferSelect,
  orderId: string,
  quantity: number,
  now: Date,
) {
  const [reserved] = await tx
    .select({ qty: sql<number>`coalesce(sum(${schema.stockReservations.quantity}), 0)::int` })
    .from(schema.stockReservations)
    .where(
      and(
        eq(schema.stockReservations.offerId, offer.id),
        eq(schema.stockReservations.status, 'active'),
      ),
    );
  const available = offer.stockAvailable - (reserved?.qty ?? 0);
  if (available < quantity) {
    throw new DomainError(
      'STOCK_INSUFFICIENT',
      `Existencias disponibles ${Math.max(0, available)} < ${quantity}`,
      {
        available: Math.max(0, available),
        requested: quantity,
      },
    );
  }
  const expiresAt = new Date(now.getTime() + STOCK_HOLD_MS);
  await tx
    .insert(schema.stockReservations)
    .values({ offerId: offer.id, orderId, quantity, expiresAt });
  return expiresAt;
}

async function payeeOf(tx: Executor, supplierOrgId: string): Promise<string | null> {
  const [seller] = await tx
    .select({ merchantId: schema.sellerAccounts.merchantId, status: schema.sellerAccounts.status })
    .from(schema.sellerAccounts)
    .where(eq(schema.sellerAccounts.orgId, supplierOrgId));
  return seller?.status === 'active' ? seller.merchantId : null;
}

interface CreateOrderArgs {
  actor: Actor;
  loaded: Loaded;
  offer: typeof schema.offers.$inferSelect;
  authorization: AuthorizationSnapshot | null;
  paymentMode: 'manual' | 'delegated';
  enforceLimits: boolean;
  checks: string[];
  now: Date;
}

async function createOrder(tx: Tx, a: CreateOrderArgs): Promise<OrderRow> {
  const { negotiation, request, quote } = a.loaded;
  const terms = termsOf(quote, negotiation.offerId);
  const [order] = await tx
    .insert(schema.orders)
    .values({
      buyerOrgId: negotiation.buyerOrgId,
      supplierOrgId: negotiation.supplierOrgId,
      quoteId: quote.id,
      authorizationId: a.authorization?.id ?? null,
      authorizationVersion: a.authorization?.version ?? null,
      acceptedByAgentId: a.actor.kind === 'agent' ? a.actor.agentId : null,
      acceptedByUserId: a.actor.kind === 'user' ? a.actor.userId : null,
      acceptedWithLevel: a.actor.kind === 'agent' ? a.actor.grant.buyerLevel : a.actor.role,
      status: 'pending_payment',
      paymentMode: a.paymentMode,
      total: quote.total,
      currency: quote.currency,
      payeeMerchantId: await payeeOf(tx, negotiation.supplierOrgId),
      terms,
      acceptedAt: a.now,
    })
    .returning();

  const stockExpiresAt = await reserveStock(tx, a.offer, order!.id, quote.quantity, a.now);
  const budget = await reserveBudget(tx, {
    orgId: negotiation.buyerOrgId,
    authorizationId: a.authorization?.id ?? null,
    orderId: order!.id,
    amount: quote.total,
    now: a.now,
    enforceLimits: a.enforceLimits,
  });

  await tx.update(schema.quotes).set({ status: 'accepted' }).where(eq(schema.quotes.id, quote.id));
  await tx
    .update(schema.negotiations)
    .set({ status: 'agreed', updatedAt: a.now })
    .where(eq(schema.negotiations.id, negotiation.id));
  // Una compra por solicitud: el resto de negociaciones abiertas se cierran.
  await tx
    .update(schema.negotiations)
    .set({ status: 'closed', updatedAt: a.now })
    .where(
      and(
        eq(schema.negotiations.requestId, request.id),
        ne(schema.negotiations.id, negotiation.id),
      ),
    );
  await tx
    .update(schema.purchaseRequests)
    .set({ status: 'closed', updatedAt: a.now })
    .where(eq(schema.purchaseRequests.id, request.id));

  await audit(tx, {
    orgId: negotiation.buyerOrgId,
    ...actorRef(a.actor),
    action: 'order.accepted',
    resourceType: 'order',
    resourceId: order!.id,
    outcome: 'succeeded',
    details: {
      quoteId: quote.id,
      quoteVersion: quote.version,
      total: quote.total,
      paymentMode: a.paymentMode,
      authorization: a.authorization
        ? { id: a.authorization.id, version: a.authorization.version }
        : null,
      level: a.actor.kind === 'agent' ? a.actor.grant.buyerLevel : a.actor.role,
      checks: a.checks,
      stockHeldUntil: stockExpiresAt.toISOString(),
      budget: {
        authorizationAvailableAfter: budget.authorizationAvailableAfter,
        monthlyAvailableAfter: budget.monthlyAvailableAfter,
      },
    },
  });
  await notify(tx, {
    orgId: negotiation.supplierOrgId,
    kind: 'order.accepted',
    title: 'Nuevo pedido aceptado',
    body: `Pedido por ${quote.total} ${quote.currency}: ${quote.quantity} ${quote.unit}, entrega ${quote.deliverBy}.`,
    resourceType: 'order',
    resourceId: order!.id,
  });
  return order!;
}

/**
 * `accept_quote` del agente con autonomía total: verifica en el servidor nivel vigente,
 * autorización vigente y todas las condiciones; reserva stock y presupuesto; crea el pedido.
 * Reintentar devuelve el mismo pedido (criterio 12).
 */
export async function acceptQuote(
  db: Executor,
  actor: AgentActor,
  input: AcceptQuoteInput,
  now = new Date(),
): Promise<OrderView> {
  const data = acceptQuoteInput.parse(input);
  let orderId: string;
  try {
    assertBuyerAction(actor, 'accept_quote');
    orderId = await withIdempotency(
      db,
      {
        scope: `agent:${actor.agentId}`,
        key: data.idempotencyKey,
        operation: 'accept_quote',
        payload: data,
      },
      async (tx) => {
        const locked = await lockForAcceptance(tx, actor, data.negotiationId, data.quoteId);
        const retry = await existingOrder(tx, locked.quote.id, actor.orgId);
        if (retry) return retry.id;

        assertQuoteAcceptable(locked, locked.offer.status, now);
        if (!locked.request.authorizationId) {
          throw new DomainError(
            'AUTHORIZATION_NOT_FOUND',
            'La solicitud no está vinculada a una autorización de compra; el agente no puede aceptar por su cuenta',
          );
        }
        const authorization = await loadAuthorizationSnapshot(
          tx,
          actor.orgId,
          locked.request.authorizationId,
          now,
        );
        if (authorization.agentId !== actor.agentId) {
          throw new DomainError(
            'AUTHORIZATION_NOT_FOUND',
            'La autorización pertenece a otro agente',
          );
        }
        const terms = purchaseTermsOf(
          termsOf(locked.quote, locked.negotiation.offerId),
          locked.negotiation.supplierOrgId,
        );
        assertNoViolations(evaluatePurchase(authorization, terms, now));

        const order = await createOrder(tx, {
          actor,
          loaded: locked,
          offer: locked.offer,
          authorization,
          paymentMode: 'delegated',
          enforceLimits: true,
          checks: [
            'nivel full_autonomy vigente',
            `autorización ${authorization.id} v${authorization.version} activa`,
            'cotización vigente y última versión',
            'categoría, atributos, cantidad, proveedor, moneda, total, destino y plazo dentro de la autorización',
            'stock y presupuesto reservados',
          ],
          now,
        });
        return order.id;
      },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      // Se audita después de revertir la transacción: dentro de ella, la inserción esperaría
      // por los bloqueos que la propia transacción mantiene.
      await audit(db, {
        orgId: actor.orgId,
        actorType: 'agent',
        actorId: actor.agentId,
        action: 'order.accept_denied',
        resourceType: 'negotiation',
        resourceId: data.negotiationId,
        outcome: 'denied',
        details: { code: error.code, message: error.message, quoteId: data.quoteId },
      });
    }
    throw error;
  }
  return getOrder(db, actor, orderId);
}

/**
 * Aceptación manual del dueño desde el portal (nivel "solo negociación" o revisión de una
 * propuesta). Crea el pedido pendiente de pago con checkout manual. Los límites delegados
 * al agente no restringen al dueño, pero el gasto queda registrado.
 */
export async function ownerAcceptQuote(
  db: Executor,
  actor: UserActor,
  input: AcceptQuoteInput,
  now = new Date(),
): Promise<OrderView> {
  requireAdmin(actor);
  const data = acceptQuoteInput.parse(input);
  const orderId = await withIdempotency(
    db,
    {
      scope: `user:${actor.userId}`,
      key: data.idempotencyKey,
      operation: 'owner_accept_quote',
      payload: data,
    },
    async (tx) => {
      const locked = await lockForAcceptance(tx, actor, data.negotiationId, data.quoteId);
      const retry = await existingOrder(tx, locked.quote.id, actor.orgId);
      if (retry) return retry.id;
      assertQuoteAcceptable(locked, locked.offer.status, now);
      const authorization = locked.request.authorizationId
        ? await loadAuthorizationSnapshot(tx, actor.orgId, locked.request.authorizationId, now)
        : null;
      const order = await createOrder(tx, {
        actor,
        loaded: locked,
        offer: locked.offer,
        authorization,
        paymentMode: 'manual',
        enforceLimits: false,
        checks: [
          'aceptación manual del dueño con sesión',
          'cotización vigente y última versión',
          'stock reservado',
        ],
        now,
      });
      return order.id;
    },
  );
  return getOrder(db, actor, orderId);
}

async function loadOrder(db: Executor, actor: Actor, orderId: string, lock = false) {
  if (!z.uuid().safeParse(orderId).success)
    throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
  const query = db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  const [order] = lock ? await query.for('no key update') : await query;
  if (!order) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
  const side =
    order.buyerOrgId === actor.orgId
      ? 'buyer'
      : order.supplierOrgId === actor.orgId
        ? 'supplier'
        : null;
  if (!side) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
  if (actor.kind === 'agent' && side === 'buyer') {
    // Un agente comprador solo ve pedidos de sus propias negociaciones.
    const [own] = await db
      .select({ agentId: schema.purchaseRequests.agentId })
      .from(schema.quotes)
      .innerJoin(schema.negotiations, eq(schema.negotiations.id, schema.quotes.negotiationId))
      .innerJoin(
        schema.purchaseRequests,
        eq(schema.purchaseRequests.id, schema.negotiations.requestId),
      )
      .where(eq(schema.quotes.id, order.quoteId));
    if (own?.agentId !== actor.agentId) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
  }
  if (actor.kind === 'agent' && side === 'supplier' && actor.grant.sellerScopes.length === 0) {
    throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
  }
  if (actor.kind === 'user') requireAdmin(actor);
  return { order, side };
}

async function toView(db: Executor, order: OrderRow): Promise<OrderView> {
  const [orgs, [stock], [budget], [payment]] = await Promise.all([
    db
      .select({ id: schema.organizations.id, name: schema.organizations.name })
      .from(schema.organizations)
      .where(inArray(schema.organizations.id, [order.buyerOrgId, order.supplierOrgId])),
    db
      .select()
      .from(schema.stockReservations)
      .where(eq(schema.stockReservations.orderId, order.id)),
    db
      .select()
      .from(schema.budgetReservations)
      .where(eq(schema.budgetReservations.orderId, order.id)),
    db
      .select()
      .from(schema.paymentAttempts)
      .where(eq(schema.paymentAttempts.orderId, order.id))
      .orderBy(desc(schema.paymentAttempts.createdAt))
      .limit(1),
  ]);
  const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? '';
  return {
    id: order.id,
    status: order.status,
    paymentMode: order.paymentMode,
    deliveryStatus: order.deliveryStatus,
    buyer: { orgId: order.buyerOrgId, name: name(order.buyerOrgId) },
    supplier: { orgId: order.supplierOrgId, name: name(order.supplierOrgId) },
    total: order.total,
    currency: order.currency,
    terms: order.terms as OrderTerms,
    acceptedBy: {
      agentId: order.acceptedByAgentId,
      userId: order.acceptedByUserId,
      level: order.acceptedWithLevel,
    },
    authorization:
      order.authorizationId && order.authorizationVersion !== null
        ? { id: order.authorizationId, version: order.authorizationVersion }
        : null,
    stockReservation: stock ? { status: stock.status, expiresAt: stock.expiresAt } : null,
    budgetReservation: budget ? { status: budget.status, amount: budget.amount } : null,
    // Solo estado y referencias PayPal; nunca tokens.
    payment: payment
      ? {
          status: payment.status,
          paypalOrderId: payment.paypalOrderId,
          paypalCaptureId: payment.paypalCaptureId,
          updatedAt: payment.updatedAt,
        }
      : null,
    incident: order.incident,
    acceptedAt: order.acceptedAt,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
  };
}

/** `get_order`: estado comercial, financiero y de entrega para un participante autorizado. */
export async function getOrder(db: Executor, actor: Actor, orderId: string): Promise<OrderView> {
  const { order } = await loadOrder(db, actor, orderId);
  return toView(db, order);
}

export async function listOrders(
  db: Executor,
  actor: Actor,
  filter: { side?: 'buyer' | 'supplier' } = {},
): Promise<OrderView[]> {
  if (actor.kind === 'user') requireAdmin(actor);
  const side =
    filter.side ?? (actor.kind === 'agent' && !actor.grant.buyerLevel ? 'supplier' : 'buyer');
  const rows = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(
      eq(side === 'buyer' ? schema.orders.buyerOrgId : schema.orders.supplierOrgId, actor.orgId),
    )
    .orderBy(desc(schema.orders.createdAt));
  const views: OrderView[] = [];
  for (const row of rows) {
    try {
      views.push(await getOrder(db, actor, row.id));
    } catch (error) {
      // Pedidos de otros agentes de la misma organización: no visibles para este agente.
      if (!(error instanceof DomainError && error.code === 'NOT_FOUND')) throw error;
    }
  }
  return views;
}

/** Libera las reservas de un pedido que no llegó a pagarse. */
async function releaseReservations(
  tx: Tx,
  orderId: string,
  stockStatus: 'released' | 'expired',
  now: Date,
) {
  await tx
    .update(schema.stockReservations)
    .set({ status: stockStatus, updatedAt: now })
    .where(
      and(
        eq(schema.stockReservations.orderId, orderId),
        eq(schema.stockReservations.status, 'active'),
      ),
    );
  await releaseBudget(tx, orderId, now);
}

/** Intentos de pago que podrían terminar en cobro: impiden cancelar o vencer el pedido. */
async function hasPaymentInFlight(tx: Executor, orderId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: schema.paymentAttempts.id })
    .from(schema.paymentAttempts)
    .where(
      and(
        eq(schema.paymentAttempts.orderId, orderId),
        // Un checkout pendiente de aprobación no bloquea: solo se captura si el pedido sigue pagable.
        inArray(schema.paymentAttempts.status, ['created', 'processing', 'unknown', 'completed']),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export const cancelOrderInput = z.object({
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type CancelOrderInput = z.input<typeof cancelOrderInput>;

/** `cancel_order`: solo antes del pago. Libera stock y presupuesto. */
export async function cancelOrder(
  db: Executor,
  actor: Actor,
  orderId: string,
  input: CancelOrderInput = {},
  now = new Date(),
): Promise<OrderView> {
  const data = cancelOrderInput.parse(input);
  await withIdempotency(
    db,
    {
      scope: actor.kind === 'agent' ? `agent:${actor.agentId}` : `user:${actor.userId}`,
      key: data.idempotencyKey,
      operation: 'cancel_order',
      payload: { orderId, reason: data.reason ?? null },
    },
    async (tx) => {
      const { order, side } = await loadOrder(tx, actor, orderId, true);
      if (side !== 'buyer')
        throw new DomainError('FORBIDDEN', 'Solo el comprador puede cancelar el pedido');
      if (actor.kind === 'agent') assertBuyerAction(actor, 'accept_quote');
      if (order.status === 'cancelled') return null;
      if (!['pending_review', 'pending_payment'].includes(order.status)) {
        throw new DomainError('INVALID_STATE', `No se puede cancelar un pedido ${order.status}`);
      }
      if (await hasPaymentInFlight(tx, order.id)) {
        throw new DomainError(
          'INVALID_STATE',
          'Hay un pago en curso o por reconciliar; no se puede cancelar',
        );
      }
      await tx
        .update(schema.orders)
        .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
        .where(eq(schema.orders.id, order.id));
      await releaseReservations(tx, order.id, 'released', now);
      await audit(tx, {
        orgId: actor.orgId,
        ...actorRef(actor),
        action: 'order.cancelled',
        resourceType: 'order',
        resourceId: order.id,
        outcome: 'succeeded',
        details: { reason: data.reason ?? null },
      });
      await notify(tx, {
        orgId: order.supplierOrgId,
        kind: 'order.cancelled',
        title: 'Pedido cancelado por el comprador',
        body: data.reason ?? 'Sin motivo indicado.',
        resourceType: 'order',
        resourceId: order.id,
      });
      return null;
    },
  );
  return getOrder(db, actor, orderId);
}

/**
 * Vence los pedidos impagos cuya reserva de stock caducó. Los que tienen un pago en curso o
 * incierto no se tocan: se resuelven por reconciliación (brief §10, §11).
 */
export async function expireUnpaidOrders(db: Executor, now: Date): Promise<number> {
  const due = await db
    .select({ orderId: schema.stockReservations.orderId })
    .from(schema.stockReservations)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.stockReservations.orderId))
    .where(
      and(
        eq(schema.stockReservations.status, 'active'),
        lte(schema.stockReservations.expiresAt, now),
        inArray(schema.orders.status, ['pending_review', 'pending_payment']),
      ),
    )
    .orderBy(asc(schema.stockReservations.expiresAt));
  let expired = 0;
  for (const { orderId } of due) {
    const done = await inTransaction(db, async (tx) => {
      const [order] = await tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId))
        .for('no key update');
      if (!order || !['pending_review', 'pending_payment'].includes(order.status)) return false;
      if (await hasPaymentInFlight(tx, orderId)) return false;
      await tx
        .update(schema.orders)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(schema.orders.id, orderId));
      await releaseReservations(tx, orderId, 'expired', now);
      await audit(tx, {
        orgId: order.buyerOrgId,
        actorType: 'system',
        actorId: null,
        action: 'order.expired',
        resourceType: 'order',
        resourceId: orderId,
        outcome: 'succeeded',
        details: { reason: 'Reserva de stock vencida sin pago' },
      });
      return true;
    });
    if (done) expired += 1;
  }
  return expired;
}
