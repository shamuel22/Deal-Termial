import { randomUUID } from 'node:crypto';
import { and, eq, inArray, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { loadAuthorizationSnapshot } from '../authorization/authorizations.js';
import {
  assertBuyerAction,
  assertNoViolations,
  evaluatePurchase,
} from '../authorization/policy.js';
import { inTransaction, type Executor } from '../db.js';
import { actorRef, requireAdmin, type AgentActor, type UserActor } from '../identity/actor.js';
import { notify } from '../notifications/notify.js';
import {
  acceptQuote,
  getOrder,
  purchaseTermsOf,
  type OrderTerms,
  type OrderView,
} from '../orders/orders.js';
import {
  GatewayRejectedError,
  GatewayUnknownError,
  type GatewayOrder,
  type PaymentGateway,
} from './gateway.js';
import {
  activeAttempt,
  failAttempt,
  markAttempt,
  settleGatewayOrder,
  type AttemptRow,
} from './settle.js';

/**
 * Ejecución de pagos (brief §3, §8, §10).
 *
 * Patrón en tres pasos para no perder ni duplicar cobros:
 *  1. Transacción: bloquea el pedido, verifica y registra el intento con su clave de idempotencia.
 *  2. Llamada a PayPal sin bloqueos abiertos, con esa misma clave (PayPal-Request-Id).
 *  3. Transacción: aplica el resultado tras verificar importe, moneda y beneficiario.
 * Si el proceso cae entre 1 y 3, la reconciliación consulta PayPal antes de reintentar.
 */

export interface PaymentUrls {
  returnUrl: string;
  cancelUrl: string;
}

export interface PaymentSummary {
  status:
    'completed' | 'processing' | 'unknown' | 'requires_action' | 'failed' | 'owner_action_required';
  attemptId: string | null;
  mode: 'manual' | 'delegated' | null;
  approveUrl?: string | null;
  reason?: string;
  message?: string;
}

function summary(attempt: AttemptRow, extra: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    status: attempt.status === 'created' ? 'processing' : attempt.status,
    attemptId: attempt.id,
    mode: attempt.mode,
    ...(attempt.failureCode
      ? { reason: attempt.failureCode, message: attempt.failureMessage ?? undefined }
      : {}),
    ...extra,
  };
}

/** Aplica el resultado de una llamada a la pasarela o registra el fallo/incertidumbre. */
async function applyCall(
  db: Executor,
  attemptId: string,
  call: () => Promise<GatewayOrder>,
): Promise<AttemptRow> {
  try {
    const result = await call();
    if (result.capture) return settleGatewayOrder(db, attemptId, result);
    return markAttempt(db, attemptId, {
      status: result.status === 'COMPLETED' ? 'processing' : 'requires_action',
      paypalOrderId: result.id,
    });
  } catch (error) {
    if (error instanceof GatewayRejectedError) {
      return failAttempt(db, attemptId, {
        code: error.code,
        message: error.message,
        debugId: error.debugId,
        requiresAction: error.code === 'PAYER_ACTION_REQUIRED',
      });
    }
    if (error instanceof GatewayUnknownError) {
      return markAttempt(db, attemptId, { status: 'unknown', failureMessage: error.message });
    }
    throw error;
  }
}

function describe(order: { id: string; terms: unknown }): string {
  const t = order.terms as OrderTerms;
  return `Deal Terminal ${order.id.slice(0, 8)}: ${t.quantity} × ${String(t.product.name ?? 'producto')}`;
}

// ---------------------------------------------------------------------------
// Checkout manual (dueño)
// ---------------------------------------------------------------------------

/**
 * Inicia (o recupera) el checkout PayPal del dueño para un pedido pendiente de pago.
 * Devuelve el enlace de aprobación. No se ofrece a agentes (brief §9).
 */
