import { DomainError, type ErrorCode } from '@deal/shared';
import { checkAttributes, type AttributeConstraints } from '../catalog/categories.js';
import type { AgentActor, BuyerLevel } from '../identity/actor.js';
import { gt } from '../money.js';
import type { DeliveryAddress } from './schemas.js';

/** Acciones del agente comprador y nivel mínimo que exige cada una (brief §3, §9). */
export const BUYER_ACTION_LEVEL = {
  search: 'search_only',
  save_request: 'search_only',
  request_quote: 'negotiate',
  counter_quote: 'negotiate',
  submit_for_review: 'negotiate',
  accept_quote: 'full_autonomy',
  execute_payment: 'full_autonomy',
} as const satisfies Record<string, BuyerLevel>;

export type BuyerAction = keyof typeof BUYER_ACTION_LEVEL;

const LEVEL_RANK: Record<BuyerLevel, number> = {
  search_only: 1,
  negotiate: 2,
  full_autonomy: 3,
};

export function levelAllows(level: BuyerLevel | null, action: BuyerAction): boolean {
  if (!level) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[BUYER_ACTION_LEVEL[action]];
}

/** Comprueba el nivel vigente del agente (resuelto en el servidor) para una acción de compra. */
export function assertBuyerAction(actor: AgentActor, action: BuyerAction): void {
  if (!levelAllows(actor.grant.buyerLevel, action)) {
    throw new DomainError(
      'LEVEL_INSUFFICIENT',
      `Action "${action}" requires access level ${BUYER_ACTION_LEVEL[action]}`,
      { action, requiredLevel: BUYER_ACTION_LEVEL[action], currentLevel: actor.grant.buyerLevel },
    );
  }
}

/** Datos de la autorización necesarios para evaluar una compra. */
export interface AuthorizationSnapshot {
  id: string;
  status: 'pending' | 'active' | 'revoked' | 'expired' | 'exhausted';
  agentId: string;
  version: number;
  category: string;
  requiredAttributes: AttributeConstraints;
  quantityMin: number;
  quantityMax: number;
  unit: string;
  allowedSupplierOrgIds: string[] | null;
  budgetTotal: string;
  currency: string;
  deliveryAddress: DeliveryAddress;
  deliverBy: string;
  expiresAt: Date;
}

/** Condiciones concretas de una compra (de la cotización final). */
export interface PurchaseTerms {
  supplierOrgId: string;
  category: string;
  productAttributes: Record<string, unknown>;
  quantity: number;
  unit: string;
  currency: string;
  total: string;
  deliveryAddress: DeliveryAddress;
  deliverBy: string;
}

