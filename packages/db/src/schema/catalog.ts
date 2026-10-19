import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, id, money, tstz, unitPrice, updatedAt } from './columns.js';
import { offerStatus } from './enums.js';
import { organizations } from './identity.js';

/** Producto con atributos normalizados según su categoría (p. ej. food_containers). */
export const products = pgTable(
  'products',
  {
    id: id(),
    supplierOrgId: uuid('supplier_org_id')
      .notNull()
      .references(() => organizations.id),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(),
    attributes: jsonb('attributes').notNull(),
    // Unidad de venta y cuántas unidades base contiene (p. ej. caja de 50 envases).
    unit: text('unit').notNull().default('unit'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_supplier_sku_uq').on(t.supplierOrgId, t.sku),
    index('products_category_idx').on(t.category),
  ],
);

/**
 * Oferta publicada de un producto. Persistente: no requiere al agente del proveedor conectado.
 * `version` se incrementa en cada cambio; las cotizaciones guardan la versión usada.
 */
export const offers = pgTable(
  'offers',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    supplierOrgId: uuid('supplier_org_id')
      .notNull()
      .references(() => organizations.id),
    status: offerStatus('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    // Existencias informadas por el proveedor; lo reservado se descuenta vía stock_reservations.
    stockAvailable: integer('stock_available').notNull(),
    minOrderQty: integer('min_order_qty').notNull().default(1),
    maxOrderQty: integer('max_order_qty'),
    // Regiones de entrega (códigos de estado de EE. UU.).
    shipRegions: text('ship_regions').array().notNull(),
    leadTimeDays: integer('lead_time_days').notNull(),
    shippingFlat: money('shipping_flat').notNull().default('0'),
    // Tasa de impuesto informada por el proveedor como fracción (0.0825 = 8.25 %).
    taxRate: numeric('tax_rate', { precision: 6, scale: 4 }).notNull().default('0'),
    validUntil: tstz('valid_until'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('offers_product_idx').on(t.productId),
    index('offers_supplier_idx').on(t.supplierOrgId, t.status),
    check('offers_stock_nonnegative', sql`${t.stockAvailable} >= 0`),
  ],
);

/** Precio por tramo de cantidad: se aplica el tramo con mayor `minQty` <= cantidad pedida. */
export const offerPriceTiers = pgTable(
  'offer_price_tiers',
  {
    id: id(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    minQty: integer('min_qty').notNull(),
    unitPrice: unitPrice('unit_price').notNull(),
  },
  (t) => [uniqueIndex('offer_price_tiers_uq').on(t.offerId, t.minQty)],
);

/**
 * Reglas de negociación fijadas por el humano del proveedor. El servidor responde automáticamente
 * dentro de ellas; lo que las exceda queda pendiente del proveedor.
 */
export const negotiationRules = pgTable('negotiation_rules', {
  offerId: uuid('offer_id')
    .primaryKey()
    .references(() => offers.id, { onDelete: 'cascade' }),
  autoRespond: boolean('auto_respond').notNull().default(true),
  // Descuento máximo sobre el precio del tramo, como fracción (0.10 = 10 %).
  maxDiscount: numeric('max_discount', { precision: 5, scale: 4 }).notNull().default('0'),
  // Precio unitario mínimo absoluto aceptable.
  floorUnitPrice: unitPrice('floor_unit_price').notNull(),
  // Cantidad mínima para conceder descuento.
  minQtyForDiscount: integer('min_qty_for_discount').notNull().default(1),
  // Plazo mínimo de entrega que el proveedor puede comprometer (días).
  minLeadTimeDays: integer('min_lead_time_days').notNull(),
  // Posibilidad de bonificar el transporte.
  canWaiveShipping: boolean('can_waive_shipping').notNull().default(false),
  quoteValidityHours: integer('quote_validity_hours').notNull().default(48),
  updatedAt: updatedAt(),
});
