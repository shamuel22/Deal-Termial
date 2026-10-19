import {
  addMoney,
  applyRate,
  compareMoney,
  lineTotal,
  subMoney,
  toMoney,
  toUnitPrice,
} from '../money.js';

/**
 * Cálculo determinista de importes de una oferta. Lo usan la búsqueda y las cotizaciones.
 *
 * Regla de demo (el MVP no tiene motor fiscal, brief §10): el impuesto informado por el
 * proveedor se aplica sobre la mercancía neta de descuento más el transporte.
 */
export interface PriceTier {
  minQty: number;
  unitPrice: string;
}

export interface PriceBreakdown {
  tierMinQty: number;
  listUnitPrice: string;
  unitPrice: string;
  subtotal: string;
  discountTotal: string;
  shipping: string;
  tax: string;
  total: string;
}

/** Tramo aplicable: el de mayor `minQty` que no supere la cantidad; null si ninguno aplica. */
export function pickTier(tiers: PriceTier[], quantity: number): PriceTier | null {
  let best: PriceTier | null = null;
  for (const tier of tiers) {
    if (tier.minQty <= quantity && (!best || tier.minQty > best.minQty)) best = tier;
  }
  return best;
}

export interface PriceInput {
  tiers: PriceTier[];
  quantity: number;
  shippingFlat: string;
  taxRate: string;
  /** Precio unitario negociado; si se omite, el del tramo. */
  unitPrice?: string;
  waiveShipping?: boolean;
}

export function priceOffer(input: PriceInput): PriceBreakdown | null {
  const tier = pickTier(input.tiers, input.quantity);
  if (!tier) return null;
  const listUnitPrice = toUnitPrice(tier.unitPrice);
  const unitPrice = toUnitPrice(input.unitPrice ?? tier.unitPrice);
  const subtotal = lineTotal(input.quantity, listUnitPrice);
  const merchandise = lineTotal(input.quantity, unitPrice);
  const discountTotal = subMoney(subtotal, merchandise);
  const shipping = input.waiveShipping ? '0.00' : toMoney(input.shippingFlat);
  const tax = applyRate(addMoney(merchandise, shipping), input.taxRate);
  return {
    tierMinQty: tier.minQty,
    listUnitPrice,
    unitPrice,
    subtotal,
    discountTotal: compareMoney(discountTotal, '0') < 0 ? '0.00' : discountTotal,
    shipping,
    tax,
    total: addMoney(merchandise, shipping, tax),
  };
}

/** Fecha (YYYY-MM-DD, UTC) a `days` días naturales de `from`. */
export function addDaysIso(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
