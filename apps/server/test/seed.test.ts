import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findMatches,
  getAuthorization,
  priceOffer,
  registerOwner,
  resolveAgentKey,
  type SearchCriteriaInput,
} from '@deal/core';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { nextFriday, seedDemo } from '../dist/seed/seed-demo.js';

describe('nextFriday (UTC)', () => {
  it.each([
    ['2026-10-19T12:00:00Z', '2026-10-23'], // lunes
    ['2026-10-22T12:00:00Z', '2026-10-30'], // jueves
    ['2026-10-23T12:00:00Z', '2026-10-30'], // viernes
    ['2026-10-20T00:00:00Z', '2026-10-23'], // exactamente 72 horas
    ['2026-10-20T00:00:01Z', '2026-10-30'], // menos de 72 horas hasta este viernes
    ['2026-12-31T12:00:00Z', '2027-01-08'], // cambio de año
    ['2026-10-19T23:00:00-05:00', '2026-10-30'], // ya es martes UTC
  ])('%s → %s sin modificar now', (input, expected) => {
    const now = new Date(input);
    const original = now.getTime();
    expect(nextFriday(now)).toBe(expected);
    expect(now.getTime()).toBe(original);
    expect(new Date(`${expected}T00:00:00Z`).getTime() - original).toBeGreaterThanOrEqual(
      3 * 86_400_000,
    );
  });

  it('rechaza fechas inválidas', () => {
    expect(() => nextFriday(new Date('invalid'))).toThrow('La fecha now no es válida');
  });
});

// Lunes: faltan cuatro fechas naturales hasta el viernes, menos que el plazo del aluminio.
const options = {
  now: new Date('2026-10-19T12:00:00Z'),
  password: 'DealTerminal-demo-2026',
  sellerMerchantIds: { a: 'TEST-MERCHANT-A', b: 'TEST-MERCHANT-B' },
};

