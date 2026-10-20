import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { post } from '../api';
import { QuoteBreakdown } from '../components/QuoteBreakdown';
import { Badge, ErrorBox, formatDate, label, Loading, Money, PageHeader } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';
import type { ActivityItem, OrderView, PaymentSummary } from '../types';

interface RefundView {
  id: string;
  amount: string;
  currency: string;
  status: string;
  reason: string | null;
  paypalRefundId: string | null;
  failureMessage: string | null;
  createdAt: string;
}

const RETURN_MESSAGE: Record<string, [string, string]> = {
  completed: ['ok', 'Pago confirmado por PayPal.'],
  processing: ['info', 'PayPal está procesando el pago; el estado se actualizará solo.'],
  failed: ['error', 'El pago no se completó. Puedes intentarlo de nuevo.'],
  cancelled: ['warn', 'Cancelaste el pago en PayPal. El pedido sigue pendiente.'],
  requires_action: ['warn', 'PayPal necesita que completes la aprobación.'],
};

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const [params] = useSearchParams();
  const { org, orgPath } = useSession();
  const order = useResource<OrderView>(orgPath(`/orders/${orderId}`));
  const refunds = useResource<RefundView[]>(orgPath(`/orders/${orderId}/refunds`));
  const activity = useResource<ActivityItem[]>(orgPath(`/activity?resourceId=${orderId}`));

  const checkout = useAction(async () => {
    const payment = await post<PaymentSummary>(orgPath(`/orders/${orderId}/checkout`));
    if (payment.approveUrl) window.location.assign(payment.approveUrl);
    else order.reload();
    return payment;
  });
  const cancel = useAction(async () => {
    await post(orgPath(`/orders/${orderId}/cancel`), {
      reason: 'Cancelado por el dueño desde el portal',
    });
    order.reload();
    activity.reload();
  });

  if (order.loading && !order.data) return <Loading />;
  if (!order.data) return <ErrorBox error={order.error} />;
  const o = order.data;
  const isBuyer = o.buyer.orgId === org?.orgId;
  const returned = params.get('payment');
  const banner = returned ? RETURN_MESSAGE[returned] : undefined;

  return (
    <>
      <PageHeader
        title={`Pedido ${o.id.slice(0, 8)}`}
        subtitle={`${isBuyer ? 'Compra a' : 'Venta a'} ${isBuyer ? o.supplier.name : o.buyer.name} · aceptado el ${formatDate(o.acceptedAt, true)}`}
        actions={<Link to="/orders">← Pedidos</Link>}
      />
      {banner && <div className={`alert ${banner[0]}`}>{banner[1]}</div>}
      {o.incident && (
        <div className="alert warn">
          <strong>Incidencia que requiere resolución:</strong> {o.incident}
        </div>
      )}

      <div className="grid">
        <section className="card stat">
          <span className="muted">Pedido</span>
          <div>
            <Badge value={o.status} />
          </div>
          {o.stockReservation?.status === 'active' && (
            <p className="muted">
              Stock reservado hasta {formatDate(o.stockReservation.expiresAt, true)}
            </p>
          )}
        </section>
        <section className="card stat">
          <span className="muted">Pago</span>
          <div>
            <Badge
              value={
                o.payment?.status ??
                (o.status === 'pending_payment' ? 'owner_action_required' : null)
              }
            />
          </div>
          <p className="muted">
            {o.paymentMode === 'delegated' ? 'Aceptado por un agente' : 'Aceptado por el dueño'}
          </p>
        </section>
        <section className="card stat">
          <span className="muted">Entrega (demostración)</span>
          <div>
            <Badge value={o.deliveryStatus} />
          </div>
          <p className="muted">Antes del {formatDate(o.terms.deliverBy)}</p>
        </section>
      </div>

      <div className="grid">
        <section className="card">
          <h2>{String(o.terms.product.name ?? 'Producto')}</h2>
          <QuoteBreakdown quote={{ ...o.terms, currency: o.currency }} />
          {isBuyer && o.status === 'pending_payment' && (
            <div className="stack">
              <ErrorBox error={checkout.error ?? cancel.error} />
              <button
                className="primary"
                disabled={checkout.pending}
                onClick={() => void checkout.run()}
              >
                {checkout.pending ? 'Abriendo PayPal…' : `Pagar ${o.total} USD con PayPal`}
              </button>
              <button
                className="danger"
                disabled={cancel.pending}
                onClick={() =>
                  window.confirm('¿Cancelar el pedido y liberar el stock y el presupuesto?') &&
                  void cancel.run()
                }
              >
                Cancelar pedido
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Por qué se permitió</h2>
          <dl className="kv">
            <dt>Aceptado por</dt>
            <dd>
              {o.acceptedBy.agentId ? 'Agente' : 'Dueño'} ({label(o.acceptedBy.level)})
            </dd>
            <dt>Autorización</dt>
            <dd>
              {o.authorization
                ? `${o.authorization.id.slice(0, 8)} · versión ${o.authorization.version}`
                : '—'}
            </dd>
            <dt>Cotización</dt>
            <dd>
              {o.terms.quoteId.slice(0, 8)} · versión {o.terms.quoteVersion}
            </dd>
            <dt>Presupuesto</dt>
            <dd>
              {o.budgetReservation ? (
                <>
                  <Money value={o.budgetReservation.amount} /> · {label(o.budgetReservation.status)}
                </>
              ) : (
                '—'
              )}
            </dd>
            <dt>PayPal</dt>
            <dd>
              {o.payment?.paypalOrderId ? (
                <>
                  Orden {o.payment.paypalOrderId}
                  {o.payment.paypalCaptureId && <> · captura {o.payment.paypalCaptureId}</>}
                </>
              ) : (
                '—'
              )}
            </dd>
            {o.paidAt && (
              <>
                <dt>Pagado</dt>
                <dd>{formatDate(o.paidAt, true)}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      <Refunds order={o} isBuyer={isBuyer} refunds={refunds.data ?? []} onChange={refunds.reload} />

      <section className="card">
        <h2>Trazabilidad</h2>
        <ErrorBox error={activity.error} />
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
      </section>
    </>
  );
}

function Refunds({
  order,
  isBuyer,
  refunds,
  onChange,
}: {
  order: OrderView;
  isBuyer: boolean;
  refunds: RefundView[];
  onChange: () => void;
}) {
  const { orgPath } = useSession();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const request = useAction(async () => {
    await post(orgPath(`/orders/${order.id}/refunds`), { amount: amount || undefined, reason });
    setAmount('');
    setReason('');
    onChange();
  });

  if (order.status !== 'paid' && refunds.length === 0) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    await request.run();
  }

  return (
    <section className="card">
      <h2>Devoluciones</h2>
      <p className="muted">Una devolución no amplía el presupuesto delegado a tus agentes.</p>
      {refunds.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th className="num">Importe</th>
              <th>Motivo</th>
              <th>Estado</th>
              <th>PayPal</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.createdAt, true)}</td>
                <td className="num">
                  <Money value={r.amount} />
                </td>
                <td>
                  {r.reason}
                  {r.failureMessage && <div className="muted">{r.failureMessage}</div>}
                </td>
                <td>
                  <Badge value={r.status} />
                </td>
                <td>{r.paypalRefundId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isBuyer && order.status === 'paid' && (
        <form className="row" onSubmit={submit}>
          <label>
            Importe (vacío = todo lo pendiente)
            <input
              inputMode="decimal"
              placeholder="20.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Motivo
            <input required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="stack">
            <ErrorBox error={request.error} />
            <button disabled={request.pending}>Solicitar devolución</button>
          </div>
        </form>
      )}
    </section>
  );
}
