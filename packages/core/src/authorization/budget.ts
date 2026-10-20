import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import type { Executor, Tx } from '../db.js';
import { addMoney, gt, subMoney, toMoney } from '../money.js';

/**
 * Libro de presupuesto delegado (brief §4, §10).
 *
 * - Reservar: dentro de una transacción, bloquea la organización y el encargo (en ese orden,
 *   siempre, para evitar interbloqueos) y comprueba disponible = límite − (reservado + consumido).
 * - Consumir: un pago confirmado convierte la reserva en gasto. Lo consumido nunca se libera,
 *   ni siquiera ante un reembolso.
 * - Liberar: un fallo definitivo devuelve la reserva. Los pagos pendientes o de resultado
 *   incierto mantienen su reserva hasta reconciliarse.
 */

const COUNTED = ['active', 'consumed'] as const;

/** Mes UTC (YYYY-MM) al que se imputa un gasto. */
export function utcPeriod(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export interface ReserveArgs {
  orgId: string;
  authorizationId: string | null;
  orderId: string;
  amount: string;
  now: Date;
  /** Compras aceptadas por el dueño en el portal no consumen los límites delegados al agente. */
  enforceLimits: boolean;
}

export interface ReserveResult {
  reservationId: string;
  amount: string;
  authorizationAvailableAfter: string | null;
  monthlyAvailableAfter: string | null;
}

async function sumCounted(tx: Executor, where: ReturnType<typeof and>): Promise<string> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${schema.budgetReservations.amount}), 0)` })
    .from(schema.budgetReservations)
    .where(and(where, inArray(schema.budgetReservations.status, [...COUNTED])));
  return toMoney(row?.total ?? '0');
}

/** Presupuesto total del encargo según su versión vigente. */
async function authorizationBudget(tx: Executor, authorizationId: string): Promise<string> {
  const [row] = await tx
    .select({ budget: schema.purchaseAuthorizationVersions.budgetTotal })
    .from(schema.purchaseAuthorizations)
    .innerJoin(
      schema.purchaseAuthorizationVersions,
      and(
        eq(schema.purchaseAuthorizationVersions.authorizationId, schema.purchaseAuthorizations.id),
        eq(
          schema.purchaseAuthorizationVersions.version,
          schema.purchaseAuthorizations.currentVersion,
        ),
      ),
    )
    .where(eq(schema.purchaseAuthorizations.id, authorizationId));
  if (!row) throw new DomainError('AUTHORIZATION_NOT_FOUND', 'Authorization not found');
  return row.budget;
}

export async function reserveBudget(tx: Tx, args: ReserveArgs): Promise<ReserveResult> {
  const amount = toMoney(args.amount);
  if (!gt(amount, '0')) throw new Error('The amount to reserve must be positive');
  const period = utcPeriod(args.now);

  // 1. Bloqueos en orden fijo: organización, luego encargo.
  const [org] = await tx
    .select({ id: schema.organizations.id, monthlyLimit: schema.organizations.monthlySpendLimit })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, args.orgId))
    .for('no key update');
  if (!org) throw new DomainError('NOT_FOUND', 'Organization not found');
  if (args.authorizationId) {
    await tx
      .select({ id: schema.purchaseAuthorizations.id })
      .from(schema.purchaseAuthorizations)
      .where(
        and(
          eq(schema.purchaseAuthorizations.id, args.authorizationId),
          eq(schema.purchaseAuthorizations.orgId, args.orgId),
        ),
      )
      .for('no key update');
  }

  // 2. Idempotencia: un reintento para el mismo pedido devuelve la reserva existente.
  const [existing] = await tx
    .select()
    .from(schema.budgetReservations)
    .where(eq(schema.budgetReservations.orderId, args.orderId));
  if (existing && existing.status !== 'released') {
    if (existing.amount !== amount) {
      throw new DomainError(
        'INVALID_STATE',
        'The order already has a reservation for a different amount',
        {
          reserved: existing.amount,
          requested: amount,
        },
      );
    }
    return {
      reservationId: existing.id,
      amount: existing.amount,
      authorizationAvailableAfter: null,
      monthlyAvailableAfter: null,
    };
  }

  // 3. Disponible del encargo.
  let authorizationAvailableAfter: string | null = null;
  if (args.authorizationId) {
    const budget = await authorizationBudget(tx, args.authorizationId);
    const used = await sumCounted(
      tx,
      eq(schema.budgetReservations.authorizationId, args.authorizationId),
    );
    const available = subMoney(budget, used);
    if (args.enforceLimits && gt(amount, available)) {
      throw new DomainError(
        'BUDGET_EXCEEDED',
        `Total ${amount} exceeds the budget available to authorize (${available})`,
        {
          total: amount,
          available,
          budgetTotal: budget,
          reservedOrSpent: used,
        },
      );
    }
    authorizationAvailableAfter = subMoney(available, amount);
  }

  // 4. Disponible del límite mensual de la organización (periodo UTC).
  let monthlyAvailableAfter: string | null = null;
  if (org.monthlyLimit !== null) {
    const used = await sumCounted(
      tx,
      and(
        eq(schema.budgetReservations.orgId, args.orgId),
        eq(schema.budgetReservations.period, period),
      ),
    );
    const available = subMoney(org.monthlyLimit, used);
    if (args.enforceLimits && gt(amount, available)) {
      throw new DomainError(
        'MONTHLY_LIMIT_EXCEEDED',
        `Total ${amount} exceeds the monthly budget available to authorize (${available}) for ${period}`,
        { total: amount, available, monthlyLimit: org.monthlyLimit, period },
      );
    }
    monthlyAvailableAfter = subMoney(available, amount);
  }

  // 5. Registrar la reserva (o reactivar la liberada de este pedido).
  const values = {
    orgId: args.orgId,
    authorizationId: args.authorizationId,
    orderId: args.orderId,
    amount,
    period,
    status: 'active' as const,
    updatedAt: args.now,
  };
  const [row] = existing
    ? await tx
        .update(schema.budgetReservations)
        .set(values)
        .where(eq(schema.budgetReservations.id, existing.id))
        .returning({ id: schema.budgetReservations.id })
    : await tx
        .insert(schema.budgetReservations)
        .values(values)
        .returning({ id: schema.budgetReservations.id });

  return { reservationId: row!.id, amount, authorizationAvailableAfter, monthlyAvailableAfter };
}

/**
 * Pago confirmado: la reserva pasa a gasto consumido. Idempotente. Si el encargo queda sin
 * disponible por gasto consumido, se marca como agotado.
 */
export async function consumeBudget(tx: Tx, orderId: string, now: Date): Promise<void> {
  const [reservation] = await tx
    .select()
    .from(schema.budgetReservations)
    .where(eq(schema.budgetReservations.orderId, orderId))
    .for('no key update');
  if (!reservation) throw new Error(`Order ${orderId} has no budget reservation`);
  if (reservation.status === 'consumed') return;
  // Un pago confirmado después de liberar la reserva se registra igualmente como gasto.
  await tx
    .update(schema.budgetReservations)
    .set({ status: 'consumed', updatedAt: now })
    .where(eq(schema.budgetReservations.id, reservation.id));

  if (reservation.authorizationId) {
    const budget = await authorizationBudget(tx, reservation.authorizationId);
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${schema.budgetReservations.amount}), 0)` })
      .from(schema.budgetReservations)
      .where(
        and(
          eq(schema.budgetReservations.authorizationId, reservation.authorizationId),
          eq(schema.budgetReservations.status, 'consumed'),
        ),
      );
    if (!gt(budget, row?.total ?? '0')) {
      await tx
        .update(schema.purchaseAuthorizations)
        .set({ status: 'exhausted', updatedAt: now })
        .where(
          and(
            eq(schema.purchaseAuthorizations.id, reservation.authorizationId),
            eq(schema.purchaseAuthorizations.status, 'active'),
          ),
        );
    }
  }
}

