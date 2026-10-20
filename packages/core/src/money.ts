import { Decimal } from 'decimal.js';

/**
 * Aritmética monetaria exacta. Los importes viajan como strings decimales (igual que `numeric`
 * en Postgres) y nunca se convierten a float. Totales con 2 decimales; precios unitarios con 4.
 * Redondeo HALF_UP, el habitual en facturación.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type DecimalInput = string | number | Decimal;

export const MONEY_SCALE = 2;
export const UNIT_PRICE_SCALE = 4;

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const UNIT_PRICE_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

export function dec(value: DecimalInput): Decimal {
  if (typeof value === 'number' && !Number.isInteger(value)) {
    // Los floats introducen error binario: solo se aceptan enteros como number.
    throw new TypeError(`Non-integer amount received as a number: ${value}. Use a decimal string.`);
  }
  return new D(value);
}

/** Redondea a 2 decimales y devuelve el string canónico ("12.50"). */
export function toMoney(value: DecimalInput): string {
  return dec(value).toDecimalPlaces(MONEY_SCALE).toFixed(MONEY_SCALE);
}

/** Redondea a 4 decimales para precios unitarios ("0.2350"). */
export function toUnitPrice(value: DecimalInput): string {
  return dec(value).toDecimalPlaces(UNIT_PRICE_SCALE).toFixed(UNIT_PRICE_SCALE);
}

export function isValidMoney(value: string): boolean {
  return MONEY_PATTERN.test(value);
}

export function isValidUnitPrice(value: string): boolean {
  return UNIT_PRICE_PATTERN.test(value);
}

export function addMoney(...values: DecimalInput[]): string {
  return toMoney(values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), dec(0)));
}

export function subMoney(a: DecimalInput, b: DecimalInput): string {
  return toMoney(dec(a).minus(dec(b)));
}

/** Importe de línea: cantidad × precio unitario, redondeado una sola vez al final. */
export function lineTotal(quantity: number, unitPrice: DecimalInput): string {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`Invalid quantity: ${quantity}`);
  }
  return toMoney(dec(unitPrice).times(quantity));
}

/** Aplica una tasa expresada como fracción (0.0825 = 8.25 %). */
export function applyRate(amount: DecimalInput, rate: DecimalInput): string {
  return toMoney(dec(amount).times(dec(rate)));
}

export function compareMoney(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  return dec(a).comparedTo(dec(b)) as -1 | 0 | 1;
}

export function lte(a: DecimalInput, b: DecimalInput): boolean {
  return compareMoney(a, b) <= 0;
}

export function gt(a: DecimalInput, b: DecimalInput): boolean {
  return compareMoney(a, b) > 0;
}

export function maxMoney(a: DecimalInput, b: DecimalInput): string {
  return gt(a, b) ? toMoney(a) : toMoney(b);
}

export function isZero(value: DecimalInput): boolean {
  return dec(value).isZero();
}

export { Decimal };
