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
    name: `Dueño ${name}`,
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
    name: `Agente ${next()}`,
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
    mandate: 'Compra 300 envases con tapa para comida caliente, sin foam. Hasta US$80.',
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
        .values({ name: `Proveedor ${next()}` })
        .returning()
    )[0]!.id;
  const [product] = await db
    .insert(schema.products)
    .values({
      supplierOrgId,
      sku: `SKU-${next()}`,
      name: 'Envase 16 oz con tapa',
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
