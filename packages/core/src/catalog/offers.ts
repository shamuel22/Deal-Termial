import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { moneyString, US_STATES } from '../authorization/schemas.js';
import { inTransaction, type Executor } from '../db.js';
import { actorRef, requireSellerScope, type Actor } from '../identity/actor.js';
import { gt, isValidUnitPrice, lte, toUnitPrice } from '../money.js';
import { CATEGORIES, CATEGORY_IDS } from './categories.js';

export const productInput = z
  .object({
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    category: z.enum(CATEGORY_IDS),
    attributes: z.record(z.string(), z.unknown()),
    unit: z.string().trim().min(1).max(30).default('unit'),
  })
  .superRefine((data, ctx) => {
    const result = CATEGORIES[data.category].attributes.strict().safeParse(data.attributes);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ['attributes', ...issue.path] });
      }
    }
  });
export type ProductInput = z.input<typeof productInput>;

const unitPriceString = z
  .string()
  .refine(isValidUnitPrice, {
    message: 'Precio inválido: usa un decimal con hasta 4 decimales',
    abort: true,
  })
  .refine((v) => gt(v, '0'), 'El precio debe ser mayor que cero')
  .transform(toUnitPrice);

function fraction(max: string) {
  return z
    .string()
    .regex(/^0(\.\d{1,4})?$/, 'Usa una fracción decimal con hasta 4 decimales')
    .refine((v) => !/^0(\.\d{1,4})?$/.test(v) || lte(v, max), `La fracción máxima es ${max}`);
}

export const negotiationRulesInput = z.object({
  autoRespond: z.boolean().default(true),
  maxDiscount: fraction('0.5').default('0'),
  floorUnitPrice: unitPriceString,
  minQtyForDiscount: z.number().int().min(1).default(1),
  minLeadTimeDays: z.number().int().min(0).max(60),
  canWaiveShipping: z.boolean().default(false),
  quoteValidityHours: z.number().int().min(1).max(720).default(48),
});
export type NegotiationRulesInput = z.input<typeof negotiationRulesInput>;

const offerConditions = z.object({
  status: z.enum(['draft', 'active']).default('draft'),
  stockAvailable: z.number().int().min(0),
  minOrderQty: z.number().int().min(1).default(1),
  maxOrderQty: z.number().int().min(1).optional(),
  shipRegions: z
    .array(z.enum(US_STATES))
    .min(1)
    .refine((v) => new Set(v).size === v.length, 'Las regiones no pueden repetirse'),
  leadTimeDays: z.number().int().min(0).max(60),
  shippingFlat: moneyString.default('0.00'),
  taxRate: fraction('0.25').default('0'),
  validUntil: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .optional(),
  priceTiers: z
    .array(z.object({ minQty: z.number().int().min(1), unitPrice: unitPriceString }))
    .min(1)
    .max(10),
  negotiationRules: negotiationRulesInput,
});

type OfferConditions = z.output<typeof offerConditions>;

function checkConditions(data: OfferConditions, ctx: z.RefinementCtx): void {
  if (data.maxOrderQty !== undefined && data.maxOrderQty < data.minOrderQty) {
    ctx.addIssue({ code: 'custom', path: ['maxOrderQty'], message: 'Debe ser >= minOrderQty' });
  }
  const tiers = [...data.priceTiers].sort((a, b) => a.minQty - b.minQty);
  if (new Set(tiers.map((t) => t.minQty)).size !== tiers.length) {
    ctx.addIssue({ code: 'custom', path: ['priceTiers'], message: 'minQty no puede repetirse' });
  }
  if (tiers[0] && tiers[0].minQty > data.minOrderQty) {
    ctx.addIssue({ code: 'custom', path: ['priceTiers'], message: 'Falta el tramo inicial' });
  }
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!;
    const previous = tiers[i - 1];
    if (previous && gt(tier.unitPrice, previous.unitPrice)) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceTiers'],
        message: 'Los precios no pueden crecer',
      });
    }
    if (gt(data.negotiationRules.floorUnitPrice, tier.unitPrice)) {
      ctx.addIssue({
        code: 'custom',
        path: ['negotiationRules', 'floorUnitPrice'],
        message: 'El precio mínimo no puede superar ningún tramo',
      });
    }
  }
  if (data.negotiationRules.minLeadTimeDays > data.leadTimeDays) {
    ctx.addIssue({
      code: 'custom',
      path: ['negotiationRules', 'minLeadTimeDays'],
      message: 'El plazo mínimo no puede superar leadTimeDays',
    });
  }
}

export const offerInput = offerConditions
  .extend({ productId: z.uuid() })
  .superRefine(checkConditions);
