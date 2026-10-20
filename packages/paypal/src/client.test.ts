import { describe, expect, it } from 'vitest';
import { PayPalApiError, PayPalClient, PayPalUnknownOutcomeError, approveLink } from './client.js';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
        status: 200,
      });
    }
    const next = responses.shift();
    if (!next) throw new Error('no response prepared');
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? '' : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'paypal-debug-id': 'dbg1' },
    });
  }) as typeof fetch;
  return { calls, impl };
}

const header = (call: Call, name: string): string | undefined =>
  (call.init.headers as Record<string, string>)[name];

describe('PayPalClient', () => {
  it('sends the exact amount, currency and payee, with idempotency and BN code', async () => {
    const f = fakeFetch([{ status: 201, body: { id: 'O1', status: 'COMPLETED' } }]);
    const client = new PayPalClient({
      clientId: 'cid',
      clientSecret: 's',
      bnCode: 'BN',
      fetch: f.impl,
    });
    await client.createOrder({
      amount: '76.86',
      currency: 'USD',
      payeeMerchantId: 'SELLER1',
      referenceId: 'order-1',
      invoiceId: 'DT-order-1',
      description: 'Order',
      requestId: 'req-1',
      vaultId: 'VAULT1',
    });
    const call = f.calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!;
    const body = JSON.parse(String(call.init.body));
    expect(body.purchase_units[0]).toMatchObject({
      amount: { currency_code: 'USD', value: '76.86' },
      payee: { merchant_id: 'SELLER1' },
    });
    expect(body.payment_source).toEqual({ paypal: { vault_id: 'VAULT1' } });
    expect(header(call, 'PayPal-Request-Id')).toBe('req-1');
    expect(header(call, 'PayPal-Partner-Attribution-Id')).toBe('BN');
  });

  it('reuses the OAuth token', async () => {
    const f = fakeFetch([
      { status: 200, body: { id: 'O1', status: 'CREATED' } },
      { status: 200, body: { id: 'O1', status: 'CREATED' } },
    ]);
    const client = new PayPalClient({ clientId: 'c', clientSecret: 's', fetch: f.impl });
    await client.getOrder('O1');
    await client.getOrder('O1');
    expect(f.calls.filter((c) => c.url.endsWith('/oauth2/token'))).toHaveLength(1);
  });

  it('a 4xx is definitive and preserves the PayPal code', async () => {
    const f = fakeFetch([
      {
        status: 422,
        body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] },
      },
    ]);
    const client = new PayPalClient({ clientId: 'c', clientSecret: 's', fetch: f.impl });
    const error = await client.captureOrder('O1', 'r').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PayPalApiError);
    expect(error).toMatchObject({
      status: 422,
      issue: 'INSTRUMENT_DECLINED',
      debugId: 'dbg1',
      isDefinitive: true,
    });
  });

  it('5xx, timeout or network failure leave the result unknown', async () => {
    const f = fakeFetch([{ status: 503, body: {} }, new Error('ECONNRESET')]);
    const client = new PayPalClient({ clientId: 'c', clientSecret: 's', fetch: f.impl });
    await expect(client.captureOrder('O1', 'r')).rejects.toBeInstanceOf(PayPalUnknownOutcomeError);
    await expect(client.captureOrder('O1', 'r')).rejects.toBeInstanceOf(PayPalUnknownOutcomeError);
  });

  it('refunds act on behalf of the supplier with PayPal-Auth-Assertion', async () => {
    const f = fakeFetch([{ status: 201, body: { id: 'R1', status: 'COMPLETED' } }]);
    const client = new PayPalClient({ clientId: 'cid', clientSecret: 's', fetch: f.impl });
    await client.refundCapture({
      captureId: 'C1',
      amount: '10.00',
      currency: 'USD',
      requestId: 'r',
      payeeMerchantId: 'SELLER1',
    });
    const call = f.calls.find((c) => c.url.includes('/refund'))!;
    const [, payload] = header(call, 'PayPal-Auth-Assertion')!.split('.');
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({
      iss: 'cid',
      payer_id: 'SELLER1',
    });
  });

  it('a webhook without signature headers is not verified', async () => {
    const client = new PayPalClient({
      clientId: 'c',
      clientSecret: 's',
      fetch: fakeFetch([]).impl,
    });
    await expect(
      client.verifyWebhookSignature({ webhookId: 'W', headers: {}, event: {} }),
    ).resolves.toBe(false);
  });

  it('extracts the approval link', () => {
    expect(
      approveLink({
        id: 'O',
        status: 'PAYER_ACTION_REQUIRED',
        links: [{ rel: 'payer-action', href: 'https://x' }],
      }),
    ).toBe('https://x');
  });
});
