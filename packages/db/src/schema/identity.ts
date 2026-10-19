import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, money, tstz, updatedAt } from './columns.js';
import { buyerLevel, memberRole, sellerScope } from './enums.js';

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('USD'),
  // Límite mensual compartido por todos los agentes de la organización (periodos UTC). Null = sin límite.
  monthlySpendLimit: money('monthly_spend_limit'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    isOperator: boolean('is_operator').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)],
);

export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: memberRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('memberships_user_idx').on(t.userId)],
);

/** Sesiones del portal. Se guarda solo el hash del token de sesión. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sessions_token_hash_uq').on(t.tokenHash)],
);

/** Agente externo que actúa en nombre de una organización. */
export const agents = pgTable(
  'agents',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    description: text('description'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    disabledAt: tstz('disabled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('agents_org_idx').on(t.orgId)],
);

/** Credencial del agente para API/MCP. Solo se guarda el hash; el secreto se muestra una vez. */
export const agentCredentials = pgTable(
  'agent_credentials',
  {
    id: id(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    // Prefijo público para identificar la credencial en la consola sin revelar el secreto.
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    lastUsedAt: tstz('last_used_at'),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('agent_credentials_hash_uq').on(t.keyHash),
    index('agent_credentials_agent_idx').on(t.agentId),
  ],
);

/**
 * Concesión de acceso versionada. Cada cambio de nivel o facultades crea una versión nueva;
 * la vigente es la que no tiene `supersededAt`. Así la auditoría conserva qué nivel se aplicó.
 */
export const agentAccessGrants = pgTable(
  'agent_access_grants',
  {
    id: id(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    version: integer('version').notNull(),
    // Null = el agente no tiene facultades de compra.
    buyerLevel: buyerLevel('buyer_level'),
    sellerScopes: sellerScope('seller_scopes')
      .array()
      .notNull()
      .default(sql`'{}'`),
    grantedByUserId: uuid('granted_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    supersededAt: tstz('superseded_at'),
  },
  (t) => [
    uniqueIndex('agent_access_grants_version_uq').on(t.agentId, t.version),
    uniqueIndex('agent_access_grants_current_uq')
      .on(t.agentId)
      .where(sql`${t.supersededAt} is null`),
  ],
);
