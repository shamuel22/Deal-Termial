import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { newAgent, newCompany } from '../testing/fixtures.js';
import {
  createOffer,
  createProduct,
  getOwnOffer,
  getOwnProduct,
  listOwnOffers,
  listOwnProducts,
  setOfferStatus,
  updateOffer,
  updateProduct,
  type ProductInput,
  type UpdateOfferInput,
} from './offers.js';

let h: DbHandle;
beforeAll(async () => {
  h = await createTestDatabase();
});
afterAll(async () => {
  await h?.close();
});

function product(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    sku: 'ENV-16',
    name: 'Envase kraft 16 oz',
    category: 'food_containers',
    attributes: {
      material: 'kraft_paper',
      capacity_oz: 16,
      hot_food_safe: true,
      has_lid: true,
      pack_size: 50,
    },
    ...overrides,
  };
}

function conditions(overrides: Partial<UpdateOfferInput> = {}): UpdateOfferInput {
  return {
    status: 'active',
    stockAvailable: 1000,
    minOrderQty: 50,
    shipRegions: ['TX', 'FL'],
    leadTimeDays: 3,
    shippingFlat: '4.5',
    taxRate: '0.0825',
    // El servicio debe aceptar cualquier orden y devolver los tramos ordenados.
    priceTiers: [
      { minQty: 300, unitPrice: '0.2' },
      { minQty: 1, unitPrice: '0.25' },
    ],
    negotiationRules: { floorUnitPrice: '0.18', maxDiscount: '0.1', minLeadTimeDays: 1 },
    ...overrides,
  };
}

