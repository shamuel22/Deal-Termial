import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createTestDatabase } from '@deal/db/testing';
import { seedDemo, type DemoSummary } from '../dist/seed/seed-demo.js';

/**
 * El recorrido del brief con un cliente MCP real (SDK oficial) contra el servidor compilado
 * y los datos de demostración. Solo falta el modelo: las llamadas son las que haría un agente.
 */
const mainJs = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const port = 3800 + Math.floor(Math.random() * 90);
const origin = `http://127.0.0.1:${port}`;
let server: ChildProcess;
let demo: DemoSummary;
const transcripts: string[] = [];

beforeAll(async () => {
  const handle = await createTestDatabase();
  demo = await seedDemo(handle.db, {
    now: new Date(),
    password: 'DealTerminal-demo-2026',
    sellerMerchantIds: { a: 'MERCHANT-A', b: 'MERCHANT-B' },
  });
  await handle.close();
  let logs = '';
  server = spawn(process.execPath, [mainJs], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      PAYPAL_PARTNER_MERCHANT_ID: process.env.PAYPAL_PARTNER_MERCHANT_ID ?? 'ci',
      SCHEDULER_INTERVAL_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (d) => (logs += d));
  server.stderr?.on('data', (d) => (logs += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      // arrancando
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`The server did not start:\n${logs}`);
}, 60_000);

afterAll(() => {
  server?.kill();
});

function key(name: string): string {
  const agent = demo.agents.find((a) => a.name === name);
  if (!agent) throw new Error(`Agent ${name} not found`);
  return agent.apiKey;
}

async function connect(apiKey?: string): Promise<Client> {
  const client = new Client({ name: 'deal-terminal-test', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {},
  });
  await client.connect(transport);
  return client;
}

interface ToolOutcome<T> {
  isError: boolean;
  data: T;
}

async function call<T = Record<string, unknown>>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolOutcome<T>> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
  transcripts.push(text);
  return { isError: Boolean(result.isError), data: JSON.parse(text) as T };
}

