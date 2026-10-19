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

const id = (what: string) => z.string().describe(`ID (UUID) de ${what}`);
const money = (what: string) =>
  z.string().describe(`${what} en USD como texto decimal, p. ej. "80.00"`);
const unitPrice = z
  .string()
  .describe('Precio unitario en USD con hasta 4 decimales, p. ej. "0.2200"');
const isoDate = (what: string) => z.string().describe(`${what} (AAAA-MM-DD)`);
const idempotencyKey = z
  .string()
  .optional()
  .describe('Clave opcional: repetir la llamada con la misma clave devuelve el mismo resultado');

const constraint = z
  .record(z.string(), z.unknown())
  .describe(
    'Una restricción: {"eq": v} | {"in": [..]} | {"not_in": [..]} | {"min": n} | {"max": n}',
  );
const requiredAttributes = z
  .record(z.string(), constraint)
  .describe(
    'Atributos obligatorios de envases (food_containers): material (paper, kraft_paper, bagasse, pla, pp, pet, aluminum, foam_eps), capacity_oz, hot_food_safe, microwave_safe, has_lid, compartments, pack_size. Ej.: {"hot_food_safe":{"eq":true},"material":{"not_in":["foam_eps"]}}',
  );
const address = z
  .object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string().describe('Código de estado de EE. UU., p. ej. "TX"'),
    postalCode: z.string(),
  })
  .describe('Dirección de entrega en EE. UU.');

const t = <S extends z.ZodRawShape>(shape: S) => z.object(shape);

