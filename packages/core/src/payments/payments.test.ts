import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { DomainError, type ErrorCode } from '@deal/shared';
import { createAuthorization, revokeAuthorization } from '../authorization/authorizations.js';
import { authorizationBudgetSummary } from '../authorization/budget.js';
import { createRequest } from '../catalog/requests.js';
import type { AgentActor, BuyerLevel, UserActor } from '../identity/actor.js';
import { counterQuote, requestQuote, submitForReview } from '../negotiation/negotiations.js';
import {
  acceptQuote,
  expireUnpaidOrders,
  getOrder,
  ownerAcceptQuote,
  STOCK_HOLD_MS,
} from '../orders/orders.js';
import { FakeGateway } from '../testing/fake-gateway.js';
import { demoTerms, newAgent, newCompany, newOffer } from '../testing/fixtures.js';
import { completeCheckout, executePurchase, reconcileAttempt, startCheckout } from './payments.js';
import { approveRefund, rejectRefund, requestRefund } from './refunds.js';
import { getSellerAccount, refreshSellerAccount, startSellerOnboarding } from './sellers.js';
import { processWebhook, recordWebhook } from './webhooks.js';

let h: DbHandle;
let gw: FakeGateway;
const NOW = new Date('2026-10-20T12:00:00Z');
const URLS = { returnUrl: 'https://dt.test/return', cancelUrl: 'https://dt.test/cancel' };
const MERCHANT = 'MERCHANT-A';

beforeAll(async () => {
  h = await createTestDatabase();
});

afterAll(async () => {
  await h?.close();
});

beforeEach(() => {
  gw = new FakeGateway();
});

async function expectCode(p: Promise<unknown>, code: ErrorCode) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e, `se esperaba ${code}`).toBeInstanceOf(DomainError);
  expect((e as DomainError).code).toBe(code);
}

interface Scene {
  buyer: UserActor;
  agent: AgentActor;
  supplier: UserActor;
  offerId: string;
  authorizationId: string;
  negotiationId: string;
  quoteId: string;
}

async function scene(level: BuyerLevel = 'full_autonomy', sellerConnected = true): Promise<Scene> {
  const buyer = await newCompany(h.db, 'Taqueria');
  const agent = await newAgent(h.db, buyer, level);
  const supplier = await newCompany(h.db, 'EcoPack');
  if (sellerConnected) {
    await h.db.insert(schema.sellerAccounts).values({
      orgId: supplier.orgId,
      status: 'active',
      trackingId: `t-${supplier.orgId}`,
      merchantId: MERCHANT,
      paymentsReceivable: true,
      primaryEmailConfirmed: true,
    });
  }
  const { offerId } = await newOffer(h.db, supplier.orgId, {
    tiers: [
      { minQty: 50, unitPrice: '0.3100' },
      { minQty: 250, unitPrice: '0.2400' },
    ],
    shippingFlat: '5.00',
    taxRate: '0.0825',
    stockAvailable: 1000,
    rules: {
      maxDiscount: '0.1000',
      floorUnitPrice: '0.2200',
      minQtyForDiscount: 250,
      minLeadTimeDays: 1,
    },
  });
  const auth = await createAuthorization(
    h.db,
    buyer,
    { agentId: agent.agentId, terms: demoTerms() },
    NOW,
  );
  const request = await createRequest(h.db, agent, { authorizationId: auth.id }, NOW);
  let n = await requestQuote(h.db, agent, { requestId: request.id, offerId }, NOW);
  n = await counterQuote(h.db, agent, n.id, { unitPrice: '0.2000' }, NOW);
  return {
    buyer,
    agent,
    supplier,
    offerId,
    authorizationId: auth.id,
    negotiationId: n.id,
    quoteId: n.quotes.at(-1)!.id,
  };
}

async function connectFinancial(orgId: string, userId: string, payee = MERCHANT) {
  await h.db.insert(schema.paymentConnections).values({
    orgId,
    status: 'active',
    scope: 'merchant',
    payeeMerchantId: payee,
    paymentTokenId: 'VAULT-TOKEN-SECRETO',
    createdByUserId: userId,
    activatedAt: NOW,
  });
}

const execute = (s: Scene) =>
  executePurchase(h.db, gw, s.agent, { negotiationId: s.negotiationId, quoteId: s.quoteId }, NOW);

