import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { post } from '../api';
import { textFrom } from '../components/forms';
import { Badge, Empty, ErrorBox, Loading, Money, PageHeader, formatDate } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';

interface Refund {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  reason: string | null;
  createdAt: string;
  status: string;
  failureMessage: string | null;
}
export default function SupplierRefundsPage() {
  const { orgPath } = useSession();
  const base = orgPath('/supplier/refunds');
  return <Refunds key={base} base={base} />;
}
function Refunds({ base }: { base: string }) {
  const refunds = useResource<Refund[]>(base);
  const [result, setResult] = useState<Refund | null>(null);
  return (
    <>
      <PageHeader
        title="Devoluciones de ventas"
        subtitle="Solicitudes pendientes de tu decisión como proveedor."
      />
      <ErrorBox error={refunds.error} />
      {refunds.loading && <Loading />}
      {result && (
        <div className="alert info" role="status">
          Última decisión registrada: <Money value={result.amount} currency={result.currency} /> ·{' '}
          <Badge value={result.status} />
          {result.failureMessage && <p>{result.failureMessage}</p>}
          <p>Aprobar autoriza el reembolso; el estado indica si PayPal ya lo confirmó.</p>
        </div>
      )}
      {refunds.data?.length === 0 && <Empty>No tienes solicitudes de devolución pendientes.</Empty>}
      {refunds.data?.map((r) => (
        <RefundCard
          key={r.id}
          refund={r}
          base={base}
          onDone={(value) => {
            setResult(value);
            refunds.reload();
          }}
        />
      ))}
    </>
  );
}
function RefundCard({
  refund: r,
  base,
  onDone,
}: {
  refund: Refund;
  base: string;
  onDone: (r: Refund) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const action = useAction((decision: string, body?: { reason: string }) =>
    post<Refund>(`${base}/${r.id}/${decision}`, body),
  );
  async function approve() {
    if (
      !window.confirm(
        '¿Autorizar esta devolución por el importe indicado? La plataforma enviará la solicitud de reembolso a PayPal.',
      )
    )
      return;
    const result = await action.run('approve');
    if (result) onDone(result);
  }
  async function reject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = textFrom(new FormData(e.currentTarget), 'reason');
    if (
      !window.confirm(
        '¿Rechazar la devolución con este motivo? El comprador recibirá tu respuesta.',
      )
    )
      return;
    const result = await action.run('reject', { reason });
    if (result) onDone(result);
  }
  return (
    <section className="card stack">
      <h2>
        Pedido <Link to={`/orders/${r.orderId}`}>{r.orderId}</Link>
      </h2>
      <dl className="kv">
        <dt>Importe</dt>
        <dd>
          <Money value={r.amount} currency={r.currency} />
        </dd>
        <dt>Motivo</dt>
        <dd>{r.reason ?? 'Sin motivo indicado'}</dd>
        <dt>Solicitada</dt>
        <dd>{formatDate(r.createdAt, true)}</dd>
        <dt>Estado</dt>
        <dd>
          <Badge value={r.status} />
        </dd>
      </dl>
      <ErrorBox error={action.error} />
      <div className="actions">
        <button className="primary" disabled={action.pending} onClick={() => void approve()}>
          Aprobar devolución
        </button>
        <button
          className="danger"
          disabled={action.pending}
          onClick={() => setRejecting(!rejecting)}
        >
          {rejecting ? 'Cancelar rechazo' : 'Rechazar con motivo'}
        </button>
      </div>
      {rejecting && (
        <form className="stack" onSubmit={reject}>
          <label>
            Motivo del rechazo
            <textarea name="reason" required maxLength={500} rows={3} disabled={action.pending} />
          </label>
          <button className="danger" disabled={action.pending}>
            Confirmar rechazo
          </button>
        </form>
      )}
    </section>
  );
}
