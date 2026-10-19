import {
  GatewayRejectedError,
  GatewayUnknownError,
  type GatewayOrder,
  type PaymentGateway,
} from '@deal/core';
import {
  approveLink,
  PayPalApiError,
  type PayPalClient,
  PayPalUnknownOutcomeError,
  type PayPalOrder,
} from '@deal/paypal';

/** Traduce el cliente PayPal al contrato de pasarela del dominio. */
export class PayPalGateway implements PaymentGateway {
  constructor(
    readonly client: PayPalClient,
    private readonly partnerMerchantId: string,
  ) {}

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PayPalUnknownOutcomeError) throw new GatewayUnknownError(error.message);
      if (error instanceof PayPalApiError) {
        if (!error.isDefinitive) throw new GatewayUnknownError(error.message);
        throw new GatewayRejectedError(
          error.issue ?? error.errorName ?? `HTTP_${error.status}`,
          error.message,
          error.debugId,
        );
      }
      throw error;
    }
  }

  private map(order: PayPalOrder): GatewayOrder {
    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    return {
      id: order.id,
      status: order.status,
      payeeMerchantId: unit?.payee?.merchant_id ?? null,
      capture: capture
        ? {
            id: capture.id,
            status: capture.status,
            amount: capture.amount?.value ?? null,
            currency: capture.amount?.currency_code ?? null,
          }
        : null,
      approveUrl: approveLink(order),
    };
  }

  createCheckoutOrder(input: Parameters<PaymentGateway['createCheckoutOrder']>[0]) {
    return this.call(async () =>
      this.map(await this.client.createOrder({ ...input, invoiceId: `DT-${input.referenceId}` })),
    );
  }

  createVaultOrder(input: Parameters<PaymentGateway['createVaultOrder']>[0]) {
    return this.call(async () =>
      this.map(await this.client.createOrder({ ...input, invoiceId: `DT-${input.referenceId}` })),
    );
  }

  getOrder(id: string) {
    return this.call(async () => this.map(await this.client.getOrder(id)));
  }

  captureOrder(id: string, requestId: string) {
    return this.call(async () => this.map(await this.client.captureOrder(id, requestId)));
  }

  refundCapture(input: Parameters<PaymentGateway['refundCapture']>[0]) {
    return this.call(() => this.client.refundCapture(input));
  }

  getRefund(id: string, payeeMerchantId: string) {
    return this.call(() => this.client.getRefund(id, payeeMerchantId));
  }

  createPartnerReferral(trackingId: string, returnUrl: string) {
    return this.call(() =>
      this.client.createPartnerReferral({ trackingId, returnUrl, vault: false }),
    );
  }

  findMerchantByTrackingId(trackingId: string) {
    return this.call(() =>
      this.client.findMerchantByTrackingId(this.partnerMerchantId, trackingId),
    );
  }

  getMerchantIntegration(merchantId: string) {
    return this.call(() => this.client.getMerchantIntegration(this.partnerMerchantId, merchantId));
  }
}
