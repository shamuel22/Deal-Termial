import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { inTransaction, type Executor, type Tx } from '../db.js';
import { requireAdmin, type AgentActor, type Actor, type BuyerLevel } from './actor.js';
import { agentActorForCredential, findOwnAgent, resolveAgentKey } from './agents.js';
import { randomToken, sha256 } from './secrets.js';

/**
 * Conexión de aplicaciones MCP por OAuth 2.1 (claude.ai, ChatGPT, Claude Code…).
 *
 * El dueño aprueba en la consola qué agente representa la aplicación. La aprobación crea una
 * credencial de ese agente (sin clave estática): el nivel, las autorizaciones y la revocación son las
 * mismas que con una clave `dtk_`. Códigos y tokens solo se guardan como hash.
 */

const CODE_PREFIX = 'dtc_';
const ACCESS_PREFIX = 'dto_';
const REFRESH_PREFIX = 'dtr_';
const REQUEST_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
export const OAUTH_ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_SCOPE = 'agent';

/** Ficha del cliente registrada dinámicamente (RFC 7591), tal como la valida el SDK de MCP. */
export interface OAuthClientInfo {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  [key: string]: unknown;
}

export interface OAuthTokenSet {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export async function registerOAuthClient(
  db: Executor,
  client: OAuthClientInfo,
): Promise<OAuthClientInfo> {
  await db.insert(schema.oauthClients).values({
    clientId: client.client_id,
    clientName: client.client_name ?? null,
    redirectUris: client.redirect_uris,
    metadata: client,
  });
  return client;
}

export async function getOAuthClient(
  db: Executor,
  clientId: string,
): Promise<OAuthClientInfo | undefined> {
  const [row] = await db
    .select({ metadata: schema.oauthClients.metadata })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.clientId, clientId));
  return row?.metadata as OAuthClientInfo | undefined;
}

/** Guarda la solicitud que llega a /authorize; la consola la muestra al dueño para que decida. */
export async function createOAuthAuthorization(
  db: Executor,
  input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state?: string;
    scopes: string[];
    resource?: string;
  },
  now = new Date(),
): Promise<string> {
  const [row] = await db
    .insert(schema.oauthAuthorizations)
    .values({
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      state: input.state ?? null,
      scopes: input.scopes,
      resource: input.resource ?? null,
      expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
    })
    .returning({ id: schema.oauthAuthorizations.id });
  return row!.id;
}

export interface OAuthAuthorizationView {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'exchanged' | 'expired';
  client: { name: string; redirectHost: string };
  /** Organizaciones donde el usuario puede conceder acceso, con sus agentes activos. */
  organizations: Array<{
    orgId: string;
    orgName: string;
    agents: Array<{
      id: string;
      name: string;
      buyerLevel: BuyerLevel | null;
      sellerScopes: string[];
    }>;
  }>;
}

async function findAuthorization(db: Executor, id: string, lock = false) {
  if (!z.uuid().safeParse(id).success) {
    throw new DomainError('NOT_FOUND', 'Authorization request not found');
  }
  const query = db
    .select()
    .from(schema.oauthAuthorizations)
    .where(eq(schema.oauthAuthorizations.id, id));
  const [row] = lock ? await query.for('no key update') : await query;
  if (!row) throw new DomainError('NOT_FOUND', 'Authorization request not found');
  return row;
}

function clientName(client: OAuthClientInfo | undefined): string {
  return client?.client_name?.trim() || 'An MCP application';
}

/** Lo que ve el dueño en la pantalla de consentimiento. */
export async function getOAuthAuthorization(
  db: Executor,
  userId: string,
  id: string,
  now = new Date(),
): Promise<OAuthAuthorizationView> {
  const row = await findAuthorization(db, id);
  const client = await getOAuthClient(db, row.clientId);
  const memberships = await db
    .select({ orgId: schema.organizations.id, orgName: schema.organizations.name })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .where(
      and(
        eq(schema.memberships.userId, userId),
        inArray(schema.memberships.role, ['owner', 'admin']),
      ),
    );
  const orgIds = memberships.map((m) => m.orgId);
  const agentRows = orgIds.length
    ? await db
        .select({
          id: schema.agents.id,
          orgId: schema.agents.orgId,
          name: schema.agents.name,
          buyerLevel: schema.agentAccessGrants.buyerLevel,
          sellerScopes: schema.agentAccessGrants.sellerScopes,
        })
        .from(schema.agents)
        .innerJoin(
          schema.agentAccessGrants,
          and(
            eq(schema.agentAccessGrants.agentId, schema.agents.id),
            isNull(schema.agentAccessGrants.supersededAt),
          ),
        )
        .where(and(inArray(schema.agents.orgId, orgIds), isNull(schema.agents.disabledAt)))
        .orderBy(schema.agents.name)
    : [];
  const expired = row.status === 'pending' && row.expiresAt <= now;
  return {
    id: row.id,
    status: expired ? 'expired' : row.status,
    client: { name: clientName(client), redirectHost: new URL(row.redirectUri).host },
    organizations: memberships.map((m) => ({
      ...m,
      agents: agentRows
        .filter((a) => a.orgId === m.orgId)
        .map(({ id, name, buyerLevel, sellerScopes }) => ({ id, name, buyerLevel, sellerScopes })),
    })),
  };
}

