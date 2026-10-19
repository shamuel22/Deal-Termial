import { describe, expect, it } from 'vitest';
import { DomainError } from '@deal/shared';
import type { AgentActor, BuyerLevel } from '../identity/actor.js';
import {
  assertBuyerAction,
  assertNoViolations,
  BUYER_ACTION_LEVEL,
  evaluatePurchase,
  levelAllows,
  type AuthorizationSnapshot,
  type BuyerAction,
  type PurchaseTerms,
} from './policy.js';

const NOW = new Date('2026-10-20T12:00:00Z');
const SUPPLIER = '11111111-1111-4111-8111-111111111111';
const OTHER_SUPPLIER = '22222222-2222-4222-8222-222222222222';
const ADDRESS = {
  line1: '120 Main St',
  city: 'Austin',
  state: 'TX' as const,
  postalCode: '78701',
  country: 'US' as const,
};

function auth(overrides: Partial<AuthorizationSnapshot> = {}): AuthorizationSnapshot {
  return {
    id: 'a',
    status: 'active',
    agentId: 'agent',
    version: 1,
    category: 'food_containers',
    requiredAttributes: {
      hot_food_safe: { eq: true },
      has_lid: { eq: true },
      material: { not_in: ['foam_eps'] },
    },
    quantityMin: 300,
    quantityMax: 300,
    unit: 'unit',
    allowedSupplierOrgIds: null,
    budgetTotal: '80.00',
    currency: 'USD',
    deliveryAddress: ADDRESS,
    deliverBy: '2026-10-23',
    expiresAt: new Date('2026-10-31T00:00:00Z'),
    ...overrides,
  };
}

function terms(overrides: Partial<PurchaseTerms> = {}): PurchaseTerms {
  return {
    supplierOrgId: SUPPLIER,
    category: 'food_containers',
    productAttributes: {
      material: 'kraft_paper',
      capacity_oz: 16,
      hot_food_safe: true,
      has_lid: true,
      pack_size: 50,
    },
    quantity: 300,
    unit: 'unit',
    currency: 'USD',
    total: '79.95',
    deliveryAddress: ADDRESS,
    deliverBy: '2026-10-22',
    ...overrides,
  };
}

const codes = (a: AuthorizationSnapshot, t: PurchaseTerms) =>
  evaluatePurchase(a, t, NOW).map((v) => v.code);

describe('niveles de acceso (brief §3)', () => {
  const matrix: Record<BuyerLevel, BuyerAction[]> = {
    search_only: ['search', 'save_request'],
    negotiate: ['search', 'save_request', 'request_quote', 'counter_quote', 'submit_for_review'],
    full_autonomy: Object.keys(BUYER_ACTION_LEVEL) as BuyerAction[],
  };

  for (const [level, allowed] of Object.entries(matrix) as [BuyerLevel, BuyerAction[]][]) {
    it(`${level} permite exactamente ${allowed.length} acciones`, () => {
      for (const action of Object.keys(BUYER_ACTION_LEVEL) as BuyerAction[]) {
        expect(levelAllows(level, action), `${level} → ${action}`).toBe(allowed.includes(action));
      }
    });
  }

  it('sin nivel de compra no se permite ninguna acción', () => {
    for (const action of Object.keys(BUYER_ACTION_LEVEL) as BuyerAction[]) {
      expect(levelAllows(null, action)).toBe(false);
    }
  });

  it('el error indica nivel requerido y actual', () => {
    const actor = {
      kind: 'agent',
      agentId: 'x',
      orgId: 'o',
      credentialId: 'c',
      grant: { id: 'g', version: 1, buyerLevel: 'search_only', sellerScopes: [] },
    } satisfies AgentActor;
    try {
      assertBuyerAction(actor, 'request_quote');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('LEVEL_INSUFFICIENT');
      expect((error as DomainError).details).toMatchObject({
        requiredLevel: 'negotiate',
        currentLevel: 'search_only',
      });
    }
  });
});

