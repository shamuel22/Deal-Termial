import { useState } from 'react';
import { post } from '../api';
import { QuoteBreakdown } from '../components/QuoteBreakdown';
import { Badge, Empty, ErrorBox, formatDate, Loading, PageHeader } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';
import type { NegotiationView, OrderView, PaymentSummary } from '../types';

/**
 * Propuestas que los agentes dejaron para revisión del dueño (nivel "solo negociación").
 * Aceptar crea el pedido; el pago se completa en PayPal con un checkout.
 */
export default function ReviewPage() {
  const { orgPath } = useSession();
  const [showAll, setShowAll] = useState(false);
  const list = useResource<NegotiationView[]>(
    orgPath(`/negotiations${showAll ? '?status=all' : ''}`),
  );

  return (
    <>
      <PageHeader
        title="Offers to review"
        subtitle="Agreements negotiated by your agents awaiting your decision. Review all costs before accepting."
        actions={
          <label className="inline">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            View all negotiations
          </label>
        }
      />
      <ErrorBox error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data?.length === 0 && (
        <Empty>
          No offers awaiting review. When an agent with Negotiate only permissions submits an offer,
          it will appear here.
        </Empty>
      )}
      {list.data?.map((n) => (
        <Proposal key={n.id} negotiation={n} onChange={list.reload} />
      ))}
    </>
  );
}

function Proposal({
  negotiation,
  onChange,
}: {
  negotiation: NegotiationView;
  onChange: () => void;
}) {
  const { orgPath } = useSession();
  const last = negotiation.quotes.at(-1);
  const supplierQuote = last?.author === 'supplier' ? last : undefined;
  const reviewable =
    negotiation.status === 'pending_owner_review' || negotiation.status === 'awaiting_buyer';
  const expired = supplierQuote ? new Date(supplierQuote.expiresAt).getTime() <= Date.now() : true;

  const accept = useAction(async () => {
    const order = await post<OrderView>(orgPath('/orders'), {
      negotiationId: negotiation.id,
      quoteId: supplierQuote!.id,
      idempotencyKey: `review-${supplierQuote!.id}`,
    });
    const payment = await post<PaymentSummary>(orgPath(`/orders/${order.id}/checkout`));
    if (payment.approveUrl) window.location.assign(payment.approveUrl);
    else onChange();
    return order;
  });

  const violations = negotiation.authorizationCheck?.violations ?? [];

  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h2>
            {String(supplierQuote?.product.name ?? last?.product.name ?? 'Product')} ·{' '}
            {negotiation.supplier.name}
          </h2>
          <p className="muted">
            {negotiation.quotes.length} versions · <Badge value={negotiation.status} />
          </p>
        </div>
      </div>

      {supplierQuote ? (
        <div className="grid">
          <div>
            <QuoteBreakdown quote={supplierQuote} />
            <p className="muted">
              Valid until {formatDate(supplierQuote.expiresAt, true)}
              {supplierQuote.message && <> · «{supplierQuote.message}»</>}
            </p>
          </div>
          <div className="stack">
            {negotiation.authorizationCheck &&
              (violations.length === 0 ? (
                <div className="alert ok">
                  Within the purchase authorization you granted your agent.
                </div>
              ) : (
                <div className="alert warn">
                  <strong>Outside the agent’s purchase authorization:</strong>
                  <ul>
                    {violations.map((v) => (
                      <li key={v.code + v.message}>{v.message}</li>
                    ))}
                  </ul>
                  As the owner, you can still accept it.
                </div>
              ))}
            <ErrorBox error={accept.error} />
            {reviewable && (
              <button
                className="primary"
                disabled={accept.pending || expired}
                onClick={() => {
                  if (
                    window.confirm(
                      `Accept the agreement with ${negotiation.supplier.name} and pay with PayPal?`,
                    )
                  ) {
                    void accept.run();
                  }
                }}
              >
                {expired
                  ? 'Quote expired'
                  : accept.pending
                    ? 'Preparing payment…'
                    : 'Approve and pay'}
              </button>
            )}
            <p className="muted">
              Accepting reserves stock and your budget. You are charged only after you approve the
              payment in PayPal.
            </p>
          </div>
        </div>
      ) : (
        <p className="muted">Waiting for the supplier’s quote.</p>
      )}

      <details>
        <summary>Negotiation history</summary>
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Author</th>
              <th className="num">Unit price</th>
              <th className="num">Total</th>
              <th>Delivery</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {negotiation.quotes.map((q) => (
              <tr key={q.id}>
                <td>v{q.version}</td>
                <td>
                  {q.author === 'buyer' ? 'Your agent' : negotiation.supplier.name}
                  {q.autoGenerated && <span className="muted"> (rules)</span>}
                </td>
                <td className="num">{q.unitPrice}</td>
                <td className="num">{q.total}</td>
                <td>{formatDate(q.deliverBy)}</td>
                <td>
                  <Badge value={q.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
