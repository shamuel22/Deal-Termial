import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { DomainError, type ErrorCode } from '@deal/shared';
import { createAuthorization } from '../authorization/authorizations.js';
import { demoTerms, newAgent, newCompany, newOffer, newOrder } from '../testing/fixtures.js';
import {
  cancelRequest,
  createRequest,
  findMatchesForRequest,
  getRequest,
  listRequests,
} from './requests.js';
import { findMatches, type SearchCriteriaInput } from './search.js';

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

const DEMO: SearchCriteriaInput = {
  category: 'food_containers',
  requiredAttributes: {
    hot_food_safe: { eq: true },
    has_lid: { eq: true },
    material: { not_in: ['foam_eps'] },
  },
  quantity: 300,
  deliveryState: 'TX',
  deliverBy: '2026-10-23',
  maxTotal: '95.00',
};

/** Mercado aislado para cada test: proveedores nuevos filtrados por id. */
async function market() {
  const buyer = await newCompany(h.db, 'Taqueria');
  const agent = await newAgent(h.db, buyer, 'search_only');
  const supA = await newCompany(h.db, 'EnvasesA');
  const supB = await newCompany(h.db, 'EnvasesB');
  const supC = await newCompany(h.db, 'EnvasesC');
  const ids = [supA.orgId, supB.orgId, supC.orgId];
  return { buyer, agent, supA, supB, supC, ids };
}

