import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { DomainError, type ErrorCode } from '@deal/shared';
import { newAgent, newCompany } from '../testing/fixtures.js';
import { disableAgent, getAgent, revokeCredential, setAgentAccess } from './agents.js';
import type { UserActor } from './actor.js';
import {
  createOAuthAuthorization,
  decideOAuthAuthorization,
  exchangeOAuthCode,
  getOAuthAuthorization,
  oauthCodeChallenge,
  refreshOAuthToken,
  registerOAuthClient,
  resolveAgentBearer,
  resolveOAuthAccessToken,
  revokeOAuthToken,
} from './oauth.js';

let h: DbHandle;

beforeAll(async () => {
  h = await createTestDatabase();
});

afterAll(async () => {
  await h?.close();
});

async function expectCode(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected ${code}`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const RESOURCE = 'https://deal.example/mcp';
let clientSeq = 0;

/** Cliente registrado + solicitud pendiente, como al pulsar "Connect" en claude.ai. */
async function pendingRequest(now = new Date()) {
  clientSeq += 1;
  const clientId = `client-${clientSeq}`;
  await registerOAuthClient(h.db, {
    client_id: clientId,
    client_name: 'Claude',
    redirect_uris: [REDIRECT],
  });
  const id = await createOAuthAuthorization(
    h.db,
    {
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: 'challenge-abc',
      state: 'state-xyz',
      scopes: ['agent'],
      resource: RESOURCE,
    },
    now,
  );
  return { clientId, id };
}

async function approved(owner: UserActor, agentId: string) {
  const { clientId, id } = await pendingRequest();
  const { redirectTo } = await decideOAuthAuthorization(h.db, owner, id, {
    approve: true,
    agentId,
  });
  const url = new URL(redirectTo);
  return { clientId, id, code: url.searchParams.get('code')!, url };
}

describe('OAuth connection of MCP apps', () => {
  it('the owner sees the request and chooses among their active agents', async () => {
    const owner = await newCompany(h.db, 'Taqueria');
    const agent = await newAgent(h.db, owner, 'full_autonomy');
    const other = await newCompany(h.db, 'Other');
    await newAgent(h.db, other, 'search_only');
    const { id } = await pendingRequest();

    const view = await getOAuthAuthorization(h.db, owner.userId, id);
    expect(view).toMatchObject({
      status: 'pending',
      client: { name: 'Claude', redirectHost: 'claude.ai' },
    });
    expect(view.organizations).toHaveLength(1);
    expect(view.organizations[0]!.agents).toEqual([
      expect.objectContaining({ id: agent.agentId, buyerLevel: 'full_autonomy' }),
    ]);
  });

  it('approval issues a one-time code, exchanged for tokens that act as the agent', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const { clientId, code, url } = await approved(owner, agent.agentId);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get('state')).toBe('state-xyz');
    expect(code).toMatch(/^dtc_/);
    expect(await oauthCodeChallenge(h.db, clientId, code)).toBe('challenge-abc');

    const tokens = await exchangeOAuthCode(h.db, {
      clientId,
      code,
      redirectUri: REDIRECT,
      resource: RESOURCE,
    });
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'agent' });
    const actor = await resolveAgentBearer(h.db, tokens.access_token);
    expect(actor).toMatchObject({
      kind: 'agent',
      agentId: agent.agentId,
      orgId: owner.orgId,
      grant: { buyerLevel: 'negotiate' },
    });

    // El código es de un solo uso.
    await expectCode(exchangeOAuthCode(h.db, { clientId, code }), 'INVALID_STATE');

    // La conexión aparece como credencial del agente, con el nombre de la aplicación.
    const view = await getAgent(h.db, owner, agent.agentId);
    expect(view.credentials).toContainEqual(
      expect.objectContaining({ keyPrefix: 'oauth', label: 'Claude', revokedAt: null }),
    );
  });

  it('the token always carries the agent’s current level', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'search_only');
    const { clientId, code } = await approved(owner, agent.agentId);
    const { access_token } = await exchangeOAuthCode(h.db, { clientId, code });
    await setAgentAccess(h.db, owner, agent.agentId, { buyerLevel: 'full_autonomy' });
    expect((await resolveAgentBearer(h.db, access_token)).grant.buyerLevel).toBe('full_autonomy');
  });

  it('rejects codes from another client, another redirect or another resource', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const { clientId, code } = await approved(owner, agent.agentId);
    await expectCode(exchangeOAuthCode(h.db, { clientId: 'intruder', code }), 'INVALID_STATE');
    await expectCode(
      exchangeOAuthCode(h.db, { clientId, code, redirectUri: 'https://evil.example/cb' }),
      'INVALID_STATE',
    );
    await expectCode(
      exchangeOAuthCode(h.db, { clientId, code, resource: 'https://other.example/mcp' }),
      'INVALID_STATE',
    );
  });

  it('expired requests and codes cannot be used', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const past = new Date(Date.now() - 11 * 60 * 1000);
    const { id } = await pendingRequest(past);
    expect((await getOAuthAuthorization(h.db, owner.userId, id)).status).toBe('expired');
    await expectCode(
      decideOAuthAuthorization(h.db, owner, id, { approve: true, agentId: agent.agentId }),
      'INVALID_STATE',
    );

    const { clientId, code } = await approved(owner, agent.agentId);
    const later = new Date(Date.now() + 6 * 60 * 1000);
    await expectCode(exchangeOAuthCode(h.db, { clientId, code }, later), 'INVALID_STATE');
  });

  it('declining returns access_denied and creates no credential', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const { id } = await pendingRequest();
    const { redirectTo } = await decideOAuthAuthorization(h.db, owner, id, { approve: false });
    const url = new URL(redirectTo);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('state-xyz');
    expect((await getAgent(h.db, owner, agent.agentId)).credentials).toHaveLength(1);
  });

  it('only an owner or admin can connect, and only agents of their organization', async () => {
    const owner = await newCompany(h.db);
    const stranger = await newCompany(h.db);
    const theirAgent = await newAgent(h.db, stranger, 'full_autonomy');
    const { id } = await pendingRequest();
    await expectCode(
      decideOAuthAuthorization(h.db, owner, id, { approve: true, agentId: theirAgent.agentId }),
      'NOT_FOUND',
    );
    await expectCode(
      decideOAuthAuthorization(h.db, theirAgent, id, { approve: false }),
      'FORBIDDEN',
    );
  });

  it('refresh rotates tokens; reusing an old refresh token cuts the connection', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const { clientId, code } = await approved(owner, agent.agentId);
    const first = await exchangeOAuthCode(h.db, { clientId, code });

    const second = await refreshOAuthToken(h.db, { clientId, refreshToken: first.refresh_token });
    expect(second.access_token).not.toBe(first.access_token);
    await resolveAgentBearer(h.db, second.access_token);

    await expectCode(
      refreshOAuthToken(h.db, { clientId, refreshToken: first.refresh_token }),
      'INVALID_STATE',
    );
    // Tras la reutilización, los tokens vigentes de la conexión dejan de valer.
    await expectCode(resolveAgentBearer(h.db, second.access_token), 'UNAUTHENTICATED');
    await expectCode(
      refreshOAuthToken(h.db, { clientId, refreshToken: second.refresh_token }),
      'INVALID_STATE',
    );
  });

  it('revoking the credential or disabling the agent invalidates the tokens', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const { clientId, code } = await approved(owner, agent.agentId);
    const tokens = await exchangeOAuthCode(h.db, { clientId, code });
    const credential = (await getAgent(h.db, owner, agent.agentId)).credentials.find(
      (c) => c.keyPrefix === 'oauth',
    )!;
    await revokeCredential(h.db, owner, agent.agentId, credential.id);
    await expectCode(resolveAgentBearer(h.db, tokens.access_token), 'UNAUTHENTICATED');
    await expectCode(
      refreshOAuthToken(h.db, { clientId, refreshToken: tokens.refresh_token }),
      'UNAUTHENTICATED',
    );

    const other = await newAgent(h.db, owner, 'negotiate');
    const second = await approved(owner, other.agentId);
    const otherTokens = await exchangeOAuthCode(h.db, {
      clientId: second.clientId,
      code: second.code,
    });
    await disableAgent(h.db, owner, other.agentId);
    await expectCode(resolveAgentBearer(h.db, otherTokens.access_token), 'UNAUTHENTICATED');
  });

  it('the app can revoke its own tokens; expired access tokens are refused', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const { clientId, code } = await approved(owner, agent.agentId);
    const tokens = await exchangeOAuthCode(h.db, { clientId, code });
    const later = new Date(Date.now() + 61 * 60 * 1000);
    await expectCode(resolveOAuthAccessToken(h.db, tokens.access_token, later), 'UNAUTHENTICATED');

    await revokeOAuthToken(h.db, { clientId: 'intruder', token: tokens.access_token });
    await resolveAgentBearer(h.db, tokens.access_token);
    await revokeOAuthToken(h.db, { clientId, token: tokens.access_token });
    await expectCode(resolveAgentBearer(h.db, tokens.access_token), 'UNAUTHENTICATED');
  });

  it('codes and tokens are stored only as hashes', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const { clientId, code } = await approved(owner, agent.agentId);
    const tokens = await exchangeOAuthCode(h.db, { clientId, code });
    const rows = JSON.stringify([
      await h.db.select().from(schema.oauthAuthorizations),
      await h.db.select().from(schema.oauthTokens),
    ]);
    for (const secret of [code, tokens.access_token, tokens.refresh_token]) {
      expect(rows).not.toContain(secret);
    }
  });
});
