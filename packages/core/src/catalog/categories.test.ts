import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { checkAttributes, foodContainerAttributes, validateConstraints } from './categories.js';

describe('atributos de categoría', () => {
  const product = {
    material: 'bagasse',
    capacity_oz: 24,
    hot_food_safe: true,
    has_lid: true,
    pack_size: 50,
  };

  it('evalúa eq, in, not_in y rangos', () => {
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

  it('un rango sobre un valor no numérico no se cumple', () => {
    expect(checkAttributes({ material: { min: 1 } }, product)[0]!.status).toBe('violated');
  });

  it('rechaza restricciones sobre atributos inexistentes', () => {
    expect(() => validateConstraints('food_containers', { color: { eq: 'red' } })).toThrow(
      ZodError,
    );
    expect(() =>
      validateConstraints('food_containers', { material: { not_in: ['foam_eps'] } }),
    ).not.toThrow();
  });

  it('valida los atributos publicados por el proveedor', () => {
    expect(foodContainerAttributes.safeParse(product).success).toBe(true);
    expect(foodContainerAttributes.safeParse({ ...product, material: 'styrofoam' }).success).toBe(
      false,
    );
  });
});