describe('pago delegado (execute_purchase)', () => {
  it('sin autorización financiera: el pedido queda pendiente de pago del dueño (criterio 6)', async () => {
    const s = await scene();
    const { order, payment } = await execute(s);
    expect(payment).toMatchObject({
      status: 'owner_action_required',
      reason: 'PAYMENT_CONNECTION_INACTIVE',
    });
    expect(order).toMatchObject({
      status: 'pending_payment',
      budgetReservation: { status: 'active' },
    });
    expect(gw.captures).toEqual([]);
    const notes = await h.db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.orgId, s.buyer.orgId),
          eq(schema.notifications.kind, 'order.owner_payment_required'),
        ),
      );
    expect(notes).toHaveLength(1);
  });

  it('con autorización financiera: cobra sin checkout el importe exacto al proveedor (criterios 5 y 9)', async () => {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId);
    const { order, payment } = await execute(s);
    expect(payment).toMatchObject({ status: 'completed', mode: 'delegated' });
    expect(gw.captures).toEqual([
      { orderId: expect.any(String), amount: '76.86', payee: MERCHANT },
    ]);
    expect(order).toMatchObject({
      status: 'paid',
      budgetReservation: { status: 'consumed' },
      stockReservation: { status: 'consumed' },
      payment: { status: 'completed', paypalCaptureId: expect.stringMatching(/^CAP-/) },
    });
    const [offer] = await h.db.select().from(schema.offers).where(eq(schema.offers.id, s.offerId));
    expect(offer!.stockAvailable).toBe(700);
    expect(JSON.stringify(order)).not.toContain('VAULT-TOKEN-SECRETO');
  });

  it('reintentos y llamadas concurrentes no generan un segundo cobro (criterio 12)', async () => {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId);
    const results = await Promise.all([execute(s), execute(s), execute(s)]);
    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
    expect(gw.captures).toHaveLength(1);
    expect((await execute(s)).payment.status).toBe('completed');
    expect(gw.captures).toHaveLength(1);
  });

  it('una autorización financiera de otro proveedor no cubre el pedido', async () => {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId, 'OTRO-PROVEEDOR');
    expect((await execute(s)).payment.status).toBe('owner_action_required');
  });

  it('la revocación entre aceptar y pagar impide el cobro (criterio 15)', async () => {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId);
    const order = await acceptQuote(
      h.db,
      s.agent,
      { negotiationId: s.negotiationId, quoteId: s.quoteId },
      NOW,
    );
    await revokeAuthorization(h.db, s.buyer, s.authorizationId, NOW);
    await expectCode(
      executePurchase(h.db, gw, s.agent, { orderId: order.id }, NOW),
      'AUTHORIZATION_REVOKED',
    );
    expect(gw.captures).toEqual([]);
  });

  it('un resultado desconocido conserva la reserva y se reconcilia sin cobrar dos veces (criterio 13)', async () => {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId);
    gw.nextCreate = 'unknown_after_create';
    const first = await execute(s);
    expect(first.payment.status).toBe('unknown');
    expect(first.order).toMatchObject({
      status: 'pending_payment',
      budgetReservation: { status: 'active' },
    });
    // El pedido no vence mientras el resultado sea incierto.
    await expireUnpaidOrders(h.db, new Date(NOW.getTime() + STOCK_HOLD_MS + 1));
    expect((await getOrder(h.db, s.agent, first.order.id)).status).toBe('pending_payment');

    const reconciled = await reconcileAttempt(h.db, gw, first.payment.attemptId!);
    expect(reconciled.status).toBe('completed');
    expect(gw.captures).toHaveLength(1);
    expect((await getOrder(h.db, s.agent, first.order.id)).status).toBe('paid');
  });

  it('un rechazo de PayPal deja el pedido pendiente y el dueño puede pagarlo manualmente', async () => {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId);
    gw.nextCreate = { reject: 'INSTRUMENT_DECLINED' };
    const { order, payment } = await execute(s);
    expect(payment).toMatchObject({ status: 'failed', reason: 'INSTRUMENT_DECLINED' });
    expect(order.status).toBe('pending_payment');
    const checkout = await startCheckout(h.db, gw, s.buyer, order.id, URLS);
    expect(checkout.approveUrl).toContain('checkoutnow');
  });

  it('una discrepancia de importe o beneficiario se registra como incidencia', async () => {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId);
    gw.tamper = { amount: '1.00' };
    const { order } = await execute(s);
    expect(order.status).toBe('paid');
    expect(order.incident).toContain('Discrepancia');
  });

  it('solo negociación no puede ejecutar pagos (criterio 4)', async () => {
    const s = await scene('negotiate');
    await expectCode(execute(s), 'LEVEL_INSUFFICIENT');
  });
});