function redirectWith(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return url.href;
}

export type OAuthDecision = { approve: true; agentId: string } | { approve: false };

/**
 * El dueño (o un administrador) aprueba conectando la aplicación a un agente de `actor.orgId`, o la
 * rechaza. Devuelve la URL de vuelta a la aplicación con el código o con `access_denied`.
 */
export async function decideOAuthAuthorization(
  db: Executor,
  actor: Actor,
  id: string,
  decision: OAuthDecision,
  now = new Date(),
): Promise<{ redirectTo: string }> {
  const admin = requireAdmin(actor);
  return inTransaction(db, async (tx) => {
    const row = await findAuthorization(tx, id, true);
    if (row.status !== 'pending' || row.expiresAt <= now) {
      throw new DomainError(
        'INVALID_STATE',
        'This connection request was already used or has expired; start it again from the application',
      );
    }
    if (!decision.approve) {
      await tx
        .update(schema.oauthAuthorizations)
        .set({ status: 'denied', decidedByUserId: admin.userId, decidedAt: now })
        .where(eq(schema.oauthAuthorizations.id, row.id));
      return {
        redirectTo: redirectWith(row.redirectUri, {
          error: 'access_denied',
          error_description: 'The owner declined the connection',
          state: row.state,
        }),
      };
    }

    const agent = await findOwnAgent(tx, admin.orgId, decision.agentId);
    if (agent.disabledAt) throw new DomainError('INVALID_STATE', 'The agent is disabled');
    const client = await getOAuthClient(tx, row.clientId);
    const label = clientName(client);
    const [credential] = await tx
      .insert(schema.agentCredentials)
      .values({ agentId: agent.id, keyPrefix: 'oauth', label, oauthClientId: row.clientId })
      .returning({ id: schema.agentCredentials.id });
    const code = `${CODE_PREFIX}${randomToken(32)}`;
    await tx
      .update(schema.oauthAuthorizations)
      .set({
        status: 'approved',
        orgId: admin.orgId,
        agentId: agent.id,
        credentialId: credential!.id,
        decidedByUserId: admin.userId,
        decidedAt: now,
        codeHash: sha256(code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      })
      .where(eq(schema.oauthAuthorizations.id, row.id));
    await audit(tx, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'agent.credential_issued',
      resourceType: 'agent',
      resourceId: agent.id,
      outcome: 'succeeded',
      details: { credentialId: credential!.id, via: 'oauth', client: label },
    });
    return { redirectTo: redirectWith(row.redirectUri, { code, state: row.state }) };
  });
}

async function findCode(db: Executor, clientId: string, code: string, now: Date, lock = false) {
  const query = db
    .select()
    .from(schema.oauthAuthorizations)
    .where(eq(schema.oauthAuthorizations.codeHash, sha256(code)));
  const [row] = lock ? await query.for('no key update') : await query;
  if (!row || row.clientId !== clientId || row.status !== 'approved' || row.expiresAt <= now) {
    throw new DomainError('INVALID_STATE', 'Invalid, used or expired authorization code');
  }
  return row;
}

/** PKCE: el SDK compara el `code_verifier` con este desafío antes de canjear el código. */
export async function oauthCodeChallenge(
  db: Executor,
  clientId: string,
  code: string,
  now = new Date(),
): Promise<string> {
  return (await findCode(db, clientId, code, now)).codeChallenge;
}

async function issueTokens(
  tx: Tx,
  credentialId: string,
  clientId: string,
  resource: string | null,
  now: Date,
): Promise<OAuthTokenSet> {
  const access = `${ACCESS_PREFIX}${randomToken(32)}`;
  const refresh = `${REFRESH_PREFIX}${randomToken(32)}`;
  await tx.insert(schema.oauthTokens).values([
    {
      credentialId,
      clientId,
      kind: 'access',
      tokenHash: sha256(access),
      resource,
      expiresAt: new Date(now.getTime() + OAUTH_ACCESS_TTL_SECONDS * 1000),
    },
    {
      credentialId,
      clientId,
      kind: 'refresh',
      tokenHash: sha256(refresh),
      resource,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    },
  ]);
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: OAUTH_ACCESS_TTL_SECONDS,
    refresh_token: refresh,
    scope: OAUTH_SCOPE,
  };
}

