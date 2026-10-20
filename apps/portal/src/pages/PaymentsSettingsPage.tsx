import { Link } from 'react-router';
import { post } from '../api';
import { Badge, ErrorBox, formatDate, Loading, PageHeader } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';

interface PaymentsStatus {
  sellerAccount: {
    status: string;
    merchantId: string | null;
    paymentsReceivable: boolean;
    primaryEmailConfirmed: boolean;
    lastCheckedAt: string | null;
  };
  automaticPayment: { available: boolean; explanation: string };
  connections: Array<{
    id: string;
    status: string;
    scope: string;
    payeeMerchantId: string | null;
    payerEmail: string | null;
  }>;
}

export default function PaymentsSettingsPage() {
  const { orgPath } = useSession();
  const status = useResource<PaymentsStatus>(orgPath('/payments/status'));
  const onboard = useAction(async () => {
    const { actionUrl } = await post<{ actionUrl: string }>(
      orgPath('/payments/seller-account/onboarding'),
    );
    window.location.assign(actionUrl);
  });
  const refresh = useAction(async () => {
    await post(orgPath('/payments/seller-account/refresh'));
    status.reload();
  });

  if (status.loading && !status.data) return <Loading />;
  if (!status.data) return <ErrorBox error={status.error} />;
  const { sellerAccount: seller, automaticPayment } = status.data;

  return (
    <>
      <PageHeader
        title="PayPal payments"
        subtitle="Receive payments as a supplier and authorize purchases as a buyer."
      />

      <section className="card">
        <h2>Supplier: receive payments</h2>
        <dl className="kv">
          <dt>Status</dt>
          <dd>
            <Badge value={seller.status} />
          </dd>
          <dt>Merchant ID</dt>
          <dd>{seller.merchantId ?? '—'}</dd>
          <dt>Can receive payments</dt>
          <dd>{seller.paymentsReceivable ? 'Yes' : 'No'}</dd>
          <dt>Email confirmed in PayPal</dt>
          <dd>{seller.primaryEmailConfirmed ? 'Yes' : 'No'}</dd>
          <dt>Last checked</dt>
          <dd>{formatDate(seller.lastCheckedAt, true)}</dd>
        </dl>
        <ErrorBox error={onboard.error ?? refresh.error} />
        <div className="actions">
          {seller.status !== 'active' && (
            <button
              className="primary"
              disabled={onboard.pending}
              onClick={() => void onboard.run()}
            >
              Continue in PayPal
            </button>
          )}
          {seller.status !== 'not_connected' && (
            <button disabled={refresh.pending} onClick={() => void refresh.run()}>
              Check status in PayPal
            </button>
          )}
        </div>
        <p className="muted">
          Buyers pay you directly into your PayPal account. Deal Terminal checks with PayPal that
          you can receive payments before directing payments to you.
        </p>
      </section>

      <section className="card">
        <h2>Buyer: two authorizations</h2>
        <div className="grid">
          <div>
            <h3>1. Purchase authorization</h3>
            <p>What each agent can buy, from whom, how much and until when.</p>
            <Link to="/console/authorizations">Manage purchase authorizations →</Link>
          </div>
          <div>
            <h3>2. PayPal consent</h3>
            <p>
              <Badge value={automaticPayment.available ? 'active' : 'owner_action_required'} />
            </p>
            <p>{automaticPayment.explanation}</p>
          </div>
        </div>
        {!automaticPayment.available && (
          <div className="alert info">
            Full autonomy: Within your authorized limits. Your agents search, negotiate, accept and
            reserve under their purchase authorization. When they place an order, you’re notified
            and pay from <Link to="/console/orders">Orders</Link> through PayPal checkout.
          </div>
        )}
      </section>
    </>
  );
}
