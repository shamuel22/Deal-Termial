import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz } from './columns.js';
import { oauthAuthorizationStatus, oauthTokenKind } from './enums.js';
import { agentCredentials, agents, organizations, users } from './identity.js';

/**
 * Cliente OAuth registrado dinámicamente (RFC 7591) por una aplicación MCP.
 * `metadata` guarda la ficha completa que devuelve el registro, tal como la valida el SDK de MCP.
 */
export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: id(),
    clientId: text('client_id').notNull(),
    clientName: text('client_name'),
    redirectUris: text('redirect_uris').array().notNull(),
    metadata: jsonb('metadata').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('oauth_clients_client_id_uq').on(t.clientId)],
);

/**
 * Solicitud de autorización: nace pendiente al llegar a /authorize, el dueño elige el agente en la
 * consola y, al aprobarla, recibe un código de un solo uso (solo se guarda su hash).
 */
export const oauthAuthorizations = pgTable(
  'oauth_authorizations',
  {
    id: id(),
    clientId: text('client_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    state: text('state'),
    scopes: text('scopes').array().notNull(),
    resource: text('resource'),
    status: oauthAuthorizationStatus('status').notNull().default('pending'),
    orgId: uuid('org_id').references(() => organizations.id),
    agentId: uuid('agent_id').references(() => agents.id),
    credentialId: uuid('credential_id').references(() => agentCredentials.id),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    codeHash: text('code_hash'),
    expiresAt: tstz('expires_at').notNull(),
    decidedAt: tstz('decided_at'),
    exchangedAt: tstz('exchanged_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('oauth_authorizations_code_hash_uq').on(t.codeHash)],
);

/** Tokens de acceso y de renovación. Ligados a una credencial del agente: revocarla los invalida. */
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: id(),
    credentialId: uuid('credential_id')
      .notNull()
      .references(() => agentCredentials.id),
    clientId: text('client_id').notNull(),
    kind: oauthTokenKind('kind').notNull(),
    tokenHash: text('token_hash').notNull(),
    resource: text('resource'),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('oauth_tokens_hash_uq').on(t.tokenHash),
    index('oauth_tokens_credential_idx').on(t.credentialId),
  ],
);