/** La credencial sigue activa y su agente habilitado; si no, la conexión ya no vale. */
async function ensureCredentialUsable(db: Executor, credentialId: string): Promise<void> {
  await agentActorForCredential(db, credentialId);
}

/** Canjea el código (un solo uso) por tokens. `redirectUri` y `resource` deben coincidir si llegan. */
export async function exchangeOAuthCode(
  db: Executor,
  input: { clientId: string; code: string; redirectUri?: string; resource?: string },
  now = new Date(),
): Promise<OAuthTokenSet> {
  return inTransaction(db, async (tx) => {
    const row = await findCode(tx, input.clientId, input.code, now, true);
    if (input.redirectUri !== undefined && input.redirectUri !== row.redirectUri) {
      throw new DomainError(
        'INVALID_STATE',
        'redirect_uri does not match the authorization request',
      );
    }
    if (input.resource !== undefined && row.resource !== null && input.resource !== row.resource) {
      throw new DomainError('INVALID_STATE', 'resource does not match the authorization request');
    }
    await ensureCredentialUsable(tx, row.credentialId!);
    await tx
      .update(schema.oauthAuthorizations)
      .set({ status: 'exchanged', exchangedAt: now })
      .where(eq(schema.oauthAuthorizations.id, row.id));
    return issueTokens(tx, row.credentialId!, row.clientId, row.resource, now);
  });
}

/**
 * Renueva con rotación: el token usado queda revocado. Reutilizar uno ya revocado indica robo, así
 * que se cortan todos los tokens de esa conexión (la credencial sigue, el dueño puede revocarla).
 */
export async function refreshOAuthToken(
  db: Executor,
  input: { clientId: string; refreshToken: string },
  now = new Date(),
): Promise<OAuthTokenSet> {
  const outcome = await inTransaction(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.oauthTokens)
      .where(
        and(
          eq(schema.oauthTokens.tokenHash, sha256(input.refreshToken)),
          eq(schema.oauthTokens.kind, 'refresh'),
        ),
      )
      .for('no key update');
    if (!row || row.clientId !== input.clientId) return { error: 'invalid' as const };
    if (row.revokedAt) {
      await tx
        .update(schema.oauthTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(schema.oauthTokens.credentialId, row.credentialId),
            isNull(schema.oauthTokens.revokedAt),
          ),
        );
      return { error: 'reused' as const };
    }
    if (row.expiresAt <= now) return { error: 'invalid' as const };
    await ensureCredentialUsable(tx, row.credentialId);
    await tx
      .update(schema.oauthTokens)
      .set({ revokedAt: now })
      .where(eq(schema.oauthTokens.id, row.id));
    return { tokens: await issueTokens(tx, row.credentialId, row.clientId, row.resource, now) };
  });
  // El corte por reutilización debe quedar guardado: por eso el error se lanza fuera de la transacción.
  if ('error' in outcome)
    throw new DomainError('INVALID_STATE', 'Invalid or expired refresh token');
  return outcome.tokens;
}

/** Revocación pedida por la aplicación (RFC 7009). Un token desconocido no es un error. */
export async function revokeOAuthToken(
  db: Executor,
  input: { clientId: string; token: string },
  now = new Date(),
): Promise<void> {
  await db
    .update(schema.oauthTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.oauthTokens.tokenHash, sha256(input.token)),
        eq(schema.oauthTokens.clientId, input.clientId),
        isNull(schema.oauthTokens.revokedAt),
      ),
    );
}

export interface OAuthAccess {
  actor: AgentActor;
  clientId: string;
  expiresAt: Date;
  resource: string | null;
}

/** Valida un token de acceso OAuth y devuelve el agente con su nivel vigente. */
export async function resolveOAuthAccessToken(
  db: Executor,
  token: string,
  now = new Date(),
): Promise<OAuthAccess> {
  const [row] = await db
    .select()
    .from(schema.oauthTokens)
    .where(
      and(eq(schema.oauthTokens.tokenHash, sha256(token)), eq(schema.oauthTokens.kind, 'access')),
    );
  if (!row || row.revokedAt || row.expiresAt <= now) {
    throw new DomainError('UNAUTHENTICATED', 'Invalid or expired access token');
  }
  return {
    actor: await agentActorForCredential(db, row.credentialId),
    clientId: row.clientId,
    expiresAt: row.expiresAt,
    resource: row.resource,
  };
}

/** Credencial de agente en `Authorization: Bearer`: clave `dtk_` o token de acceso OAuth `dto_`. */
export async function resolveAgentBearer(db: Executor, token: string): Promise<AgentActor> {
  if (token.startsWith(ACCESS_PREFIX)) return (await resolveOAuthAccessToken(db, token)).actor;
  return resolveAgentKey(db, token);
}
