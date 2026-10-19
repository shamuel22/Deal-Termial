import { describe, expect, it } from 'vitest';
import {
  addMoney,
  applyRate,
  compareMoney,
  dec,
  isValidMoney,
  isValidUnitPrice,
  lineTotal,
  lte,
  subMoney,
  toMoney,
  toUnitPrice,
} from './money.js';

describe('money', () => {
  it('evita errores de coma flotante', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(addMoney('19.99', '0.01', '80.00')).toBe('100.00');
  });

  it('redondea HALF_UP a 2 decimales solo al final de la línea', () => {
    // 300 × 0.2350 = 70.5 exacto; 333 × 0.2345 = 78.0885 → 78.09
    expect(lineTotal(300, '0.2350')).toBe('70.50');
    expect(lineTotal(333, '0.2345')).toBe('78.09');
    expect(toMoney('2.345')).toBe('2.35');
    expect(toMoney('2.344')).toBe('2.34');
  });

  it('formatea precios unitarios con 4 decimales', () => {
    expect(toUnitPrice('0.235')).toBe('0.2350');
    expect(toUnitPrice('0.23456')).toBe('0.2346');
  });

  it('aplica tasas como fracción', () => {
    expect(applyRate('70.50', '0.0825')).toBe('5.82');
    expect(applyRate('100.00', '0')).toBe('0.00');
  });

  it('compara importes con distinta escala', () => {
    expect(compareMoney('80', '80.00')).toBe(0);
    expect(lte('79.99', '80.00')).toBe(true);
    expect(lte('80.01', '80.00')).toBe(false);
    expect(subMoney('80.00', '79.995')).toBe('0.01');
  });

  it('rechaza floats no enteros', () => {
    expect(() => dec(0.1)).toThrow(TypeError);
    expect(dec(3).toString()).toBe('3');
  });

  it('rechaza cantidades no enteras o negativas', () => {
    expect(() => lineTotal(1.5, '1.00')).toThrow(RangeError);
    expect(() => lineTotal(-1, '1.00')).toThrow(RangeError);
  });

  it('valida formatos de entrada', () => {
    expect(isValidMoney('80.00')).toBe(true);
    expect(isValidMoney('80')).toBe(true);
    expect(isValidMoney('80.001')).toBe(false);
    expect(isValidMoney('-1.00')).toBe(false);
    expect(isValidMoney('1e3')).toBe(false);
    expect(isValidUnitPrice('0.2350')).toBe(true);
    expect(isValidUnitPrice('0.23501')).toBe(false);
  });
});
