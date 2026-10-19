import { describe, expect, it } from 'vitest';
import {
  agentQuoteViolations,
  allowedMinUnitPrice,
  initialQuote,
  respondToCounter,
  type OfferTerms,
  type SupplierRules,
} from './rules.js';

const NOW = new Date('2026-10-20T12:00:00Z'); // martes
// Oferta A de la demo: kraft 16 oz.
const offer: OfferTerms = {
  tiers: [
    { minQty: 50, unitPrice: '0.3100' },
    { minQty: 250, unitPrice: '0.2400' },
  ],
  minOrderQty: 50,
  maxOrderQty: null,
  availableStock: 4000,
  shipRegions: ['TX', 'OK'],
  leadTimeDays: 2,
  shippingFlat: '5.00',
  taxRate: '0.0825',
};
const rules: SupplierRules = {
  autoRespond: true,
  maxDiscount: '0.1000',
  floorUnitPrice: '0.2200',
  minQtyForDiscount: 250,
  minLeadTimeDays: 1,
  canWaiveShipping: false,
  quoteValidityHours: 48,
};
const listTerms = { unitPrice: '0.2400', waiveShipping: false, deliverBy: '2026-10-22' };

describe('precio mínimo permitido', () => {
  it('aplica el mayor entre el descuento máximo y el precio piso', () => {
    // 0.24 × 0.90 = 0.216 < piso 0.22
    expect(allowedMinUnitPrice(offer, rules, 300)).toBe('0.2200');
    expect(allowedMinUnitPrice(offer, { ...rules, floorUnitPrice: '0.2000' }, 300)).toBe('0.2160');
  });

  it('sin descuento por debajo de la cantidad mínima para descuento', () => {
    expect(allowedMinUnitPrice(offer, rules, 100)).toBe('0.3100');
  });

  it('redondea hacia arriba para no conceder de más', () => {
    // 0.2333 × 0.9 = 0.20997 → 0.2100
    const o = { ...offer, tiers: [{ minQty: 1, unitPrice: '0.2333' }] };
    expect(
      allowedMinUnitPrice(o, { ...rules, floorUnitPrice: '0.1000', minQtyForDiscount: 1 }, 10),
    ).toBe('0.2100');
  });
});

describe('cotización inicial', () => {
  it('caso de uso: 300 a precio de lista, total 83.35 por encima de US$80', () => {
    const out = initialQuote(
      offer,
      rules,
      { quantity: 300, deliveryState: 'TX', deliverBy: '2026-10-23' },
      NOW,
    );
    expect(out.kind).toBe('counter');
    if (out.kind === 'escalate') return;
    expect(out.terms).toMatchObject({ unitPrice: '0.2400', deliverBy: '2026-10-22' });
    expect(out.terms.pricing.total).toBe('83.35');
  });

  it('ofrece la fecha pedida si cabe en el plazo mínimo', () => {
    const out = initialQuote(
      offer,
      rules,
      { quantity: 300, deliveryState: 'TX', deliverBy: '2026-10-21' },
      NOW,
    );
    expect(out.kind === 'counter' && out.terms.deliverBy).toBe('2026-10-21');
    const tooSoon = initialQuote(
      offer,
      rules,
      { quantity: 300, deliveryState: 'TX', deliverBy: '2026-10-20' },
      NOW,
    );
    expect(tooSoon.kind === 'counter' && tooSoon.terms.deliverBy).toBe('2026-10-21');
  });

  it('escala al proveedor si no puede resolver automáticamente', () => {
    expect(
      initialQuote(
        offer,
        { ...rules, autoRespond: false },
        { quantity: 300, deliveryState: 'TX', deliverBy: '2026-10-23' },
        NOW,
      ).kind,
    ).toBe('escalate');
    const out = initialQuote(
      offer,
      rules,
      { quantity: 5000, deliveryState: 'CA', deliverBy: '2026-10-23' },
      NOW,
    );
    expect(out.kind).toBe('escalate');
    expect(out.kind === 'escalate' && out.reasons).toEqual([
      'Existencias insuficientes (4000)',
      'No se entrega en CA',
    ]);
  });
});

describe('respuesta a contrapropuestas', () => {
  it('acepta una propuesta dentro de las reglas', () => {
    const out = respondToCounter(
      offer,
      rules,
      listTerms,
      { quantity: 300, unitPrice: '0.2250' },
      'TX',
      NOW,
    );
    expect(out.kind).toBe('accept');
    expect(out.kind !== 'escalate' && out.terms.unitPrice).toBe('0.2250');
  });

  it('contraoferta al mínimo permitido si piden menos: 300 × 0.22 + 5 + 8.25 % = 76.86', () => {
    const out = respondToCounter(
      offer,
      rules,
      listTerms,
      { quantity: 300, unitPrice: '0.2000' },
      'TX',
      NOW,
    );
    expect(out.kind).toBe('counter');
    if (out.kind === 'escalate') return;
    expect(out.terms.unitPrice).toBe('0.2200');
    expect(out.terms.pricing).toMatchObject({
      subtotal: '72.00',
      discountTotal: '6.00',
      total: '76.86',
    });
    expect(out.trace.join(' ')).toContain('0.2200');
  });

  it('no bonifica transporte ni acorta plazos fuera de las reglas', () => {
    const out = respondToCounter(
      offer,
      rules,
      listTerms,
      { quantity: 300, unitPrice: '0.2300', waiveShipping: true, deliverBy: '2026-10-20' },
      'TX',
      NOW,
    );
    expect(out.kind).toBe('counter');
    expect(out.kind !== 'escalate' && out.terms).toMatchObject({
      unitPrice: '0.2300',
      waiveShipping: false,
      deliverBy: '2026-10-21',
    });
  });

  it('bonifica transporte si está permitido', () => {
    const out = respondToCounter(
      offer,
      { ...rules, canWaiveShipping: true },
      listTerms,
      { quantity: 300, waiveShipping: true },
      'TX',
      NOW,
    );
    expect(out.kind).toBe('accept');
    expect(out.kind !== 'escalate' && out.terms.pricing.shipping).toBe('0.00');
  });

  it('no sube por encima del precio de lista', () => {
    const out = respondToCounter(
      offer,
      rules,
      listTerms,
      { quantity: 300, unitPrice: '0.5000' },
      'TX',
      NOW,
    );
    expect(out.kind !== 'escalate' && out.terms.unitPrice).toBe('0.2400');
  });
});

describe('cotizaciones emitidas por el agente del proveedor', () => {
  it('no puede conceder fuera de las reglas', () => {
    expect(
      agentQuoteViolations(
        offer,
        rules,
        { quantity: 300, unitPrice: '0.2100', waiveShipping: true, deliverBy: '2026-10-20' },
        NOW,
      ),
    ).toHaveLength(3);
    expect(
      agentQuoteViolations(
        offer,
        rules,
        { quantity: 300, unitPrice: '0.2200', waiveShipping: false, deliverBy: '2026-10-21' },
        NOW,
      ),
    ).toEqual([]);
  });
});