describe('MCP server', () => {
  it('requires an agent credential and only accepts POST', async () => {
    await expect(connect()).rejects.toThrow();
    await expect(connect('dtk_inventada_123')).rejects.toThrow();
    expect(
      (
        await fetch(`${origin}/mcp`, {
          headers: { Authorization: `Bearer ${key('Purchasing assistant')}` },
        })
      ).status,
    ).toBe(405);
  });

  it('exposes the tool catalog with instructions', async () => {
    const client = await connect(key('Research assistant'));
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of [
      'get_authorization_status',
      'create_request',
      'find_matches',
      'get_request',
      'request_quote',
      'counter_quote',
      'get_quotes',
      'submit_for_review',
      'accept_quote',
      'execute_purchase',
      'get_order',
      'cancel_order',
      'request_refund',
      'request_authorization_change',
      'publish_offer',
      'update_offer',
      'list_pending_negotiations',
      'submit_quote',
      'respond_to_counterquote',
      'approve_refund',
    ]) {
      expect(names).toContain(expected);
    }
    expect(tools.find((t) => t.name === 'find_matches')?.annotations?.readOnlyHint).toBe(true);
    expect(client.getInstructions()).toContain('get_authorization_status');
    await client.close();
  });

  it('Search only: queries and compares, but cannot negotiate (criterion 3)', async () => {
    const client = await connect(key('Research assistant'));
    const status = await call<{ agent: { buyerLevel: string } }>(
      client,
      'get_authorization_status',
    );
    expect(status.data.agent.buyerLevel).toBe('search_only');

    const found = await call<{ matches: Array<{ offerId: string; product: { sku: string } }> }>(
      client,
      'find_matches',
      {
        criteria: {
          category: 'food_containers',
          requiredAttributes: {
            hot_food_safe: { eq: true },
            has_lid: { eq: true },
            material: { not_in: ['foam_eps'] },
          },
          quantity: 300,
          deliveryState: 'TX',
        },
      },
    );
    const skus = found.data.matches.map((m) => m.product.sku);
    expect(skus).toEqual(expect.arrayContaining(['ENV-KR16-L', 'ENV-PP32-L', 'GB-BAG24']));
    expect(skus).not.toContain('ENV-FOAM9');
    expect(skus).not.toContain('GB-PET16');

    const request = await call<{ id: string }>(client, 'create_request', {
      criteria: {
        category: 'food_containers',
        quantity: 300,
        deliveryAddress: {
          line1: '1100 E 6th St',
          city: 'Austin',
          state: 'TX',
          postalCode: '78702',
        },
        deliverBy: demo.deliverBy,
      },
    });
    expect(request.isError).toBe(false);
    const denied = await call<{ error: { code: string; hint: string } }>(client, 'request_quote', {
      requestId: request.data.id,
      offerId: found.data.matches[0]!.offerId,
    });
    expect(denied.isError).toBe(true);
    expect(denied.data.error.code).toBe('LEVEL_INSUFFICIENT');
    expect(denied.data.error.hint).toContain('owner');
    await client.close();
  });

  it('full_autonomy: searches, negotiates, accepts and leaves payment to the owner without PayPal consent', async () => {
    const client = await connect(key('Purchasing assistant'));
    const status = await call<{
      authorizations: Array<{ id: string; budget: { available: string } }>;
    }>(client, 'get_authorization_status');
    const authorizationId = status.data.authorizations[0]!.id;
    expect(status.data.authorizations[0]!.budget.available).toBe('80.00');

    const request = await call<{ id: string; criteria: { maxTotal: string } }>(
      client,
      'create_request',
      { authorizationId },
    );
    expect(request.data.criteria.maxTotal).toBe('80.00');
    const found = await call<{
      matches: Array<{
        offerId: string;
        product: { sku: string };
        budget: { withinBudget: boolean };
      }>;
    }>(client, 'find_matches', { requestId: request.data.id });
    const kraft = found.data.matches.find((m) => m.product.sku === 'ENV-KR16-L')!;
    expect(kraft.budget.withinBudget).toBe(false);

    const opened = await call<{ id: string; quotes: Array<{ total: string }> }>(
      client,
      'request_quote',
      {
        requestId: request.data.id,
        offerId: kraft.offerId,
      },
    );
    expect(opened.data.quotes.at(-1)!.total).toBe('83.35');
    const countered = await call<{
      quotes: Array<{ id: string; total: string; unitPrice: string }>;
      authorizationCheck: { violations: unknown[] };
    }>(client, 'counter_quote', { negotiationId: opened.data.id, unitPrice: '0.20' });
    const final = countered.data.quotes.at(-1)!;
    expect(final).toMatchObject({ unitPrice: '0.2200', total: '76.86' });
    expect(countered.data.authorizationCheck.violations).toEqual([]);

    const purchase = await call<{
      order: { id: string; status: string };
      payment: { status: string };
    }>(client, 'execute_purchase', {
      negotiationId: opened.data.id,
      quoteId: final.id,
      idempotencyKey: 'demo-compra-1',
    });
    expect(purchase.isError).toBe(false);
    expect(purchase.data.payment.status).toBe('owner_action_required');
    expect(purchase.data.order.status).toBe('pending_payment');

    const retry = await call<{ order: { id: string } }>(client, 'execute_purchase', {
      orderId: purchase.data.order.id,
    });
    expect(retry.data.order.id).toBe(purchase.data.order.id);
    const after = await call<{
      authorizations: Array<{ budget: { reserved: string; available: string } }>;
    }>(client, 'get_authorization_status');
    expect(after.data.authorizations[0]!.budget).toMatchObject({
      reserved: '76.86',
      available: '3.14',
    });

    // El proveedor ve la negociación y el pedido desde su propio agente.
    const seller = await connect(key('EcoPack sales agent'));
    const negotiations = await call<Array<{ id: string; status: string }>>(
      seller,
      'list_pending_negotiations',
      { status: 'all' },
    );
    expect(negotiations.data.find((n) => n.id === opened.data.id)?.status).toBe('agreed');
    const order = await call<{ total: string }>(seller, 'get_order', {
      orderId: purchase.data.order.id,
    });
    expect(order.data.total).toBe('76.86');
    await seller.close();
    await client.close();
  });

  it('an agent cannot extend its own permissions; it can only propose changes (criterion 8)', async () => {
    const client = await connect(key('Research assistant'));
    const proposal = await call<{ status: string }>(client, 'request_authorization_change', {
      kind: 'change_level',
      buyerLevel: 'full_autonomy',
      reason: 'I need to buy',
    });
    expect(proposal.data.status).toBe('pending');
    const status = await call<{ agent: { buyerLevel: string } }>(
      client,
      'get_authorization_status',
    );
    expect(status.data.agent.buyerLevel).toBe('search_only');
    await client.close();
  });

  it('no MCP response contains secrets or tokens (criterion 16)', () => {
    expect(transcripts.length).toBeGreaterThan(10);
    const all = transcripts.join('\n');
    for (const pattern of [
      /dtk_/,
      /passwordHash/i,
      /tokenHash/i,
      /keyHash/i,
      /paymentTokenId/i,
      /setupTokenId/i,
      /scrypt\$/,
    ]) {
      expect(all).not.toMatch(pattern);
    }
  });
});
