import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '@deal/db/testing';
import { catalog } from '../../portal/src/site/knowledge/catalog.js';

/**
 * Pruebas de extremo a extremo contra el servidor compilado (`pnpm build` antes de `pnpm test`).
 * Arranca el proceso real con la base de test y lo ejercita por HTTP.
 */
const mainJs = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}/api`;
const publicBase = 'https://docs.deal-terminal.test';
const origin = `http://127.0.0.1:${port}`;
let server: ChildProcess;
let logs = '';

beforeAll(async () => {
  if (!existsSync(mainJs)) throw new Error('dist/main.js is missing: run `pnpm build` first');
  const handle = await createTestDatabase();
  await handle.close();
  server = spawn(process.execPath, [mainJs], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      PUBLIC_BASE_URL: `${publicBase}/`,
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
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // aún arrancando
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`The server did not start:\n${logs}`);
}, 30_000);

afterAll(() => {
  server?.kill();
});

type Json = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string; bearer?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : null) as Json,
    setCookie: res.headers.get('set-cookie'),
  };
}

let n = 0;
async function company(name: string) {
  n += 1;
  const res = await call('POST', '/auth/register', {
    body: {
      email: `dueno${n}@${name}.test`,
      name: 'Owner',
      password: 'contraseña-segura-123',
      organizationName: name,
    },
  });
  expect(res.status).toBe(201);
  const cookie = res.setCookie!.split(';')[0]!;
  return { cookie, orgId: res.body.orgId as string };
}