describe('checkout manual del dueño (criterio 17)', () => {
  async function ownerOrder() {
    const s = await scene('negotiate');
    await submitForReview(h.db, s.agent, s.negotiationId, {}, NOW);
    const order = await ownerAcceptQuote(
      h.db,
      s.buyer,
      { negotiationId: s.negotiationId, quoteId: s.quoteId },
      NOW,
    );
    return { s, order };
  }

  it('aprobación y captura con importe y beneficiario del acuerdo', async () => {
    const { s, order } = await ownerOrder();
    const started = await startCheckout(h.db, gw, s.buyer, order.id, URLS);
    expect(started).toMatchObject({ status: 'requires_action', mode: 'manual' });
    // Reabrir el checkout reutiliza la misma orden de PayPal.
    const again = await startCheckout(h.db, gw, s.buyer, order.id, URLS);
    expect(again.approveUrl).toBe(started.approveUrl);
    expect(gw.orders.size).toBe(1);

    const [ppOrder] = [...gw.orders.values()];
    expect(ppOrder!.input).toMatchObject({
      amount: '76.86',
      currency: 'USD',
      payeeMerchantId: MERCHANT,
    });
    gw.approve(ppOrder!.id);
    const done = await completeCheckout(h.db, gw, s.buyer, ppOrder!.id);
    expect(done.payment.status).toBe('completed');
    await completeCheckout(h.db, gw, s.buyer, ppOrder!.id);
    expect(gw.captures).toHaveLength(1);
    expect((await getOrder(h.db, s.buyer, order.id)).status).toBe('paid');
  });

  it('no se captura si el pedido venció antes de volver de PayPal', async () => {
    const { s, order } = await ownerOrder();
    await startCheckout(h.db, gw, s.buyer, order.id, URLS);
    const [ppOrder] = [...gw.orders.values()];
    gw.approve(ppOrder!.id);
    await expireUnpaidOrders(h.db, new Date(NOW.getTime() + STOCK_HOLD_MS + 1));
    const result = await completeCheckout(h.db, gw, s.buyer, ppOrder!.id);
    expect(result.payment).toMatchObject({ status: 'failed', reason: 'ORDER_NOT_PAYABLE' });
    expect(gw.captures).toEqual([]);
  });

  it('exige proveedor conectado y no se ofrece a agentes', async () => {
    const s = await scene('negotiate', false);
    await submitForReview(h.db, s.agent, s.negotiationId, {}, NOW);
    const order = await ownerAcceptQuote(
      h.db,
      s.buyer,
      { negotiationId: s.negotiationId, quoteId: s.quoteId },
      NOW,
    );
    await expectCode(startCheckout(h.db, gw, s.buyer, order.id, URLS), 'SELLER_NOT_CONNECTED');
    await expectCode(
      startCheckout(h.db, gw, s.agent as unknown as UserActor, order.id, URLS),
      'FORBIDDEN',
    );
  });
});

