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
        title="Propuestas"
        subtitle="Acuerdos negociados por tus agentes que esperan tu decisión. Revisa todos los costes antes de aceptar."
        actions={
          <label className="inline">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Ver todas las negociaciones
          </label>
        }
      />
      <ErrorBox error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data?.length === 0 && (
        <Empty>
          No hay propuestas pendientes. Cuando un agente con nivel "solo negociación" cierre una
          propuesta, aparecerá aquí.
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
            {String(supplierQuote?.product.name ?? last?.product.name ?? 'Producto')} ·{' '}
            {negotiation.supplier.name}
          </h2>
          <p className="muted">
            {negotiation.quotes.length} versiones · <Badge value={negotiation.status} />
          </p>
        </div>
      </div>

      {supplierQuote ? (
        <div className="grid">
          <div>
            <QuoteBreakdown quote={supplierQuote} />
            <p className="muted">
              Válida hasta {formatDate(supplierQuote.expiresAt, true)}
              {supplierQuote.message && <> · «{supplierQuote.message}»</>}
            </p>
          </div>
          <div className="stack">
            {negotiation.authorizationCheck &&
              (violations.length === 0 ? (
                <div className="alert ok">
                  Cabe dentro de la autorización que diste a tu agente.
                </div>
              ) : (
                <div className="alert warn">
                  <strong>Fuera de la autorización del agente:</strong>
                  <ul>
                    {violations.map((v) => (
                      <li key={v.code + v.message}>{v.message}</li>
                    ))}
                  </ul>
                  Como dueña o dueño puedes aceptarla igualmente.
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
                      `¿Aceptar el acuerdo con ${negotiation.supplier.name} y pagar con PayPal?`,
                    )
                  ) {
                    void accept.run();
                  }
                }}
              >
                {expired
                  ? 'Cotización vencida'
                  : accept.pending
                    ? 'Preparando pago…'
                    : 'Aceptar y pagar con PayPal'}
              </button>
            )}
            <p className="muted">
              Al aceptar se reservan el stock y tu presupuesto; el cobro ocurre solo cuando apruebas
              el pago en PayPal.
            </p>
          </div>
        </div>
      ) : (
        <p className="muted">Esperando la cotización del proveedor.</p>
      )}

      <details>
        <summary>Historial de la negociación</summary>
        <table>
          <thead>
            <tr>
              <th>Versión</th>
              <th>Autor</th>
              <th className="num">Precio unitario</th>
              <th className="num">Total</th>
              <th>Entrega</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {negotiation.quotes.map((q) => (
              <tr key={q.id}>
                <td>v{q.version}</td>
                <td>
                  {q.author === 'buyer' ? 'Tu agente' : negotiation.supplier.name}
                  {q.autoGenerated && <span className="muted"> (reglas)</span>}
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
