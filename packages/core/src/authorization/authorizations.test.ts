import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { DomainError, type ErrorCode } from '@deal/shared';
import { getAgent, resolveAgentKey, setAgentAccess } from '../identity/agents.js';
import { demoTerms, newAgent, newAgentWithKey, newCompany } from '../testing/fixtures.js';
import {
  amendAuthorization,
  createAuthorization,
  expireAuthorizations,
  getAgentAuthorizationStatus,
  getAuthorization,
  listAuthorizations,
  loadAgentAuthorization,
  revokeAuthorization,
} from './authorizations.js';
import {
  approveChangeRequest,
  listChangeRequests,
  rejectChangeRequest,
  submitChangeRequest,
} from './change-requests.js';

let h: DbHandle;
const NOW = new Date('2026-10-20T12:00:00Z');

beforeAll(async () => {
  h = await createTestDatabase();
});

afterAll(async () => {
  await h?.close();
});

async function expectCode(p: Promise<unknown>, code: ErrorCode) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e, `expected ${code}`).toBeInstanceOf(DomainError);
  expect((e as DomainError).code).toBe(code);
}

describe('purchase authorizations', () => {
  it('the owner creates a structured, active authorization', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'full_autonomy');
    const auth = await createAuthorization(
      h.db,
      owner,
      { agentId: agent.agentId, terms: demoTerms() },
      NOW,
    );
    expect(auth).toMatchObject({
      status: 'active',
      version: 1,
      agentId: agent.agentId,
      terms: { budgetTotal: '80.00', quantityMin: 300, deliverBy: '2026-10-23' },
      budget: { limit: '80.00', available: '80.00' },
    });
  });

  it('validates category attributes, amounts and dates', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'full_autonomy');
    const create = (terms: Parameters<typeof demoTerms>[0]) =>
      createAuthorization(h.db, owner, { agentId: agent.agentId, terms: demoTerms(terms) }, NOW);

    await expect(create({ requiredAttributes: { color: { eq: 'red' } } })).rejects.toThrow(
      /Unknown/,
    );
    await expect(create({ budgetTotal: '80.001' })).rejects.toThrow();
    await expect(create({ budgetTotal: '0' })).rejects.toThrow();
    await expect(create({ quantityMin: 400, quantityMax: 300 })).rejects.toThrow();
    await expectCode(create({ expiresAt: '2026-10-19T00:00:00Z' }), 'VALIDATION_FAILED');
  });

  it('cannot authorize an agent without buyer permissions', async () => {
    const owner = await newCompany(h.db);
    const seller = await newAgent(h.db, owner, null);
    await expectCode(
      createAuthorization(h.db, owner, { agentId: seller.agentId, terms: demoTerms() }, NOW),
      'LEVEL_INSUFFICIENT',
    );
  });

  it('amending creates a new version; revoking blocks the authorization', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'full_autonomy');
    const auth = await createAuthorization(
      h.db,
      owner,
      { agentId: agent.agentId, terms: demoTerms() },
      NOW,
    );

    const amended = await amendAuthorization(
      h.db,
      owner,
      auth.id,
      demoTerms({ budgetTotal: '95.00' }),
      NOW,
    );
    expect(amended).toMatchObject({ version: 2, terms: { budgetTotal: '95.00' } });
    const versions = await h.db.select().from(schema.purchaseAuthorizationVersions);
    expect(versions.filter((v) => v.authorizationId === auth.id).map((v) => v.version)).toEqual([
      1, 2,
    ]);

    const revoked = await revokeAuthorization(h.db, owner, auth.id, NOW);
    expect(revoked.status).toBe('revoked');
    await expectCode(
      amendAuthorization(h.db, owner, auth.id, demoTerms(), NOW),
      'AUTHORIZATION_REVOKED',
    );

    const snapshot = await h.db.transaction((tx) =>
      loadAgentAuthorization(tx, agent, auth.id, NOW),
    );
    expect(snapshot.status).toBe('revoked');
  });

  it('an expired authorization is reported as expired and the sweep marks it', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'full_autonomy');
    const auth = await createAuthorization(
      h.db,
      owner,
      { agentId: agent.agentId, terms: demoTerms({ expiresAt: '2026-10-21T00:00:00Z' }) },
      NOW,
    );
    const later = new Date('2026-10-22T00:00:00Z');
    expect((await getAuthorization(h.db, owner, auth.id, later)).status).toBe('expired');
    expect(await expireAuthorizations(h.db, later)).toBeGreaterThanOrEqual(1);
    expect((await getAuthorization(h.db, owner, auth.id, NOW)).status).toBe('expired');
  });

  it('only owners or administrators manage authorizations (criterion 8)', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'full_autonomy');
    await expectCode(
      createAuthorization(h.db, agent, { agentId: agent.agentId, terms: demoTerms() }, NOW),
      'FORBIDDEN',
    );
    const auth = await createAuthorization(
      h.db,
      owner,
      { agentId: agent.agentId, terms: demoTerms() },
      NOW,
    );
    await expectCode(
      amendAuthorization(h.db, agent, auth.id, demoTerms({ budgetTotal: '999.00' }), NOW),
      'FORBIDDEN',
    );
    await expectCode(revokeAuthorization(h.db, agent, auth.id, NOW), 'FORBIDDEN');
  });

  it('an agent only sees its own authorizations; another organization sees none (criterion 16)', async () => {
    const owner = await newCompany(h.db);
    const mine = await newAgent(h.db, owner, 'full_autonomy');
    const colleague = await newAgent(h.db, owner, 'full_autonomy');
    const auth = await createAuthorization(
      h.db,
      owner,
      { agentId: mine.agentId, terms: demoTerms() },
      NOW,
    );
    await createAuthorization(h.db, owner, { agentId: colleague.agentId, terms: demoTerms() }, NOW);

    expect((await listAuthorizations(h.db, mine, {}, NOW)).map((a) => a.id)).toEqual([auth.id]);
    await expectCode(getAuthorization(h.db, colleague, auth.id, NOW), 'NOT_FOUND');
    await expectCode(
      h.db.transaction((tx) => loadAgentAuthorization(tx, colleague, auth.id, NOW)),
      'NOT_FOUND',
    );

    const stranger = await newCompany(h.db);
    await expectCode(getAuthorization(h.db, stranger, auth.id, NOW), 'NOT_FOUND');
    await expectCode(revokeAuthorization(h.db, stranger, auth.id, NOW), 'NOT_FOUND');
    expect(await listAuthorizations(h.db, stranger, {}, NOW)).toEqual([]);
  });

  it('agent status does not expose payment token identifiers', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'full_autonomy');
    await createAuthorization(h.db, owner, { agentId: agent.agentId, terms: demoTerms() }, NOW);
    await h.db.insert(schema.paymentConnections).values({
      orgId: owner.orgId,
      status: 'active',
      scope: 'merchant',
      payeeMerchantId: 'MERCHANT123',
      setupTokenId: 'SETUP-SECRETO',
      paymentTokenId: 'TOKEN-SECRETO',
      paypalCustomerId: 'CUSTOMER-SECRETO',
      createdByUserId: owner.userId,
    });

    const status = await getAgentAuthorizationStatus(h.db, agent, NOW);
    expect(status.financialAuthorization).toEqual({
      active: true,
      scopes: ['merchant:MERCHANT123'],
    });
    expect(status.authorizations).toHaveLength(1);
    const json = JSON.stringify(status);
    for (const secret of ['SETUP-SECRETO', 'TOKEN-SECRETO', 'CUSTOMER-SECRETO']) {
      expect(json).not.toContain(secret);
    }
  });

  it("lowering an agent's access level is reflected immediately in its status", async () => {
    const owner = await newCompany(h.db);
    const { apiKey } = await newAgentWithKey(h.db, owner, 'full_autonomy');
    const before = await resolveAgentKey(h.db, apiKey);
    await setAgentAccess(h.db, owner, before.agentId, { buyerLevel: 'search_only' });
    const after = await resolveAgentKey(h.db, apiKey);
    const status = await getAgentAuthorizationStatus(h.db, after, NOW);
    expect(status.agent).toMatchObject({ buyerLevel: 'search_only', accessVersion: 2 });
  });
});

