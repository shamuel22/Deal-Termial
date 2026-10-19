import { describe, expect, it } from 'vitest';
import { addDaysIso, pickTier, priceOffer } from './pricing.js';

const tiers = [
  { minQty: 50, unitPrice: '0.3200' },
  { minQty: 250, unitPrice: '0.2600' },
  { minQty: 1000, unitPrice: '0.2100' },
];

describe('pricing', () => {
  it('elige el tramo de mayor cantidad mínima alcanzada', () => {
    expect(pickTier(tiers, 49)).toBeNull();
    expect(pickTier(tiers, 50)?.minQty).toBe(50);
    expect(pickTier(tiers, 300)?.minQty).toBe(250);
    expect(pickTier([...tiers].reverse(), 1000)?.minQty).toBe(1000);
  });

  it('calcula el caso de uso: 300 envases a 0.26 + envío 6.00 + 8.25 %', () => {
    // 300 × 0.26 = 78.00; base 84.00; impuesto 6.93; total 90.93
    expect(priceOffer({ tiers, quantity: 300, shippingFlat: '6.00', taxRate: '0.0825' })).toEqual({
      tierMinQty: 250,
      listUnitPrice: '0.2600',
      unitPrice: '0.2600',
      subtotal: '78.00',
      discountTotal: '0.00',
      shipping: '6.00',
      tax: '6.93',
      total: '90.93',
    });
  });

  it('aplica precio negociado y bonificación de transporte', () => {
    const p = priceOffer({
      tiers,
      quantity: 300,
      shippingFlat: '6.00',
      taxRate: '0',
      unitPrice: '0.2400',
      waiveShipping: true,
    });
    expect(p).toMatchObject({
      subtotal: '78.00',
      discountTotal: '6.00',
      shipping: '0.00',
      total: '72.00',
    });
  });

  it('devuelve null si la cantidad no alcanza ningún tramo', () => {
    expect(priceOffer({ tiers, quantity: 10, shippingFlat: '0', taxRate: '0' })).toBeNull();
  });

  it('suma días naturales en UTC', () => {
    expect(addDaysIso(new Date('2026-10-20T23:30:00-05:00'), 2)).toBe('2026-10-23');
    expect(addDaysIso(new Date('2026-10-30T12:00:00Z'), 3)).toBe('2026-11-02');
  });
});
