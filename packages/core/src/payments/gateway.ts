/**
 * Pasarela de pagos vista desde el dominio. La implementa un adaptador sobre `@deal/paypal`
 * en el servidor y una pasarela simulada en los tests. El dominio nunca habla HTTP.
 */
export interface GatewayCapture {
  id: string;
  status: string;
  amount: string | null;
  currency: string | null;
}

export interface GatewayOrder {
  id: string;
  status: string;
  payeeMerchantId: string | null;
  capture: GatewayCapture | null;
  approveUrl: string | null;
}

export interface GatewayOrderInput {
  amount: string;
  currency: string;
  payeeMerchantId: string;
  referenceId: string;
  description: string;
  requestId: string;
}

export interface PaymentGateway {
  createCheckoutOrder(
    input: GatewayOrderInput & { returnUrl: string; cancelUrl: string },
  ): Promise<GatewayOrder>;
  createVaultOrder(input: GatewayOrderInput & { vaultId: string }): Promise<GatewayOrder>;
  getOrder(id: string): Promise<GatewayOrder>;
  captureOrder(id: string, requestId: string): Promise<GatewayOrder>;
  refundCapture(input: {
    captureId: string;
    amount: string;
    currency: string;
    requestId: string;
    payeeMerchantId: string;
    note?: string;
  }): Promise<{ id: string; status: string }>;
  getRefund(id: string, payeeMerchantId: string): Promise<{ id: string; status: string }>;
  createPartnerReferral(trackingId: string, returnUrl: string): Promise<{ actionUrl: string }>;
  findMerchantByTrackingId(trackingId: string): Promise<string | null>;
  getMerchantIntegration(merchantId: string): Promise<{
    merchantId: string;
    paymentsReceivable: boolean;
    primaryEmailConfirmed: boolean;
    scopes: string[];
  }>;
}

/** PayPal rechazó la operación: resultado definitivo. */
export class GatewayRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly debugId: string | null = null,
  ) {
    super(message);
    this.name = 'GatewayRejectedError';
  }
}

/** Sin respuesta concluyente: hay que consultar el estado antes de reintentar. */
export class GatewayUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayUnknownError';
  }
}
