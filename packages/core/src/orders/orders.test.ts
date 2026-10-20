import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { DomainError, type ErrorCode } from '@deal/shared';
import { createAuthorization, revokeAuthorization } from '../authorization/authorizations.js';
import { authorizationBudgetSummary } from '../authorization/budget.js';
import { createRequest } from '../catalog/requests.js';
import { resolveAgentKey, setAgentAccess } from '../identity/agents.js';
import type { AgentActor, BuyerLevel, UserActor } from '../identity/actor.js';
import { counterQuote, requestQuote, submitForReview } from '../negotiation/negotiations.js';
import {
  demoTerms,
  newAgentWithKey,
  newCompany,
  newOffer,
  type OfferFixture,
} from '../testing/fixtures.js';
import {
  acceptQuote,
  cancelOrder,
  expireUnpaidOrders,
  getOrder,
  listOrders,
  ownerAcceptQuote,
  STOCK_HOLD_MS,
} from './orders.js';

let h: DbHandle;
const NOW = new Date('2026-10-20T12:00:00Z');

beforeAll(async () => {
  h = await createTestDatabase();
});

afterAll(async () => {
  await h?.close();
});

async function expectCode(p: Promise<unknown>, code: ErrorCode) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e, `expected ${code}`).toBeInstanceOf(DomainError);
  expect((e as DomainError).code).toBe(code);
}

const OFFER_A: OfferFixture = {
  tiers: [
    { minQty: 50, unitPrice: '0.3100' },
    { minQty: 250, unitPrice: '0.2400' },
  ],
  shippingFlat: '5.00',
  taxRate: '0.0825',
  rules: {
    maxDiscount: '0.1000',
    floorUnitPrice: '0.2200',
    minQtyForDiscount: 250,
    minLeadTimeDays: 1,
  },
};

interface Scene {
  buyer: UserActor;
  agent: AgentActor;
  apiKey: string;
  supplier: UserActor;
  offerId: string;
  authorizationId: string;
  negotiationId: string;
  quoteId: string;
  total: string;
}

/** Negociación de la demo hasta la cotización final de 76.86 (o la de lista si `negotiate` es false). */
async function scene(
  opts: {
    level?: BuyerLevel;
    negotiate?: boolean;
    offer?: OfferFixture;
    linkAuthorization?: boolean;
  } = {},
): Promise<Scene> {
  const buyer = await newCompany(h.db, 'Taqueria');
  const { actor: agent, apiKey } = await newAgentWithKey(
    h.db,
    buyer,
    opts.level ?? 'full_autonomy',
  );
  const supplier = await newCompany(h.db, 'EcoPack');
  await h.db.insert(schema.sellerAccounts).values({
    orgId: supplier.orgId,
    status: 'active',
    trackingId: `t-${supplier.orgId}`,
    merchantId: 'MERCHANT-A',
    paymentsReceivable: true,
    primaryEmailConfirmed: true,
  });
  const { offerId } = await newOffer(h.db, supplier.orgId, opts.offer ?? OFFER_A);
  const auth = await createAuthorization(
    h.db,
    buyer,
    { agentId: agent.agentId, terms: demoTerms() },
    NOW,
  );
  const request = await createRequest(
    h.db,
    agent,
    opts.linkAuthorization === false
      ? {
          criteria: {
            category: 'food_containers',
            quantity: 300,
            deliveryAddress: demoTerms().deliveryAddress,
            deliverBy: '2026-10-23',
          },
        }
      : { authorizationId: auth.id },
    NOW,
  );
  let n = await requestQuote(h.db, agent, { requestId: request.id, offerId }, NOW);
  if (opts.negotiate !== false)
    n = await counterQuote(h.db, agent, n.id, { unitPrice: '0.2000' }, NOW);
  const last = n.quotes.at(-1)!;
  return {
    buyer,
    agent,
    apiKey,
    supplier,
    offerId,
    authorizationId: auth.id,
    negotiationId: n.id,
    quoteId: last.id,
    total: last.total,
  };
}

const accept = (s: Scene, extra: { idempotencyKey?: string } = {}, now = NOW) =>
  acceptQuote(h.db, s.agent, { negotiationId: s.negotiationId, quoteId: s.quoteId, ...extra }, now);

