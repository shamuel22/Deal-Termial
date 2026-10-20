import { pgEnum } from 'drizzle-orm/pg-core';

// Roles humanos dentro de una organización. El operador del servicio no pertenece a organizaciones.
export const memberRole = pgEnum('member_role', ['owner', 'admin', 'member']);

// Niveles de acceso del agente comprador (brief §3).
export const buyerLevel = pgEnum('buyer_level', ['search_only', 'negotiate', 'full_autonomy']);

// Facultades de venta, administradas por separado de las de compra (brief §3, §9).
export const sellerScope = pgEnum('seller_scope', [
  'publish_offers',
  'submit_quotes',
  'accept_terms',
  'approve_refunds',
]);

export const authorizationStatus = pgEnum('authorization_status', [
  'pending',
  'active',
  'revoked',
  'expired',
  'exhausted',
]);

export const changeRequestStatus = pgEnum('change_request_status', [
  'pending',
  'approved',
  'rejected',
]);

// Conexión financiera del comprador (brief §8).
export const paymentConnectionStatus = pgEnum('payment_connection_status', [
  'not_connected',
  'setup_pending',
  'active',
  'revoked',
  'needs_attention',
]);

// Alcance del token guardado: toda la plataforma o un único proveedor.
export const paymentTokenScope = pgEnum('payment_token_scope', ['platform', 'merchant']);

export const sellerAccountStatus = pgEnum('seller_account_status', [
  'not_connected',
  'pending',
  'active',
  'needs_attention',
]);

export const offerStatus = pgEnum('offer_status', ['draft', 'active', 'paused', 'archived']);

export const requestStatus = pgEnum('request_status', ['open', 'closed', 'cancelled', 'expired']);

export const negotiationStatus = pgEnum('negotiation_status', [
  'awaiting_supplier',
  'awaiting_buyer',
  'pending_owner_review',
  'agreed',
  'closed',
]);

// Una cotización del proveedor o una contrapropuesta del comprador.
export const quoteKind = pgEnum('quote_kind', ['quote', 'counter']);

export const quoteStatus = pgEnum('quote_status', [
  'proposed',
  'superseded',
  'accepted',
  'rejected',
  'expired',
]);

export const orderStatus = pgEnum('order_status', [
  'pending_review',
  'pending_payment',
  'paid',
  'cancelled',
  'expired',
]);

// Estado de entrega de demostración, independiente del comercial y del financiero (brief §5, §11).
export const deliveryStatus = pgEnum('delivery_status', ['not_shipped', 'shipped', 'delivered']);

export const paymentMode = pgEnum('payment_mode', ['manual', 'delegated']);

export const paymentStatus = pgEnum('payment_status', [
  'created',
  'processing',
  'requires_action',
  'completed',
  'failed',
  'unknown',
]);

export const refundStatus = pgEnum('refund_status', [
  'requested',
  'authorized',
  'processing',
  'completed',
  'failed',
]);

export const reservationStatus = pgEnum('reservation_status', [
  'active',
  'consumed',
  'released',
  'expired',
]);

export const actorType = pgEnum('actor_type', ['user', 'agent', 'system', 'paypal', 'operator']);

export const webhookStatus = pgEnum('webhook_status', [
  'received',
  'processed',
  'ignored',
  'failed',
]);

// Solicitud de autorización OAuth de un cliente MCP (claude.ai, ChatGPT…) hasta que se canjea su código.
export const oauthAuthorizationStatus = pgEnum('oauth_authorization_status', [
  'pending',
  'approved',
  'denied',
  'exchanged',
]);

export const oauthTokenKind = pgEnum('oauth_token_kind', ['access', 'refresh']);
