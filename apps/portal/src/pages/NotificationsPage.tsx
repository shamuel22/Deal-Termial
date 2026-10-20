import { useState } from 'react';
import { Link } from 'react-router';
import { post } from '../api';
import { Empty, ErrorBox, Loading, PageHeader, formatDate } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';

interface Notification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  resourceType: string | null;
  resourceId: string | null;
}
interface Notifications {
  unread: number;
  items: Notification[];
}
function resourceLink(n: Notification): string | null {
  switch (n.resourceType) {
    case 'order':
      return n.resourceId ? `/console/orders/${n.resourceId}` : null;
    case 'negotiation':
      return '/console/review';
    case 'refund':
      return '/console/supplier/refunds';
    case 'seller_account':
      return '/console/settings/payments';
    default:
      return null;
  }
}
export default function NotificationsPage() {
  const { orgPath } = useSession();
  const base = orgPath('/notifications');
  return <NotificationsList key={base} base={base} />;
}
function NotificationsList({ base }: { base: string }) {
  const notifications = useResource<Notifications>(base);
  const [message, setMessage] = useState('');
  const read = useAction(async () => {
    await post(`${base}/read`, {});
    return true;
  });
  async function markRead() {
    setMessage('');
    if (await read.run()) {
      notifications.reload();
      setMessage('Todas las notificaciones se marcaron como leídas.');
    }
  }
  return (
    <>
      <PageHeader
        title="Notificaciones"
        subtitle="Avisos de operaciones y decisiones que necesitan tu atención."
        actions={
          <button
            disabled={read.pending || !notifications.data?.unread}
            onClick={() => void markRead()}
          >
            {read.pending ? 'Marcando…' : 'Marcar todas como leídas'}
          </button>
        }
      />
      <ErrorBox error={notifications.error} />
      <ErrorBox error={read.error} />
      {notifications.loading && <Loading />}
      {message && (
        <p className="alert ok" role="status">
          {message}
        </p>
      )}
      {notifications.data && (
        <p className="muted">
          {notifications.data.unread} sin leer. Se muestran hasta 50 avisos recientes.
        </p>
      )}
      {notifications.data?.items.length === 0 && <Empty>No tienes notificaciones.</Empty>}
      {notifications.data?.items.map((n) => (
        <article className="card stack" key={n.id}>
          <div>
            <h2>{n.title}</h2>
            <span className={`badge ${n.readAt ? 'neutral' : 'info'}`}>
              {n.readAt ? 'Leída' : 'No leída'}
            </span>
          </div>
          <p className="portal-message">{n.body}</p>
          <time dateTime={n.createdAt}>{formatDate(n.createdAt, true)}</time>
          {resourceLink(n) && <Link to={resourceLink(n)!}>Ver recurso relacionado</Link>}
        </article>
      ))}
    </>
  );
}
