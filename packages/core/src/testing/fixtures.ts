import { schema, type Database } from '@deal/db';
import { createAgent, issueCredential, resolveAgentKey } from '../identity/agents.js';
import { registerOwner, resolveUserActor } from '../identity/accounts.js';
import type { AgentActor, BuyerLevel, SellerScope, UserActor } from '../identity/actor.js';
import type { AuthorizationTermsInput } from '../authorization/schemas.js';

/** Utilidades de test: construyen escenarios mínimos y coherentes sobre la base de test. */

let seq = 0;
const next = () => (seq += 1);

export async function newCompany(db: Database, name = `Empresa${next()}`): Promise<UserActor> {
  const n = next();
  const { userId, orgId } = await registerOwner(db, {
    email: `owner${n}@${name.toLowerCase().replace(/\W/g, '')}.test`,
    name: `Owner ${name}`,
    password: 'contraseña-segura-123',
    organizationName: name,
  });
  return resolveUserActor(db, userId, orgId);
}

export async function newAgentWithKey(
  db: Database,
  owner: UserActor,
  buyerLevel: BuyerLevel | null,
  sellerScopes: SellerScope[] = [],
): Promise<{ actor: AgentActor; apiKey: string }> {
  const agent = await createAgent(db, owner, {
    name: `Agent ${next()}`,
    access: { buyerLevel, sellerScopes },
  });
  const { apiKey } = await issueCredential(db, owner, agent.id);
  return { actor: await resolveAgentKey(db, apiKey), apiKey };
}

export async function newAgent(
  db: Database,
  owner: UserActor,
  buyerLevel: BuyerLevel | null,
  sellerScopes: SellerScope[] = [],
): Promise<AgentActor> {
  return (await newAgentWithKey(db, owner, buyerLevel, sellerScopes)).actor;
}

export const DEMO_ADDRESS = {
  line1: '120 Main St',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
} as const;

/** Encargo del caso de uso: 300 envases con tapa, aptos para caliente, sin foam, hasta US$80. */
export function demoTerms(
  overrides: Partial<AuthorizationTermsInput> = {},
): AuthorizationTermsInput {
  return {
    mandate: 'Buy 300 containers with lids for hot food, no foam. Up to US$80.',
    category: 'food_containers',
    requiredAttributes: {
      hot_food_safe: { eq: true },
      has_lid: { eq: true },
      material: { not_in: ['foam_eps'] },
    },
    quantityMin: 300,
    quantityMax: 300,
    budgetTotal: '80.00',
    deliveryAddress: { ...DEMO_ADDRESS },
    deliverBy: '2026-10-23',
    expiresAt: '2026-12-31T23:59:59Z',
    ...overrides,
  };
}

/**
 * Crea un pedido mínimo (proveedor, producto, oferta, solicitud, negociación, cotización)
 * para probar reservas. Los importes son los del pedido; no pasan por el motor comercial.
 */
export async function newOrder(
  db: Database,
  buyerOrgId: string,
  total: string,
  options: { supplierOrgId?: string; authorizationId?: string | null } = {},
): Promise<string> {
  const supplierOrgId =
    options.supplierOrgId ??
    (
      await db
        .insert(schema.organizations)
        .values({ name: `Supplier ${next()}` })
        .returning()
    )[0]!.id;
  const [product] = await db
    .insert(schema.products)
    .values({
      supplierOrgId,
      sku: `SKU-${next()}`,
      name: 'Container 16 oz with lid',
      category: 'food_containers',
      attributes: {
        material: 'kraft_paper',
        capacity_oz: 16,
        hot_food_safe: true,
        has_lid: true,
        pack_size: 50,
      },
    })
    .returning();
  const [offer] = await db
    .insert(schema.offers)
    .values({
      productId: product!.id,
      supplierOrgId,
      status: 'active',
      stockAvailable: 10_000,
      shipRegions: ['TX'],
      leadTimeDays: 2,
    })
    .returning();
  const [request] = await db
    .insert(schema.purchaseRequests)
    .values({ buyerOrgId, category: 'food_containers', criteria: {} })
    .returning();
  const [negotiation] = await db
    .insert(schema.negotiations)
    .values({ requestId: request!.id, buyerOrgId, supplierOrgId, offerId: offer!.id })
    .returning();
  const [quote] = await db
    .insert(schema.quotes)
    .values({
      negotiationId: negotiation!.id,
      version: 1,
      kind: 'quote',
      offerVersion: 1,
      productSnapshot: {},
      quantity: 300,
      unit: 'unit',
      listUnitPrice: '0.2500',
      unitPrice: '0.2500',
      subtotal: total,
      discountTotal: '0.00',
      shipping: '0.00',
      tax: '0.00',
      total,
      deliveryAddress: DEMO_ADDRESS,
      deliverBy: '2026-10-23',
      expiresAt: new Date(Date.now() + 86_400_000),
      authorOrgId: supplierOrgId,
    })
    .returning();
  const [order] = await db
    .insert(schema.orders)
    .values({
      buyerOrgId,
      supplierOrgId,
      quoteId: quote!.id,
      authorizationId: options.authorizationId ?? null,
      status: 'pending_payment',
      paymentMode: 'delegated',
      total,
      terms: {},
      acceptedAt: new Date(),
    })
    .returning();
  return order!.id;
}

export interface OfferFixture {
  attributes?: Record<string, unknown>;
  status?: 'draft' | 'active' | 'paused' | 'archived';
  stockAvailable?: number;
  minOrderQty?: number;
  maxOrderQty?: number | null;
  shipRegions?: string[];
  leadTimeDays?: number;
  shippingFlat?: string;
  taxRate?: string;
  tiers?: Array<{ minQty: number; unitPrice: string }>;
  rules?: Partial<typeof schema.negotiationRules.$inferInsert>;
}

/** Inserta directamente producto + oferta + tramos + reglas (sin pasar por el servicio). */
export async function newOffer(
  db: Database,
  supplierOrgId: string,
  o: OfferFixture = {},
): Promise<{ offerId: string; productId: string }> {
  const [product] = await db
    .insert(schema.products)
    .values({
      supplierOrgId,
      sku: `SKU-${next()}`,
      name: 'Kraft container 16 oz with lid',
      category: 'food_containers',
      attributes: o.attributes ?? {
        material: 'kraft_paper',
        capacity_oz: 16,
        hot_food_safe: true,
        has_lid: true,
        pack_size: 50,
      },
    })
    .returning();
  const [offer] = await db
    .insert(schema.offers)
    .values({
      productId: product!.id,
      supplierOrgId,
      status: o.status ?? 'active',
      stockAvailable: o.stockAvailable ?? 5000,
      minOrderQty: o.minOrderQty ?? 50,
      maxOrderQty: o.maxOrderQty ?? null,
      shipRegions: o.shipRegions ?? ['TX', 'OK'],
      leadTimeDays: o.leadTimeDays ?? 2,
      shippingFlat: o.shippingFlat ?? '6.00',
      taxRate: o.taxRate ?? '0.0825',
    })
    .returning();
  await db.insert(schema.offerPriceTiers).values(
    (
      o.tiers ?? [
        { minQty: 50, unitPrice: '0.3200' },
        { minQty: 250, unitPrice: '0.2600' },
      ]
    ).map((t) => ({ offerId: offer!.id, ...t })),
  );
  await db.insert(schema.negotiationRules).values({
    offerId: offer!.id,
    maxDiscount: '0.1000',
    floorUnitPrice: '0.2300',
    minLeadTimeDays: 1,
    ...o.rules,
  });
  return { offerId: offer!.id, productId: product!.id };
}
