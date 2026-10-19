import {
  addDaysIso,
  pickTier,
  priceOffer,
  type PriceBreakdown,
  type PriceTier,
} from '../catalog/pricing.js';
import { compareMoney, dec, Decimal, gt, toUnitPrice } from '../money.js';

/**
 * Motor determinista de reglas del proveedor (brief §1 "recién agregado", §10). Responde en nombre
 * del proveedor sin que su agente esté conectado, siempre dentro de los límites fijados por su humano.
 */
export interface SupplierRules {
  autoRespond: boolean;
  maxDiscount: string;
  floorUnitPrice: string;
  minQtyForDiscount: number;
  minLeadTimeDays: number;
  canWaiveShipping: boolean;
  quoteValidityHours: number;
}

export interface OfferTerms {
  tiers: PriceTier[];
  minOrderQty: number;
  maxOrderQty: number | null;
  /** Existencias informadas menos reservas activas. */
  availableStock: number;
  shipRegions: string[];
  leadTimeDays: number;
  shippingFlat: string;
  taxRate: string;
}

export interface Proposal {
  quantity: number;
  unitPrice?: string;
  waiveShipping?: boolean;
  deliverBy?: string;
}

export interface ResolvedTerms {
  quantity: number;
  unitPrice: string;
  waiveShipping: boolean;
  deliverBy: string;
  pricing: PriceBreakdown;
}

export type RuleOutcome =
  | { kind: 'accept'; terms: ResolvedTerms; trace: string[] }
  | { kind: 'counter'; terms: ResolvedTerms; trace: string[] }
  | { kind: 'escalate'; reasons: string[]; trace: string[] };

/** Precio unitario mínimo que las reglas permiten para una cantidad. */
export function allowedMinUnitPrice(
  offer: OfferTerms,
  rules: SupplierRules,
  quantity: number,
): string | null {
  const tier = pickTier(offer.tiers, quantity);
  if (!tier) return null;
  if (quantity < rules.minQtyForDiscount) return toUnitPrice(tier.unitPrice);
  const discounted = dec(tier.unitPrice).times(dec(1).minus(dec(rules.maxDiscount)));
  // Se redondea hacia arriba: el redondeo nunca concede más descuento del permitido.
  const candidate = toUnitPrice(discounted.toDecimalPlaces(4, Decimal.ROUND_UP));
  return gt(rules.floorUnitPrice, candidate) ? toUnitPrice(rules.floorUnitPrice) : candidate;
}

/** Problemas que impiden cotizar automáticamente esa cantidad/destino. */
export function feasibilityIssues(
  offer: OfferTerms,
  quantity: number,
  deliveryState: string,
): string[] {
  const issues: string[] = [];
  if (quantity < offer.minOrderQty)
    issues.push(`Cantidad ${quantity} menor que el pedido mínimo ${offer.minOrderQty}`);
  if (offer.maxOrderQty !== null && quantity > offer.maxOrderQty) {
    issues.push(`Cantidad ${quantity} mayor que el pedido máximo ${offer.maxOrderQty}`);
  }
  if (quantity > offer.availableStock)
    issues.push(`Existencias insuficientes (${offer.availableStock})`);
  if (!offer.shipRegions.includes(deliveryState)) issues.push(`No se entrega en ${deliveryState}`);
  if (!pickTier(offer.tiers, quantity)) issues.push('Ningún tramo de precio aplica a esa cantidad');
  return issues;
}

function resolve(
  offer: OfferTerms,
  p: Required<Omit<Proposal, 'deliverBy'>> & { deliverBy: string },
): ResolvedTerms {
  const pricing = priceOffer({
    tiers: offer.tiers,
    quantity: p.quantity,
    shippingFlat: offer.shippingFlat,
    taxRate: offer.taxRate,
    unitPrice: p.unitPrice,
    waiveShipping: p.waiveShipping,
  });
  if (!pricing) throw new Error('Sin tramo aplicable; debió detectarse antes');
  return {
    quantity: p.quantity,
    unitPrice: pricing.unitPrice,
    waiveShipping: p.waiveShipping,
    deliverBy: p.deliverBy,
    pricing,
  };
}

/**
 * Cotización inicial a precio de lista. Ofrece la fecha pedida si cabe en el plazo mínimo del
 * proveedor; si no se pidió o es posterior al plazo estándar, usa el plazo estándar.
 */