describe('agent change requests (brief §4)', () => {
  it('the agent proposes and cannot approve; the owner approves and the change takes effect', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const request = await submitChangeRequest(h.db, agent, {
      kind: 'new_authorization',
      terms: demoTerms(),
      reason: "Owner's mandate in chat",
    });
    expect(request.status).toBe('pending');

    await expectCode(approveChangeRequest(h.db, agent, request.id, NOW), 'FORBIDDEN');
    expect(await listAuthorizations(h.db, owner, { agentId: agent.agentId }, NOW)).toHaveLength(0);

    const approved = await approveChangeRequest(h.db, owner, request.id, NOW);
    expect(approved.status).toBe('approved');
    const auths = await listAuthorizations(h.db, owner, { agentId: agent.agentId }, NOW);
    expect(auths).toHaveLength(1);
    expect(auths[0]!.grantedByUserId).toBe(owner.userId);

    await expectCode(approveChangeRequest(h.db, owner, request.id, NOW), 'INVALID_STATE');
  });

  it('an approved access level request changes the level; a rejected request changes nothing', async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'search_only');
    const up = await submitChangeRequest(h.db, agent, {
      kind: 'change_level',
      buyerLevel: 'negotiate',
    });
    const upMore = await submitChangeRequest(h.db, agent, {
      kind: 'change_level',
      buyerLevel: 'full_autonomy',
    });

    await rejectChangeRequest(h.db, owner, upMore.id, NOW);
    await approveChangeRequest(h.db, owner, up.id, NOW);

    expect((await getAgent(h.db, owner, agent.agentId)).access).toMatchObject({
      buyerLevel: 'negotiate',
      version: 2,
    });
    const requests = await listChangeRequests(h.db, agent);
    expect(requests.map((r) => r.status).sort()).toEqual(['approved', 'rejected']);
  });

  it("cannot request an increase to another agent's authorization", async () => {
    const owner = await newCompany(h.db);
    const agent = await newAgent(h.db, owner, 'negotiate');
    const other = await newAgent(h.db, owner, 'full_autonomy');
    const auth = await createAuthorization(
      h.db,
      owner,
      { agentId: other.agentId, terms: demoTerms() },
      NOW,
    );
    await expectCode(
      submitChangeRequest(h.db, agent, {
        kind: 'amend_authorization',
        authorizationId: auth.id,
        terms: demoTerms({ budgetTotal: '500.00' }),
      }),
      'NOT_FOUND',
    );
  });
});