describe('catálogo privado del proveedor', () => {
  it('el dueño crea producto y oferta activa con importes normalizados y auditoría', async () => {
    const owner = await newCompany(h.db);
    const p = await createProduct(h.db, owner, product());
    expect(p).toMatchObject({ supplierOrgId: owner.orgId, unit: 'unit', description: null });
    const offer = await createOffer(h.db, owner, { productId: p.id, ...conditions() });
    expect(offer).toMatchObject({
      product: { id: p.id },
      status: 'active',
      version: 1,
      currency: 'USD',
      shippingFlat: '4.50',
      taxRate: '0.0825',
      maxOrderQty: null,
      validUntil: null,
      negotiationRules: {
        floorUnitPrice: '0.1800',
        maxDiscount: '0.1000',
        autoRespond: true,
        minQtyForDiscount: 1,
        canWaiveShipping: false,
        quoteValidityHours: 48,
      },
    });
    expect(offer.priceTiers.map(({ minQty, unitPrice }) => ({ minQty, unitPrice }))).toEqual([
      { minQty: 1, unitPrice: '0.2500' },
      { minQty: 300, unitPrice: '0.2000' },
    ]);
    expect(await getOwnOffer(h.db, owner, offer.id)).toEqual(offer);
    expect(await listOwnOffers(h.db, owner)).toEqual([offer]);
    expect(await listOwnProducts(h.db, owner)).toEqual([p]);
    const events = await h.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceId, offer.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'offer.created',
      actorId: owner.userId,
      orgId: owner.orgId,
      details: { version: 1 },
    });
  });

  it('rechaza atributos inválidos y desconocidos al crear y reemplazar productos', async () => {
    const owner = await newCompany(h.db);
    const p = await createProduct(h.db, owner, product());
    for (const attributes of [
      { ...product().attributes, material: 'wood' },
      { ...product().attributes, capacity_oz: -1 },
      { ...product().attributes, invented: true },
      {},
    ]) {
      await expect(createProduct(h.db, owner, product({ attributes }))).rejects.toBeInstanceOf(
        z.ZodError,
      );
      await expect(
        updateProduct(h.db, owner, p.id, product({ attributes })),
      ).rejects.toBeInstanceOf(z.ZodError);
    }
    const updated = await updateProduct(
      h.db,
      owner,
      p.id,
      product({ name: 'Nuevo nombre', description: 'Temporal', unit: 'box' }),
    );
    expect(updated).toMatchObject({ name: 'Nuevo nombre', description: 'Temporal', unit: 'box' });
    expect(await updateProduct(h.db, owner, p.id, product())).toMatchObject({
      description: null,
      unit: 'unit',
    });
  });

  it('permite al agente publicar con facultad y protege también las lecturas privadas', async () => {
    const owner = await newCompany(h.db);
    const seller = await newAgent(h.db, owner, null, ['publish_offers']);
    const buyer = await newAgent(h.db, owner, 'full_autonomy');
    const p = await createProduct(h.db, seller, product());
    const offer = await createOffer(h.db, seller, { productId: p.id, ...conditions() });
    const denied = { code: 'SELLER_SCOPE_MISSING' };
    await expect(createProduct(h.db, buyer, product())).rejects.toMatchObject(denied);
    await expect(
      createOffer(h.db, buyer, { productId: p.id, ...conditions() }),
    ).rejects.toMatchObject(denied);
    await expect(updateProduct(h.db, buyer, p.id, product())).rejects.toMatchObject(denied);
    await expect(updateOffer(h.db, buyer, offer.id, conditions())).rejects.toMatchObject(denied);
    await expect(setOfferStatus(h.db, buyer, offer.id, 'paused')).rejects.toMatchObject(denied);
    await expect(getOwnOffer(h.db, buyer, offer.id)).rejects.toMatchObject(denied);
    await expect(listOwnOffers(h.db, buyer)).rejects.toMatchObject(denied);
    await expect(getOwnProduct(h.db, buyer, p.id)).rejects.toMatchObject(denied);
    await expect(listOwnProducts(h.db, buyer)).rejects.toMatchObject(denied);
    await expect(
      createProduct(h.db, { ...owner, role: 'member' }, product()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const events = await h.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceId, offer.id));
    expect(events[0]).toMatchObject({ actorType: 'agent', actorId: seller.agentId });
  });

  it('valida tramos, precios, fracciones y límites antes de persistir', async () => {
    const owner = await newCompany(h.db);
    const p = await createProduct(h.db, owner, product());
    const offer = await createOffer(h.db, owner, { productId: p.id, ...conditions() });
    const invalid: Partial<UpdateOfferInput>[] = [
      {
        priceTiers: [
          { minQty: 1, unitPrice: '0.25' },
          { minQty: 1, unitPrice: '0.2' },
        ],
      },
      {
        priceTiers: [
          { minQty: 1, unitPrice: '0.2' },
          { minQty: 300, unitPrice: '0.25' },
        ],
      },
      { priceTiers: [{ minQty: 51, unitPrice: '0.25' }] },
      { priceTiers: [] },
      { priceTiers: Array.from({ length: 11 }, (_, i) => ({ minQty: i + 1, unitPrice: '0.25' })) },
      { priceTiers: [{ minQty: 1, unitPrice: '0' }] },
      { priceTiers: [{ minQty: 1, unitPrice: '0.12345' }] },
      { priceTiers: [{ minQty: 1, unitPrice: 'NaN' }] },
      { priceTiers: [{ minQty: 1, unitPrice: 'bad' }] },
      { negotiationRules: { floorUnitPrice: 'bad', minLeadTimeDays: 1 } },
      { negotiationRules: { floorUnitPrice: '0.21', minLeadTimeDays: 1 } },
      { negotiationRules: { floorUnitPrice: '0.18', minLeadTimeDays: 4 } },
      { negotiationRules: { floorUnitPrice: '0.18', minLeadTimeDays: 1, maxDiscount: '0.5001' } },
      { taxRate: '0.2501' },
      { taxRate: '0.00001' },
      { taxRate: '-0.1' },
      { shippingFlat: '1.001' },
      { maxOrderQty: 49 },
      { stockAvailable: -1 },
      { shipRegions: [] },
      { shipRegions: ['TX', 'TX'] },
      { validUntil: '2099-01-01T00:00:00' },
    ];
    for (const overrides of invalid) {
      await expect(
        createOffer(h.db, owner, { productId: p.id, ...conditions(overrides) }),
      ).rejects.toBeInstanceOf(z.ZodError);
      await expect(
        updateOffer(h.db, owner, offer.id, conditions(overrides)),
      ).rejects.toBeInstanceOf(z.ZodError);
    }
    expect((await listOwnOffers(h.db, owner)).map((o) => o.version)).toEqual([1]);
  });

  it('reemplaza condiciones, tramos y reglas, versiona y no permite editar archivadas', async () => {
    const owner = await newCompany(h.db);
    const p = await createProduct(h.db, owner, product());
    const offer = await createOffer(h.db, owner, {
      productId: p.id,
      ...conditions(),
      maxOrderQty: 500,
      validUntil: '2099-01-01T12:00:00-04:00',
    });
    const updated = await updateOffer(
      h.db,
      owner,
      offer.id,
      conditions({
        priceTiers: [{ minQty: 1, unitPrice: '0.19' }],
        negotiationRules: { floorUnitPrice: '0.17', minLeadTimeDays: 0, autoRespond: false },
      }),
    );
    expect(updated).toMatchObject({
      version: 2,
      productId: p.id,
      maxOrderQty: null,
      validUntil: null,
      negotiationRules: { floorUnitPrice: '0.1700', maxDiscount: '0.0000', autoRespond: false },
    });
    expect(updated.priceTiers).toHaveLength(1);
    expect(updated.priceTiers[0]).toMatchObject({ minQty: 1, unitPrice: '0.1900' });
    expect((await setOfferStatus(h.db, owner, offer.id, 'paused')).version).toBe(3);
    expect((await setOfferStatus(h.db, owner, offer.id, 'paused')).version).toBe(3);
    expect((await setOfferStatus(h.db, owner, offer.id, 'active')).version).toBe(4);
    expect((await setOfferStatus(h.db, owner, offer.id, 'archived')).version).toBe(5);
    await expect(updateOffer(h.db, owner, offer.id, conditions())).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(setOfferStatus(h.db, owner, offer.id, 'active')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    const events = await h.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceId, offer.id));
    expect(events.filter((e) => e.action === 'offer.status_changed')).toHaveLength(3);
    expect(events.find((e) => e.action === 'offer.updated')).toMatchObject({
      details: { fromVersion: 1, toVersion: 2 },
    });
  });

  it('serializa reemplazos concurrentes sin mezclar tramos y reglas', async () => {
    const owner = await newCompany(h.db);
    const p = await createProduct(h.db, owner, product());
    const offer = await createOffer(h.db, owner, { productId: p.id, ...conditions() });
    const results = await Promise.all(
      ['0.21', '0.22'].map((price) =>
        updateOffer(
          h.db,
          owner,
          offer.id,
          conditions({
            priceTiers: [{ minQty: 1, unitPrice: price }],
            negotiationRules: { floorUnitPrice: price, minLeadTimeDays: 1 },
          }),
        ),
      ),
    );
    expect(results.map((o) => o.version).sort()).toEqual([2, 3]);
    for (const view of [...results, await getOwnOffer(h.db, owner, offer.id)]) {
      expect(view.priceTiers).toHaveLength(1);
      expect(view.priceTiers[0]!.unitPrice).toBe(view.negotiationRules.floorUnitPrice);
    }
  });

  it('aísla productos y ofertas y responde NOT_FOUND para identificadores inválidos', async () => {
    const a = await newCompany(h.db);
    const b = await newCompany(h.db);
    const p = await createProduct(h.db, a, product());
    const offer = await createOffer(h.db, a, { productId: p.id, ...conditions() });
    for (const id of [p.id, 'no-es-uuid']) {
      await expect(getOwnProduct(h.db, b, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(updateProduct(h.db, b, id, product())).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(createOffer(h.db, b, { productId: id, ...conditions() })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }
    for (const id of [offer.id, 'no-es-uuid']) {
      await expect(getOwnOffer(h.db, b, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(updateOffer(h.db, b, id, conditions())).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(setOfferStatus(h.db, b, id, 'archived')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }
    expect(await listOwnProducts(h.db, b)).toEqual([]);
    expect(await listOwnOffers(h.db, b)).toEqual([]);
    expect((await getOwnOffer(h.db, a, offer.id)).version).toBe(1);
  });

  it('el SKU es único por organización, también al editar y crear concurrentemente', async () => {
    const a = await newCompany(h.db);
    const b = await newCompany(h.db);
    await createProduct(h.db, a, product());
    await expect(createProduct(h.db, a, product())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { field: 'sku' },
    });
    await expect(createProduct(h.db, b, product())).resolves.toMatchObject({ sku: 'ENV-16' });
    const second = await createProduct(h.db, a, product({ sku: 'OTRO' }));
    await expect(updateProduct(h.db, a, second.id, product())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { field: 'sku' },
    });
    const results = await Promise.allSettled(
      [1, 2].map(() => createProduct(h.db, a, product({ sku: 'CONCURRENTE' }))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'VALIDATION_FAILED', details: { field: 'sku' } },
    });
  });
});
