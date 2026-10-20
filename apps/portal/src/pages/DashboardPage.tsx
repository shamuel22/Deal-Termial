import { Link } from 'react-router';
import { Badge, ErrorBox, formatDate, Money, PageHeader } from '../components/ui';
import { useResource } from '../hooks';
import { useSession } from '../session';
import type { ActivityItem, NegotiationView, OrderView } from '../types';

interface MonthlyBudget {
  period: string;
  limit: string;
  reserved: string;
  consumed: string;
  available: string;
}

export default function DashboardPage() {
  const { org, orgPath } = useSession();
  const proposals = useResource<NegotiationView[]>(orgPath('/negotiations'));
  const orders = useResource<OrderView[]>(orgPath('/orders?side=buyer'));
  const sales = useResource<OrderView[]>(orgPath('/orders?side=supplier'));
  const budget = useResource<MonthlyBudget | null>(orgPath('/budget/monthly'));
  const activity = useResource<ActivityItem[]>(orgPath('/activity?limit=8'));

  const toPay = (orders.data ?? []).filter((o) => o.status === 'pending_payment');
  const incidents = [...(orders.data ?? []), ...(sales.data ?? [])].filter((o) => o.incident);

  return (
    <>
      <PageHeader
        title={org?.orgName ?? 'Resumen'}
        subtitle="Lo que tus agentes hicieron y lo que espera tu decisión."
      />
      <ErrorBox error={proposals.error ?? orders.error} />

      {incidents.length > 0 && (
        <div className="alert warn">
          {incidents.length} pedido(s) con incidencia.{' '}
          <Link to={`/console/orders/${incidents[0]!.id}`}>Revisar</Link>
        </div>
      )}

      <div className="grid">
        <Link
          to="/console/review"
          className="card stat"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <span className="muted">Propuestas por revisar</span>
          <div className="value">{proposals.data?.length ?? '…'}</div>
        </Link>
        <Link
          to="/console/orders"
          className="card stat"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <span className="muted">Pedidos pendientes de pago</span>
          <div className="value">{orders.data ? toPay.length : '…'}</div>
          {toPay.length > 0 && (
            <span className="muted">
              <Money value={toPay.reduce((sum, o) => addCents(sum, o.total), '0.00')} /> en total
            </span>
          )}
        </Link>
        <div className="card stat">
          <span className="muted">
            Presupuesto mensual de agentes {budget.data ? `(${budget.data.period})` : ''}
          </span>
          {budget.data ? (
            <>
              <div className="value">
                <Money value={budget.data.available} />
              </div>
              <span className="muted">
                de <Money value={budget.data.limit} /> · consumido{' '}
                <Money value={budget.data.consumed} /> · reservado{' '}
                <Money value={budget.data.reserved} />
              </span>
            </>
          ) : (
            <div className="value muted">Sin límite</div>
          )}
        </div>
        <Link
          to="/console/orders"
          className="card stat"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <span className="muted">Ventas</span>
          <div className="value">{sales.data?.length ?? '…'}</div>
        </Link>
      </div>

      {toPay.length > 0 && (
        <section className="card">
          <h2>Para pagar</h2>
          <table>
            <tbody>
              {toPay.map((o) => (
                <tr key={o.id}>
                  <td>{o.supplier.name}</td>
                  <td>{String(o.terms.product.name ?? '')}</td>
                  <td className="num">
                    <Money value={o.total} />
                  </td>
                  <td>{o.acceptedBy.agentId ? 'Aceptado por tu agente' : 'Aceptado por ti'}</td>
                  <td>
                    <Link to={`/console/orders/${o.id}`}>Pagar →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2>Actividad reciente</h2>
        <table>
          <tbody>
            {(activity.data ?? []).map((a) => (
              <tr key={a.id}>
                <td className="muted">{formatDate(a.at, true)}</td>
                <td>{a.actor.name ?? a.actor.type}</td>
                <td>{a.action}</td>
                <td>
                  <Badge
                    value={
                      a.outcome === 'succeeded' || a.outcome === 'allowed' ? 'completed' : a.outcome
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Link to="/console/activity">Ver toda la actividad →</Link>
      </section>
    </>
  );
}

/** Suma exacta de importes con 2 decimales trabajando en centavos enteros. */
function addCents(a: string, b: string): string {
  const cents = (v: string) => {
    const [i, d = '00'] = v.split('.');
    return BigInt(i!) * 100n + BigInt(d.padEnd(2, '0').slice(0, 2));
  };
  const total = cents(a) + cents(b);
  return `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`;
}
