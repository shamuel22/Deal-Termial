import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { post } from '../api';
import { QuoteBreakdown } from '../components/QuoteBreakdown';
import { Badge, ErrorBox, formatDate, label, Loading, Money, PageHeader } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';
import { actions as activityActions } from './ActivityPage';
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
  completed: ['ok', 'We’re confirming the payment. Don’t submit it again.'],
  processing: ['info', 'We’re confirming the payment. Don’t submit it again.'],
  failed: ['error', 'We’re checking the payment status. Don’t submit it again.'],
  cancelled: ['warn', 'You returned from PayPal. We’re checking the payment status.'],
  requires_action: ['warn', 'Check the payment status below for any required action.'],
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
      reason: 'Cancelled by the owner from the portal',
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
        title={`Order ${o.id.slice(0, 8)}`}
        subtitle={`${isBuyer ? 'Purchase from' : 'Sale to'} ${isBuyer ? o.supplier.name : o.buyer.name} · accepted on ${formatDate(o.acceptedAt, true)}`}
        actions={<Link to="/console/orders">← Orders</Link>}
      />
      {banner && <div className={`alert ${banner[0]}`}>{banner[1]}</div>}
      {o.incident && (
        <div className="alert warn">
          <strong>Issue requiring resolution:</strong> {o.incident}
        </div>
      )}

      <div className="grid">
        <section className="card stat">
          <span className="muted">Order</span>
          <div>
            <Badge value={o.status} />
          </div>
          {o.stockReservation?.status === 'active' && (
            <p className="muted">
              Stock reserved until {formatDate(o.stockReservation.expiresAt, true)}
            </p>
          )}
        </section>
        <section className="card stat">
          <span className="muted">Payment</span>
          <div>
            <Badge
              value={
                o.payment?.status ??
                (o.status === 'pending_payment' ? 'owner_action_required' : null)
              }
            />
          </div>
          <p className="muted">
            {o.paymentMode === 'delegated' ? 'Accepted by an agent' : 'Accepted by the owner'}
          </p>
        </section>
        <section className="card stat">
          <span className="muted">Delivery (demo)</span>
          <div>
            <Badge value={o.deliveryStatus} />
          </div>
          <p className="muted">By {formatDate(o.terms.deliverBy)}</p>
        </section>
      </div>

      <div className="grid">
        <section className="card">
          <h2>{String(o.terms.product.name ?? 'Product')}</h2>
          <QuoteBreakdown quote={{ ...o.terms, currency: o.currency }} />
          {isBuyer && o.status === 'pending_payment' && (
            <div className="stack">
              <ErrorBox error={checkout.error ?? cancel.error} />
              <button
                className="primary"
                disabled={checkout.pending}
                onClick={() => void checkout.run()}
              >
                {checkout.pending ? 'Opening PayPal…' : `Continue in PayPal · ${o.total} USD`}
              </button>
              <button
                className="danger"
                disabled={cancel.pending}
                onClick={() =>
                  window.confirm('Cancel the order and release its stock and budget?') &&
                  void cancel.run()
                }
              >
                Cancel order
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Why it was allowed</h2>
          <dl className="kv">
            <dt>Accepted by</dt>
            <dd>
              {o.acceptedBy.agentId ? 'Agent' : 'Owner'} ({label(o.acceptedBy.level)})
            </dd>
            <dt>Purchase authorization</dt>
            <dd>
              {o.authorization
                ? `${o.authorization.id.slice(0, 8)} · version ${o.authorization.version}`
                : '—'}
            </dd>
            <dt>Quote</dt>
            <dd>
              {o.terms.quoteId.slice(0, 8)} · version {o.terms.quoteVersion}
            </dd>
            <dt>Authorized budget</dt>
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
                  Order {o.payment.paypalOrderId}
                  {o.payment.paypalCaptureId && <> · capture {o.payment.paypalCaptureId}</>}
                </>
              ) : (
                '—'
              )}
            </dd>
            {o.paidAt && (
              <>
                <dt>Paid</dt>
                <dd>{formatDate(o.paidAt, true)}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      <Refunds order={o} isBuyer={isBuyer} refunds={refunds.data ?? []} onChange={refunds.reload} />

      <section className="card">
        <h2>Activity log</h2>
        <ErrorBox error={activity.error} />
        <table>
          <tbody>
            {(activity.data ?? []).map((a) => (
              <tr key={a.id}>
                <td className="muted">{formatDate(a.at, true)}</td>
                <td>{a.actor.name ?? a.actor.type}</td>
                <td>{activityActions[a.action] ?? a.action}</td>
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
      <h2>Refunds</h2>
      <p className="muted">A refund does not increase your agents’ authorized budget.</p>
      {refunds.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Amount</th>
              <th>Reason</th>
              <th>Status</th>
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
            Amount (leave blank for the full refundable amount)
            <input
              inputMode="decimal"
              placeholder="20.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Reason
            <input required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="stack">
            <ErrorBox error={request.error} />
            <button disabled={request.pending}>Request refund</button>
          </div>
        </form>
      )}
    </section>
  );
}
