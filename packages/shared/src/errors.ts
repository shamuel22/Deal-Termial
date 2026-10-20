/**
 * Errores accionables del dominio (brief §12). Se usan igual en la API REST y en MCP:
 * cada código lleva un estado HTTP y una indicación de qué puede hacer el agente o el dueño.
 */
export const ERROR_CATALOG = {
  UNAUTHENTICATED: { http: 401, hint: 'Send an agent credential or a valid session.' },
  FORBIDDEN: { http: 403, hint: 'This operation is not permitted for this actor.' },
  NOT_FOUND: {
    http: 404,
    hint: 'The resource does not exist or does not belong to your organization.',
  },
  VALIDATION_FAILED: { http: 400, hint: 'Correct the fields listed in `details`.' },
  INVALID_STATE: {
    http: 409,
    hint: "Check the resource's current state; it does not allow this operation.",
  },
  IDEMPOTENCY_KEY_REUSED: {
    http: 409,
    hint: 'Generate a new idempotency key; this one was already used with different data.',
  },

  // Nivel y facultades
  LEVEL_INSUFFICIENT: {
    http: 403,
    hint: "Ask the owner to change the agent's access level in the portal; its current level does not allow this action.",
  },
  SELLER_SCOPE_MISSING: {
    http: 403,
    hint: 'Ask the owner to grant the required seller permission in the portal; the agent does not have it.',
  },

  // Autorización de compra
  AUTHORIZATION_NOT_FOUND: {
    http: 403,
    hint: 'Request a purchase authorization from the owner; no active authorization covers this operation.',
  },
  AUTHORIZATION_REVOKED: { http: 403, hint: 'The owner revoked the authorization.' },
  AUTHORIZATION_EXPIRED: { http: 403, hint: 'Ask the owner to renew the expired authorization.' },
  AUTHORIZATION_EXHAUSTED: { http: 403, hint: 'The authorization has exhausted its budget.' },
  BUDGET_EXCEEDED: {
    http: 403,
    hint: 'Negotiate a lower total or ask for a budget increase; the total exceeds the budget available to authorize.',
  },
  MONTHLY_LIMIT_EXCEEDED: {
    http: 403,
    hint: "The total exceeds the organization's available monthly limit.",
  },
  SUPPLIER_NOT_ALLOWED: { http: 403, hint: 'The supplier is not among the allowed suppliers.' },
  TERMS_OUTSIDE_AUTHORIZATION: {
    http: 403,
    hint: 'The terms (quantity, delivery, destination or currency) do not meet the purchase authorization.',
  },
  ATTRIBUTE_UNCONFIRMED: {
    http: 422,
    hint: 'Ask the supplier to confirm the required attributes or clarify them with the owner; some remain unconfirmed.',
  },

  // Cotizaciones y stock
  QUOTE_EXPIRED: { http: 409, hint: 'Request a new quote; this one has expired.' },
  QUOTE_SUPERSEDED: { http: 409, hint: 'Call get_quotes; a newer version exists.' },
  QUOTE_NOT_ACCEPTABLE: {
    http: 409,
    hint: "Only the supplier's latest valid quote can be accepted.",
  },
  STOCK_INSUFFICIENT: { http: 409, hint: 'There is not enough stock for that quantity.' },
  OUTSIDE_SUPPLIER_RULES: {
    http: 422,
    hint: "The proposal exceeds the supplier's rules and awaits its review.",
  },

  // Pagos
  PAYMENT_CONNECTION_INACTIVE: {
    http: 409,
    hint: 'No active PayPal consent covers this supplier. The order awaits payment by the owner.',
  },
  PAYPAL_ACTION_REQUIRED: {
    http: 409,
    hint: 'Check get_order for the status; PayPal requires action from the owner.',
  },
  PAYMENT_FAILED: {
    http: 402,
    hint: 'Check get_order for details; PayPal rejected the payment.',
  },
  SELLER_NOT_CONNECTED: {
    http: 409,
    hint: 'The supplier has no active PayPal connection to receive payments.',
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