export const updateOfferInput = offerConditions.superRefine(checkConditions);
export const offerStatusInput = z.object({ status: z.enum(['active', 'paused', 'archived']) });
export type OfferInput = z.input<typeof offerInput>;
export type UpdateOfferInput = z.input<typeof updateOfferInput>;
export type OfferStatusInput = z.input<typeof offerStatusInput>;

type Product = typeof schema.products.$inferSelect;
type Offer = typeof schema.offers.$inferSelect;

/** Vista privada del proveedor; las reglas nunca se exponen en búsquedas de compradores. */
export interface SupplierOfferView extends Offer {
  product: Product;
  priceTiers: (typeof schema.offerPriceTiers.$inferSelect)[];
  negotiationRules: typeof schema.negotiationRules.$inferSelect;
}

function assertUuid(id: string, message: string): void {
  if (!z.uuid().safeParse(id).success) throw new DomainError('NOT_FOUND', message);
}

async function findOwnProduct(db: Executor, orgId: string, productId: string) {
  assertUuid(productId, 'Producto no encontrado');
  const [row] = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.id, productId), eq(schema.products.supplierOrgId, orgId)));
  if (!row) throw new DomainError('NOT_FOUND', 'Producto no encontrado');
  return row;
}

async function findOwnOffer(
  db: Executor,
  orgId: string,
  offerId: string,
  lock: 'no key update' | 'share',
) {
  assertUuid(offerId, 'Oferta no encontrada');
  const [row] = await db
    .select()
    .from(schema.offers)
    .where(and(eq(schema.offers.id, offerId), eq(schema.offers.supplierOrgId, orgId)))
    .for(lock);
  if (!row) throw new DomainError('NOT_FOUND', 'Oferta no encontrada');
  return row;
}

/** Reconoce solo la restricción de SKU, también cuando Drizzle envuelve el error de Postgres. */
function duplicateSku(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'products_supplier_sku_uq'
  )
    return true;
  return 'cause' in error && duplicateSku(error.cause);
}

function rethrowProductError(error: unknown): never {
  if (duplicateSku(error)) {
    throw new DomainError('VALIDATION_FAILED', 'Ya existe un producto con ese SKU', {
      field: 'sku',
    });
  }
  throw error;
}

export async function createProduct(
  db: Executor,
  actor: Actor,
  input: ProductInput,
): Promise<Product> {
  requireSellerScope(actor, 'publish_offers');
  const data = productInput.parse(input);
  try {
    return await inTransaction(db, async (tx) => {
      const [product] = await tx
        .insert(schema.products)
        .values({
          ...data,
          supplierOrgId: actor.orgId,
          description: data.description ?? null,
        })
        .returning();
      await audit(tx, {
        orgId: actor.orgId,
        ...actorRef(actor),
        action: 'product.created',
        resourceType: 'product',
        resourceId: product!.id,
        outcome: 'succeeded',
      });
      return product!;
    });
  } catch (error) {
    rethrowProductError(error);
  }
}

export async function updateProduct(
  db: Executor,
  actor: Actor,
  productId: string,
  input: ProductInput,
): Promise<Product> {
  requireSellerScope(actor, 'publish_offers');
  const data = productInput.parse(input);
  try {
    return await inTransaction(db, async (tx) => {
      await findOwnProduct(tx, actor.orgId, productId);
      const [product] = await tx
        .update(schema.products)
        .set({
          ...data,
          description: data.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.products.id, productId))
        .returning();
      await audit(tx, {
        orgId: actor.orgId,
        ...actorRef(actor),
        action: 'product.updated',
        resourceType: 'product',
        resourceId: productId,
        outcome: 'succeeded',
      });
      return product!;
    });
  } catch (error) {
    rethrowProductError(error);
  }
}

export async function getOwnProduct(
  db: Executor,
  actor: Actor,
  productId: string,
): Promise<Product> {
  requireSellerScope(actor, 'publish_offers');
  return findOwnProduct(db, actor.orgId, productId);
}

export async function listOwnProducts(db: Executor, actor: Actor): Promise<Product[]> {
  requireSellerScope(actor, 'publish_offers');
  return db
    .select()
    .from(schema.products)
    .where(eq(schema.products.supplierOrgId, actor.orgId))
    .orderBy(desc(schema.products.createdAt));
}

function conditionValues(data: OfferConditions) {
  const { priceTiers: _tiers, negotiationRules: _rules, ...conditions } = data;
  return {
    ...conditions,
    maxOrderQty: data.maxOrderQty ?? null,
    validUntil: data.validUntil ?? null,
  };
}

async function insertConditions(
  tx: Executor,
  offerId: string,
  data: OfferConditions,
): Promise<void> {
  await tx.insert(schema.offerPriceTiers).values(data.priceTiers.map((t) => ({ ...t, offerId })));
  await tx.insert(schema.negotiationRules).values({ ...data.negotiationRules, offerId });
}

