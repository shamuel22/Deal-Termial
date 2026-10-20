import { z } from 'zod';

/**
 * Configuración del servidor, validada al arrancar.
 * Un valor inválido detiene el proceso con un mensaje claro en lugar de fallar más tarde.
 */
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3029),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  PAYPAL_ENV: z.enum(['sandbox']).default('sandbox'),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_WEBHOOK_ID: z.string().min(1),
  /** Merchant ID de la cuenta partner (plataforma) en PayPal. */
  PAYPAL_PARTNER_MERCHANT_ID: z.string().min(1),
  PAYPAL_BN_CODE: z.string().min(1).optional(),
  /** Intervalo de tareas periódicas (vencimientos, reconciliación). 0 = desactivadas. */
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),
});

export type AppConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
