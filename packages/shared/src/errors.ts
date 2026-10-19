/**
 * Errores accionables del dominio (brief §12). Se usan igual en la API REST y en MCP:
 * cada código lleva un estado HTTP y una indicación de qué puede hacer el agente o el dueño.
 */
export const ERROR_CATALOG = {
  UNAUTHENTICATED: { http: 401, hint: 'Envía una credencial de agente o una sesión válida.' },
  FORBIDDEN: { http: 403, hint: 'La operación no está permitida para este actor.' },
  NOT_FOUND: { http: 404, hint: 'El recurso no existe o no pertenece a tu organización.' },
  VALIDATION_FAILED: { http: 400, hint: 'Corrige los campos indicados en `details`.' },
  INVALID_STATE: {
    http: 409,
    hint: 'El recurso no está en un estado que permita esta operación; consulta su estado actual.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    http: 409,
    hint: 'Esa clave de idempotencia ya se usó con otros datos; genera una nueva.',
  },

  // Nivel y facultades
  LEVEL_INSUFFICIENT: {
    http: 403,
    hint: 'El nivel del agente no permite esta acción. El dueño puede cambiarlo desde el portal.',
  },
  SELLER_SCOPE_MISSING: {
    http: 403,
    hint: 'El agente no tiene la facultad de venta requerida. El dueño puede concederla desde el portal.',
  },

  // Autorización de compra
  AUTHORIZATION_NOT_FOUND: {
    http: 403,
    hint: 'No hay una autorización de compra activa que cubra esta operación. Solicita una al dueño.',
  },
  AUTHORIZATION_REVOKED: { http: 403, hint: 'La autorización fue revocada por el dueño.' },
  AUTHORIZATION_EXPIRED: { http: 403, hint: 'La autorización venció; el dueño debe renovarla.' },
  AUTHORIZATION_EXHAUSTED: { http: 403, hint: 'La autorización ya agotó su presupuesto.' },
  BUDGET_EXCEEDED: {
    http: 403,
    hint: 'El total supera el presupuesto disponible del encargo. Negocia un total menor o pide ampliación.',
  },
  MONTHLY_LIMIT_EXCEEDED: {
    http: 403,
    hint: 'El total supera el límite mensual disponible de la organización.',
  },
  SUPPLIER_NOT_ALLOWED: { http: 403, hint: 'El proveedor no está entre los permitidos.' },
  TERMS_OUTSIDE_AUTHORIZATION: {
    http: 403,
    hint: 'Las condiciones (cantidad, entrega, destino o moneda) no cumplen la autorización.',
  },
  ATTRIBUTE_UNCONFIRMED: {
    http: 422,
    hint: 'Hay atributos obligatorios sin confirmar por el proveedor; pide confirmación o aclara con el dueño.',
  },

  // Cotizaciones y stock
  QUOTE_EXPIRED: { http: 409, hint: 'La cotización venció; solicita una nueva.' },
  QUOTE_SUPERSEDED: { http: 409, hint: 'Existe una versión más reciente; consulta get_quotes.' },
  QUOTE_NOT_ACCEPTABLE: {
    http: 409,
    hint: 'Solo se puede aceptar la última cotización vigente del proveedor.',
  },
  STOCK_INSUFFICIENT: { http: 409, hint: 'No hay existencias suficientes para esa cantidad.' },
  OUTSIDE_SUPPLIER_RULES: {
    http: 422,
    hint: 'La propuesta excede las reglas del proveedor; queda pendiente de su revisión.',
  },

  // Pagos
  PAYMENT_CONNECTION_INACTIVE: {
    http: 409,
    hint: 'No hay una autorización financiera PayPal activa para este proveedor. El pedido queda pendiente de pago del dueño.',
  },
  PAYPAL_ACTION_REQUIRED: {
    http: 409,
    hint: 'PayPal requiere una acción del dueño; consulta get_order para el estado.',
  },
  PAYMENT_FAILED: {
    http: 402,
    hint: 'PayPal rechazó el pago; consulta get_order para el detalle.',
  },
  SELLER_NOT_CONNECTED: {
    http: 409,
    hint: 'El proveedor no tiene una conexión de cobro PayPal activa.',
  },
} as const satisfies Record<string, { http: number; hint: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export class DomainError extends Error {
  readonly http: number;
  readonly hint: string;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.http = ERROR_CATALOG[code].http;
    this.hint = ERROR_CATALOG[code].hint;
  }

  toJSON(): { code: ErrorCode; message: string; hint: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
