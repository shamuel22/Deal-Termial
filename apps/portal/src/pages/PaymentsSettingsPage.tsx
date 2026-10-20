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
        title="Pagos PayPal"
        subtitle="Cobros como proveedor y autorizaciones para pagar como comprador."
      />

      <section className="card">
        <h2>Como proveedor: recibir pagos</h2>
        <dl className="kv">
          <dt>Estado</dt>
          <dd>
            <Badge value={seller.status} />
          </dd>
          <dt>Merchant ID</dt>
          <dd>{seller.merchantId ?? '—'}</dd>
          <dt>Puede recibir pagos</dt>
          <dd>{seller.paymentsReceivable ? 'Sí' : 'No'}</dd>
          <dt>Email confirmado en PayPal</dt>
          <dd>{seller.primaryEmailConfirmed ? 'Sí' : 'No'}</dd>
          <dt>Última comprobación</dt>
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
              Conectar con PayPal
            </button>
          )}
          {seller.status !== 'not_connected' && (
            <button disabled={refresh.pending} onClick={() => void refresh.run()}>
              Comprobar estado en PayPal
            </button>
          )}
        </div>
        <p className="muted">
          Los compradores te pagan directamente en tu cuenta PayPal. Deal Terminal verifica con
          PayPal que puedes cobrar antes de dirigirte pagos.
        </p>
      </section>

      <section className="card">
        <h2>Como comprador: las dos autorizaciones</h2>
        <div className="grid">
          <div>
            <h3>1. Autorización comercial</h3>
            <p>Qué puede comprar cada agente, a quién, cuánto y hasta cuándo.</p>
            <Link to="/authorizations">Gestionar autorizaciones →</Link>
          </div>
          <div>
            <h3>2. Autorización financiera</h3>
            <p>
              <Badge value={automaticPayment.available ? 'active' : 'owner_action_required'} />
            </p>
            <p>{automaticPayment.explanation}</p>
          </div>
        </div>
        {!automaticPayment.available && (
          <div className="alert info">
            Tus agentes con autonomía total buscan, negocian, aceptan y reservan dentro de su
            autorización. Cuando cierran un pedido recibes una notificación y lo pagas desde{' '}
            <Link to="/orders">Pedidos</Link> con un checkout de PayPal.
          </div>
        )}
      </section>
    </>
  );
}
