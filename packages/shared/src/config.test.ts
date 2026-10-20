import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const validEnv = {
  PUBLIC_BASE_URL: 'https://example.test',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  PAYPAL_CLIENT_ID: 'id',
  PAYPAL_CLIENT_SECRET: 'secret',
  PAYPAL_WEBHOOK_ID: 'wh',
  PAYPAL_PARTNER_MERCHANT_ID: 'partner',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(3000);
    expect(config.PAYPAL_ENV).toBe('sandbox');
  });

  it('rejects incomplete configuration and lists the fields', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({});
    } catch (error) {
      expect((error as ConfigError).issues.join(' ')).toContain('DATABASE_URL');
    }
  });

  it('only allows the PayPal sandbox environment', () => {
    expect(() => loadConfig({ ...validEnv, PAYPAL_ENV: 'live' })).toThrow(ConfigError);
  });
});
