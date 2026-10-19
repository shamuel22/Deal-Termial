import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, money, tstz, updatedAt } from './columns.js';
import {
  authorizationStatus,
  buyerLevel,
  changeRequestStatus,
  paymentConnectionStatus,
  paymentTokenScope,
  sellerAccountStatus,
} from './enums.js';
import { agents, organizations, users } from './identity.js';

/**
 * Autorización de compra (encargo). Las condiciones viven en versiones inmutables;
 * `currentVersion` apunta a la vigente. Un pedido registra la versión con la que se aceptó.
 */
export const purchaseAuthorizations = pgTable(
  'purchase_authorizations',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    status: authorizationStatus('status').notNull().default('pending'),
    currentVersion: integer('current_version').notNull().default(1),
    revokedAt: tstz('revoked_at'),
    revokedByUserId: uuid('revoked_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('purchase_authorizations_agent_idx').on(t.agentId, t.status)],
);

export const purchaseAuthorizationVersions = pgTable(
  'purchase_authorization_versions',
  {
    id: id(),
    authorizationId: uuid('authorization_id')
      .notNull()
      .references(() => purchaseAuthorizations.id),
    version: integer('version').notNull(),
    grantedByUserId: uuid('granted_by_user_id')
      .notNull()
      .references(() => users.id),
    // Nivel con el que se concedió; la verificación usa siempre el nivel vigente del agente.
    level: buyerLevel('level').notNull(),
    // Encargo en lenguaje natural, solo informativo: la autoridad está en los campos estructurados.
    mandate: text('mandate').notNull(),
    category: text('category').notNull(),
    // Atributos obligatorios estructurados (validados por el esquema de la categoría).
    requiredAttributes: jsonb('required_attributes').notNull(),
    quantityMin: integer('quantity_min').notNull(),
    quantityMax: integer('quantity_max').notNull(),
    unit: text('unit').notNull().default('unit'),
    // Null = cualquier proveedor.
    allowedSupplierOrgIds: uuid('allowed_supplier_org_ids').array(),
    budgetTotal: money('budget_total').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    deliveryAddress: jsonb('delivery_address').notNull(),
    deliverBy: date('deliver_by').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('purchase_authorization_versions_uq').on(t.authorizationId, t.version)],
);

/** Solicitud de cambio de permisos hecha por un agente; solo el dueño puede aprobarla. */
export const authorizationChangeRequests = pgTable(
  'authorization_change_requests',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    authorizationId: uuid('authorization_id').references(() => purchaseAuthorizations.id),
    proposal: jsonb('proposal').notNull(),
    reason: text('reason'),
    status: changeRequestStatus('status').notNull().default('pending'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
    reviewedAt: tstz('reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('authorization_change_requests_org_idx').on(t.orgId, t.status)],
);

/**
 * Autorización financiera del comprador (vault PayPal). Los identificadores de token se guardan
 * solo en el servidor y nunca se devuelven a agentes.
 */
export const paymentConnections = pgTable(
  'payment_connections',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    status: paymentConnectionStatus('status').notNull().default('not_connected'),
    scope: paymentTokenScope('scope').notNull(),
    // Para scope = merchant: el proveedor al que el token permite pagar.
    payeeMerchantId: text('payee_merchant_id'),
    setupTokenId: text('setup_token_id'),
    paymentTokenId: text('payment_token_id'),
    paypalCustomerId: text('paypal_customer_id'),
    payerEmail: text('payer_email'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    activatedAt: tstz('activated_at'),
    revokedAt: tstz('revoked_at'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payment_connections_org_idx').on(t.orgId, t.status),
    uniqueIndex('payment_connections_setup_token_uq')
      .on(t.setupTokenId)
      .where(sql`${t.setupTokenId} is not null`),
  ],
);

/** Conexión de cobro del proveedor (Partner Referrals). */
export const sellerAccounts = pgTable(
  'seller_accounts',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    status: sellerAccountStatus('status').notNull().default('not_connected'),
    trackingId: text('tracking_id').notNull(),
    merchantId: text('merchant_id'),
    paymentsReceivable: boolean('payments_receivable').notNull().default(false),
    primaryEmailConfirmed: boolean('primary_email_confirmed').notNull().default(false),
    grantedScopes: text('granted_scopes')
      .array()
      .notNull()
      .default(sql`'{}'`),
    lastCheckedAt: tstz('last_checked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('seller_accounts_org_uq').on(t.orgId),
    uniqueIndex('seller_accounts_tracking_uq').on(t.trackingId),
  ],
);
