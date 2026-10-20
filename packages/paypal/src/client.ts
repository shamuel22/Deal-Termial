import { randomUUID } from 'node:crypto';

/**
 * Cliente mínimo y tipado de las APIs REST de PayPal usadas por Deal Terminal.
 * Solo sandbox en el MVP. Las credenciales viven en el servidor; nada de lo que devuelve este
 * cliente se entrega tal cual a un agente.
 */
export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  /** BN code de la app (PayPal-Partner-Attribution-Id). */
  bnCode?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Tiempo máximo por petición. Un timeout deja el resultado como desconocido. */
  timeoutMs?: number;
}

export const SANDBOX_API = 'https://api-m.sandbox.paypal.com';

/** Error devuelto por PayPal con su detalle; `issue` es el primer código de `details`. */
export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorName: string | undefined,
    readonly issue: string | undefined,
    readonly debugId: string | null,
    readonly body: unknown,
  ) {
    super(`PayPal ${status} ${errorName ?? ''}${issue ? ` (${issue})` : ''}`.trim());
    this.name = 'PayPalApiError';
  }

  /** 4xx: PayPal procesó y rechazó la petición; el resultado es definitivo. */
  get isDefinitive(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

/** Fallo de red, timeout o 5xx: no sabemos si PayPal procesó la petición. */
export class PayPalUnknownOutcomeError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PayPalUnknownOutcomeError';
  }
}

export interface RequestOptions {
  requestId?: string;
  /** Actúa en nombre de un comerciante conectado (PayPal-Auth-Assertion). */
  onBehalfOfMerchantId?: string;
  attribution?: boolean;
}

interface Link {
  href: string;
  rel: string;
  method?: string;
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export class PayPalClient {
  private token?: { value: string; expiresAt: number };
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: PayPalConfig) {
    this.baseUrl = config.baseUrl ?? SANDBOX_API;
    this.fetchImpl = config.fetch ?? fetch;
  }