export async function startCheckout(
  db: Executor,
  gateway: PaymentGateway,
  actor: UserActor,
  orderId: string,
  urls: PaymentUrls,
): Promise<PaymentSummary> {
  requireAdmin(actor);
  const prepared = await inTransaction(db, async (tx) => {
    if (!z.uuid().safeParse(orderId).success)
      throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.buyerOrgId, actor.orgId)))
      .for('no key update');
    if (!order) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
    const current = await activeAttempt(tx, order.id);
    // Un cobro automático que pidió acción en PayPal no impide que el dueño pague con checkout.
    const blocking =
      current && !(current.mode === 'delegated' && current.status === 'requires_action');
    if (current && blocking) return { order, attempt: current, fresh: false };
    if (order.status !== 'pending_payment') {
      throw new DomainError('INVALID_STATE', `El pedido está ${order.status}`);
    }
    if (!order.payeeMerchantId) {
      throw new DomainError(
        'SELLER_NOT_CONNECTED',
        'El proveedor no tiene una conexión de cobro PayPal activa',
      );
    }
    const [attempt] = await tx
      .insert(schema.paymentAttempts)
      .values({
        orderId: order.id,
        mode: 'manual',
        status: 'created',
        amount: order.total,
        currency: order.currency,
        payeeMerchantId: order.payeeMerchantId,
        requestId: randomUUID(),
      })
      .returning();
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'payment.checkout_started',
      resourceType: 'order',
      resourceId: order.id,
      outcome: 'succeeded',
      details: {
        attemptId: attempt!.id,
        amount: order.total,
        payeeMerchantId: order.payeeMerchantId,
      },
    });
    return { order, attempt: attempt!, fresh: true };
  });

  const { order, attempt } = prepared;
  if (!prepared.fresh) {
    if (attempt.status === 'requires_action' && attempt.paypalOrderId) {
      const existing = await gateway.getOrder(attempt.paypalOrderId);
      return summary(attempt, { approveUrl: existing.approveUrl });
    }
    return summary(attempt);
  }

  let approveUrl: string | null = null;
  const result = await applyCall(db, attempt.id, async () => {
    const created = await gateway.createCheckoutOrder({
      amount: order.total,
      currency: order.currency,
      payeeMerchantId: attempt.payeeMerchantId,
      referenceId: order.id,
      description: describe(order),
      requestId: attempt.requestId,
      ...urls,
    });
    approveUrl = created.approveUrl;
    return created;
  });
  return summary(result, { approveUrl });
}

/**
 * Retorno del checkout: el comprador aprobó en PayPal. Solo se captura si el pedido sigue
 * pendiente de pago; si venció o se canceló, no se mueve dinero.
 */
export async function completeCheckout(
  db: Executor,
  gateway: PaymentGateway,
  actor: UserActor,
  paypalOrderId: string,
): Promise<{ orderId: string; payment: PaymentSummary }> {
  requireAdmin(actor);
  const attempt = await inTransaction(db, async (tx) => {
    const [row] = await tx
      .select({ attempt: schema.paymentAttempts, order: schema.orders })
      .from(schema.paymentAttempts)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.paymentAttempts.orderId))
      .where(
        and(
          eq(schema.paymentAttempts.paypalOrderId, paypalOrderId),
          eq(schema.orders.buyerOrgId, actor.orgId),
        ),
      );
    if (!row) throw new DomainError('NOT_FOUND', 'Pago no encontrado');
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, row.order.id))
      .for('no key update');
    if (row.attempt.status !== 'requires_action' && row.attempt.status !== 'created')
      return { row: row.attempt, capture: false };
    if (order!.status !== 'pending_payment') {
      const failed = await failAttempt(tx, row.attempt.id, {
        code: 'ORDER_NOT_PAYABLE',
        message: `El pedido está ${order!.status}; no se capturó el pago`,
      });
      return { row: failed, capture: false };
    }
    // Pasa a "procesando" antes de capturar: impide cancelar o vencer el pedido mientras tanto.
    const [processing] = await tx
      .update(schema.paymentAttempts)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(schema.paymentAttempts.id, row.attempt.id))
      .returning();
    return { row: processing!, capture: true };
  });

  const final = attempt.capture
    ? await applyCall(db, attempt.row.id, () =>
        gateway.captureOrder(paypalOrderId, `${attempt.row.requestId}:capture`),
      )
    : attempt.row;
  return { orderId: final.orderId, payment: summary(final) };
}