describe('seedDemo sobre PostgreSQL real', () => {
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDatabase();
  });

  afterEach(async () => {
    await handle?.close();
  });

  // Incluye auditoría, concesiones y credenciales para detectar también duplicados parciales.
  async function snapshot() {
    const tables = [
      schema.organizations,
      schema.users,
      schema.memberships,
      schema.agents,
      schema.agentAccessGrants,
      schema.agentCredentials,
      schema.purchaseAuthorizations,
      schema.purchaseAuthorizationVersions,
      schema.sellerAccounts,
      schema.products,
      schema.offers,
      schema.offerPriceTiers,
      schema.negotiationRules,
      schema.auditEvents,
    ];
    return Promise.all(
      tables.map(async (table) =>
        (await handle.db.select().from(table)).map((row) => JSON.stringify(row)).sort(),
      ),
    );
  }

  it('crea cuentas, permisos, catálogo y autorizaciones con auditoría de los agentes', async () => {
    const result = await seedDemo(handle.db, options);
    const orgs = await handle.db.select().from(schema.organizations);
    expect(orgs).toHaveLength(3);
    expect(orgs.find((org) => org.name === 'Taquería El Sol')?.monthlySpendLimit).toBe('500.00');
    expect(await handle.db.select().from(schema.users)).toHaveLength(3);
    expect(await handle.db.select().from(schema.agents)).toHaveLength(5);
    expect(await handle.db.select().from(schema.agentCredentials)).toHaveLength(5);
    const offers = await handle.db.select().from(schema.offers);
    expect(offers).toHaveLength(6);
    expect(offers.every((offer) => offer.status === 'active')).toBe(true);
    expect(await handle.db.select().from(schema.products)).toHaveLength(6);
    expect(await handle.db.select().from(schema.negotiationRules)).toHaveLength(6);
    expect(result.owners.map((owner) => owner.email)).toEqual([
      'owner@taqueria-elsol.demo',
      'owner@ecopack.demo',
      'owner@greenbox.demo',
    ]);
    expect(result.deliverBy).toBe('2026-10-23');
    expect(result.expiresAt).toBe('2026-11-18T12:00:00.000Z');

    const authorizations = await handle.db.select().from(schema.purchaseAuthorizations);
    expect(authorizations).toHaveLength(2);
    expect(authorizations.every((authorization) => authorization.status === 'active')).toBe(true);
    expect(result.authorizations).toHaveLength(2);
    for (const agent of result.agents) {
      const actor = await resolveAgentKey(handle.db, agent.apiKey);
      expect(actor).toMatchObject({ agentId: agent.id, orgId: agent.orgId });
      expect(actor.grant).toMatchObject({
        buyerLevel: agent.buyerLevel,
        sellerScopes: agent.sellerScopes,
      });
      if (agent.buyerLevel === null) {
        expect(actor.grant.sellerScopes).toEqual([
          'publish_offers',
          'submit_quotes',
          'accept_terms',
          'approve_refunds',
        ]);
      }
      const authorization = result.authorizations.find((auth) => auth.agentId === agent.id);
      if (!authorization) {
        expect(agent.buyerLevel === null || agent.buyerLevel === 'search_only').toBe(true);
        continue;
      }
      const view = await getAuthorization(handle.db, actor, authorization.id, options.now);
      expect(view).toMatchObject({
        status: 'active',
        agentId: agent.id,
        terms: {
          category: 'food_containers',
          quantityMin: 300,
          quantityMax: 300,
          budgetTotal: '80.00',
          deliverBy: result.deliverBy,
          expiresAt: new Date(result.expiresAt),
          requiredAttributes: {
            hot_food_safe: { eq: true },
            has_lid: { eq: true },
            material: { not_in: ['foam_eps'] },
          },
          deliveryAddress: {
            line1: '1100 E 6th St',
            city: 'Austin',
            state: 'TX',
            postalCode: '78702',
            country: 'US',
          },
        },
        budget: { available: '80.00' },
      });
    }

    const sellers = await handle.db.select().from(schema.sellerAccounts);
    expect(sellers).toHaveLength(2);
    expect(sellers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trackingId: 'demo-seller-a', merchantId: 'TEST-MERCHANT-A' }),
        expect.objectContaining({ trackingId: 'demo-seller-b', merchantId: 'TEST-MERCHANT-B' }),
      ]),
    );
    expect(
      sellers.every(
        (seller) =>
          seller.status === 'active' && seller.paymentsReceivable && seller.primaryEmailConfirmed,
      ),
    ).toBe(true);

    const events = await handle.db.select().from(schema.auditEvents);
    for (const action of ['product.created', 'offer.created']) {
      const published = events.filter((event) => event.action === action);
      expect(published).toHaveLength(6);
      for (const event of published) {
        const sellerAgent = result.agents.find((agent) => agent.orgId === event.orgId);
        expect(event).toMatchObject({
          actorType: 'agent',
          actorId: sellerAgent!.id,
          outcome: 'succeeded',
        });
      }
    }
    const credentials = await handle.db.select().from(schema.agentCredentials);
    for (const agent of result.agents)
      expect(JSON.stringify(credentials)).not.toContain(agent.apiKey);
  });

  it('encuentra las tres alternativas por atributos/plazo y explica el exceso de presupuesto', async () => {
    const result = await seedDemo(handle.db, options);
    const buyer = result.agents.find((agent) => agent.buyerLevel === 'full_autonomy')!;
    const actor = await resolveAgentKey(handle.db, buyer.apiKey);
    const authorization = result.authorizations.find((auth) => auth.agentId === buyer.id)!;
    const { terms } = await getAuthorization(handle.db, actor, authorization.id, options.now);
    const criteria: SearchCriteriaInput = {
      category: 'food_containers',
      requiredAttributes: terms.requiredAttributes,
      quantity: terms.quantityMax,
      deliveryState: terms.deliveryAddress.state,
      deliverBy: terms.deliverBy,
    };
    const found = await findMatches(handle.db, actor, criteria, {}, options.now);
    expect(found.matches.map((match) => match.product.sku).sort()).toEqual([
      'ENV-KR16-L',
      'ENV-PP32-L',
      'GB-BAG24',
    ]);
    expect(found.matches.every((match) => match.status === 'compatible')).toBe(true);
    expect(found.excludedIncompatible).toBe(3);
    expect(found.matches.find((match) => match.product.sku === 'ENV-KR16-L')?.pricing?.total).toBe(
      '83.35',
    );

    const bounded = await findMatches(
      handle.db,
      actor,
      { ...criteria, maxTotal: terms.budgetTotal },
      { includeIncompatible: true },
      options.now,
    );
    // Por encima de US$80 a precio de lista: siguen siendo compatibles y se negocian.
    for (const sku of ['ENV-KR16-L', 'ENV-PP32-L', 'GB-BAG24']) {
      expect(bounded.matches.find((match) => match.product.sku === sku)).toMatchObject({
        status: 'compatible',
        mismatches: [],
        budget: { withinBudget: false },
      });
    }
    for (const sku of ['ENV-FOAM9', 'GB-PET16']) {
      expect(bounded.matches.find((match) => match.product.sku === sku)?.mismatches).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'ATTRIBUTE_VIOLATED' })]),
      );
    }
    expect(bounded.matches.find((match) => match.product.sku === 'GB-ALU-L')?.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'MISSES_DEADLINE' })]),
    );

    for (const [sku, total] of [
      ['ENV-KR16-L', '76.86'],
      ['GB-BAG24', '76.32'],
    ]) {
      const item = result.catalog.find((entry) => entry.sku === sku)!;
      const offer = found.matches.find((match) => match.offerId === item.offerId)!;
      const rules = await handle.db.query.negotiationRules.findFirst({
        where: (rules, { eq }) => eq(rules.offerId, item.offerId),
      });
      expect(
        priceOffer({
          tiers: offer.priceTiers,
          quantity: 300,
          shippingFlat: offer.pricing!.shipping,
          taxRate: '0.0825',
          unitPrice: rules!.floorUnitPrice,
        })?.total,
      ).toBe(total);
    }
  });

  it('rechaza una segunda ejecución por email duplicado sin modificar ningún dato', async () => {
    await seedDemo(handle.db, options);
    const before = await snapshot();
    await expect(seedDemo(handle.db, options)).rejects.toThrow(
      'Ya existe el email owner@taqueria-elsol.demo',
    );
    expect(await snapshot()).toEqual(before);
  });

  it('revierte toda la carga si falla después de crear comprador y proveedor A', async () => {
    await registerOwner(handle.db, {
      email: 'owner@greenbox.demo',
      name: 'Dueño existente',
      organizationName: 'Empresa existente',
      password: options.password,
    });
    const before = await snapshot();
    await expect(seedDemo(handle.db, options)).rejects.toThrow(
      'Ya existe una cuenta con ese email',
    );
    expect(await snapshot()).toEqual(before);
  });
});