  /** JWT sin firma que PayPal acepta para actuar en nombre de un comerciante conectado. */
  authAssertion(merchantId: string): string {
    return `${base64url({ alg: 'none' })}.${base64url({ iss: this.config.clientId, payer_id: merchantId })}.`;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64',
    );
    const res = await this.send(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) {
      throw new PayPalApiError(
        res.status,
        'AUTHENTICATION_FAILURE',
        undefined,
        res.headers.get('paypal-debug-id'),
        body,
      );
    }
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + ((body.expires_in ?? 300) - 60) * 1000,
    };
    return body.access_token;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 20_000),
      });
    } catch (error) {
      throw new PayPalUnknownOutcomeError(
        `No response from PayPal: ${(error as Error).message}`,
        error,
      );
    }
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    if (method !== 'GET') headers['PayPal-Request-Id'] = options.requestId ?? randomUUID();
    if (options.attribution !== false && this.config.bnCode) {
      headers['PayPal-Partner-Attribution-Id'] = this.config.bnCode;
    }
    if (options.onBehalfOfMerchantId) {
      headers['PayPal-Auth-Assertion'] = this.authAssertion(options.onBehalfOfMerchantId);
    }
    const res = await this.send(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (res.status >= 500) {
      throw new PayPalUnknownOutcomeError(
        `PayPal ${res.status} (debug ${res.headers.get('paypal-debug-id')})`,
      );
    }
    if (!res.ok) {
      const err = parsed as { name?: string; details?: Array<{ issue?: string }> } | null;
      throw new PayPalApiError(
        res.status,
        err?.name,
        err?.details?.[0]?.issue,
        res.headers.get('paypal-debug-id'),
        parsed,
      );
    }
    return parsed as T;
  }

  // ---- Conexión de proveedores (Partner Referrals) ----

  async createPartnerReferral(input: { trackingId: string; returnUrl: string; vault: boolean }) {
    const features = input.vault
      ? ['PAYMENT', 'REFUND', 'PARTNER_FEE', 'VAULT', 'BILLING_AGREEMENT']
      : ['PAYMENT', 'REFUND'];
    const res = await this.request<{ links: Link[] }>('POST', '/v2/customer/partner-referrals', {
      tracking_id: input.trackingId,
      operations: [
        {
          operation: 'API_INTEGRATION',
          api_integration_preference: {
            rest_api_integration: {
              integration_method: 'PAYPAL',
              integration_type: 'THIRD_PARTY',
              third_party_details: { features },
            },
          },
        },
      ],
      products: input.vault ? ['EXPRESS_CHECKOUT', 'ADVANCED_VAULTING'] : ['EXPRESS_CHECKOUT'],
      ...(input.vault ? { capabilities: ['PAYPAL_WALLET_VAULTING_ADVANCED'] } : {}),
      legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }],
      partner_config_override: { return_url: input.returnUrl },
    });
    const actionUrl = res.links.find((l) => l.rel === 'action_url')?.href;
    if (!actionUrl) throw new PayPalApiError(200, 'MISSING_ACTION_URL', undefined, null, res);
    return { actionUrl };
  }

  async findMerchantByTrackingId(
    partnerMerchantId: string,
    trackingId: string,
  ): Promise<string | null> {
    try {
      const res = await this.request<{ merchant_id?: string }>(
        'GET',
        `/v1/customer/partners/${partnerMerchantId}/merchant-integrations?tracking_id=${encodeURIComponent(trackingId)}`,
      );
      return res.merchant_id ?? null;
    } catch (error) {
      if (error instanceof PayPalApiError && error.status === 404) return null;
      throw error;
    }
  }

  async getMerchantIntegration(partnerMerchantId: string, merchantId: string) {
    const res = await this.request<{
      merchant_id: string;
      payments_receivable?: boolean;
      primary_email_confirmed?: boolean;
      oauth_integrations?: Array<{ oauth_third_party?: Array<{ scopes?: string[] }> }>;
    }>('GET', `/v1/customer/partners/${partnerMerchantId}/merchant-integrations/${merchantId}`);
    return {
      merchantId: res.merchant_id,
      paymentsReceivable: Boolean(res.payments_receivable),
      primaryEmailConfirmed: Boolean(res.primary_email_confirmed),
      scopes: (res.oauth_integrations ?? []).flatMap((i) =>
        (i.oauth_third_party ?? []).flatMap((t) => t.scopes ?? []),
      ),
    };
  }

  // ---- Vault: consentimiento y token persistente ----

  async createSetupToken(input: {
    usageType: 'PLATFORM' | 'MERCHANT';
    returnUrl: string;
    cancelUrl: string;
    description: string;
    onBehalfOfMerchantId?: string;
  }) {
    const res = await this.request<{ id: string; status: string; links: Link[] }>(
      'POST',
      '/v3/vault/setup-tokens',
      {
        payment_source: {
          paypal: {
            description: input.description,
            usage_type: input.usageType,
            usage_pattern: 'IMMEDIATE',
            customer_type: 'CONSUMER',
            permit_multiple_payment_tokens: false,
            experience_context: {
              brand_name: 'Deal Terminal',
              locale: 'en-US',
              shipping_preference: 'NO_SHIPPING',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      },
      { onBehalfOfMerchantId: input.onBehalfOfMerchantId },
    );
    const approveUrl = res.links.find((l) => l.rel === 'approve')?.href ?? null;
    return { id: res.id, status: res.status, approveUrl };
  }

  async getSetupToken(id: string) {
    const res = await this.request<{ id: string; status: string }>(
      'GET',
      `/v3/vault/setup-tokens/${encodeURIComponent(id)}`,
    );
    return { id: res.id, status: res.status };
  }

  async createPaymentToken(setupTokenId: string, requestId: string) {
    const res = await this.request<{
      id: string;
      customer?: { id?: string };
      payment_source?: { paypal?: { email_address?: string; payer_id?: string } };
    }>(
      'POST',
      '/v3/vault/payment-tokens',
      { payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } },
      { requestId },
    );
    return {
      id: res.id,
      customerId: res.customer?.id ?? null,
      payerEmail: res.payment_source?.paypal?.email_address ?? null,
    };
  }

  async deletePaymentToken(id: string): Promise<void> {
    await this.request('DELETE', `/v3/vault/payment-tokens/${encodeURIComponent(id)}`);
  }

  // ---- Órdenes y capturas ----

  async createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
    const paymentSource = input.vaultId
      ? { paypal: { vault_id: input.vaultId } }
      : {
          paypal: {
            experience_context: {
              brand_name: 'Deal Terminal',
              locale: 'en-US',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        };
    return this.request<PayPalOrder>(
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.referenceId,
            custom_id: input.referenceId,
            invoice_id: input.invoiceId,
            description: input.description.slice(0, 127),
            amount: { currency_code: input.currency, value: input.amount },
            payee: { merchant_id: input.payeeMerchantId },
          },
        ],
        payment_source: paymentSource,
      },
      { requestId: input.requestId },
    );
  }

  async getOrder(id: string): Promise<PayPalOrder> {
    return this.request<PayPalOrder>('GET', `/v2/checkout/orders/${encodeURIComponent(id)}`);
  }

  async captureOrder(id: string, requestId: string): Promise<PayPalOrder> {
    return this.request<PayPalOrder>(
      'POST',
      `/v2/checkout/orders/${encodeURIComponent(id)}/capture`,
      {},
      { requestId },
    );
  }

  async refundCapture(input: {
    captureId: string;
    amount: string;
    currency: string;
    requestId: string;
    payeeMerchantId: string;
    note?: string;
  }) {
    const res = await this.request<{ id: string; status: string }>(
      'POST',
      `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
      {
        amount: { currency_code: input.currency, value: input.amount },
        ...(input.note ? { note_to_payer: input.note.slice(0, 255) } : {}),
      },
      { requestId: input.requestId, onBehalfOfMerchantId: input.payeeMerchantId },
    );
    return { id: res.id, status: res.status };
  }

  async getRefund(id: string, payeeMerchantId: string) {
    const res = await this.request<{ id: string; status: string }>(
      'GET',
      `/v2/payments/refunds/${encodeURIComponent(id)}`,
      undefined,
      { onBehalfOfMerchantId: payeeMerchantId },
    );
    return { id: res.id, status: res.status };
  }

  // ---- Webhooks ----

  /** Verifica la firma de un webhook con la API de PayPal. */
  async verifyWebhookSignature(input: {
    webhookId: string;
    headers: Record<string, string | undefined>;
    event: unknown;
  }): Promise<boolean> {
    const h = (name: string) => input.headers[name] ?? input.headers[name.toLowerCase()];
    const required = [
      'paypal-auth-algo',
      'paypal-cert-url',
      'paypal-transmission-id',
      'paypal-transmission-sig',
      'paypal-transmission-time',
    ];
    if (required.some((name) => !h(name))) return false;
    const res = await this.request<{ verification_status: string }>(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      {
        auth_algo: h('paypal-auth-algo'),
        cert_url: h('paypal-cert-url'),
        transmission_id: h('paypal-transmission-id'),
        transmission_sig: h('paypal-transmission-sig'),
        transmission_time: h('paypal-transmission-time'),
        webhook_id: input.webhookId,
        webhook_event: input.event,
      },
      { attribution: false },
    );
    return res.verification_status === 'SUCCESS';
  }
}

export interface CreateOrderInput {
  amount: string;
  currency: string;
  payeeMerchantId: string;
  referenceId: string;
  invoiceId: string;
  description: string;
  requestId: string;
  /** Pago con token guardado (sin checkout). */
  vaultId?: string;
  /** Checkout manual: URLs de retorno. */
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
  status_details?: { reason?: string };
}

export interface PayPalOrder {
  id: string;
  status: string;
  links?: Link[];
  purchase_units?: Array<{
    reference_id?: string;
    payee?: { merchant_id?: string; email_address?: string };
    amount?: { currency_code: string; value: string };
    payments?: { captures?: PayPalCapture[] };
  }>;
}

export function approveLink(order: PayPalOrder): string | null {
  return order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href ?? null;
}