export const TOOLS: ToolDefinition[] = [
  // ---- Comunes ----
  {
    name: 'get_authorization_status',
    title: 'Estado de mis permisos',
    description:
      'Devuelve tu nivel de acceso (search_only, negotiate, full_autonomy), facultades de venta, autorizaciones de compra con su presupuesto disponible y si existe autorización financiera. Úsala primero para saber qué puedes hacer. No incluye secretos.',
    side: 'common',
    readOnly: true,
    input: t({}),
    run: ({ db, agent }) => getAgentAuthorizationStatus(db, agent),
  },
  {
    name: 'request_authorization_change',
    title: 'Solicitar cambio de permisos',
    description:
      'Propone al dueño una autorización nueva, una ampliación o un cambio de nivel. No concede nada: queda pendiente de que el dueño la apruebe en el portal.',
    side: 'common',
    readOnly: false,
    input: t({
      kind: z.enum(['new_authorization', 'amend_authorization', 'change_level']),
      authorizationId: id('la autorización a ampliar').optional(),
      buyerLevel: z.enum(['search_only', 'negotiate', 'full_autonomy']).optional(),
      terms: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Condiciones completas propuestas: mandate, category, requiredAttributes, quantityMin, quantityMax, budgetTotal, deliveryAddress, deliverBy, expiresAt (ISO con zona).',
        ),
      reason: z.string().optional(),
    }),
    run: ({ db, agent }, a) => submitChangeRequest(db, agent, a as never),
  },

  // ---- Comprador ----
  {
    name: 'create_request',
    title: 'Guardar necesidad de compra',
    description:
      'Guarda una necesidad privada sin contactar proveedores (permitido en todos los niveles). Si tienes una autorización de compra, pasa solo authorizationId: los criterios se toman de ella y el máximo es tu presupuesto disponible.',
    side: 'buyer',
    readOnly: false,
    input: t({
      authorizationId: id('tu autorización de compra').optional(),
      criteria: z
        .object({
          category: z.literal('food_containers'),
          requiredAttributes: requiredAttributes.optional(),
          quantity: z.number().int(),
          deliveryAddress: address,
          deliverBy: isoDate('Fecha límite de entrega'),
          maxTotal: money('Total máximo').optional(),
        })
        .optional()
        .describe('Criterios, solo si no usas authorizationId'),
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
    title: 'Buscar y comparar ofertas',
    description:
      'Busca ofertas publicadas compatibles y las compara con total (incluye transporte e impuestos), entrega, stock y atributos sin confirmar. Pasa requestId para usar una necesidad guardada, o criteria. Una oferta por encima del presupuesto aparece con budget.withinBudget=false: se puede negociar.',
    side: 'buyer',
    readOnly: true,
    input: t({
      requestId: id('una necesidad guardada').optional(),
      criteria: z
        .object({
          category: z.literal('food_containers'),
          requiredAttributes: requiredAttributes.optional(),
          quantity: z.number().int(),
          deliveryState: z.string().optional(),
          deliverBy: isoDate('Fecha límite').optional(),
          maxTotal: money('Total máximo').optional(),
        })
        .optional(),
      includeIncompatible: z
        .boolean()
        .optional()
        .describe('Incluir también las incompatibles con su motivo'),
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
    title: 'Consultar una necesidad',
    description: 'Consulta una de tus necesidades guardadas. Sin requestId, lista todas las tuyas.',
    side: 'buyer',
    readOnly: true,
    input: t({ requestId: id('la necesidad').optional() }),
    run: ({ db, agent }, a) =>
      a.requestId ? getRequest(db, agent, a.requestId as string) : listRequests(db, agent),
  },
  {
    name: 'cancel_request',
    title: 'Cancelar una necesidad',
    description: 'Cancela una necesidad abierta.',
    side: 'buyer',
    readOnly: false,
    input: t({ requestId: id('la necesidad') }),
    run: ({ db, agent }, a) => cancelRequest(db, agent, a.requestId as string),
  },
  {
    name: 'request_quote',
    title: 'Pedir cotización',
    description:
      'Pide cotización de una oferta para una necesidad tuya (nivel negotiate o full_autonomy). El proveedor responde con sus reglas aunque su agente no esté conectado; si no puede, queda pendiente de su respuesta. Repetir la llamada devuelve la misma negociación.',
    side: 'buyer',
    readOnly: false,
    input: t({
      requestId: id('tu necesidad'),
      offerId: id('la oferta'),
      message: z.string().optional(),
    }),
    run: ({ db, agent }, a) => requestQuote(db, agent, a as never),
  },
  {
    name: 'counter_quote',
    title: 'Contraofertar',
    description:
      'Propone cambios sobre la última cotización del proveedor: precio unitario, cantidad, bonificar transporte o fecha. El proveedor acepta, contraoferta con lo máximo que permiten sus reglas o deja la negociación pendiente. Revisa authorizationCheck en la respuesta para saber si ya cabe en tu autorización.',
    side: 'buyer',
    readOnly: false,
    input: t({
      negotiationId: id('la negociación'),
      unitPrice: unitPrice.optional(),
      quantity: z.number().int().optional(),
      waiveShipping: z.boolean().optional(),
      deliverBy: isoDate('Nueva fecha de entrega').optional(),
      message: z.string().optional(),
    }),
    run: ({ db, agent }, a) => {
      const { negotiationId, ...rest } = a;
      return counterQuote(db, agent, negotiationId as string, rest as never);
    },
  },
  {
    name: 'get_quotes',
    title: 'Ver cotizaciones',
    description:
      'Historial de versiones de una negociación (negotiationId) o de todas las negociaciones de una necesidad (requestId), con importes, vigencia y comprobación contra tu autorización.',
    side: 'common',
    readOnly: true,
    input: t({
      negotiationId: id('la negociación').optional(),
      requestId: id('la necesidad').optional(),
    }),
    run: ({ db, agent }, a) =>
      a.negotiationId
        ? getNegotiation(db, agent, a.negotiationId as string)
        : getQuotesForRequest(db, agent, a.requestId as string),
  },
  {
    name: 'submit_for_review',
    title: 'Enviar propuesta final al dueño',
    description:
      'Nivel negotiate: deja la última cotización como propuesta final para que el dueño la revise, acepte y pague en el portal. No crea compromisos.',
    side: 'buyer',
    readOnly: false,
    input: t({ negotiationId: id('la negociación'), message: z.string().optional() }),
    run: ({ db, agent }, a) =>
      submitForReview(db, agent, a.negotiationId as string, {
        message: a.message as string | undefined,
      }),
  },
  {
    name: 'accept_quote',
    title: 'Aceptar cotización',
    description:
      'Nivel full_autonomy: acepta la cotización indicada y crea el pedido, reservando stock y presupuesto. El servidor verifica tu nivel, tu autorización y todas las condiciones. Repetirla devuelve el mismo pedido.',
    side: 'buyer',
    readOnly: false,
    input: t({
      negotiationId: id('la negociación'),
      quoteId: id('la versión a aceptar'),
      idempotencyKey,
    }),
    run: ({ db, agent }, a) => acceptQuote(db, agent, a as never),
  },
  {
    name: 'execute_purchase',
    title: 'Ejecutar compra',
    description:
      'Nivel full_autonomy: acepta (o recupera) el pedido y ejecuta el pago autorizado. Si no hay autorización financiera para ese proveedor, el pedido queda aceptado y pendiente de pago del dueño, que es notificado (payment.status = owner_action_required). Nunca cobra dos veces.',
    side: 'buyer',
    readOnly: false,
    input: t({
      orderId: id('un pedido ya aceptado').optional(),
      negotiationId: id('la negociación').optional(),
      quoteId: id('la versión a aceptar').optional(),
      idempotencyKey,
    }),
    run: ({ db, gateway, agent }, a) => executePurchase(db, gateway, agent, a as never),
  },
  {
    name: 'get_order',
    title: 'Consultar pedido',
    description:
      'Estado comercial, financiero y de entrega de un pedido. Sin orderId, lista tus pedidos.',
    side: 'common',
    readOnly: true,
    input: t({
      orderId: id('el pedido').optional(),
      side: z.enum(['buyer', 'supplier']).optional(),
    }),
    run: ({ db, agent }, a) =>
      a.orderId
        ? getOrder(db, agent, a.orderId as string)
        : listOrders(db, agent, { side: a.side as never }),
  },
  {
    name: 'cancel_order',
    title: 'Cancelar pedido',
    description: 'Cancela un pedido antes del pago y libera stock y presupuesto.',
    side: 'buyer',
    readOnly: false,
    input: t({ orderId: id('el pedido'), reason: z.string().optional(), idempotencyKey }),
    run: ({ db, agent }, a) => cancelOrder(db, agent, a.orderId as string, a as never),
  },
  {
    name: 'request_refund',
    title: 'Solicitar devolución',
    description:
      'Solicita revisión de una devolución sobre un pedido pagado. El proveedor decide; un reembolso no devuelve presupuesto delegado.',
    side: 'buyer',
    readOnly: false,
    input: t({
      orderId: id('el pedido'),
      amount: money('Importe').optional(),
      reason: z.string(),
      idempotencyKey,
    }),
    run: ({ db, agent }, a) => requestRefund(db, agent, a.orderId as string, a as never),
  },

  // ---- Proveedor ----
  {
    name: 'publish_offer',
    title: 'Publicar oferta',
    description:
      'Facultad publish_offers: crea un producto con atributos normalizados y su oferta (tramos de precio por cantidad, stock, regiones, plazos y reglas privadas de negociación). Las reglas nunca se muestran a compradores.',
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
          'Producto; attributes: material, capacity_oz, hot_food_safe, microwave_safe?, has_lid, compartments?, pack_size',
        ),
      offer: z
        .record(z.string(), z.unknown())
        .describe(
          'Oferta: status ("draft"|"active"), stockAvailable, minOrderQty, maxOrderQty?, shipRegions ["TX",...], leadTimeDays, shippingFlat "5.00", taxRate "0.0825", priceTiers [{minQty, unitPrice}], negotiationRules {autoRespond, maxDiscount "0.10", floorUnitPrice, minQtyForDiscount, minLeadTimeDays, canWaiveShipping, quoteValidityHours}',
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
    title: 'Actualizar oferta',
    description:
      'Facultad publish_offers: reemplaza las condiciones de una oferta propia (nueva versión) o, con solo status, la activa, pausa o archiva.',
    side: 'supplier',
    readOnly: false,
    input: t({
      offerId: id('la oferta'),
      status: z.enum(['active', 'paused', 'archived']).optional(),
      conditions: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Condiciones completas, como en publish_offer'),
    }),
    run: ({ db, agent }, a) =>
      a.conditions
        ? updateOffer(db, agent, a.offerId as string, a.conditions as never)
        : setOfferStatus(db, agent, a.offerId as string, a.status as never),
  },
  {
    name: 'list_my_offers',
    title: 'Mis ofertas',
    description: 'Facultad publish_offers: ofertas propias con tramos y reglas privadas.',
    side: 'supplier',
    readOnly: true,
    input: t({}),
    run: ({ db, agent }) => listOwnOffers(db, agent),
  },
  {
    name: 'list_pending_negotiations',
    title: 'Negociaciones pendientes',
    description:
      'Negociaciones de tus ofertas que esperan tu respuesta (o todas con status "all"). Incluye la traza de reglas aplicadas.',
    side: 'supplier',
    readOnly: true,
    input: t({
      status: z
        .string()
        .optional()
        .describe('awaiting_supplier (por defecto), awaiting_buyer, agreed, closed o all'),
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
    title: 'Enviar cotización',
    description:
      'Facultad submit_quotes: cotiza una negociación pendiente. Un agente no puede conceder fuera de las reglas de su oferta (precio mínimo, plazo mínimo, transporte).',
    side: 'supplier',
    readOnly: false,
    input: t({
      negotiationId: id('la negociación'),
      quantity: z.number().int(),
      unitPrice,
      waiveShipping: z.boolean().optional(),
      deliverBy: isoDate('Fecha de entrega comprometida'),
      message: z.string().optional(),
    }),
    run: ({ db, agent }, a) => {
      const { negotiationId, ...rest } = a;
      return submitQuote(db, agent, negotiationId as string, rest as never);
    },
  },
  {
    name: 'respond_to_counterquote',
    title: 'Responder contrapropuesta',
    description:
      'Responde a la contrapropuesta del comprador: accept (facultad accept_terms, dentro de tus reglas), reject, o counter con nuevas condiciones (submit_quotes).',
    side: 'supplier',
    readOnly: false,
    input: t({
      negotiationId: id('la negociación'),
      action: z.enum(['accept', 'reject', 'counter']),
      message: z.string().optional(),
      terms: z
        .object({
          quantity: z.number().int(),
          unitPrice,
          waiveShipping: z.boolean().optional(),
          deliverBy: isoDate('Entrega'),
        })
        .optional()
        .describe('Solo para counter'),
    }),
    run: ({ db, agent }, a) => {
      const { negotiationId, ...rest } = a;
      return respondToCounterquote(db, agent, negotiationId as string, rest as never);
    },
  },
  {
    name: 'list_refunds',
    title: 'Devoluciones',
    description:
      'Con orderId: devoluciones de ese pedido. Sin orderId: devoluciones pendientes de tu decisión como proveedor.',
    side: 'common',
    readOnly: true,
    input: t({ orderId: id('el pedido').optional() }),
    run: ({ db, agent }, a) =>
      a.orderId ? listRefunds(db, agent, a.orderId as string) : listPendingRefunds(db, agent),
  },
  {
    name: 'approve_refund',
    title: 'Aprobar devolución',
    description:
      'Facultad approve_refunds: autoriza la devolución y la plataforma la ejecuta en PayPal en tu nombre.',
    side: 'supplier',
    readOnly: false,
    input: t({ refundId: id('la devolución') }),
    run: ({ db, gateway, agent }, a) => approveRefund(db, gateway, agent, a.refundId as string),
  },
  {
    name: 'reject_refund',
    title: 'Rechazar devolución',
    description: 'Facultad approve_refunds: rechaza la solicitud indicando el motivo.',
    side: 'supplier',
    readOnly: false,
    input: t({ refundId: id('la devolución'), reason: z.string() }),
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
