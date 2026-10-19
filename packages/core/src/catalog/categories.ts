import { z } from 'zod';

/**
 * Categorías con atributos normalizados. El MVP tiene una: envases para alimentos (brief §5).
 * Los proveedores publican estos atributos estructurados; las autorizaciones y búsquedas
 * expresan restricciones sobre ellos.
 */
export const FOOD_CONTAINER_MATERIALS = [
  'paper',
  'kraft_paper',
  'bagasse',
  'pla',
  'pp',
  'pet',
  'aluminum',
  'foam_eps',
] as const;

export const foodContainerAttributes = z.object({
  material: z.enum(FOOD_CONTAINER_MATERIALS),
  capacity_oz: z.number().positive().max(256),
  hot_food_safe: z.boolean(),
  microwave_safe: z.boolean().optional(),
  has_lid: z.boolean(),
  compartments: z.number().int().min(1).max(8).optional(),
  // Presentación: unidades por paquete.
  pack_size: z.number().int().positive(),
});

export const CATEGORIES = {
  food_containers: {
    label: 'Envases para alimentos',
    attributes: foodContainerAttributes,
  },
} as const;

export type CategoryId = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as [CategoryId, ...CategoryId[]];

/**
 * Restricción sobre un atributo. Una sola clave por restricción:
 * `eq`, `in`, `not_in`, `min`, `max`.
 */
const scalar = z.union([z.string(), z.number(), z.boolean()]);
export const attributeConstraint = z.union([
  z.object({ eq: scalar }).strict(),
  z.object({ in: z.array(scalar).min(1) }).strict(),
  z.object({ not_in: z.array(scalar).min(1) }).strict(),
  z.object({ min: z.number() }).strict(),
  z.object({ max: z.number() }).strict(),
  z.object({ min: z.number(), max: z.number() }).strict(),
]);
export type AttributeConstraint = z.infer<typeof attributeConstraint>;

export const attributeConstraints = z.record(z.string(), attributeConstraint);
export type AttributeConstraints = z.infer<typeof attributeConstraints>;

/** Valida que las restricciones solo usen atributos existentes de la categoría. */
export function validateConstraints(category: CategoryId, constraints: AttributeConstraints): void {
  const known = Object.keys(CATEGORIES[category].attributes.shape);
  const unknown = Object.keys(constraints).filter((k) => !known.includes(k));
  if (unknown.length > 0) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['requiredAttributes', ...unknown],
        message: `Atributos desconocidos para ${category}: ${unknown.join(', ')}`,
        input: constraints,
      },
    ]);
  }
}

export type AttributeCheck =
  | { attribute: string; status: 'satisfied'; value: unknown }
  | { attribute: string; status: 'violated'; value: unknown; constraint: AttributeConstraint }
  | { attribute: string; status: 'unconfirmed'; constraint: AttributeConstraint };

/**
 * Evalúa restricciones contra los atributos confirmados de un producto. Un atributo ausente
 * queda `unconfirmed`: nunca se da por cumplido (brief §10).
 */
export function checkAttributes(
  constraints: AttributeConstraints,
  attributes: Record<string, unknown>,
): AttributeCheck[] {
  return Object.entries(constraints).map(([attribute, constraint]) => {
    const value = attributes[attribute];
    if (value === undefined || value === null) {
      return { attribute, status: 'unconfirmed', constraint };
    }
    return satisfies(constraint, value)
      ? { attribute, status: 'satisfied', value }
      : { attribute, status: 'violated', value, constraint };
  });
}

function satisfies(constraint: AttributeConstraint, value: unknown): boolean {
  if ('eq' in constraint) return value === constraint.eq;
  if ('in' in constraint) return constraint.in.includes(value as string | number | boolean);
  if ('not_in' in constraint)
    return !constraint.not_in.includes(value as string | number | boolean);
  if (typeof value !== 'number') return false;
  if ('min' in constraint && value < constraint.min) return false;
  if ('max' in constraint && value > constraint.max) return false;
  return true;
}
