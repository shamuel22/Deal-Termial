import { z } from 'zod';
import type { Database } from '@deal/db';
import {
  acceptQuote,
  approveRefund,
  cancelOrder,
  cancelRequest,
  counterQuote,
  createOffer,
  createProduct,
  createRequest,
  executePurchase,
  findMatches,
  findMatchesForRequest,
  getAgentAuthorizationStatus,
  getNegotiation,
  getOrder,
  getQuotesForRequest,
  getRequest,
  inTransaction,
  listOrders,
  listOwnOffers,
  listPendingRefunds,
  listRefunds,
  listRequests,
  listSupplierNegotiations,
  rejectRefund,
  requestQuote,
  requestRefund,
  respondToCounterquote,
  setOfferStatus,
  submitChangeRequest,
  submitForReview,
  submitQuote,
  updateOffer,
  type AgentActor,
  type PaymentGateway,
} from '@deal/core';

/**
 * Catálogo de herramientas MCP (brief §9). Cada herramienta llama al mismo servicio de core que la
 * API REST: los permisos se aplican en el servidor y nunca dependen de lo que diga el modelo.
 * Los esquemas de entrada son deliberadamente simples (sin transformaciones) para que cualquier
 * cliente MCP los entienda; la validación estricta la hace core.
 */
export interface ToolContext {
  db: Database;
  gateway: PaymentGateway;
  agent: AgentActor;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  side: 'buyer' | 'supplier' | 'common';
  readOnly: boolean;
  input: z.ZodObject<z.ZodRawShape>;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

const id = (what: string) => z.string().describe(`${what} ID (UUID)`);
const money = (what: string) =>
  z.string().describe(`${what} in USD as a decimal string, e.g. "80.00"`);
const unitPrice = z
  .string()
  .describe('Unit price in USD with up to 4 decimal places, e.g. "0.2200"');
const isoDate = (what: string) => z.string().describe(`${what} (YYYY-MM-DD)`);
const idempotencyKey = z
  .string()
  .optional()
  .describe('Optional key: repeating the call with the same key returns the same result');

const constraint = z
  .record(z.string(), z.unknown())
  .describe('A constraint: {"eq": v} | {"in": [..]} | {"not_in": [..]} | {"min": n} | {"max": n}');
const requiredAttributes = z
  .record(z.string(), constraint)
  .describe(
    'Required food container attributes (food_containers): material (paper, kraft_paper, bagasse, pla, pp, pet, aluminum, foam_eps), capacity_oz, hot_food_safe, microwave_safe, has_lid, compartments, pack_size. Example: {"hot_food_safe":{"eq":true},"material":{"not_in":["foam_eps"]}}',
  );
const address = z
  .object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string().describe('US state code, e.g. "TX"'),
    postalCode: z.string(),
  })
  .describe('Delivery address in the US');

const t = <S extends z.ZodRawShape>(shape: S) => z.object(shape);