describe('webhooks', () => {
  it('un webhook repetido o fuera de orden no altera un pago ya confirmado (criterio 17)', async () => {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId);
    gw.nextCreate = 'unknown_after_create';
    const { payment, order } = await execute(s);
    const [ppOrder] = [...gw.orders.values()];
    // El intento quedó sin id de PayPal; el reconciliador lo enlaza por la clave de idempotencia.
    await reconcileAttempt(h.db, gw, payment.attemptId!);

    const event = {
      id: `WH-${order.id}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: `CAP-${ppOrder!.id}`,
        supplementary_data: { related_ids: { order_id: ppOrder!.id } },
      },
    };
    const first = await recordWebhook(h.db, event);
    const dup = await recordWebhook(h.db, event);
    expect(first.isNew).toBe(true);
    expect(dup).toEqual({ id: first.id, isNew: false });
    await processWebhook(h.db, gw, first.id);

    const late = await recordWebhook(h.db, {
      ...event,
      id: `WH2-${order.id}`,
      event_type: 'PAYMENT.CAPTURE.DENIED',
    });
    await processWebhook(h.db, gw, late.id);
    expect((await getOrder(h.db, s.agent, order.id)).status).toBe('paid');
    expect(gw.captures).toHaveLength(1);
  });

  it('un webhook confirma un checkout aprobado si el comprador no volvió al sitio', async () => {
    const s = await scene('negotiate');
    await submitForReview(h.db, s.agent, s.negotiationId, {}, NOW);
    const order = await ownerAcceptQuote(
      h.db,
      s.buyer,
      { negotiationId: s.negotiationId, quoteId: s.quoteId },
      NOW,
    );
    await startCheckout(h.db, gw, s.buyer, order.id, URLS);
    const [ppOrder] = [...gw.orders.values()];
    gw.approve(ppOrder!.id);
    const event = await recordWebhook(h.db, {
      id: `WH-APPROVED-${order.id}`,
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: ppOrder!.id },
    });
    await processWebhook(h.db, gw, event.id);
    expect((await getOrder(h.db, s.buyer, order.id)).status).toBe('paid');
  });
});

describe('reembolsos (criterio 14)', () => {
  async function paidOrder() {
    const s = await scene();
    await connectFinancial(s.buyer.orgId, s.buyer.userId);
    const { order } = await execute(s);
    return { s, order };
  }

  it('el proveedor autoriza, PayPal confirma y el presupuesto delegado no se restaura', async () => {
    const { s, order } = await paidOrder();
    const before = await authorizationBudgetSummary(h.db, s.authorizationId);
    const refund = await requestRefund(h.db, s.agent, order.id, {
      amount: '20.00',
      reason: 'Llegaron 80 tapas rotas',
    });
    expect(refund.status).toBe('requested');

    const quoter = await newAgent(h.db, s.supplier, null, ['submit_quotes']);
    const refunder = await newAgent(h.db, s.supplier, null, ['approve_refunds']);
    await expectCode(approveRefund(h.db, gw, quoter, refund.id), 'SELLER_SCOPE_MISSING');
    await expectCode(approveRefund(h.db, gw, s.buyer, refund.id), 'NOT_FOUND');

    const done = await approveRefund(h.db, gw, refunder, refund.id);
    expect(done).toMatchObject({
      status: 'completed',
      paypalRefundId: expect.stringMatching(/^RF-/),
    });
    expect(await authorizationBudgetSummary(h.db, s.authorizationId)).toEqual(before);

    // No se puede pedir más de lo cobrado menos lo ya devuelto.
    await expectCode(
      requestRefund(h.db, s.agent, order.id, { amount: '60.00', reason: 'x' }),
      'VALIDATION_FAILED',
    );
  });

  it('el proveedor puede rechazar una solicitud', async () => {
    const { s, order } = await paidOrder();
    const refund = await requestRefund(h.db, s.buyer, order.id, { reason: 'No los necesitamos' });
    expect(refund.amount).toBe('76.86');
    const rejected = await rejectRefund(h.db, s.supplier, refund.id, 'Producto entregado conforme');
    expect(rejected.status).toBe('failed');
    expect(gw.refunds.size).toBe(0);
  });
});

describe('conexión de cobro del proveedor', () => {
  it('genera el enlace de PayPal y activa la cuenta cuando PayPal confirma', async () => {
    const supplier = await newCompany(h.db, 'GreenBox');
    const started = await startSellerOnboarding(
      h.db,
      gw,
      supplier,
      'https://dt.test/seller/return',
    );
    expect(started.actionUrl).toContain(`org-${supplier.orgId}`);
    expect(started.account.status).toBe('pending');

    gw.merchants.set(`org-${supplier.orgId}`, {
      merchantId: 'MERCH-GB',
      paymentsReceivable: true,
      primaryEmailConfirmed: false,
    });
    expect((await refreshSellerAccount(h.db, gw, supplier.orgId)).status).toBe('needs_attention');
    gw.merchants.get(`org-${supplier.orgId}`)!.primaryEmailConfirmed = true;
    expect(await refreshSellerAccount(h.db, gw, supplier.orgId)).toMatchObject({
      status: 'active',
      merchantId: 'MERCH-GB',
    });
    expect((await getSellerAccount(h.db, supplier)).status).toBe('active');
  });
});