describe('identity API (e2e)', () => {
  it('registration issues an httpOnly cookie and /me returns the membership', async () => {
    const res = await call('POST', '/auth/register', {
      body: {
        email: 'e2e@empresa.test',
        name: 'E2E',
        password: 'contraseña-segura-123',
        organizationName: 'E2E SA',
      },
    });
    expect(res.status).toBe(201);
    expect(res.setCookie).toMatch(/dt_session=.+HttpOnly/i);
    expect(res.setCookie).toMatch(/SameSite=Lax/i);

    const cookie = res.setCookie!.split(';')[0]!;
    const me = await call('GET', '/me', { cookie });
    expect(me.status).toBe(200);
    expect(me.body.memberships).toEqual([
      { orgId: res.body.orgId, orgName: 'E2E SA', role: 'owner' },
    ]);
  });

  it('errors have a stable, actionable format', async () => {
    const invalid = await call('POST', '/auth/register', { body: { email: 'no-es-email' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });

    const anon = await call('GET', '/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('owner creates agent and credential; the agent authenticates with its access level', async () => {
    const { cookie, orgId } = await company('compras');
    const agent = await call('POST', `/orgs/${orgId}/agents`, {
      cookie,
      body: { name: 'Agent', access: { buyerLevel: 'negotiate' } },
    });
    expect(agent.status).toBe(201);

    const cred = await call('POST', `/orgs/${orgId}/agents/${agent.body.id}/credentials`, {
      cookie,
    });
    expect(cred.status).toBe(201);
    const apiKey = cred.body.apiKey as string;

    const me = await call('GET', '/agent/me', { bearer: apiKey });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      orgId,
      access: { buyerLevel: 'negotiate', version: 1 },
    });

    // El agente no puede usar rutas del portal para cambiar su nivel (criterio 8).
    const escalate = await call('PUT', `/orgs/${orgId}/agents/${agent.body.id}/access`, {
      bearer: apiKey,
      body: { buyerLevel: 'full_autonomy' },
    });
    expect(escalate.status).toBe(401);

    // La lista del portal nunca expone secretos.
    const list = await call('GET', `/orgs/${orgId}/agents`, { cookie });
    expect(JSON.stringify(list.body)).not.toContain(apiKey);
  });

  it('isolation: another organization receives 404 for resources it does not own (criterion 16)', async () => {
    const a = await company('alfa');
    const b = await company('beta');
    const agentA = await call('POST', `/orgs/${a.orgId}/agents`, {
      cookie: a.cookie,
      body: { name: 'From alpha', access: { buyerLevel: 'search_only' } },
    });

    // B intenta usar la organización de A en la ruta.
    expect((await call('GET', `/orgs/${a.orgId}/agents`, { cookie: b.cookie })).status).toBe(404);
    // B intenta acceder al agente de A desde su propia organización.
    expect(
      (await call('GET', `/orgs/${b.orgId}/agents/${agentA.body.id}`, { cookie: b.cookie })).status,
    ).toBe(404);
  });

  it('authorizations: owner grants, agent checks and proposes, owner revokes', async () => {
    const { cookie, orgId } = await company('delegacion');
    const agent = await call('POST', `/orgs/${orgId}/agents`, {
      cookie,
      body: { name: 'Buyer', access: { buyerLevel: 'full_autonomy' } },
    });
    const { apiKey } = (
      await call('POST', `/orgs/${orgId}/agents/${agent.body.id}/credentials`, { cookie })
    ).body as { apiKey: string };

    const terms = {
      mandate: '300 containers with lids for hot food, no foam, up to US$80',
      category: 'food_containers',
      requiredAttributes: {
        hot_food_safe: { eq: true },
        has_lid: { eq: true },
        material: { not_in: ['foam_eps'] },
      },
      quantityMin: 300,
      quantityMax: 300,
      budgetTotal: '80.00',
      deliveryAddress: { line1: '120 Main St', city: 'Austin', state: 'TX', postalCode: '78701' },
      deliverBy: '2099-01-01',
      expiresAt: '2099-12-31T23:59:59Z',
    };
    const created = await call('POST', `/orgs/${orgId}/authorizations`, {
      cookie,
      body: { agentId: agent.body.id, terms },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'active', budget: { available: '80.00' } });

    const status = await call('GET', '/agent/authorization-status', { bearer: apiKey });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      agent: { buyerLevel: 'full_autonomy' },
      financialAuthorization: { active: false, scopes: [] },
    });

    // El agente no puede ampliarse el presupuesto: solo proponerlo.
    const selfAmend = await call('PUT', `/orgs/${orgId}/authorizations/${created.body.id}/terms`, {
      bearer: apiKey,
      body: { ...terms, budgetTotal: '500.00' },
    });
    expect(selfAmend.status).toBe(401);
    const proposal = await call('POST', '/agent/change-requests', {
      bearer: apiKey,
      body: {
        kind: 'amend_authorization',
        authorizationId: created.body.id,
        terms: { ...terms, budgetTotal: '95.00' },
        reason: 'The supplier charges for shipping',
      },
    });
    expect(proposal.status).toBe(201);
    expect(proposal.body).toMatchObject({ status: 'pending' });

    const revoked = await call('POST', `/orgs/${orgId}/authorizations/${created.body.id}/revoke`, {
      cookie,
    });
    expect(revoked.body).toMatchObject({ status: 'revoked' });

    const invalid = await call('POST', `/orgs/${orgId}/authorizations`, {
      cookie,
      body: { agentId: agent.body.id, terms: { ...terms, budgetTotal: '80.001' } },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('catalog: owner publishes, supplier agent updates and another organization receives 404', async () => {
    const { cookie, orgId } = await company('catalogo');
    const product = await call('POST', `/orgs/${orgId}/products`, {
      cookie,
      body: {
        sku: 'ENV-16',
        name: 'Kraft container',
        category: 'food_containers',
        attributes: {
          material: 'kraft_paper',
          capacity_oz: 16,
          hot_food_safe: true,
          has_lid: true,
          pack_size: 50,
        },
      },
    });
    expect(product.status).toBe(201);
    const terms = {
      status: 'active',
      stockAvailable: 1000,
      shipRegions: ['TX'],
      leadTimeDays: 3,
      priceTiers: [
        { minQty: 1, unitPrice: '0.25' },
        { minQty: 300, unitPrice: '0.2' },
      ],
      negotiationRules: { floorUnitPrice: '0.18', minLeadTimeDays: 1 },
    };
    const offer = await call('POST', `/orgs/${orgId}/offers`, {
      cookie,
      body: { productId: product.body.id, ...terms },
    });
    expect(offer.status).toBe(201);
    expect(offer.body).toMatchObject({ version: 1, status: 'active' });
    const agent = await call('POST', `/orgs/${orgId}/agents`, {
      cookie,
      body: { name: 'Supplier', access: { buyerLevel: null, sellerScopes: ['publish_offers'] } },
    });
    expect(agent.status).toBe(201);
    const cred = await call('POST', `/orgs/${orgId}/agents/${agent.body.id}/credentials`, {
      cookie,
    });
    expect(cred.status).toBe(201);
    const updated = await call('PUT', `/agent/offers/${offer.body.id}`, {
      bearer: cred.body.apiKey as string,
      body: { ...terms, stockAvailable: 900 },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ version: 2, stockAvailable: 900 });
    const other = await company('catalogoajeno');
    expect(
      (await call('GET', `/orgs/${other.orgId}/offers/${offer.body.id}`, { cookie: other.cookie }))
        .status,
    ).toBe(404);
    expect(
      (
        await call('GET', `/orgs/${other.orgId}/products/${product.body.id}`, {
          cookie: other.cookie,
        })
      ).status,
    ).toBe(404);
  });

  it('HTTP negotiation: the agent negotiates and leaves the proposal for the owner', async () => {
    const supplier = await company('proveedorneg');
    const product = await call('POST', `/orgs/${supplier.orgId}/products`, {
      cookie: supplier.cookie,
      body: {
        sku: 'KR16',
        name: 'Kraft container 16 oz',
        category: 'food_containers',
        attributes: {
          material: 'kraft_paper',
          capacity_oz: 16,
          hot_food_safe: true,
          has_lid: true,
          pack_size: 50,
        },
      },
    });
    const offer = await call('POST', `/orgs/${supplier.orgId}/offers`, {
      cookie: supplier.cookie,
      body: {
        productId: product.body.id,
        status: 'active',
        stockAvailable: 4000,
        minOrderQty: 50,
        shipRegions: ['TX'],
        leadTimeDays: 2,
        shippingFlat: '5.00',
        taxRate: '0.0825',
        priceTiers: [
          { minQty: 50, unitPrice: '0.31' },
          { minQty: 250, unitPrice: '0.24' },
        ],
        negotiationRules: {
          maxDiscount: '0.1',
          floorUnitPrice: '0.22',
          minQtyForDiscount: 250,
          minLeadTimeDays: 1,
        },
      },
    });
    expect(offer.status).toBe(201);

    const buyer = await company('compradorneg');
    const agent = await call('POST', `/orgs/${buyer.orgId}/agents`, {
      cookie: buyer.cookie,
      body: { name: 'Negotiator', access: { buyerLevel: 'negotiate' } },
    });
    const { apiKey } = (
      await call('POST', `/orgs/${buyer.orgId}/agents/${agent.body.id}/credentials`, {
        cookie: buyer.cookie,
      })
    ).body as { apiKey: string };

    const request = await call('POST', '/agent/requests', {
      bearer: apiKey,
      body: {
        criteria: {
          category: 'food_containers',
          requiredAttributes: { hot_food_safe: { eq: true }, has_lid: { eq: true } },
          quantity: 300,
          deliveryAddress: {
            line1: '1100 E 6th St',
            city: 'Austin',
            state: 'TX',
            postalCode: '78702',
          },
          deliverBy: '2099-01-01',
          maxTotal: '80.00',
        },
      },
    });
    expect(request.status).toBe(201);

    const matches = await call('POST', `/agent/requests/${request.body.id}/matches`, {
      bearer: apiKey,
      body: { options: { includeIncompatible: true } },
    });
    const match = (matches.body.matches as Array<{ offerId: string }>).find(
      (m) => m.offerId === offer.body.id,
    );
    expect(match).toBeDefined();

    const negotiation = await call('POST', '/agent/negotiations', {
      bearer: apiKey,
      body: { requestId: request.body.id, offerId: offer.body.id },
    });
    expect(negotiation.status).toBe(201);
    expect(negotiation.body).toMatchObject({ status: 'awaiting_buyer' });

    const countered = await call('POST', `/agent/negotiations/${negotiation.body.id}/counter`, {
      bearer: apiKey,
      body: { unitPrice: '0.20' },
    });
    expect(countered.status).toBe(200);
    const last = (countered.body.quotes as Array<{ unitPrice: string; ruleTrace?: unknown }>).at(
      -1,
    )!;
    expect(last.unitPrice).toBe('0.2200');
    expect(last.ruleTrace).toBeUndefined();

    const review = await call(
      'POST',
      `/agent/negotiations/${negotiation.body.id}/submit-for-review`,
      { bearer: apiKey, body: {} },
    );
    expect(review.body).toMatchObject({ status: 'pending_owner_review' });

    // Solo negociación no puede aceptar por su cuenta; el dueño acepta desde el portal.
    const quoteId = (review.body.quotes as Array<{ id: string }>).at(-1)!.id;
    const denied = await call('POST', '/agent/orders', {
      bearer: apiKey,
      body: { negotiationId: negotiation.body.id, quoteId },
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatchObject({ code: 'LEVEL_INSUFFICIENT' });
    const order = await call('POST', `/orgs/${buyer.orgId}/orders`, {
      cookie: buyer.cookie,
      body: { negotiationId: negotiation.body.id, quoteId },
    });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ status: 'pending_payment', paymentMode: 'manual' });
    const supplierOrder = await call('GET', `/orgs/${supplier.orgId}/orders/${order.body.id}`, {
      cookie: supplier.cookie,
    });
    expect(supplierOrder.body).toMatchObject({ total: order.body.total });

    const supplierList = await call(
      'GET',
      `/orgs/${supplier.orgId}/supplier/negotiations?status=all`,
      { cookie: supplier.cookie },
    );
    expect((supplierList.body as unknown as Array<{ id: string }>).map((n) => n.id)).toContain(
      negotiation.body.id,
    );
  });

  it('PayPal webhook: outside /api and rejects events without a valid signature', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/webhooks/paypal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'WH-FALSO',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {},
      }),
    });
    expect(res.status).toBe(401);
    expect((await fetch(`${base}/webhooks/paypal`, { method: 'POST' })).status).toBe(404);
  });

  it('PayPal return without a session sends the browser to sign in and back', async () => {
    const path = '/api/paypal/checkout/return?orgId=org-1&token=PAYPAL-ORDER&PayerID=PAYER';
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/login?next=${encodeURIComponent(path)}`);
  });

  it('publishes OpenAPI with routes and input schemas', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/docs-json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/auth/register', '/api/orgs/{orgId}/agents', '/api/agent/me']),
    );
  });
});

describe('OAuth for MCP apps (e2e)', () => {
  const origin = `http://127.0.0.1:${port}`;
  const redirectUri = 'http://127.0.0.1:43123/callback';

  async function form(path: string, fields: Record<string, string>) {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    });
    return { status: res.status, body: (await res.json()) as Json };
  }

  async function mcp(token?: string) {
    return fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'e2e', version: '1' },
        },
      }),
    });
  }

  it('an MCP app discovers OAuth, the owner picks the agent and the token works on /mcp', async () => {
    // 1. Descubrimiento: 401 con resource_metadata y metadatos del servidor de autorización.
    const anonymous = await mcp();
    expect(anonymous.status).toBe(401);
    const challenge = anonymous.headers.get('www-authenticate')!;
    expect(challenge).toMatch(
      /^Bearer resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"$/,
    );
    const resource = (await (
      await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`)
    ).json()) as { resource: string; authorization_servers: string[] };
    expect(resource.resource).toMatch(/\/mcp$/);
    const metadata = (await (
      await fetch(`${origin}/.well-known/oauth-authorization-server`)
    ).json()) as Json;
    expect(metadata).toMatchObject({
      issuer: resource.authorization_servers[0],
      code_challenge_methods_supported: ['S256'],
    });
    expect(metadata.registration_endpoint).toMatch(/\/oauth\/register$/);

    // 2. Registro dinámico del cliente (público, con PKCE).
    const registered = await fetch(`${origin}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'E2E Assistant',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    });
    expect(registered.status).toBe(201);
    const clientId = ((await registered.json()) as Json).client_id as string;

    // 3. /oauth/authorize guarda la solicitud y manda al dueño a la pantalla de consentimiento.
    const verifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
    const authorize = new URL(`${origin}/oauth/authorize`);
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'e2e-state',
      scope: 'agent',
      resource: resource.resource,
    })) {
      authorize.searchParams.set(key, value);
    }
    const redirect = await fetch(authorize, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    const consent = new URL(redirect.headers.get('location')!, origin);
    expect(consent.pathname).toBe('/oauth/consent');
    const requestId = consent.searchParams.get('request')!;

    // 4. El dueño ve la solicitud y conecta la aplicación como uno de sus agentes.
    const { cookie, orgId } = await company('oauth');
    const agent = await call('POST', `/orgs/${orgId}/agents`, {
      cookie,
      body: { name: 'Buyer', access: { buyerLevel: 'negotiate' } },
    });
    const view = await call('GET', `/oauth/requests/${requestId}`, { cookie });
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({
      status: 'pending',
      client: { name: 'E2E Assistant', redirectHost: '127.0.0.1:43123' },
    });
    expect(await call('GET', `/oauth/requests/${requestId}`)).toMatchObject({ status: 401 });
    const approved = await call('POST', `/orgs/${orgId}/oauth/requests/${requestId}/approve`, {
      cookie,
      body: { agentId: agent.body.id },
    });
    expect(approved.status).toBe(200);
    const back = new URL(approved.body.redirectTo as string);
    expect(`${back.origin}${back.pathname}`).toBe(redirectUri);
    expect(back.searchParams.get('state')).toBe('e2e-state');
    const code = back.searchParams.get('code')!;

    // 5. Canje con PKCE: un verificador incorrecto no sirve y no consume el código.
    const wrong = await form('/oauth/token', {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: randomBytes(32).toString('base64url'),
      redirect_uri: redirectUri,
    });
    expect(wrong).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
    const tokens = await form('/oauth/token', {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: resource.resource,
    });
    expect(tokens.status).toBe(200);
    expect(tokens.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });

    // 6. El token actúa como el agente elegido en /mcp y en la API de agentes.
    const session = await mcp(tokens.body.access_token as string);
    expect(session.status).toBe(200);
    expect(JSON.stringify(await session.json())).toContain('deal-terminal');
    const me = await call('GET', '/agent/me', { bearer: tokens.body.access_token as string });
    expect(me.body).toMatchObject({ agentId: agent.body.id });

    // 7. Renovación con rotación.
    const refreshed = await form('/oauth/token', {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: tokens.body.refresh_token as string,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.access_token).not.toBe(tokens.body.access_token);

    // 8. Un token inválido en /mcp vuelve a señalar el descubrimiento OAuth.
    const invalid = await mcp('dto_not-a-real-token');
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('the account pages keep their routes next to the OAuth endpoints', async () => {
    for (const path of ['/register', '/login', '/oauth/consent']) {
      expect((await fetch(`${origin}${path}`)).status, path).toBe(200);
    }
  });
});