describe('find_matches', () => {
  it('use case: compares totals, excludes foam and flags unconfirmed attributes', async () => {
    const m = await market();
    // A: kraft, 0.26 × 300 + 6 + 8.25 % = 90.93
    const a = await newOffer(h.db, m.supA.orgId);
    // B: más barata pero de foam → incompatible
    await newOffer(h.db, m.supB.orgId, {
      attributes: {
        material: 'foam_eps',
        capacity_oz: 16,
        hot_food_safe: true,
        has_lid: true,
        pack_size: 50,
      },
      tiers: [{ minQty: 50, unitPrice: '0.1500' }],
    });
    // C: bagazo sin confirmar aptitud para caliente, más barata que A
    const c = await newOffer(h.db, m.supC.orgId, {
      attributes: { material: 'bagasse', capacity_oz: 16, has_lid: true, pack_size: 50 },
      tiers: [{ minQty: 100, unitPrice: '0.2400' }],
      shippingFlat: '0.00',
      taxRate: '0',
    });

    const result = await findMatches(h.db, m.agent, { ...DEMO, supplierOrgIds: m.ids }, {}, NOW);
    expect(result.excludedIncompatible).toBe(1);
    expect(result.matches.map((x) => [x.offerId, x.status])).toEqual([
      [a.offerId, 'compatible'],
      [c.offerId, 'needs_confirmation'],
    ]);
    expect(result.matches[0]!.pricing).toMatchObject({
      unitPrice: '0.2600',
      subtotal: '78.00',
      shipping: '6.00',
      tax: '6.93',
      total: '90.93',
      currency: 'USD',
    });
    expect(result.matches[0]!.delivery).toMatchObject({
      earliestDate: '2026-10-22',
      meetsDeadline: true,
    });
    expect(result.matches[1]!.unconfirmedAttributes).toEqual(['hot_food_safe']);
  });

  it('explains why an offer is incompatible', async () => {
    const m = await market();
    await newOffer(h.db, m.supA.orgId, {
      shipRegions: ['CA'],
      leadTimeDays: 7,
      stockAvailable: 100,
    });
    const { matches } = await findMatches(
      h.db,
      m.agent,
      { ...DEMO, supplierOrgIds: m.ids, maxTotal: '50.00' },
      { includeIncompatible: true },
      NOW,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('incompatible');
    expect(matches[0]!.mismatches.map((x) => x.code).sort()).toEqual([
      'INSUFFICIENT_STOCK',
      'MISSES_DEADLINE',
      'REGION_NOT_SERVED',
    ]);
    // Superar el presupuesto no es una incompatibilidad: se informa para negociar.
    expect(matches[0]!.budget).toEqual({ maxTotal: '50.00', withinBudget: false, overBy: '40.93' });
  });

  it('an offer over budget still appears so it can be negotiated', async () => {
    const m = await market();
    const cheap = await newOffer(h.db, m.supA.orgId, {
      tiers: [{ minQty: 50, unitPrice: '0.2000' }],
    });
    const pricey = await newOffer(h.db, m.supB.orgId);
    const res = await findMatches(
      h.db,
      m.agent,
      { ...DEMO, supplierOrgIds: m.ids, maxTotal: '80.00' },
      {},
      NOW,
    );
    expect(res.matches.map((x) => [x.offerId, x.status, x.budget?.withinBudget])).toEqual([
      [cheap.offerId, 'compatible', true],
      [pricey.offerId, 'compatible', false],
    ]);
  });

  it('deducts reserved stock and respects minimum and maximum order quantities', async () => {
    const m = await market();
    const { offerId } = await newOffer(h.db, m.supA.orgId, {
      stockAvailable: 600,
      maxOrderQty: 400,
    });
    const order = await newOrder(h.db, m.buyer.orgId, '10.00');
    await h.db.insert(schema.stockReservations).values({
      offerId,
      orderId: order,
      quantity: 250,
      expiresAt: new Date(NOW.getTime() + 3_600_000),
    });
    const res = await findMatches(
      h.db,
      m.agent,
      { ...DEMO, supplierOrgIds: m.ids },
      { includeIncompatible: true },
      NOW,
    );
    expect(res.matches[0]!.stock).toEqual({ available: 350, sufficient: true });

    const big = await findMatches(
      h.db,
      m.agent,
      { ...DEMO, quantity: 450, supplierOrgIds: m.ids },
      { includeIncompatible: true },
      NOW,
    );
    expect(big.matches[0]!.mismatches.map((x) => x.code).sort()).toEqual([
      'ABOVE_MAX_ORDER',
      'INSUFFICIENT_STOCK',
    ]);
  });

  it('does not return own, inactive or expired offers', async () => {
    const m = await market();
    const ownSupplier = await newCompany(h.db, 'Mixta');
    const mixedAgent = await newAgent(h.db, ownSupplier, 'search_only');
    await newOffer(h.db, ownSupplier.orgId);
    await newOffer(h.db, m.supA.orgId, { status: 'paused' });
    const expired = await newOffer(h.db, m.supB.orgId);
    await h.db
      .update(schema.offers)
      .set({ validUntil: new Date(NOW.getTime() - 1000) })
      .where(eq(schema.offers.id, expired.offerId));

    const res = await findMatches(
      h.db,
      mixedAgent,
      { ...DEMO, supplierOrgIds: [ownSupplier.orgId, ...m.ids] },
      { includeIncompatible: true },
      NOW,
    );
    expect(res.matches).toEqual([]);
  });

  it("never exposes the supplier's private negotiation rules", async () => {
    const m = await market();
    await newOffer(h.db, m.supA.orgId, {
      rules: { floorUnitPrice: '0.1987', maxDiscount: '0.3333' },
    });
    const res = await findMatches(h.db, m.agent, { ...DEMO, supplierOrgIds: m.ids }, {}, NOW);
    const json = JSON.stringify(res);
    expect(res.matches).toHaveLength(1);
    expect(json).not.toContain('0.1987');
    expect(json).not.toContain('0.3333');
    expect(json).not.toMatch(/floor|maxDiscount|autoRespond/i);
  });

  it('requires buyer access and valid attributes', async () => {
    const m = await market();
    const seller = await newAgent(h.db, m.buyer, null, ['publish_offers']);
    await expectCode(findMatches(h.db, seller, DEMO, {}, NOW), 'LEVEL_INSUFFICIENT');
    await expect(
      findMatches(
        h.db,
        m.agent,
        { ...DEMO, requiredAttributes: { color: { eq: 'red' } } },
        {},
        NOW,
      ),
    ).rejects.toThrow(/Unknown/);
  });
});

describe('private requests (create_request / get_request)', () => {
  const criteria = {
    category: 'food_containers' as const,
    requiredAttributes: DEMO.requiredAttributes,
    quantity: 300,
    deliveryAddress: {
      line1: '120 Main St',
      city: 'Austin',
      state: 'TX' as const,
      postalCode: '78701',
    },
    deliverBy: '2026-10-23',
    maxTotal: '95.00',
  };

  it('Search only can save and repeat a search without contacting suppliers', async () => {
    const m = await market();
    await newOffer(h.db, m.supA.orgId);
    const request = await createRequest(h.db, m.agent, { criteria }, NOW);
    expect(request).toMatchObject({ status: 'open', criteria: { quantity: 300, unit: 'unit' } });

    const again = await findMatchesForRequest(h.db, m.agent, request.id, {}, NOW);
    expect(again.matches.some((x) => x.supplier.orgId === m.supA.orgId)).toBe(true);

    const negotiations = await h.db.select().from(schema.negotiations);
    expect(negotiations.filter((n) => n.requestId === request.id)).toEqual([]);
  });

  it('inherits criteria from an authorization and uses the available budget', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'full_autonomy');
    const auth = await createAuthorization(
      h.db,
      owner,
      { agentId: agent.agentId, terms: demoTerms() },
      NOW,
    );
    const request = await createRequest(h.db, agent, { authorizationId: auth.id }, NOW);
    expect(request.criteria).toMatchObject({
      quantity: 300,
      deliverBy: '2026-10-23',
      maxTotal: '80.00',
      requiredAttributes: { material: { not_in: ['foam_eps'] } },
    });
  });

  it('an agent only sees its own requests; another organization sees none', async () => {
    const m = await market();
    const colleague = await newAgent(h.db, m.buyer, 'negotiate');
    const request = await createRequest(h.db, m.agent, { criteria }, NOW);

    await expectCode(getRequest(h.db, colleague, request.id), 'NOT_FOUND');
    expect(await listRequests(h.db, colleague)).toEqual([]);
    expect((await listRequests(h.db, m.buyer)).map((r) => r.id)).toContain(request.id);

    const stranger = await newCompany(h.db);
    await expectCode(getRequest(h.db, stranger, request.id), 'NOT_FOUND');
    await expectCode(cancelRequest(h.db, stranger, request.id), 'NOT_FOUND');

    const cancelled = await cancelRequest(h.db, m.agent, request.id);
    expect(cancelled.status).toBe('cancelled');
    await expectCode(cancelRequest(h.db, m.agent, request.id), 'INVALID_STATE');
  });

  it("cannot link another agent's authorization", async () => {
    const owner = await newCompany(h.db);
    const mine = await newAgent(h.db, owner, 'full_autonomy');
    const other = await newAgent(h.db, owner, 'full_autonomy');
    const auth = await createAuthorization(
      h.db,
      owner,
      { agentId: other.agentId, terms: demoTerms() },
      NOW,
    );
    await expectCode(createRequest(h.db, mine, { authorizationId: auth.id }, NOW), 'NOT_FOUND');
  });
});
