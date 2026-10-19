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

  it('publica OpenAPI con las rutas y los esquemas de entrada', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/docs-json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/auth/register', '/api/orgs/{orgId}/agents', '/api/agent/me']),
    );
  });
});