async function supplierView(db: Executor, offer: Offer): Promise<SupplierOfferView> {
  const product = await findOwnProduct(db, offer.supplierOrgId, offer.productId);
  const priceTiers = await db
    .select()
    .from(schema.offerPriceTiers)
    .where(eq(schema.offerPriceTiers.offerId, offer.id))
    .orderBy(asc(schema.offerPriceTiers.minQty));
  const [rules] = await db
    .select()
    .from(schema.negotiationRules)
    .where(eq(schema.negotiationRules.offerId, offer.id));
  if (!rules) throw new Error(`Oferta ${offer.id} sin reglas de negociación`);
  return { ...offer, product, priceTiers, negotiationRules: rules };
}

export async function createOffer(
  db: Executor,
  actor: Actor,
  input: OfferInput,
): Promise<SupplierOfferView> {
  requireSellerScope(actor, 'publish_offers');
  if (input && typeof input === 'object' && 'productId' in input) {
    assertUuid(input.productId, 'Producto no encontrado');
  }
  const { productId, ...data } = offerInput.parse(input);
  return inTransaction(db, async (tx) => {
    await findOwnProduct(tx, actor.orgId, productId);
    const [offer] = await tx
      .insert(schema.offers)
      .values({
        ...conditionValues(data),
        productId,
        supplierOrgId: actor.orgId,
        version: 1,
      })
      .returning();
    await insertConditions(tx, offer!.id, data);
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'offer.created',
      resourceType: 'offer',
      resourceId: offer!.id,
      outcome: 'succeeded',
      details: { version: 1 },
    });
    return supplierView(tx, offer!);
  });
}

export async function updateOffer(
  db: Executor,
  actor: Actor,
  offerId: string,
  input: UpdateOfferInput,
): Promise<SupplierOfferView> {
  requireSellerScope(actor, 'publish_offers');
  const data = updateOfferInput.parse(input);
  return inTransaction(db, async (tx) => {
    const previous = await findOwnOffer(tx, actor.orgId, offerId, 'no key update');
    if (previous.status === 'archived') {
      throw new DomainError('INVALID_STATE', 'Una oferta archivada no se puede modificar');
    }
    const [offer] = await tx
      .update(schema.offers)
      .set({
        ...conditionValues(data),
        version: previous.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.offers.id, offerId))
      .returning();
    await tx.delete(schema.offerPriceTiers).where(eq(schema.offerPriceTiers.offerId, offerId));
    await tx.delete(schema.negotiationRules).where(eq(schema.negotiationRules.offerId, offerId));
    await insertConditions(tx, offerId, data);
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'offer.updated',
      resourceType: 'offer',
      resourceId: offerId,
      outcome: 'succeeded',
      details: { fromVersion: previous.version, toVersion: offer!.version },
    });
    return supplierView(tx, offer!);
  });
}

export async function setOfferStatus(
  db: Executor,
  actor: Actor,
  offerId: string,
  status: OfferStatusInput['status'],
): Promise<SupplierOfferView> {
  requireSellerScope(actor, 'publish_offers');
  const data = offerStatusInput.parse({ status });
  return inTransaction(db, async (tx) => {
    const previous = await findOwnOffer(tx, actor.orgId, offerId, 'no key update');
    if (previous.status === data.status) return supplierView(tx, previous);
    if (previous.status === 'archived') {
      throw new DomainError('INVALID_STATE', 'Una oferta archivada no se puede modificar');
    }
    const [offer] = await tx
      .update(schema.offers)
      .set({
        status: data.status,
        version: previous.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.offers.id, offerId))
      .returning();
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'offer.status_changed',
      resourceType: 'offer',
      resourceId: offerId,
      outcome: 'succeeded',
      details: {
        from: previous.status,
        to: data.status,
        fromVersion: previous.version,
        toVersion: offer!.version,
      },
    });
    return supplierView(tx, offer!);
  });
}

export async function getOwnOffer(
  db: Executor,
  actor: Actor,
  offerId: string,
): Promise<SupplierOfferView> {
  requireSellerScope(actor, 'publish_offers');
  // El bloqueo compartido evita mezclar condiciones y tramos de versiones distintas.
  return inTransaction(db, async (tx) =>
    supplierView(tx, await findOwnOffer(tx, actor.orgId, offerId, 'share')),
  );
}

export async function listOwnOffers(db: Executor, actor: Actor): Promise<SupplierOfferView[]> {
  requireSellerScope(actor, 'publish_offers');
  const rows = await db
    .select({ id: schema.offers.id })
    .from(schema.offers)
    .where(eq(schema.offers.supplierOrgId, actor.orgId))
    .orderBy(desc(schema.offers.createdAt));
  return Promise.all(rows.map((row) => getOwnOffer(db, actor, row.id)));
}
