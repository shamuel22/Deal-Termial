import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Empty, ErrorBox, formatDate, Loading, Money, PageHeader } from '../components/ui';
import { useResource } from '../hooks';
import { useSession } from '../session';
import type { OrderView } from '../types';

export default function OrdersPage() {
  const { orgPath } = useSession();
  const [side, setSide] = useState<'buyer' | 'supplier'>('buyer');
  const orders = useResource<OrderView[]>(orgPath(`/orders?side=${side}`));

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle="Estado comercial, de pago y de entrega de cada acuerdo."
        actions={
          <div className="actions" role="tablist">
            <button className={side === 'buyer' ? 'primary' : ''} onClick={() => setSide('buyer')}>
              Compras
            </button>
            <button
              className={side === 'supplier' ? 'primary' : ''}
              onClick={() => setSide('supplier')}
            >
              Ventas
            </button>
          </div>
        }
      />
      <ErrorBox error={orders.error} />
      {orders.loading && !orders.data && <Loading />}
      {orders.data?.length === 0 && <Empty>Todavía no hay pedidos.</Empty>}
      {orders.data && orders.data.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>{side === 'buyer' ? 'Proveedor' : 'Comprador'}</th>
                <th>Producto</th>
                <th className="num">Cantidad</th>
                <th className="num">Total</th>
                <th>Pedido</th>
                <th>Pago</th>
                <th>Aceptado por</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/orders/${o.id}`}>{formatDate(o.acceptedAt, true)}</Link>
                  </td>
                  <td>{side === 'buyer' ? o.supplier.name : o.buyer.name}</td>
                  <td>{String(o.terms.product.name ?? '—')}</td>
                  <td className="num">{o.terms.quantity}</td>
                  <td className="num">
                    <Money value={o.total} currency={o.currency} />
                  </td>
                  <td>
                    <Badge value={o.status} />
                    {o.incident && <span title={o.incident}> ⚠</span>}
                  </td>
                  <td>
                    {o.payment ? (
                      <Badge value={o.payment.status} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{o.acceptedBy.agentId ? 'Agente' : 'Dueño'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