describe('evaluatePurchase', () => {
  it('acepta una compra dentro de todas las condiciones', () => {
    expect(evaluatePurchase(auth(), terms(), NOW)).toEqual([]);
  });

  it('tolera diferencias de mayúsculas y espacios en la dirección', () => {
    const t = terms({ deliveryAddress: { ...ADDRESS, line1: ' 120  main st ', city: 'AUSTIN' } });
    expect(codes(auth(), t)).toEqual([]);
  });

  it.each([
    ['revocada', { status: 'revoked' as const }, 'AUTHORIZATION_REVOKED'],
    ['agotada', { status: 'exhausted' as const }, 'AUTHORIZATION_EXHAUSTED'],
    ['vencida por estado', { status: 'expired' as const }, 'AUTHORIZATION_EXPIRED'],
    ['vencida por fecha', { expiresAt: new Date('2026-10-20T11:59:59Z') }, 'AUTHORIZATION_EXPIRED'],
    ['pendiente', { status: 'pending' as const }, 'AUTHORIZATION_NOT_FOUND'],
  ])('rechaza autorización %s', (_label, override, code) => {
    expect(codes(auth(override), terms())).toEqual([code]);
  });

  it('un atributo obligatorio ausente queda sin confirmar, nunca cumplido', () => {
    const t = terms({
      productAttributes: { material: 'kraft_paper', capacity_oz: 16, has_lid: true, pack_size: 50 },
    });
    const violations = evaluatePurchase(auth(), t, NOW);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      code: 'ATTRIBUTE_UNCONFIRMED',
      details: { attribute: 'hot_food_safe' },
    });
  });

  it('rechaza foam aunque cumpla lo demás', () => {
    const t = terms({
      productAttributes: { ...terms().productAttributes, material: 'foam_eps' },
    });
    expect(codes(auth(), t)).toEqual(['TERMS_OUTSIDE_AUTHORIZATION']);
  });

  it.each([
    ['cantidad menor', { quantity: 299 }],
    ['cantidad mayor', { quantity: 301 }],
    ['otra categoría', { category: 'cups' }],
    ['otra unidad', { unit: 'box' }],
    ['otra moneda', { currency: 'EUR' }],
    ['entrega tardía', { deliverBy: '2026-10-24' }],
    ['otro destino', { deliveryAddress: { ...ADDRESS, postalCode: '78702' } }],
  ])('rechaza %s', (_label, override) => {
    expect(codes(auth(), terms(override as Partial<PurchaseTerms>))).toEqual([
      'TERMS_OUTSIDE_AUTHORIZATION',
    ]);
  });

  it('rechaza proveedores no permitidos', () => {
    expect(codes(auth({ allowedSupplierOrgIds: [OTHER_SUPPLIER] }), terms())).toEqual([
      'SUPPLIER_NOT_ALLOWED',
    ]);
    expect(codes(auth({ allowedSupplierOrgIds: [SUPPLIER] }), terms())).toEqual([]);
  });

  it('el total incluye transporte e impuestos y no puede superar el encargo', () => {
    expect(codes(auth(), terms({ total: '80.00' }))).toEqual([]);
    expect(codes(auth(), terms({ total: '80.01' }))).toEqual(['BUDGET_EXCEEDED']);
  });

  it('acumula todas las violaciones y las adjunta al error', () => {
    const violations = evaluatePurchase(
      auth({ status: 'revoked' }),
      terms({ quantity: 10, total: '99.00' }),
      NOW,
    );
    expect(violations.map((v) => v.code)).toEqual([
      'AUTHORIZATION_REVOKED',
      'TERMS_OUTSIDE_AUTHORIZATION',
      'BUDGET_EXCEEDED',
    ]);
    expect(() => assertNoViolations(violations)).toThrow(DomainError);
    try {
      assertNoViolations(violations);
    } catch (error) {
      expect((error as DomainError).code).toBe('AUTHORIZATION_REVOKED');
      expect((error as DomainError).details?.violations).toHaveLength(3);
    }
  });
});
