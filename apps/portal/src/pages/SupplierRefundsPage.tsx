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
      <PageHeader title="Sales refunds" subtitle="Requests awaiting your decision as supplier." />
      <ErrorBox error={refunds.error} />
      {refunds.loading && <Loading />}
      {result && (
        <div className="alert info" role="status">
          Latest recorded decision: <Money value={result.amount} currency={result.currency} /> ·{' '}
          <Badge value={result.status} />
          {result.failureMessage && <p>{result.failureMessage}</p>}
          <p>Approval authorizes the refund. The status shows whether PayPal has confirmed it.</p>
        </div>
      )}
      {refunds.data?.length === 0 && <Empty>No refund requests awaiting your decision.</Empty>}
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
        'Authorize this refund for the amount shown? The platform will send the refund request to PayPal.',
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
      !window.confirm('Reject the refund with this reason? The buyer will receive your response.')
    )
      return;
    const result = await action.run('reject', { reason });
    if (result) onDone(result);
  }
  return (
    <section className="card stack">
      <h2>
        Order <Link to={`/console/orders/${r.orderId}`}>{r.orderId}</Link>
      </h2>
      <dl className="kv">
        <dt>Amount</dt>
        <dd>
          <Money value={r.amount} currency={r.currency} />
        </dd>
        <dt>Reason</dt>
        <dd>{r.reason ?? 'No reason provided'}</dd>
        <dt>Requested</dt>
        <dd>{formatDate(r.createdAt, true)}</dd>
        <dt>Status</dt>
        <dd>
          <Badge value={r.status} />
        </dd>
      </dl>
      <ErrorBox error={action.error} />
      <div className="actions">
        <button className="primary" disabled={action.pending} onClick={() => void approve()}>
          Approve refund
        </button>
        <button
          className="danger"
          disabled={action.pending}
          onClick={() => setRejecting(!rejecting)}
        >
          {rejecting ? 'Cancel' : 'Reject with reason'}
        </button>
      </div>
      {rejecting && (
        <form className="stack" onSubmit={reject}>
          <label>
            Reason for rejection
            <textarea name="reason" required maxLength={500} rows={3} disabled={action.pending} />
          </label>
          <button className="danger" disabled={action.pending}>
            Confirm rejection
          </button>
        </form>
      )}
    </section>
  );
}