export function initialQuote(
  offer: OfferTerms,
  rules: SupplierRules,
  request: { quantity: number; deliveryState: string; deliverBy: string },
  now: Date,
): RuleOutcome {
  const trace: string[] = [];
  const issues = feasibilityIssues(offer, request.quantity, request.deliveryState);
  if (!rules.autoRespond) issues.unshift('El proveedor revisa manualmente cada solicitud');
  if (issues.length > 0) return { kind: 'escalate', reasons: issues, trace };

  const earliest = addDaysIso(now, rules.minLeadTimeDays);
  const standard = addDaysIso(now, offer.leadTimeDays);
  const deliverBy =
    request.deliverBy < standard
      ? request.deliverBy < earliest
        ? earliest
        : request.deliverBy
      : standard;
  trace.push(`Tramo de lista para ${request.quantity}; entrega ${deliverBy}`);
  const tier = pickTier(offer.tiers, request.quantity)!;
  return {
    kind: 'counter',
    terms: resolve(offer, {
      quantity: request.quantity,
      unitPrice: tier.unitPrice,
      waiveShipping: false,
      deliverBy,
    }),
    trace,
  };
}

/**
 * Respuesta automática a una contrapropuesta del comprador. Cada dimensión se ajusta al mejor
 * valor permitido; si no hubo que ajustar nada, el proveedor acepta los términos propuestos.
 */
export function respondToCounter(
  offer: OfferTerms,
  rules: SupplierRules,
  current: { unitPrice: string; waiveShipping: boolean; deliverBy: string },
  proposal: Proposal,
  deliveryState: string,
  now: Date,
): RuleOutcome {
  const trace: string[] = [];
  const issues = feasibilityIssues(offer, proposal.quantity, deliveryState);
  if (!rules.autoRespond) issues.unshift('El proveedor revisa manualmente cada contrapropuesta');
  if (issues.length > 0) return { kind: 'escalate', reasons: issues, trace };

  let adjusted = false;
  const tier = pickTier(offer.tiers, proposal.quantity)!;
  const minPrice = allowedMinUnitPrice(offer, rules, proposal.quantity)!;

  let unitPrice = toUnitPrice(proposal.unitPrice ?? current.unitPrice);
  // Nunca por encima del precio de lista del tramo.
  if (gt(unitPrice, tier.unitPrice)) unitPrice = toUnitPrice(tier.unitPrice);
  if (compareMoney(unitPrice, minPrice) < 0) {
    trace.push(`Precio ${unitPrice} por debajo del permitido; se ofrece ${minPrice}`);
    unitPrice = minPrice;
    adjusted = true;
  }

  let waiveShipping = proposal.waiveShipping ?? current.waiveShipping;
  if (waiveShipping && !rules.canWaiveShipping && compareMoney(offer.shippingFlat, '0') > 0) {
    trace.push('El transporte no puede bonificarse');
    waiveShipping = false;
    adjusted = true;
  }

  const earliest = addDaysIso(now, rules.minLeadTimeDays);
  let deliverBy = proposal.deliverBy ?? current.deliverBy;
  if (deliverBy < earliest) {
    trace.push(`Entrega ${deliverBy} antes del plazo mínimo; se ofrece ${earliest}`);
    deliverBy = earliest;
    adjusted = true;
  }

  const terms = resolve(offer, {
    quantity: proposal.quantity,
    unitPrice,
    waiveShipping,
    deliverBy,
  });
  if (!adjusted) trace.push('Propuesta dentro de las reglas del proveedor');
  return { kind: adjusted ? 'counter' : 'accept', terms, trace };
}

/**
 * Valida una cotización emitida por un agente del proveedor: no puede conceder más de lo que
 * permiten las reglas. Devuelve los motivos de rechazo (vacío = válida).
 */
export function agentQuoteViolations(
  offer: OfferTerms,
  rules: SupplierRules,
  proposal: Required<Omit<Proposal, 'deliverBy'>> & { deliverBy: string },
  now: Date,
): string[] {
  const reasons: string[] = [];
  const minPrice = allowedMinUnitPrice(offer, rules, proposal.quantity);
  if (minPrice && compareMoney(proposal.unitPrice, minPrice) < 0) {
    reasons.push(`Precio ${toUnitPrice(proposal.unitPrice)} inferior al mínimo autorizado`);
  }
  if (
    proposal.waiveShipping &&
    !rules.canWaiveShipping &&
    compareMoney(offer.shippingFlat, '0') > 0
  ) {
    reasons.push('Bonificar el transporte no está autorizado');
  }
  if (proposal.deliverBy < addDaysIso(now, rules.minLeadTimeDays)) {
    reasons.push('Plazo de entrega inferior al mínimo autorizado');
  }
  return reasons;
}