describe('accept_quote with full_autonomy', () => {
  it('accepts within the purchase authorization: order, reservations and audit', async () => {
    const s = await scene();
    expect(s.total).toBe('76.86');
    const order = await accept(s);
    expect(order).toMatchObject({
      status: 'pending_payment',
      paymentMode: 'delegated',
      deliveryStatus: 'not_shipped',
      total: '76.86',
      acceptedBy: { agentId: s.agent.agentId, level: 'full_autonomy' },
      authorization: { id: s.authorizationId, version: 1 },
      budgetReservation: { status: 'active', amount: '76.86' },
      terms: { quantity: 300, unitPrice: '0.2200', deliverBy: '2026-10-22' },
    });
    expect(order.stockReservation?.expiresAt.getTime()).toBe(NOW.getTime() + STOCK_HOLD_MS);
    expect((await authorizationBudgetSummary(h.db, s.authorizationId)).available).toBe('3.14');

    const [row] = await h.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(row!.payeeMerchantId).toBe('MERCHANT-A');
    const [negotiation] = await h.db
      .select()
      .from(schema.negotiations)
      .where(eq(schema.negotiations.id, s.negotiationId));
    expect(negotiation!.status).toBe('agreed');

    const [event] = await h.db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.resourceId, order.id),
          eq(schema.auditEvents.action, 'order.accepted'),
        ),
      );
    expect(event!.actorId).toBe(s.agent.agentId);
    expect(JSON.stringify(event!.details)).toContain('current full_autonomy access level');
  });

  it('retrying does not duplicate orders or reservations, even concurrently (criterion 12)', async () => {
    const s = await scene();
    const results = await Promise.all([accept(s), accept(s), accept(s), accept(s)]);
    expect(new Set(results.map((o) => o.id)).size).toBe(1);
    const reservations = await h.db
      .select()
      .from(schema.budgetReservations)
      .where(eq(schema.budgetReservations.authorizationId, s.authorizationId));
    expect(reservations).toHaveLength(1);
  });

  it('rejects an idempotency key reused with different data', async () => {
    const s = await scene();
    const first = await accept(s, { idempotencyKey: 'clave-1' });
    const replay = await accept(s, { idempotencyKey: 'clave-1' });
    expect(replay.id).toBe(first.id);
    await expectCode(
      acceptQuote(
        h.db,
        s.agent,
        { negotiationId: s.negotiationId, quoteId: s.negotiationId, idempotencyKey: 'clave-1' },
        NOW,
      ),
      'IDEMPOTENCY_KEY_REUSED',
    );
  });

  it('rejects a quote that exceeds the authorized budget and audits it (criterion 17)', async () => {
    const s = await scene({ negotiate: false });
    expect(s.total).toBe('83.35');
    await expectCode(accept(s), 'BUDGET_EXCEEDED');
    expect(
      await h.db.select().from(schema.orders).where(eq(schema.orders.quoteId, s.quoteId)),
    ).toEqual([]);
    const denied = await h.db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.resourceId, s.negotiationId),
          eq(schema.auditEvents.action, 'order.accept_denied'),
        ),
      );
    expect(denied[0]?.outcome).toBe('denied');
  });

  it('does not accept expired quotes, superseded quotes or counterproposals (criterion 10)', async () => {
    const s = await scene();
    await expectCode(accept(s, {}, new Date(NOW.getTime() + 49 * 3_600_000)), 'QUOTE_EXPIRED');

    const negotiation = await h.db
      .select()
      .from(schema.quotes)
      .where(eq(schema.quotes.negotiationId, s.negotiationId));
    const superseded = negotiation.find((q) => q.version === 1)!;
    const counter = negotiation.find((q) => q.kind === 'counter')!;
    await expectCode(
      acceptQuote(h.db, s.agent, { negotiationId: s.negotiationId, quoteId: superseded.id }, NOW),
      'QUOTE_SUPERSEDED',
    );
    await expectCode(
      acceptQuote(h.db, s.agent, { negotiationId: s.negotiationId, quoteId: counter.id }, NOW),
      'QUOTE_NOT_ACCEPTABLE',
    );
  });

  it('rejects with a reduced access level, revoked authorization or no authorization (criterion 7)', async () => {
    const reduced = await scene();
    await setAgentAccess(h.db, reduced.buyer, reduced.agent.agentId, { buyerLevel: 'negotiate' });
    const reducedActor = await resolveAgentKey(h.db, reduced.apiKey);
    await expectCode(
      acceptQuote(
        h.db,
        reducedActor,
        { negotiationId: reduced.negotiationId, quoteId: reduced.quoteId },
        NOW,
      ),
      'LEVEL_INSUFFICIENT',
    );

    const revoked = await scene();
    await revokeAuthorization(h.db, revoked.buyer, revoked.authorizationId, NOW);
    await expectCode(accept(revoked), 'AUTHORIZATION_REVOKED');

    const unlinked = await scene({ linkAuthorization: false });
    await expectCode(accept(unlinked), 'AUTHORIZATION_NOT_FOUND');
  });

  it('Negotiate only cannot accept (criterion 4)', async () => {
    const s = await scene({ level: 'negotiate' });
    await expectCode(accept(s), 'LEVEL_INSUFFICIENT');
  });

  it('does not accept without sufficient stock', async () => {
    const s = await scene({ offer: { ...OFFER_A, stockAvailable: 300 } });
    const other = await scene();
    // Otro pedido ya retiene 100 unidades de la misma oferta.
    const order = await accept(other);
    await h.db
      .update(schema.stockReservations)
      .set({ offerId: s.offerId, quantity: 100 })
      .where(eq(schema.stockReservations.orderId, order.id));
    await expectCode(accept(s), 'STOCK_INSUFFICIENT');
  });
});