export interface Violation {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

function normalizeAddress(a: DeliveryAddress): string {
  const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return [
    norm(a.line1),
    norm(a.line2),
    norm(a.city),
    a.state,
    a.postalCode.slice(0, 5),
    a.country,
  ].join('|');
}

/**
 * Evalúa unas condiciones de compra contra una autorización. Función pura: devuelve todas las
 * violaciones encontradas (lista vacía = cumple). El presupuesto restante lo verifica el libro
 * de presupuesto de forma transaccional; aquí solo se comprueba el tope del encargo.
 */
export function evaluatePurchase(
  auth: AuthorizationSnapshot,
  terms: PurchaseTerms,
  now: Date,
): Violation[] {
  const violations: Violation[] = [];

  if (auth.status === 'revoked') {
    violations.push({ code: 'AUTHORIZATION_REVOKED', message: 'The authorization was revoked' });
  } else if (auth.status === 'exhausted') {
    violations.push({
      code: 'AUTHORIZATION_EXHAUSTED',
      message: 'The authorization has exhausted its budget',
    });
  } else if (auth.status === 'expired' || auth.expiresAt.getTime() <= now.getTime()) {
    violations.push({
      code: 'AUTHORIZATION_EXPIRED',
      message: 'The authorization has expired',
      details: { expiresAt: auth.expiresAt.toISOString() },
    });
  } else if (auth.status !== 'active') {
    violations.push({
      code: 'AUTHORIZATION_NOT_FOUND',
      message: 'The authorization is not active',
    });
  }

  if (terms.category !== auth.category) {
    violations.push({
      code: 'TERMS_OUTSIDE_AUTHORIZATION',
      message: `Category ${terms.category} is not authorized`,
      details: { field: 'category', authorized: auth.category, actual: terms.category },
    });
  }

  for (const check of checkAttributes(auth.requiredAttributes, terms.productAttributes)) {
    if (check.status === 'unconfirmed') {
      violations.push({
        code: 'ATTRIBUTE_UNCONFIRMED',
        message: `Required attribute "${check.attribute}" is unconfirmed`,
        details: { attribute: check.attribute, constraint: check.constraint },
      });
    } else if (check.status === 'violated') {
      violations.push({
        code: 'TERMS_OUTSIDE_AUTHORIZATION',
        message: `Attribute "${check.attribute}" does not satisfy the constraint`,
        details: { attribute: check.attribute, value: check.value, constraint: check.constraint },
      });
    }
  }

  if (terms.unit !== auth.unit) {
    violations.push({
      code: 'TERMS_OUTSIDE_AUTHORIZATION',
      message: `Unit ${terms.unit} differs from the authorized unit (${auth.unit})`,
      details: { field: 'unit' },
    });
  }
  if (terms.quantity < auth.quantityMin || terms.quantity > auth.quantityMax) {
    violations.push({
      code: 'TERMS_OUTSIDE_AUTHORIZATION',
      message: `Quantity ${terms.quantity} is outside the authorized range ${auth.quantityMin}–${auth.quantityMax}`,
      details: {
        field: 'quantity',
        min: auth.quantityMin,
        max: auth.quantityMax,
        actual: terms.quantity,
      },
    });
  }

  if (auth.allowedSupplierOrgIds && !auth.allowedSupplierOrgIds.includes(terms.supplierOrgId)) {
    violations.push({
      code: 'SUPPLIER_NOT_ALLOWED',
      message: 'The supplier is not among the authorized suppliers',
      details: { supplierOrgId: terms.supplierOrgId },
    });
  }

  if (terms.currency !== auth.currency) {
    violations.push({
      code: 'TERMS_OUTSIDE_AUTHORIZATION',
      message: `Currency ${terms.currency} is not authorized`,
      details: { field: 'currency' },
    });
  }

  if (gt(terms.total, auth.budgetTotal)) {
    violations.push({
      code: 'BUDGET_EXCEEDED',
      message: `Total ${terms.total} exceeds the authorized budget ${auth.budgetTotal}`,
      details: { total: terms.total, budgetTotal: auth.budgetTotal },
    });
  }

  if (normalizeAddress(terms.deliveryAddress) !== normalizeAddress(auth.deliveryAddress)) {
    violations.push({
      code: 'TERMS_OUTSIDE_AUTHORIZATION',
      message: 'The delivery address does not match the authorized address',
      details: { field: 'deliveryAddress' },
    });
  }

  // Fechas ISO (YYYY-MM-DD) comparables lexicográficamente.
  if (terms.deliverBy > auth.deliverBy) {
    violations.push({
      code: 'TERMS_OUTSIDE_AUTHORIZATION',
      message: `Delivery (${terms.deliverBy}) is after the authorized deadline (${auth.deliverBy})`,
      details: { field: 'deliverBy', authorized: auth.deliverBy, actual: terms.deliverBy },
    });
  }

  return violations;
}

/** Lanza la primera violación como error accionable, adjuntando la lista completa. */
export function assertNoViolations(violations: Violation[]): void {
  const first = violations[0];
  if (!first) return;
  throw new DomainError(first.code, first.message, {
    ...first.details,
    violations: violations.map((v) => ({ code: v.code, message: v.message })),
  });
}
