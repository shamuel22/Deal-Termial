import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { DomainError, type ErrorCode } from '@deal/shared';
import {
  createAgent,
  disableAgent,
  getAgent,
  issueCredential,
  listAgents,
  resolveAgentKey,
  revokeCredential,
  setAgentAccess,
} from './agents.js';
import { login, logout, registerOwner, resolveSession, resolveUserActor } from './accounts.js';
import type { UserActor } from './actor.js';

let h: DbHandle;

beforeAll(async () => {
  h = await createTestDatabase();
});

afterAll(async () => {
  await h?.close();
});

let seq = 0;
async function newCompany(name: string): Promise<UserActor> {
  seq += 1;
  const { userId, orgId } = await registerOwner(h.db, {
    email: `owner${seq}@${name.toLowerCase()}.test`,
    name: `Owner ${name}`,
    password: 'contraseña-segura-123',
    organizationName: name,
  });
  return resolveUserActor(h.db, userId, orgId);
}

async function expectCode(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected ${code}`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe('accounts and sessions', () => {
  it('registers, signs in and signs out', async () => {
    await registerOwner(h.db, {
      email: 'Ana@Envases.test',
      name: 'Ana',
      password: 'contraseña-segura-123',
      organizationName: 'Ana Containers',
    });
    const session = await login(h.db, {
      email: 'ana@envases.test',
      password: 'contraseña-segura-123',
    });
    expect(session.token.length).toBeGreaterThan(40);
    const resolved = await resolveSession(h.db, session.token);
    expect(resolved?.email).toBe('ana@envases.test');

    // El token no se guarda en claro.
    const stored = await h.db.select().from(schema.sessions);
    expect(stored.some((s) => s.tokenHash === session.token)).toBe(false);

    await logout(h.db, session.token);
    expect(await resolveSession(h.db, session.token)).toBeNull();
  });

  it('rejects an incorrect password, unknown email and duplicate email', async () => {
    await expectCode(
      login(h.db, { email: 'ana@envases.test', password: 'otra-contraseña-123' }),
      'UNAUTHENTICATED',
    );
    await expectCode(
      login(h.db, { email: 'nadie@envases.test', password: 'contraseña-segura-123' }),
      'UNAUTHENTICATED',
    );
    await expectCode(
      registerOwner(h.db, {
        email: 'ANA@envases.test',
        name: 'Ana 2',
        password: 'contraseña-segura-123',
        organizationName: 'Otra',
      }),
      'VALIDATION_FAILED',
    );
  });

  it('requires passwords of at least 12 characters', async () => {
    await expect(
      registerOwner(h.db, {
        email: 'corta@x.test',
        name: 'X',
        password: 'corta',
        organizationName: 'X',
      }),
    ).rejects.toThrow();
  });
});

describe('agents and access levels', () => {
  it('creates an agent, issues a credential and resolves it with its current access level', async () => {
    const owner = await newCompany('Compradora');
    const agent = await createAgent(h.db, owner, {
      name: 'Purchasing agent',
      access: { buyerLevel: 'search_only' },
    });
    expect(agent.access).toMatchObject({ version: 1, buyerLevel: 'search_only', sellerScopes: [] });

    const credential = await issueCredential(h.db, owner, agent.id);
    expect(credential.apiKey.startsWith(credential.keyPrefix)).toBe(true);

    const actor = await resolveAgentKey(h.db, credential.apiKey);
    expect(actor).toMatchObject({
      kind: 'agent',
      agentId: agent.id,
      orgId: owner.orgId,
      grant: { version: 1, buyerLevel: 'search_only' },
    });

    // La vista del agente nunca incluye el secreto.
    const view = await getAgent(h.db, owner, agent.id);
    expect(JSON.stringify(view)).not.toContain(credential.apiKey);
  });

  it('an access level change creates a new version and takes effect immediately', async () => {
    const owner = await newCompany('Versionada');
    const agent = await createAgent(h.db, owner, {
      name: 'A',
      access: { buyerLevel: 'full_autonomy' },
    });
    const { apiKey } = await issueCredential(h.db, owner, agent.id);

    const updated = await setAgentAccess(h.db, owner, agent.id, {
      buyerLevel: 'negotiate',
      sellerScopes: ['submit_quotes'],
    });
    expect(updated.access).toMatchObject({ version: 2, buyerLevel: 'negotiate' });

    const actor = await resolveAgentKey(h.db, apiKey);
    expect(actor.grant).toMatchObject({
      version: 2,
      buyerLevel: 'negotiate',
      sellerScopes: ['submit_quotes'],
    });

    const history = await h.db
      .select()
      .from(schema.agentAccessGrants)
      .where(eq(schema.agentAccessGrants.agentId, agent.id));
    expect(history).toHaveLength(2);

    const events = await h.db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.resourceId, agent.id),
          eq(schema.auditEvents.action, 'agent.access_changed'),
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0]!.actorId).toBe(owner.userId);
  });

  it('a revoked credential or disabled agent cannot authenticate', async () => {
    const owner = await newCompany('Revocadora');
    const agent = await createAgent(h.db, owner, {
      name: 'A',
      access: { buyerLevel: 'negotiate' },
    });
    const first = await issueCredential(h.db, owner, agent.id);
    const second = await issueCredential(h.db, owner, agent.id);

    await revokeCredential(h.db, owner, agent.id, first.credentialId);
    await expectCode(resolveAgentKey(h.db, first.apiKey), 'UNAUTHENTICATED');
    await expect(resolveAgentKey(h.db, second.apiKey)).resolves.toMatchObject({
      agentId: agent.id,
    });

    await disableAgent(h.db, owner, agent.id);
    await expectCode(resolveAgentKey(h.db, second.apiKey), 'UNAUTHENTICATED');
    await expectCode(issueCredential(h.db, owner, agent.id), 'INVALID_STATE');
  });

  it('rejects malformed or fabricated keys', async () => {
    await expectCode(resolveAgentKey(h.db, 'sk_otra_cosa'), 'UNAUTHENTICATED');
    await expectCode(resolveAgentKey(h.db, 'dtk_inventada_123'), 'UNAUTHENTICATED');
  });
});

describe('authority over permissions (criterion 8)', () => {
  it('an agent cannot change its own access level or issue credentials', async () => {
    const owner = await newCompany('Autoridad');
    const agent = await createAgent(h.db, owner, {
      name: 'A',
      access: { buyerLevel: 'search_only' },
    });
    const { apiKey } = await issueCredential(h.db, owner, agent.id);
    const agentActor = await resolveAgentKey(h.db, apiKey);

    await expectCode(
      setAgentAccess(h.db, agentActor, agent.id, { buyerLevel: 'full_autonomy' }),
      'FORBIDDEN',
    );
    await expectCode(issueCredential(h.db, agentActor, agent.id), 'FORBIDDEN');
    await expectCode(listAgents(h.db, agentActor), 'FORBIDDEN');
  });

  it('a member without the administrator role cannot manage agents', async () => {
    const owner = await newCompany('Roles');
    const [member] = await h.db
      .insert(schema.users)
      .values({ email: 'miembro@roles.test', name: 'M', passwordHash: 'x' })
      .returning();
    await h.db
      .insert(schema.memberships)
      .values({ orgId: owner.orgId, userId: member!.id, role: 'member' });
    const memberActor = await resolveUserActor(h.db, member!.id, owner.orgId);

    await expectCode(
      createAgent(h.db, memberActor, { name: 'X', access: { buyerLevel: 'full_autonomy' } }),
      'FORBIDDEN',
    );
  });
});

describe('isolation between organizations (criterion 16)', () => {
  it("an organization cannot view or modify another organization's agents", async () => {
    const a = await newCompany('OrgA');
    const b = await newCompany('OrgB');
    const agentA = await createAgent(h.db, a, {
      name: 'From A',
      access: { buyerLevel: 'negotiate' },
    });
    const { credentialId } = await issueCredential(h.db, a, agentA.id);

    await expectCode(getAgent(h.db, b, agentA.id), 'NOT_FOUND');
    await expectCode(
      setAgentAccess(h.db, b, agentA.id, { buyerLevel: 'full_autonomy' }),
      'NOT_FOUND',
    );
    await expectCode(issueCredential(h.db, b, agentA.id), 'NOT_FOUND');
    await expectCode(revokeCredential(h.db, b, agentA.id, credentialId), 'NOT_FOUND');
    await expectCode(disableAgent(h.db, b, agentA.id), 'NOT_FOUND');
    expect((await listAgents(h.db, b)).map((x) => x.id)).not.toContain(agentA.id);

    // Tampoco puede usar el id de su propio agente con una credencial ajena.
    const agentB = await createAgent(h.db, b, {
      name: 'From B',
      access: { buyerLevel: 'negotiate' },
    });
    await expectCode(revokeCredential(h.db, b, agentB.id, credentialId), 'NOT_FOUND');
  });

  it('a user cannot act in an organization they do not belong to', async () => {
    const a = await newCompany('Ajena');
    const b = await newCompany('Propia');
    await expectCode(resolveUserActor(h.db, b.userId, a.orgId), 'NOT_FOUND');
    await expectCode(resolveUserActor(h.db, b.userId, 'no-es-uuid'), 'NOT_FOUND');
  });
});