// ---------------------------------------------------------------------------
// execute_purchase (agente con autonomía total)
// ---------------------------------------------------------------------------

export const executePurchaseInput = z.union([
  z.object({ orderId: z.uuid(), idempotencyKey: z.string().min(1).max(200).optional() }),
  z.object({
    negotiationId: z.uuid(),
    quoteId: z.uuid(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  }),
]);
export type ExecutePurchaseInput = z.input<typeof executePurchaseInput>;

/** Autorización financiera activa cuyo alcance cubre al proveedor del pedido. */
async function financialAuthorizationFor(db: Executor, orgId: string, payeeMerchantId: string) {
  const [connection] = await db
    .select()
    .from(schema.paymentConnections)
    .where(
      and(
        eq(schema.paymentConnections.orgId, orgId),
        eq(schema.paymentConnections.status, 'active'),
        or(
          eq(schema.paymentConnections.scope, 'platform'),
          and(
            eq(schema.paymentConnections.scope, 'merchant'),
            eq(schema.paymentConnections.payeeMerchantId, payeeMerchantId),
          ),
        ),
      ),
    )
    .limit(1);
  return connection?.paymentTokenId ? connection : null;
}

/**
 * `execute_purchase`: acepta (o recupera) el pedido y ejecuta el pago autorizado.
 *
 * Verifica la delegación al aceptar y otra vez antes de pagar. Si no hay autorización
 * financiera que cubra al proveedor, el pedido queda pendiente de pago del dueño (no es un
 * error: el encargo sigue su curso). Reintentar nunca genera un segundo cobro.
 */
export async function executePurchase(
  db: Executor,
  gateway: PaymentGateway,
  actor: AgentActor,
  input: ExecutePurchaseInput,
  now = new Date(),
): Promise<{ order: OrderView; payment: PaymentSummary }> {
  const data = executePurchaseInput.parse(input);
  assertBuyerAction(actor, 'execute_payment');
  const orderId =
    'orderId' in data
      ? (await getOrder(db, actor, data.orderId)).id
      : (
          await acceptQuote(
            db,
            actor,
            {
              negotiationId: data.negotiationId,
              quoteId: data.quoteId,
              idempotencyKey: data.idempotencyKey,
            },
            now,
          )
        ).id;

  type Prepared =
    | { kind: 'existing'; attempt: AttemptRow }
    | { kind: 'owner'; reason: string; message: string }
    | {
        kind: 'charge';
        attempt: AttemptRow;
        vaultId: string;
        order: typeof schema.orders.$inferSelect;
      };

  const prepared = await inTransaction(db, async (tx): Promise<Prepared> => {
    // Orden de bloqueo: organización → autorización → pedido.
    await tx
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, actor.orgId))
      .for('no key update');
    const [ref] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (ref?.authorizationId) {
      await tx
        .select({ id: schema.purchaseAuthorizations.id })
        .from(schema.purchaseAuthorizations)
        .where(eq(schema.purchaseAuthorizations.id, ref.authorizationId))
        .for('no key update');
    }
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .for('no key update');
    if (!order) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');

    const current = await activeAttempt(tx, order.id);
    if (current) return { kind: 'existing', attempt: current };
    if (order.status !== 'pending_payment')
      throw new DomainError('INVALID_STATE', `El pedido está ${order.status}`);
    if (order.paymentMode !== 'delegated' || !order.authorizationId) {
      throw new DomainError('FORBIDDEN', 'Este pedido requiere el pago del dueño desde el portal');
    }

    // Segunda verificación de la delegación, inmediatamente antes de pagar.
    const authorization = await loadAuthorizationSnapshot(
      tx,
      actor.orgId,
      order.authorizationId,
      now,
    );
    if (authorization.agentId !== actor.agentId)
      throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
    assertNoViolations(
      evaluatePurchase(
        authorization,
        purchaseTermsOf(order.terms as OrderTerms, order.supplierOrgId),
        now,
      ),
    );

    if (!order.payeeMerchantId) {
      throw new DomainError(
        'SELLER_NOT_CONNECTED',
        'El proveedor no tiene una conexión de cobro PayPal activa',
      );
    }
    const connection = await financialAuthorizationFor(tx, actor.orgId, order.payeeMerchantId);
    if (!connection) {
      await notify(tx, {
        orgId: actor.orgId,
        kind: 'order.owner_payment_required',
        title: 'Pedido aceptado por tu agente: completa el pago',
        body: `Tu agente aceptó un pedido de ${order.total} ${order.currency} dentro de su autorización. Falta la autorización financiera para pagarlo automáticamente; págalo desde el portal.`,
        resourceType: 'order',
        resourceId: order.id,
      });
      await audit(tx, {
        orgId: actor.orgId,
        ...actorRef(actor),
        action: 'payment.owner_action_required',
        resourceType: 'order',
        resourceId: order.id,
        outcome: 'allowed',
        details: { reason: 'PAYMENT_CONNECTION_INACTIVE', payeeMerchantId: order.payeeMerchantId },
      });
      return {
        kind: 'owner',
        reason: 'PAYMENT_CONNECTION_INACTIVE',
        message:
          'No hay autorización financiera PayPal que cubra a este proveedor. El pedido queda pendiente de pago del dueño, que fue notificado.',
      };
    }

    const [attempt] = await tx
      .insert(schema.paymentAttempts)
      .values({
        orderId: order.id,
        mode: 'delegated',
        status: 'processing',
        amount: order.total,
        currency: order.currency,
        payeeMerchantId: order.payeeMerchantId,
        paymentConnectionId: connection.id,
        requestId: randomUUID(),
      })
      .returning();
    await audit(tx, {
      orgId: actor.orgId,
      ...actorRef(actor),
      action: 'payment.dispatched',
      resourceType: 'order',
      resourceId: order.id,
      outcome: 'allowed',
      details: {
        attemptId: attempt!.id,
        amount: order.total,
        payeeMerchantId: order.payeeMerchantId,
        authorization: { id: authorization.id, version: authorization.version },
        financialAuthorization: { id: connection.id, scope: connection.scope },
      },
    });
    return { kind: 'charge', attempt: attempt!, vaultId: connection.paymentTokenId!, order };
  });

  let payment: PaymentSummary;
  if (prepared.kind === 'existing') payment = summary(prepared.attempt);
  else if (prepared.kind === 'owner') {
    payment = {
      status: 'owner_action_required',
      attemptId: null,
      mode: null,
      reason: prepared.reason,
      message: prepared.message,
    };
  } else {
    const { attempt, order, vaultId } = prepared;
    const result = await applyCall(db, attempt.id, () =>
      gateway.createVaultOrder({
        amount: attempt.amount,
        currency: attempt.currency,
        payeeMerchantId: attempt.payeeMerchantId,
        referenceId: order.id,
        description: describe(order),
        requestId: attempt.requestId,
        vaultId,
      }),
    );
    payment = summary(result);
  }
  return { order: await getOrder(db, actor, orderId), payment };
}

