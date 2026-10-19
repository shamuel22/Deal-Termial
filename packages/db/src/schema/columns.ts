import { numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Clave primaria UUID generada por Postgres. */
export const id = () => uuid('id').primaryKey().defaultRandom();

/** Importe monetario con 2 decimales (totales, presupuestos). Llega como string. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/** Precio unitario con 4 decimales (p. ej. US$0.2350 por envase). Llega como string. */
export const unitPrice = (name: string) => numeric(name, { precision: 14, scale: 4 });

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
export const tstz = (name: string) => timestamp(name, { withTimezone: true });
