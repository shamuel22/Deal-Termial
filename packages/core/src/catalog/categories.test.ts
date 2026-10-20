import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { checkAttributes, foodContainerAttributes, validateConstraints } from './categories.js';

describe('category attributes', () => {
  const product = {
    material: 'bagasse',
    capacity_oz: 24,
    hot_food_safe: true,
    has_lid: true,
    pack_size: 50,
  };

  it('evaluates eq, in, not_in and ranges', () => {
    const checks = checkAttributes(
      {
        hot_food_safe: { eq: true },
        material: { in: ['bagasse', 'kraft_paper'] },
        has_lid: { eq: false },
        capacity_oz: { min: 16, max: 32 },
        pack_size: { min: 100 },
        microwave_safe: { eq: true },
      },
      product,
    );
    expect(Object.fromEntries(checks.map((c) => [c.attribute, c.status]))).toEqual({
      hot_food_safe: 'satisfied',
      material: 'satisfied',
      has_lid: 'violated',
      capacity_oz: 'satisfied',
      pack_size: 'violated',
      microwave_safe: 'unconfirmed',
    });
  });

  it('a range on a non-numeric value is not satisfied', () => {
    expect(checkAttributes({ material: { min: 1 } }, product)[0]!.status).toBe('violated');
  });

  it('rejects constraints on unknown attributes', () => {
    expect(() => validateConstraints('food_containers', { color: { eq: 'red' } })).toThrow(
      ZodError,
    );
    expect(() =>
      validateConstraints('food_containers', { material: { not_in: ['foam_eps'] } }),
    ).not.toThrow();
  });

  it('validates the attributes published by the supplier', () => {
    expect(foodContainerAttributes.safeParse(product).success).toBe(true);
    expect(foodContainerAttributes.safeParse({ ...product, material: 'styrofoam' }).success).toBe(
      false,
    );
  });
});
