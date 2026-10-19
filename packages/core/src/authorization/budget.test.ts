import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@deal/db';
import { createTestDatabase } from '@deal/db/testing';
import { DomainError } from '@deal/shared';
import { createAuthorization, getAuthorization, setMonthlyLimit } from './authorizations.js';
import {
  authorizationBudgetSummary,
  consumeBudget,
  monthlyBudgetSummary,
  releaseBudget,
  reserveBudget,
  utcPeriod,
} from './budget.js';
import { demoTerms, newAgent, newCompany, newOrder } from '../testing/fixtures.js';

let h: DbHandle;
const NOW = new Date('2026-10-20T12:00:00Z');

beforeAll(async () => {
  h = await createTestDatabase();
});

afterAll(async () => {
  await h?.close();
});

async function scenario(budget = '80.00') {
  const owner = await newCompany(h.db);
  const agent = await newAgent(h.db, owner, 'full_autonomy');
  const auth = await createAuthorization(
    h.db,
    owner,
    { agentId: agent.agentId, terms: demoTerms({ budgetTotal: budget }) },
    NOW,
  );
  return { owner, agent, auth };
}

function reserve(
  orgId: string,
  authorizationId: string | null,
  orderId: string,
  amount: string,
  enforceLimits = true,
) {
  return h.db.transaction((tx) =>
    reserveBudget(tx, { orgId, authorizationId, orderId, amount, now: NOW, enforceLimits }),
  );
}

async function errorCode(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  return e instanceof DomainError ? e.code : e;
}