export const TOOLS: ToolDefinition[] = [
  // ---- Comunes ----
  {
    name: 'get_authorization_status',
    title: 'Check my permissions',
    description:
      'Get your access level (search_only, negotiate, full_autonomy), seller permissions, purchase authorizations with their available budgets, and whether PayPal consent exists. Call this first to learn what you can do. No secrets are included.',
    side: 'common',
    readOnly: true,
    input: t({}),
    run: ({ db, agent }) => getAgentAuthorizationStatus(db, agent),
  },
  {
    name: 'request_authorization_change',
    title: 'Request a permission change',
    description:
      'Propose a new authorization, an increase or an access level change to the owner. This grants nothing: the proposal awaits owner approval in the portal.',
    side: 'common',
    readOnly: false,
    input: t({
      kind: z.enum(['new_authorization', 'amend_authorization', 'change_level']),
      authorizationId: id('Authorization to extend').optional(),
      buyerLevel: z.enum(['search_only', 'negotiate', 'full_autonomy']).optional(),
      terms: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Complete proposed terms: mandate, category, requiredAttributes, quantityMin, quantityMax, budgetTotal, deliveryAddress, deliverBy, expiresAt (ISO with timezone).',
        ),
      reason: z.string().optional(),
    }),
    run: ({ db, agent }, a) => submitChangeRequest(db, agent, a as never),
  },

  // ---- Comprador ----
  {
    name: 'create_request',
    title: 'Save a purchase request',
    description:
      'Save a private purchase request without contacting suppliers (allowed at all access levels). If you have a purchase authorization, pass only authorizationId: its terms provide the criteria and your available budget sets the maximum.',
    side: 'buyer',
    readOnly: false,
    input: t({
      authorizationId: id('Your purchase authorization').optional(),
      criteria: z
        .object({
          category: z.literal('food_containers'),
          requiredAttributes: requiredAttributes.optional(),
          quantity: z.number().int(),
          deliveryAddress: address,
          deliverBy: isoDate('Delivery deadline'),
          maxTotal: money('Maximum total').optional(),
        })
        .optional()
        .describe('Criteria, only if you are not using authorizationId'),
      preferences: z
        .object({
          preferredMaterials: z.array(z.string()).optional(),
          notes: z.string().optional(),
        })
        .optional(),
    }),
    run: ({ db, agent }, a) => createRequest(db, agent, a as never),
  },
  {
    name: 'find_matches',
    title: 'Search and compare offers',
    description:
      'Search compatible published offers and compare totals (including shipping and tax), delivery, stock and unconfirmed attributes. Pass requestId to use a saved purchase request, or pass criteria. An offer over budget appears with budget.withinBudget=false: you can negotiate it.',
    side: 'buyer',
    readOnly: true,
    input: t({
      requestId: id('Saved purchase request').optional(),
      criteria: z
        .object({
          category: z.literal('food_containers'),
          requiredAttributes: requiredAttributes.optional(),
          quantity: z.number().int(),
          deliveryState: z.string().optional(),
          deliverBy: isoDate('Deadline').optional(),
          maxTotal: money('Maximum total').optional(),
        })
        .optional(),
      includeIncompatible: z
        .boolean()
        .optional()
        .describe('Also include incompatible offers with their reasons'),
    }),
    run: ({ db, agent }, a) => {
      const options = { includeIncompatible: a.includeIncompatible as boolean | undefined };
      return a.requestId
        ? findMatchesForRequest(db, agent, a.requestId as string, options)
        : findMatches(db, agent, a.criteria as never, options);
    },
  },
  {
    name: 'get_request',
    title: 'Get a purchase request',
    description:
      'Get one of your saved purchase requests. Without requestId, list all your requests.',
    side: 'buyer',
    readOnly: true,
    input: t({ requestId: id('Purchase request').optional() }),
    run: ({ db, agent }, a) =>
      a.requestId ? getRequest(db, agent, a.requestId as string) : listRequests(db, agent),
  },
  {
    name: 'cancel_request',
    title: 'Cancel a purchase request',
    description: 'Cancel an open purchase request.',
    side: 'buyer',
    readOnly: false,
    input: t({ requestId: id('Purchase request') }),
    run: ({ db, agent }, a) => cancelRequest(db, agent, a.requestId as string),
  },
  {
    name: 'request_quote',
    title: 'Request a quote',
    description:
      "Request a quote for an offer using your own purchase request (negotiate or full_autonomy access level). The supplier responds using its rules even if its agent is disconnected; if it cannot, the negotiation awaits the supplier's response. Repeating the call returns the same negotiation.",
    side: 'buyer',
    readOnly: false,
    input: t({
      requestId: id('Your purchase request'),
      offerId: id('Offer'),
      message: z.string().optional(),
    }),
    run: ({ db, agent }, a) => requestQuote(db, agent, a as never),
  },
  {
    name: 'counter_quote',
    title: 'Make a counterproposal',
    description:
      "Propose changes to the supplier's latest quote: unit price, quantity, waived shipping or date. The supplier accepts, counters with the best terms its rules permit, or leaves the negotiation pending. Check authorizationCheck in the response to see whether the terms now fit your purchase authorization.",
    side: 'buyer',
    readOnly: false,
    input: t({
      negotiationId: id('Negotiation'),
      unitPrice: unitPrice.optional(),
      quantity: z.number().int().optional(),
      waiveShipping: z.boolean().optional(),
      deliverBy: isoDate('New delivery date').optional(),
      message: z.string().optional(),
    }),
    run: ({ db, agent }, a) => {
      const { negotiationId, ...rest } = a;
      return counterQuote(db, agent, negotiationId as string, rest as never);
    },
  },
  {
    name: 'get_quotes',
    title: 'View quotes',
    description:
      'Get the version history for a negotiation (negotiationId) or all negotiations for a purchase request (requestId), including amounts, validity and checks against your purchase authorization.',
    side: 'common',
    readOnly: true,
    input: t({
      negotiationId: id('Negotiation').optional(),
      requestId: id('Purchase request').optional(),
    }),
    run: ({ db, agent }, a) =>
      a.negotiationId
        ? getNegotiation(db, agent, a.negotiationId as string)
        : getQuotesForRequest(db, agent, a.requestId as string),
  },
  {
    name: 'submit_for_review',
    title: 'Submit the final proposal to the owner',
    description:
      'negotiate access level: submit the latest quote as the final proposal for the owner to review, accept and pay in the portal. This creates no commitments.',
    side: 'buyer',
    readOnly: false,
    input: t({ negotiationId: id('Negotiation'), message: z.string().optional() }),
    run: ({ db, agent }, a) =>
      submitForReview(db, agent, a.negotiationId as string, {
        message: a.message as string | undefined,
      }),
  },
  {
    name: 'accept_quote',
    title: 'Accept a quote',
    description:
      'full_autonomy access level: accept the specified quote and create the order, reserving stock and budget. The server checks your access level, purchase authorization and all terms. Repeating the call returns the same order.',
    side: 'buyer',
    readOnly: false,
    input: t({
      negotiationId: id('Negotiation'),
      quoteId: id('Quote version to accept'),
      idempotencyKey,
    }),
    run: ({ db, agent }, a) => acceptQuote(db, agent, a as never),
  },
  {
    name: 'execute_purchase',
    title: 'Execute a purchase',
    description:
      'full_autonomy access level: accept (or retrieve) the order and execute the authorized payment. If no PayPal consent covers that supplier, the order remains accepted and awaits payment by the owner, who is notified (payment.status = owner_action_required). Never charges twice.',
    side: 'buyer',
    readOnly: false,
    input: t({
      orderId: id('Previously accepted order').optional(),
      negotiationId: id('Negotiation').optional(),
      quoteId: id('Quote version to accept').optional(),
      idempotencyKey,
    }),
    run: ({ db, gateway, agent }, a) => executePurchase(db, gateway, agent, a as never),
  },
  {
    name: 'get_order',
    title: 'Get an order',
    description:
      "Get an order's commercial, payment and delivery status. Without orderId, list your orders.",
    side: 'common',
    readOnly: true,
    input: t({
      orderId: id('Order').optional(),
      side: z.enum(['buyer', 'supplier']).optional(),
    }),
    run: ({ db, agent }, a) =>
      a.orderId
        ? getOrder(db, agent, a.orderId as string)
        : listOrders(db, agent, { side: a.side as never }),
  },
  {
    name: 'cancel_order',
    title: 'Cancel an order',
    description: 'Cancel an order before payment and release stock and budget.',
    side: 'buyer',
    readOnly: false,
    input: t({ orderId: id('Order'), reason: z.string().optional(), idempotencyKey }),
    run: ({ db, agent }, a) => cancelOrder(db, agent, a.orderId as string, a as never),
  },
  {
    name: 'request_refund',
    title: 'Request a refund',
    description:
      'Request a refund review for a paid order. The supplier decides; a refund does not restore delegated budget.',
    side: 'buyer',
    readOnly: false,
    input: t({
      orderId: id('Order'),
      amount: money('Amount').optional(),
      reason: z.string(),
      idempotencyKey,
    }),
    run: ({ db, agent }, a) => requestRefund(db, agent, a.orderId as string, a as never),
  },

  // ---- Proveedor ----
  {
    name: 'publish_offer',
    title: 'Publish an offer',
    description:
      'publish_offers permission: create a product with normalized attributes and its offer (quantity price tiers, stock, regions, lead times and private negotiation rules). The rules are never shown to buyers.',
    side: 'supplier',
    readOnly: false,
    input: t({
      product: z
        .object({
          sku: z.string(),
          name: z.string(),
          description: z.string().optional(),
          category: z.literal('food_containers'),
          attributes: z.record(z.string(), z.unknown()),
        })
        .describe(
          'Product; attributes: material, capacity_oz, hot_food_safe, microwave_safe?, has_lid, compartments?, pack_size',
        ),
      offer: z
        .record(z.string(), z.unknown())
        .describe(
          'Offer: status ("draft"|"active"), stockAvailable, minOrderQty, maxOrderQty?, shipRegions ["TX",...], leadTimeDays, shippingFlat "5.00", taxRate "0.0825", priceTiers [{minQty, unitPrice}], negotiationRules {autoRespond, maxDiscount "0.10", floorUnitPrice, minQtyForDiscount, minLeadTimeDays, canWaiveShipping, quoteValidityHours}',
        ),
    }),
    run: ({ db, agent }, a) =>
      inTransaction(db, async (tx) => {
        const product = await createProduct(tx, agent, a.product as never);
        return createOffer(tx, agent, { ...(a.offer as object), productId: product.id } as never);
      }),
  },
  {
    name: 'update_offer',
    title: 'Update an offer',
    description:
      'publish_offers permission: replace the terms of your own offer (new version), or pass only status to activate, pause or archive it.',
    side: 'supplier',
    readOnly: false,
    input: t({
      offerId: id('Offer'),
      status: z.enum(['active', 'paused', 'archived']).optional(),
      conditions: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Complete terms, as in publish_offer'),
    }),
    run: ({ db, agent }, a) =>
      a.conditions
        ? updateOffer(db, agent, a.offerId as string, a.conditions as never)
        : setOfferStatus(db, agent, a.offerId as string, a.status as never),
  },
  {
    name: 'list_my_offers',
    title: 'List my offers',
    description:
      'publish_offers permission: list your own offers with price tiers and private rules.',
    side: 'supplier',
    readOnly: true,
    input: t({}),
    run: ({ db, agent }) => listOwnOffers(db, agent),
  },
  {
    name: 'list_pending_negotiations',
    title: 'List pending negotiations',
    description:
      'List negotiations for your offers awaiting your response (or all negotiations with status "all"). Includes the trace of applied rules.',
    side: 'supplier',
    readOnly: true,
    input: t({
      status: z
        .string()
        .optional()
        .describe('awaiting_supplier (default), awaiting_buyer, agreed, closed or all'),
    }),
    run: ({ db, agent }, a) =>
      listSupplierNegotiations(
        db,
        agent,
        a.status === 'all' ? {} : { status: (a.status ?? 'awaiting_supplier') as never },
      ),
  },
  {
    name: 'submit_quote',
    title: 'Submit a quote',
    description:
      "submit_quotes permission: quote a pending negotiation. An agent cannot grant terms outside its offer's rules (minimum price, minimum lead time, shipping).",
    side: 'supplier',
    readOnly: false,
    input: t({
      negotiationId: id('Negotiation'),
      quantity: z.number().int(),
      unitPrice,
      waiveShipping: z.boolean().optional(),
      deliverBy: isoDate('Committed delivery date'),
      message: z.string().optional(),
    }),
    run: ({ db, agent }, a) => {
      const { negotiationId, ...rest } = a;
      return submitQuote(db, agent, negotiationId as string, rest as never);
    },
  },
  {
    name: 'respond_to_counterquote',
    title: 'Respond to a counterproposal',
    description:
      "Respond to the buyer's counterproposal: accept (accept_terms permission, within your rules), reject, or counter with new terms (submit_quotes).",
    side: 'supplier',
    readOnly: false,
    input: t({
      negotiationId: id('Negotiation'),
      action: z.enum(['accept', 'reject', 'counter']),
      message: z.string().optional(),
      terms: z
        .object({
          quantity: z.number().int(),
          unitPrice,
          waiveShipping: z.boolean().optional(),
          deliverBy: isoDate('Delivery'),
        })
        .optional()
        .describe('Only for counter'),
    }),
    run: ({ db, agent }, a) => {
      const { negotiationId, ...rest } = a;
      return respondToCounterquote(db, agent, negotiationId as string, rest as never);
    },
  },
  {
    name: 'list_refunds',
    title: 'Refunds',
    description:
      'With orderId: list refunds for that order. Without orderId: list refunds awaiting your decision as supplier.',
    side: 'common',
    readOnly: true,
    input: t({ orderId: id('Order').optional() }),
    run: ({ db, agent }, a) =>
      a.orderId ? listRefunds(db, agent, a.orderId as string) : listPendingRefunds(db, agent),
  },
  {
    name: 'approve_refund',
    title: 'Approve a refund',
    description:
      'approve_refunds permission: authorize the refund and the platform executes it in PayPal on your behalf.',
    side: 'supplier',
    readOnly: false,
    input: t({ refundId: id('Refund') }),
    run: ({ db, gateway, agent }, a) => approveRefund(db, gateway, agent, a.refundId as string),
  },
  {
    name: 'reject_refund',
    title: 'Reject a refund',
    description: 'approve_refunds permission: reject the request and provide a reason.',
    side: 'supplier',
    readOnly: false,
    input: t({ refundId: id('Refund'), reason: z.string() }),
    run: ({ db, agent }, a) => rejectRefund(db, agent, a.refundId as string, a.reason as string),
  },
];

/** Claves que nunca deben salir hacia un agente, aunque un servicio las devolviera por error. */
const SECRET_KEYS = new Set([
  'paymentTokenId',
  'setupTokenId',
  'paypalCustomerId',
  'apiKey',
  'keyHash',
  'tokenHash',
  'passwordHash',
]);

/** Saneado final de toda respuesta MCP (defensa en profundidad, brief §12). */
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEYS.has(key))
        .map(([key, v]) => [key, sanitize(v)]),
    );
  }
  return value;
}