describe('public documentation (e2e)', () => {
  it('builds every catalog article in reading order and publishes absolute Markdown URLs', async () => {
    const builtCatalog = JSON.parse(
      await readFile(new URL('../../portal/dist/llms/catalog.json', import.meta.url), 'utf8'),
    );
    expect(builtCatalog).toEqual(catalog);
    const res = await fetch(`${origin}/llms.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    const text = await res.text();
    expect(text).toContain(`${publicBase}/mcp`);
    expect(text).toContain('Streamable HTTP');
    expect(text).toContain('Authorization: Bearer dtk_');
    expect(text).toContain(`${publicBase}/console/agents`);
    expect(text).toContain(`${publicBase}/register`);
    expect(text).toContain(`${publicBase}/api/docs`);
    expect(text).toContain(`${publicBase}/llms-full.txt`);
    expect(text).not.toContain('https://your-domain.example');
    let position = -1;
    for (const article of catalog) {
      const line = `- [${article.title}](${publicBase}/knowledge/${article.slug}.md): ${article.summary}`;
      const next = text.indexOf(line);
      expect(next).toBeGreaterThan(position);
      position = next;
      expect(text).toContain(`## ${article.section}`);
    }
  });

  it('serves Markdown with the instance URL and keeps the credential placeholder', async () => {
    const res = await fetch(`${origin}/knowledge/mcp.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    const text = await res.text();
    expect(text).toMatch(/^# MCP server\n\n> /);
    expect(text).toContain(`${publicBase}/mcp`);
    expect(text).not.toContain('https://your-domain.example');
    expect(text).toContain('dtk_your_agent_credential');
    for (const slug of ['unknown-article', 'mcp.md', '..%2Findex', '%2e%2e%2f%2e%2e%2findex']) {
      expect((await fetch(`${origin}/knowledge/${slug}.md`)).status).toBe(404);
    }
  });

  it('combines all Markdown articles in reading order', async () => {
    const res = await fetch(`${origin}/llms-full.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    const text = await res.text();
    expect(text).toMatch(/^# Deal Terminal/);
    expect(text).toContain(`${publicBase}/mcp`);
    expect(text).not.toContain('https://your-domain.example');
    const articles = await Promise.all(
      catalog.map(async (article) =>
        (await fetch(`${origin}/knowledge/${article.slug}.md`)).text(),
      ),
    );
    expect(text.endsWith(articles.join('\n\n---\n\n'))).toBe(true);
  });

  it('injects hidden article content, metadata and alternate links into the portal shell', async () => {
    const res = await fetch(`${origin}/knowledge/mcp`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const html = await res.text();
    expect(html).toContain('<div id="root"></div><article id="dt-static">');
    expect(html).toContain('<style>#dt-static{display:none}</style>');
    expect(html).toContain('<h1>MCP server</h1>');
    expect(html).toContain('<title>MCP server — Deal Terminal</title>');
    expect(html).toContain(`content="${catalog.find((a) => a.slug === 'mcp')!.summary}"`);
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="/knowledge/mcp.md">');
    expect(html).toContain(
      '<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">',
    );
    expect(html).toContain(`${publicBase}/mcp`);
    expect(html).not.toContain('https://your-domain.example');
  });

  it('serves the home and Knowledge index while preserving assets and unknown SPA routes', async () => {
    const home = await fetch(`${origin}/`);
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<article id="dt-static">');
    expect(html).toContain('How to connect an agent');
    expect(html).toContain(`${publicBase}/mcp`);
    const index = await fetch(`${origin}/knowledge/`);
    expect(index.status).toBe(200);
    const indexHtml = await index.text();
    expect(indexHtml).toContain('<article id="dt-static">');
    for (const article of catalog) {
      expect(indexHtml).toContain(`href="/knowledge/${article.slug}"`);
    }
    const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    expect(assetPath).toBeDefined();
    const asset = await fetch(`${origin}${assetPath}`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toMatch(/javascript/);
    expect((await fetch(`${origin}/brand/favicon-32.png`)).headers.get('content-type')).toBe(
      'image/png',
    );
    for (const path of [
      '/unknown-route',
      '/knowledge/unknown-article',
      '/knowledge/unknown/nested',
    ]) {
      const fallback = await fetch(`${origin}${path}`);
      expect(fallback.status).toBe(200);
      const shell = await fallback.text();
      expect(shell).toContain('<div id="root"></div>');
      expect(shell).not.toContain('dt-static');
    }
  });
});
