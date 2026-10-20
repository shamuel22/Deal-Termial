import { and, eq, gt as sqlGt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { assertBuyerAction } from '../authorization/policy.js';
import { moneyString, isoDate, US_STATES } from '../authorization/schemas.js';
import type { Executor } from '../db.js';
import { requireAdmin, type Actor } from '../identity/actor.js';
import { compareMoney, gt, subMoney } from '../money.js';
import {
  attributeConstraints,
  checkAttributes,
  CATEGORY_IDS,
  validateConstraints,
} from './categories.js';
import { addDaysIso, priceOffer, type PriceBreakdown, type PriceTier } from './pricing.js';

/**
 * Búsqueda y comparación de ofertas publicadas (herramienta `find_matches`). Determinista:
 * compara atributos estructurados, calcula importes y explica cada resultado sin presentar
 * datos desconocidos como confirmados (brief §5, paso 3).
 */
export const searchCriteria = z.object({
  category: z.enum(CATEGORY_IDS),
  requiredAttributes: attributeConstraints.default({}),
  quantity: z.number().int().positive(),
  deliveryState: z.enum(US_STATES).optional(),
  deliverBy: isoDate.optional(),
  maxTotal: moneyString.optional(),
  supplierOrgIds: z.array(z.uuid()).min(1).optional(),
});
export type SearchCriteriaInput = z.input<typeof searchCriteria>;
export type SearchCriteria = z.output<typeof searchCriteria>;

export const searchOptions = z.object({
  includeIncompatible: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(10),
});
export type SearchOptionsInput = z.input<typeof searchOptions>;

export type MatchStatus = 'compatible' | 'needs_confirmation' | 'incompatible';

export type MismatchCode =
  | 'ATTRIBUTE_VIOLATED'
  | 'REGION_NOT_SERVED'
  | 'INSUFFICIENT_STOCK'
  | 'BELOW_MIN_ORDER'
  | 'ABOVE_MAX_ORDER'
  | 'MISSES_DEADLINE';

export interface OfferMatch {
  offerId: string;
  offerVersion: number;
  supplier: { orgId: string; name: string };
  product: {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    unit: string;
    attributes: Record<string, unknown>;
  };
  status: MatchStatus;
  /** Atributos obligatorios que el proveedor no ha confirmado: requieren aclaración. */
  unconfirmedAttributes: string[];
  mismatches: Array<{ code: MismatchCode; message: string }>;
  pricing: (PriceBreakdown & { currency: string }) | null;
  /**
   * Comparación del total de lista con el máximo pedido. Superarlo no descarta la oferta:
   * es el punto de partida de la negociación.
   */
  budget: { maxTotal: string; withinBudget: boolean; overBy: string | null } | null;
  delivery: {
    regions: string[];
    leadTimeDays: number;
    earliestDate: string;
    meetsDeadline: boolean | null;
  };
  stock: { available: number; sufficient: boolean };
  orderLimits: { minOrderQty: number; maxOrderQty: number | null };
  priceTiers: PriceTier[];
}

const RANK: Record<MatchStatus, number> = { compatible: 0, needs_confirmation: 1, incompatible: 2 };

/** Evalúa una oferta concreta contra los criterios. Función pura. */
export function evaluateOffer(
  offer: {
    stockAvailable: number;
    reserved: number;
    minOrderQty: number;
    maxOrderQty: number | null;
    shipRegions: string[];
    leadTimeDays: number;
    shippingFlat: string;
    taxRate: string;
    tiers: PriceTier[];
    attributes: Record<string, unknown>;
  },
  criteria: SearchCriteria,
  now: Date,
) {
  const mismatches: OfferMatch['mismatches'] = [];
  const unconfirmed: string[] = [];

  for (const check of checkAttributes(criteria.requiredAttributes, offer.attributes)) {
    if (check.status === 'unconfirmed') unconfirmed.push(check.attribute);
    if (check.status === 'violated') {
      mismatches.push({
        code: 'ATTRIBUTE_VIOLATED',
        message: `${check.attribute} = ${JSON.stringify(check.value)} does not satisfy ${JSON.stringify(check.constraint)}`,
      });
    }
  }

  if (criteria.deliveryState && !offer.shipRegions.includes(criteria.deliveryState)) {
    mismatches.push({
      code: 'REGION_NOT_SERVED',
      message: `No delivery to ${criteria.deliveryState}`,
    });
  }

  const available = Math.max(0, offer.stockAvailable - offer.reserved);
  const sufficient = available >= criteria.quantity;
  if (!sufficient) {
    mismatches.push({
      code: 'INSUFFICIENT_STOCK',
      message: `Reported stock ${available} < ${criteria.quantity}`,
    });
  }
  if (criteria.quantity < offer.minOrderQty) {
    mismatches.push({
      code: 'BELOW_MIN_ORDER',
      message: `Minimum order quantity ${offer.minOrderQty}`,
    });
  }
  if (offer.maxOrderQty !== null && criteria.quantity > offer.maxOrderQty) {
    mismatches.push({
      code: 'ABOVE_MAX_ORDER',
      message: `Maximum order quantity ${offer.maxOrderQty}`,
    });
  }

  const earliestDate = addDaysIso(now, offer.leadTimeDays);
  const meetsDeadline = criteria.deliverBy ? earliestDate <= criteria.deliverBy : null;
  if (meetsDeadline === false) {
    mismatches.push({
      code: 'MISSES_DEADLINE',
      message: `Earliest delivery ${earliestDate}, after ${criteria.deliverBy}`,
    });
  }

  const pricing = priceOffer({
    tiers: offer.tiers,
    quantity: criteria.quantity,
    shippingFlat: offer.shippingFlat,
    taxRate: offer.taxRate,
  });
  const budget =
    pricing && criteria.maxTotal
      ? {
          maxTotal: criteria.maxTotal,
          withinBudget: !gt(pricing.total, criteria.maxTotal),
          overBy: gt(pricing.total, criteria.maxTotal)
            ? subMoney(pricing.total, criteria.maxTotal)
            : null,
        }
      : null;

  const status: MatchStatus =
    mismatches.length > 0
      ? 'incompatible'
      : unconfirmed.length > 0
        ? 'needs_confirmation'
        : 'compatible';
  return {
    status,
    mismatches,
    unconfirmed,
    pricing,
    budget,
    earliestDate,
    meetsDeadline,
    available,
    sufficient,
  };
}

export async function findMatches(
  db: Executor,
  actor: Actor,
  criteriaInput: SearchCriteriaInput,
  optionsInput: SearchOptionsInput = {},
  now = new Date(),
): Promise<{ criteria: SearchCriteria; matches: OfferMatch[]; excludedIncompatible: number }> {
  if (actor.kind === 'agent') assertBuyerAction(actor, 'search');
  else requireAdmin(actor);
  const criteria = searchCriteria.parse(criteriaInput);
  const options = searchOptions.parse(optionsInput);
  validateConstraints(criteria.category, criteria.requiredAttributes);

  const conditions = [
    eq(schema.offers.status, 'active'),
    eq(schema.products.category, criteria.category),
    // Las ofertas propias no se ofrecen a la misma organización.
    ne(schema.offers.supplierOrgId, actor.orgId),
    or(isNull(schema.offers.validUntil), sqlGt(schema.offers.validUntil, now)),
  ];
  if (criteria.supplierOrgIds)
    conditions.push(inArray(schema.offers.supplierOrgId, criteria.supplierOrgIds));

  // Solo columnas públicas: las reglas de negociación del proveedor nunca se leen aquí.
  const rows = await db
    .select({
      offer: {
        id: schema.offers.id,
        version: schema.offers.version,
        supplierOrgId: schema.offers.supplierOrgId,
        stockAvailable: schema.offers.stockAvailable,
        minOrderQty: schema.offers.minOrderQty,
        maxOrderQty: schema.offers.maxOrderQty,
        shipRegions: schema.offers.shipRegions,
        leadTimeDays: schema.offers.leadTimeDays,
        shippingFlat: schema.offers.shippingFlat,
        taxRate: schema.offers.taxRate,
        currency: schema.offers.currency,
      },
      product: {
        id: schema.products.id,
        sku: schema.products.sku,
        name: schema.products.name,
        description: schema.products.description,
        unit: schema.products.unit,
        attributes: schema.products.attributes,
      },
      supplierName: schema.organizations.name,
      reserved: sql<number>`coalesce((
        select sum(${schema.stockReservations.quantity}) from ${schema.stockReservations}
        where ${schema.stockReservations.offerId} = ${schema.offers.id}
          and ${schema.stockReservations.status} = 'active'
      ), 0)::int`,
    })
    .from(schema.offers)
    .innerJoin(schema.products, eq(schema.products.id, schema.offers.productId))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.offers.supplierOrgId))
    .where(and(...conditions));

  const tierRows =
    rows.length === 0
      ? []
      : await db
          .select()
          .from(schema.offerPriceTiers)
          .where(
            inArray(
              schema.offerPriceTiers.offerId,
              rows.map((r) => r.offer.id),
            ),
          );

  const all: OfferMatch[] = rows.map((row) => {
    const tiers = tierRows
      .filter((t) => t.offerId === row.offer.id)
      .map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice }))
      .sort((a, b) => a.minQty - b.minQty);
    const attributes = row.product.attributes as Record<string, unknown>;
    const result = evaluateOffer(
      { ...row.offer, reserved: row.reserved, tiers, attributes },
      criteria,
      now,
    );
    return {
      offerId: row.offer.id,
      offerVersion: row.offer.version,
      supplier: { orgId: row.offer.supplierOrgId, name: row.supplierName },
      product: { ...row.product, attributes },
      status: result.status,
      unconfirmedAttributes: result.unconfirmed,
      mismatches: result.mismatches,
      pricing: result.pricing ? { ...result.pricing, currency: row.offer.currency } : null,
      budget: result.budget,
      delivery: {
        regions: row.offer.shipRegions,
        leadTimeDays: row.offer.leadTimeDays,
        earliestDate: result.earliestDate,
        meetsDeadline: result.meetsDeadline,
      },
      stock: { available: result.available, sufficient: result.sufficient },
      orderLimits: { minOrderQty: row.offer.minOrderQty, maxOrderQty: row.offer.maxOrderQty },
      priceTiers: tiers,
    };
  });

  all.sort((a, b) => {
    const byStatus = RANK[a.status] - RANK[b.status];
    if (byStatus !== 0) return byStatus;
    // Dentro del mismo estado, primero las que ya caben en el presupuesto.
    const fits = Number(b.budget?.withinBudget ?? true) - Number(a.budget?.withinBudget ?? true);
    if (fits !== 0) return fits;
    if (a.pricing && b.pricing) return compareMoney(a.pricing.total, b.pricing.total);
    return a.pricing ? -1 : b.pricing ? 1 : 0;
  });

  const visible = options.includeIncompatible
    ? all
    : all.filter((m) => m.status !== 'incompatible');
  return {
    criteria,
    matches: visible.slice(0, options.limit),
    excludedIncompatible: all.length - all.filter((m) => m.status !== 'incompatible').length,
  };
}