describe('libro de presupuesto', () => {
  it('reserva dentro del encargo y rechaza lo que exceda el disponible', async () => {
    const { owner, auth } = await scenario();
    const o1 = await newOrder(h.db, owner.orgId, '50.00');
    const o2 = await newOrder(h.db, owner.orgId, '30.01');

    const r1 = await reserve(owner.orgId, auth.id, o1, '50.00');
    expect(r1.authorizationAvailableAfter).toBe('30.00');
    expect(await errorCode(reserve(owner.orgId, auth.id, o2, '30.01'))).toBe('BUDGET_EXCEEDED');

    expect(await authorizationBudgetSummary(h.db, auth.id)).toEqual({
      limit: '80.00',
      reserved: '50.00',
      consumed: '0.00',
      available: '30.00',
    });
  });

  it('reintentar la reserva del mismo pedido no duplica (criterio 12)', async () => {
    const { owner, auth } = await scenario();
    const order = await newOrder(h.db, owner.orgId, '40.00');
    const a = await reserve(owner.orgId, auth.id, order, '40.00');
    const b = await reserve(owner.orgId, auth.id, order, '40.00');
    expect(b.reservationId).toBe(a.reservationId);
    expect((await authorizationBudgetSummary(h.db, auth.id)).reserved).toBe('40.00');
    expect(await errorCode(reserve(owner.orgId, auth.id, order, '41.00'))).toBe('INVALID_STATE');
  });

  it('consumir registra gasto; liberar devuelve solo reservas activas', async () => {
    const { owner, auth } = await scenario();
    const paid = await newOrder(h.db, owner.orgId, '30.00');
    const failed = await newOrder(h.db, owner.orgId, '20.00');
    await reserve(owner.orgId, auth.id, paid, '30.00');
    await reserve(owner.orgId, auth.id, failed, '20.00');

    await h.db.transaction((tx) => consumeBudget(tx, paid, NOW));
    await h.db.transaction((tx) => releaseBudget(tx, failed, NOW));
    // Liberar un pedido ya pagado no tiene efecto: lo consumido no vuelve.
    await h.db.transaction((tx) => releaseBudget(tx, paid, NOW));

    expect(await authorizationBudgetSummary(h.db, auth.id)).toEqual({
      limit: '80.00',
      reserved: '0.00',
      consumed: '30.00',
      available: '50.00',
    });
  });

  it('un pago de resultado incierto conserva la reserva hasta reconciliar (criterio 13)', async () => {
    const { owner, auth } = await scenario();
    const uncertain = await newOrder(h.db, owner.orgId, '70.00');
    const other = await newOrder(h.db, owner.orgId, '20.00');
    await reserve(owner.orgId, auth.id, uncertain, '70.00');
    // Mientras no se reconcilie, el disponible sigue descontado.
    expect(await errorCode(reserve(owner.orgId, auth.id, other, '20.00'))).toBe('BUDGET_EXCEEDED');
  });

  it('agotar el encargo con gasto confirmado lo marca como agotado', async () => {
    const { owner, auth } = await scenario('50.00');
    const order = await newOrder(h.db, owner.orgId, '50.00');
    await reserve(owner.orgId, auth.id, order, '50.00');
    await h.db.transaction((tx) => consumeBudget(tx, order, NOW));
    expect((await getAuthorization(h.db, owner, auth.id, NOW)).status).toBe('exhausted');
  });

  it('el límite mensual se comparte entre encargos y agentes de la organización', async () => {
    const owner = await newCompany(h.db);
    await setMonthlyLimit(h.db, owner, { monthlySpendLimit: '100.00' });
    const a1 = await newAgent(h.db, owner, 'full_autonomy');
    const a2 = await newAgent(h.db, owner, 'full_autonomy');
    const auth1 = await createAuthorization(
      h.db,
      owner,
      { agentId: a1.agentId, terms: demoTerms() },
      NOW,
    );
    const auth2 = await createAuthorization(
      h.db,
      owner,
      { agentId: a2.agentId, terms: demoTerms() },
      NOW,
    );

    await reserve(owner.orgId, auth1.id, await newOrder(h.db, owner.orgId, '70.00'), '70.00');
    expect(
      await errorCode(
        reserve(owner.orgId, auth2.id, await newOrder(h.db, owner.orgId, '40.00'), '40.00'),
      ),
    ).toBe('MONTHLY_LIMIT_EXCEEDED');

    expect(await monthlyBudgetSummary(h.db, owner.orgId, NOW)).toEqual({
      period: '2026-10',
      limit: '100.00',
      reserved: '70.00',
      consumed: '0.00',
      available: '30.00',
    });
    // Otro mes UTC tiene su propio límite.
    expect(
      (await monthlyBudgetSummary(h.db, owner.orgId, new Date('2026-11-01T00:00:00Z')))!.available,
    ).toBe('100.00');
  });

  it('los periodos se calculan en UTC', () => {
    expect(utcPeriod(new Date('2026-10-31T23:59:59-05:00'))).toBe('2026-11');
    expect(utcPeriod(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11');
  });

  it('las compras aceptadas por el dueño no se limitan por el presupuesto delegado', async () => {
    const { owner, auth } = await scenario();
    const order = await newOrder(h.db, owner.orgId, '95.00');
    await expect(reserve(owner.orgId, auth.id, order, '95.00', false)).resolves.toMatchObject({
      amount: '95.00',
    });
  });
});

describe('concurrencia (criterio 11)', () => {
  it('dos compras simultáneas que juntas superan el encargo: solo una reserva', async () => {
    const { owner, auth } = await scenario();
    const orders = await Promise.all([
      newOrder(h.db, owner.orgId, '50.00'),
      newOrder(h.db, owner.orgId, '50.00'),
    ]);
    const results = await Promise.allSettled(
      orders.map((o) => reserve(owner.orgId, auth.id, o, '50.00')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as DomainError).code).toBe('BUDGET_EXCEEDED');
    expect((await authorizationBudgetSummary(h.db, auth.id)).reserved).toBe('50.00');
  });

  it('diez intentos simultáneos de 20.00 sobre 80.00: exactamente cuatro reservan', async () => {
    const { owner, auth } = await scenario();
    const orders = await Promise.all(
      Array.from({ length: 10 }, () => newOrder(h.db, owner.orgId, '20.00')),
    );
    const results = await Promise.allSettled(
      orders.map((o) => reserve(owner.orgId, auth.id, o, '20.00')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    expect(await authorizationBudgetSummary(h.db, auth.id)).toMatchObject({
      reserved: '80.00',
      available: '0.00',
    });
  });

  it('dos agentes con encargos distintos no exceden juntos el límite mensual', async () => {
    const owner = await newCompany(h.db);
    await setMonthlyLimit(h.db, owner, { monthlySpendLimit: '100.00' });
    const auths = await Promise.all(
      [0, 1].map(async () => {
        const agent = await newAgent(h.db, owner, 'full_autonomy');
        return createAuthorization(
          h.db,
          owner,
          { agentId: agent.agentId, terms: demoTerms() },
          NOW,
        );
      }),
    );
    const orders = await Promise.all(auths.map(() => newOrder(h.db, owner.orgId, '60.00')));
    const results = await Promise.allSettled(
      auths.map((a, i) => reserve(owner.orgId, a.id, orders[i]!, '60.00')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rows = await h.db
      .select()
      .from(schema.budgetReservations)
      .where(eq(schema.budgetReservations.orgId, owner.orgId));
    expect(rows).toHaveLength(1);
  });
});
