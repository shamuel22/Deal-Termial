import {
  GatewayRejectedError,
  GatewayUnknownError,
  type GatewayOrder,
  type GatewayOrderInput,
  type PaymentGateway,
} from '../payments/gateway.js';

interface FakeOrder {
  id: string;
  status: string;
  input: GatewayOrderInput;
  captured: boolean;
}

/**
 * Pasarela simulada con la semántica relevante de PayPal: idempotencia por requestId,
 * órdenes con vault que se capturan al crearse y checkout que requiere aprobación.
 */
export class FakeGateway implements PaymentGateway {
  orders = new Map<string, FakeOrder>();
  byRequest = new Map<string, string>();
  refunds = new Map<string, { id: string; status: string; amount: string }>();
  refundsByRequest = new Map<string, string>();
  /** Cobros efectivos (capturas), para comprobar que no hay duplicados. */
  captures: Array<{ orderId: string; amount: string; payee: string }> = [];
  /** Próximo fallo a simular en una creación de orden. */
  nextCreate: 'ok' | 'unknown_after_create' | { reject: string } = 'ok';
  /** Altera lo que PayPal "informa" para simular discrepancias. */
  tamper: { amount?: string; payee?: string } | null = null;
  merchants = new Map<
    string,
    { merchantId: string; paymentsReceivable: boolean; primaryEmailConfirmed: boolean }
  >();
  private seq = 0;
  private readonly run = Math.random().toString(36).slice(2, 8);

  private view(o: FakeOrder): GatewayOrder {
    return {
      id: o.id,
      status: o.status,
      payeeMerchantId: this.tamper?.payee ?? o.input.payeeMerchantId,
      capture: o.captured
        ? {
            id: `CAP-${o.id}`,
            status: 'COMPLETED',
            amount: this.tamper?.amount ?? o.input.amount,
            currency: o.input.currency,
          }
        : null,
      approveUrl:
        o.status === 'PAYER_ACTION_REQUIRED'
          ? `https://sandbox.test/checkoutnow?token=${o.id}`
          : null,
    };
  }

  private create(input: GatewayOrderInput, vault: boolean): GatewayOrder {
    const existing = this.byRequest.get(input.requestId);
    if (existing) return this.view(this.orders.get(existing)!);
    const mode = this.nextCreate;
    this.nextCreate = 'ok';
    if (typeof mode === 'object')
      throw new GatewayRejectedError(mode.reject, `PayPal rejected: ${mode.reject}`, 'dbg-fake');
    const order: FakeOrder = {
      id: `PP-${this.run}-${++this.seq}`,
      status: vault ? 'COMPLETED' : 'PAYER_ACTION_REQUIRED',
      input,
      captured: vault,
    };
    this.orders.set(order.id, order);
    this.byRequest.set(input.requestId, order.id);
    if (vault)
      this.captures.push({ orderId: order.id, amount: input.amount, payee: input.payeeMerchantId });
    // La orden se creó en PayPal pero la respuesta se perdió.
    if (mode === 'unknown_after_create') throw new GatewayUnknownError('simulated timeout');
    return this.view(order);
  }

  async createCheckoutOrder(input: GatewayOrderInput & { returnUrl: string; cancelUrl: string }) {
    return this.create(input, false);
  }

  async createVaultOrder(input: GatewayOrderInput & { vaultId: string }) {
    return this.create(input, true);
  }

  /** Simula que el comprador aprueba el checkout en PayPal. */
  approve(id: string): void {
    this.orders.get(id)!.status = 'APPROVED';
  }

  async getOrder(id: string) {
    const order = this.orders.get(id);
    if (!order) throw new GatewayRejectedError('RESOURCE_NOT_FOUND', 'Order does not exist');
    return this.view(order);
  }

  async captureOrder(id: string, _requestId: string) {
    const order = this.orders.get(id)!;
    if (order.status !== 'APPROVED' && order.status !== 'COMPLETED') {
      throw new GatewayRejectedError('ORDER_NOT_APPROVED', 'The buyer has not approved the order');
    }
    if (!order.captured) {
      order.captured = true;
      order.status = 'COMPLETED';
      this.captures.push({
        orderId: id,
        amount: order.input.amount,
        payee: order.input.payeeMerchantId,
      });
    }
    return this.view(order);
  }

  async refundCapture(input: {
    captureId: string;
    amount: string;
    currency: string;
    requestId: string;
    payeeMerchantId: string;
  }) {
    const existing = this.refundsByRequest.get(input.requestId);
    if (existing) return this.refunds.get(existing)!;
    const refund = {
      id: `RF-${this.run}-${++this.seq}`,
      status: 'COMPLETED',
      amount: input.amount,
    };
    this.refunds.set(refund.id, refund);
    this.refundsByRequest.set(input.requestId, refund.id);
    return refund;
  }

  async getRefund(id: string) {
    return this.refunds.get(id)!;
  }

  async createPartnerReferral(trackingId: string) {
    return { actionUrl: `https://sandbox.test/bizsignup?tracking=${trackingId}` };
  }

  async findMerchantByTrackingId(trackingId: string) {
    return this.merchants.get(trackingId)?.merchantId ?? null;
  }

  async getMerchantIntegration(merchantId: string) {
    const found = [...this.merchants.values()].find((m) => m.merchantId === merchantId);
    if (!found) throw new GatewayRejectedError('RESOURCE_NOT_FOUND', 'Unknown merchant');
    return { ...found, scopes: ['payments/payment'] };
  }
}
