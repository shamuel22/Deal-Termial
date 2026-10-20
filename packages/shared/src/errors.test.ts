import { describe, expect, it } from 'vitest';
import { DomainError, ERROR_CATALOG, isDomainError } from './errors.js';

describe('DomainError', () => {
  it('takes the HTTP status and hint from the catalog', () => {
    const error = new DomainError('BUDGET_EXCEEDED', 'Total 95.00 > available 80.00', {
      available: '80.00',
    });
    expect(error.http).toBe(403);
    expect(error.toJSON()).toEqual({
      code: 'BUDGET_EXCEEDED',
      message: 'Total 95.00 > available 80.00',
      hint: ERROR_CATALOG.BUDGET_EXCEEDED.hint,
      details: { available: '80.00' },
    });
    expect(isDomainError(error)).toBe(true);
    expect(isDomainError(new Error('x'))).toBe(false);
  });

  it('all entries have an error HTTP status and a hint', () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(entry.http, code).toBeGreaterThanOrEqual(400);
      expect(entry.hint.length, code).toBeGreaterThan(10);
    }
  });
});