// ---------------------------------------------------------------------------
// Reconciliación
// ---------------------------------------------------------------------------

/**
 * Reconcilia un intento consultando PayPal (fuente de verdad) antes de cualquier reintento.
 * Para pagos delegados sin respuesta, repite la creación con la misma clave de idempotencia:
 * PayPal devuelve la orden original en lugar de cobrar de nuevo.
 */
export async function reconcileAttempt(
  db: Executor,
  gateway: PaymentGateway,
  attemptId: string,
): Promise<AttemptRow> {
  const [row] = await db
    .select({
      attempt: schema.paymentAttempts,
      order: schema.orders,
      connection: schema.paymentConnections,
    })
    .from(schema.paymentAttempts)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.paymentAttempts.orderId))
    .leftJoin(
      schema.paymentConnections,
      eq(schema.paymentConnections.id, schema.paymentAttempts.paymentConnectionId),
    )
    .where(eq(schema.paymentAttempts.id, attemptId));
  if (!row) throw new Error(`Intento ${attemptId} inexistente`);
  const { attempt, order, connection } = row;
  if (attempt.status === 'completed' || attempt.status === 'failed') return attempt;

  if (attempt.paypalOrderId) {
    return applyCall(db, attempt.id, async () => {
      const current = await gateway.getOrder(attempt.paypalOrderId!);
      // Aprobada en PayPal pero sin capturar (el comprador no volvió): se captura si procede.
      if (
        current.status === 'APPROVED' &&
        attempt.mode === 'manual' &&
        order.status === 'pending_payment'
      ) {
        return gateway.captureOrder(current.id, `${attempt.requestId}:capture`);
      }
      return current;
    });
  }
  if (attempt.mode === 'delegated' && connection?.paymentTokenId) {
    return applyCall(db, attempt.id, () =>
      gateway.createVaultOrder({
        amount: attempt.amount,
        currency: attempt.currency,
        payeeMerchantId: attempt.payeeMerchantId,
        referenceId: order.id,
        description: describe(order),
        requestId: attempt.requestId,
        vaultId: connection.paymentTokenId!,
      }),
    );
  }
  return failAttempt(db, attempt.id, {
    code: 'NOT_CREATED',
    message: 'La orden de PayPal no llegó a crearse',
  });
}