/** Fallo definitivo o cancelación antes del pago: libera la reserva activa. Idempotente. */
export async function releaseBudget(tx: Tx, orderId: string, now: Date): Promise<void> {
  await tx
    .update(schema.budgetReservations)
    .set({ status: 'released', updatedAt: now })
    .where(
      and(
        eq(schema.budgetReservations.orderId, orderId),
        eq(schema.budgetReservations.status, 'active'),
      ),
    );
}

export interface BudgetSummary {
  limit: string;
  reserved: string;
  consumed: string;
  available: string;
}

async function summarize(
  db: Executor,
  limit: string,
  where: ReturnType<typeof and>,
): Promise<BudgetSummary> {
  const rows = await db
    .select({
      status: schema.budgetReservations.status,
      total: sql<string>`coalesce(sum(${schema.budgetReservations.amount}), 0)`,
    })
    .from(schema.budgetReservations)
    .where(where)
    .groupBy(schema.budgetReservations.status);
  const by = (s: string) => toMoney(rows.find((r) => r.status === s)?.total ?? '0');
  const reserved = by('active');
  const consumed = by('consumed');
  return {
    limit: toMoney(limit),
    reserved,
    consumed,
    available: subMoney(limit, addMoney(reserved, consumed)),
  };
}

export async function authorizationBudgetSummary(
  db: Executor,
  authorizationId: string,
): Promise<BudgetSummary> {
  const budget = await authorizationBudget(db, authorizationId);
  return summarize(db, budget, eq(schema.budgetReservations.authorizationId, authorizationId));
}

export async function monthlyBudgetSummary(
  db: Executor,
  orgId: string,
  now: Date,
): Promise<(BudgetSummary & { period: string }) | null> {
  const [org] = await db
    .select({ limit: schema.organizations.monthlySpendLimit })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId));
  if (!org || org.limit === null) return null;
  const period = utcPeriod(now);
  const summary = await summarize(
    db,
    org.limit,
    and(eq(schema.budgetReservations.orgId, orgId), eq(schema.budgetReservations.period, period)),
  );
  return { ...summary, period };
}
