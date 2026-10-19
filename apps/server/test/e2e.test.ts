import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '@deal/db/testing';

/**
 * Pruebas de extremo a extremo contra el servidor compilado (`pnpm build` antes de `pnpm test`).
 * Arranca el proceso real con la base de test y lo ejercita por HTTP.
 */
const mainJs = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}/api`;
let server: ChildProcess;
let logs = '';

beforeAll(async () => {
  if (!existsSync(mainJs)) throw new Error('Falta dist/main.js: ejecuta `pnpm build` antes');
  const handle = await createTestDatabase();
  await handle.close();
  server = spawn(process.execPath, [mainJs], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
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
  throw new Error(`El servidor no arrancó:\n${logs}`);
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
      name: 'Dueño',
      password: 'contraseña-segura-123',
      organizationName: name,
    },
  });
  expect(res.status).toBe(201);
  const cookie = res.setCookie!.split(';')[0]!;
  return { cookie, orgId: res.body.orgId as string };
}

describe('API de identidad (e2e)', () => {
  it('registro emite cookie httpOnly y /me devuelve la membresía', async () => {
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

  it('errores con formato estable y accionable', async () => {
    const invalid = await call('POST', '/auth/register', { body: { email: 'no-es-email' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });

    const anon = await call('GET', '/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('dueño crea agente y credencial; el agente se autentica con su nivel', async () => {
    const { cookie, orgId } = await company('compras');
    const agent = await call('POST', `/orgs/${orgId}/agents`, {
      cookie,
      body: { name: 'Agente', access: { buyerLevel: 'negotiate' } },
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

  it('aislamiento: otra organización recibe 404 en recursos ajenos (criterio 16)', async () => {
    const a = await company('alfa');
    const b = await company('beta');
    const agentA = await call('POST', `/orgs/${a.orgId}/agents`, {
      cookie: a.cookie,
      body: { name: 'De alfa', access: { buyerLevel: 'search_only' } },
    });

    // B intenta usar la organización de A en la ruta.
    expect((await call('GET', `/orgs/${a.orgId}/agents`, { cookie: b.cookie })).status).toBe(404);
    // B intenta acceder al agente de A desde su propia organización.
    expect(
      (await call('GET', `/orgs/${b.orgId}/agents/${agentA.body.id}`, { cookie: b.cookie })).status,
    ).toBe(404);
  });

  it('autorizaciones: el dueño concede, el agente consulta y propone, el dueño revoca', async () => {
    const { cookie, orgId } = await company('delegacion');
    const agent = await call('POST', `/orgs/${orgId}/agents`, {
      cookie,
      body: { name: 'Comprador', access: { buyerLevel: 'full_autonomy' } },
    });
    const { apiKey } = (
      await call('POST', `/orgs/${orgId}/agents/${agent.body.id}/credentials`, { cookie })
    ).body as { apiKey: string };

    const terms = {
      mandate: '300 envases con tapa para caliente, sin foam, hasta US$80',
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
        reason: 'El proveedor cobra transporte',
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

  it('catálogo: dueño publica, agente proveedor actualiza y otra organización recibe 404', async () => {
    const { cookie, orgId } = await company('catalogo');
    const product = await call('POST', `/orgs/${orgId}/products`, {
      cookie,
      body: {
        sku: 'ENV-16',
        name: 'Envase kraft',
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
      body: { name: 'Proveedor', access: { buyerLevel: null, sellerScopes: ['publish_offers'] } },
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

  it('negociación por HTTP: el agente negocia y deja la propuesta para el dueño', async () => {
    const supplier = await company('proveedorneg');
    const product = await call('POST', `/orgs/${supplier.orgId}/products`, {
      cookie: supplier.cookie,
      body: {
        sku: 'KR16',
        name: 'Envase kraft 16 oz',
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
      body: { name: 'Negociador', access: { buyerLevel: 'negotiate' } },
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

  it('publica OpenAPI con las rutas y los esquemas de entrada', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/docs-json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/auth/register', '/api/orgs/{orgId}/agents', '/api/agent/me']),
    );
  });
});