/** Barrido periódico: intentos en curso o inciertos con más de `olderThanMs` de antigüedad. */
export async function reconcilePendingPayments(
  db: Executor,
  gateway: PaymentGateway,
  now: Date,
  olderThanMs = 60_000,
): Promise<number> {
  const rows = await db
    .select({ id: schema.paymentAttempts.id })
    .from(schema.paymentAttempts)
    .where(
      and(
        inArray(schema.paymentAttempts.status, [
          'created',
          'processing',
          'unknown',
          'requires_action',
        ]),
        lte(schema.paymentAttempts.updatedAt, new Date(now.getTime() - olderThanMs)),
      ),
    );
  let reconciled = 0;
  for (const { id } of rows) {
    try {
      await reconcileAttempt(db, gateway, id);
      reconciled += 1;
    } catch {
      // Se reintentará en el siguiente barrido; el estado sigue reservado.
    }
  }
  return reconciled;
}

/** Intento asociado a una orden de PayPal (para webhooks). */
export async function attemptByPayPalOrder(
  db: Executor,
  paypalOrderId: string,
): Promise<AttemptRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.paymentAttempts)
    .where(eq(schema.paymentAttempts.paypalOrderId, paypalOrderId));
  return row;
}

/**
 * Estado de las dos autorizaciones del dueño (brief §13): comercial (por agente) y financiera.
 * Sin identificadores de tokens. Explica cuándo el pago automático no está disponible.
 */
export async function getFinancialStatus(db: Executor, actor: UserActor) {
  requireAdmin(actor);
  const connections = await db
    .select({
      id: schema.paymentConnections.id,
      status: schema.paymentConnections.status,
      scope: schema.paymentConnections.scope,
      payeeMerchantId: schema.paymentConnections.payeeMerchantId,
      payerEmail: schema.paymentConnections.payerEmail,
      activatedAt: schema.paymentConnections.activatedAt,
      revokedAt: schema.paymentConnections.revokedAt,
      lastError: schema.paymentConnections.lastError,
    })
    .from(schema.paymentConnections)
    .where(eq(schema.paymentConnections.orgId, actor.orgId));
  const active = connections.filter((c) => c.status === 'active');
  return {
    automaticPayment: {
      available: active.length > 0,
      explanation:
        active.length > 0
          ? 'Hay autorización financiera activa: los agentes con autonomía total pueden pagar sin checkout a los proveedores cubiertos.'
          : 'PayPal no ofrece hoy el guardado de medios de pago a nivel plataforma para pagar a varios vendedores. Tus agentes con autonomía total negocian, aceptan y reservan; tú completas el pago con un checkout de un clic.',
    },
    connections,
  };
}