describe('manual owner acceptance (Negotiate only)', () => {
  it('the owner accepts the proposal submitted for review and the order awaits manual checkout', async () => {
    const s = await scene({ level: 'negotiate', negotiate: false });
    await submitForReview(h.db, s.agent, s.negotiationId, {}, NOW);
    const order = await ownerAcceptQuote(
      h.db,
      s.buyer,
      { negotiationId: s.negotiationId, quoteId: s.quoteId },
      NOW,
    );
    // El dueño no está limitado por el presupuesto delegado al agente.
    expect(order).toMatchObject({
      status: 'pending_payment',
      paymentMode: 'manual',
      total: '83.35',
      acceptedBy: { userId: s.buyer.userId, level: 'owner' },
    });
  });

  it('an agent cannot use manual acceptance', async () => {
    const s = await scene({ level: 'negotiate' });
    await expectCode(
      ownerAcceptQuote(
        h.db,
        s.agent as unknown as UserActor,
        { negotiationId: s.negotiationId, quoteId: s.quoteId },
        NOW,
      ),
      'FORBIDDEN',
    );
  });
});

describe('cancellation and expiration', () => {
  it('cancelling before payment releases stock and budget', async () => {
    const s = await scene();
    const order = await accept(s);
    const cancelled = await cancelOrder(
      h.db,
      s.agent,
      order.id,
      { reason: 'Change of plans' },
      NOW,
    );
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      stockReservation: { status: 'released' },
      budgetReservation: { status: 'released' },
    });
    expect((await authorizationBudgetSummary(h.db, s.authorizationId)).available).toBe('80.00');
    await expect(cancelOrder(h.db, s.agent, order.id, {}, NOW)).resolves.toMatchObject({
      status: 'cancelled',
    });
  });

  it('cannot cancel with a payment in progress', async () => {
    const s = await scene();
    const order = await accept(s);
    await h.db.insert(schema.paymentAttempts).values({
      orderId: order.id,
      mode: 'delegated',
      status: 'processing',
      amount: order.total,
      payeeMerchantId: 'MERCHANT-A',
      requestId: `req-${order.id}`,
    });
    await expectCode(cancelOrder(h.db, s.agent, order.id, {}, NOW), 'INVALID_STATE');
  });

  it('expires unpaid orders when the reservation expires, except with an uncertain payment (criterion 13)', async () => {
    const unpaid = await scene();
    const uncertain = await scene();
    const o1 = await accept(unpaid);
    const o2 = await accept(uncertain);
    await h.db.insert(schema.paymentAttempts).values({
      orderId: o2.id,
      mode: 'delegated',
      status: 'unknown',
      amount: o2.total,
      payeeMerchantId: 'MERCHANT-A',
      requestId: `req-${o2.id}`,
    });

    const later = new Date(NOW.getTime() + STOCK_HOLD_MS + 1000);
    expect(await expireUnpaidOrders(h.db, later)).toBeGreaterThanOrEqual(1);
    expect(await getOrder(h.db, unpaid.agent, o1.id)).toMatchObject({
      status: 'expired',
      stockReservation: { status: 'expired' },
      budgetReservation: { status: 'released' },
    });
    expect(await getOrder(h.db, uncertain.agent, o2.id)).toMatchObject({
      status: 'pending_payment',
      budgetReservation: { status: 'active' },
    });
  });
});

describe('isolation (criterion 16)', () => {
  it('buyer, supplier and third parties', async () => {
    const s = await scene();
    const order = await accept(s);
    const stranger = await newCompany(h.db);
    const colleague = (await newAgentWithKey(h.db, s.buyer, 'full_autonomy')).actor;

    await expectCode(getOrder(h.db, stranger, order.id), 'NOT_FOUND');
    await expectCode(getOrder(h.db, colleague, order.id), 'NOT_FOUND');
    await expectCode(cancelOrder(h.db, stranger, order.id, {}, NOW), 'NOT_FOUND');
    expect((await getOrder(h.db, s.supplier, order.id)).total).toBe('76.86');
    await expectCode(cancelOrder(h.db, s.supplier, order.id, {}, NOW), 'FORBIDDEN');

    expect((await listOrders(h.db, s.agent)).map((o) => o.id)).toEqual([order.id]);
    expect(await listOrders(h.db, colleague)).toEqual([]);
    expect((await listOrders(h.db, s.supplier, { side: 'supplier' })).map((o) => o.id)).toEqual([
      order.id,
    ]);
    expect(JSON.stringify(await getOrder(h.db, s.agent, order.id))).not.toMatch(/token/i);
  });
});
