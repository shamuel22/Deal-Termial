import { NavLink, Navigate, Outlet } from 'react-router';
import { useResource } from '../hooks';
import { useSession } from '../session';

const BUYER = [
  ['/', 'Resumen'],
  ['/review', 'Propuestas'],
  ['/orders', 'Pedidos'],
  ['/agents', 'Agentes'],
  ['/authorizations', 'Autorizaciones'],
] as const;

const SUPPLIER = [
  ['/catalog', 'Catálogo'],
  ['/supplier/negotiations', 'Negociaciones'],
  ['/supplier/refunds', 'Devoluciones'],
] as const;

const ACCOUNT = [
  ['/settings/payments', 'Pagos PayPal'],
  ['/activity', 'Actividad'],
  ['/notifications', 'Notificaciones'],
] as const;

export function Layout() {
  const { status, me, org, setOrg, logout, orgPath } = useSession();
  const unread = useResource<{ unread: number }>(
    org ? orgPath('/notifications?unread=true') : null,
  );

  if (status === 'loading') return <p className="center muted">Cargando…</p>;
  if (status === 'anonymous') return <Navigate to="/login" replace />;

  const link = ([to, text]: readonly [string, string]) => (
    <NavLink key={to} to={to} end={to === '/'}>
      {text}
      {to === '/notifications' && (unread.data?.unread ?? 0) > 0 && (
        <span className="count">{unread.data!.unread}</span>
      )}
    </NavLink>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◆
          </span>
          Deal Terminal
        </div>
        {me && me.memberships.length > 1 ? (
          <select
            className="org-select"
            value={org?.orgId}
            onChange={(e) => setOrg(e.target.value)}
          >
            {me.memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>
                {m.orgName}
              </option>
            ))}
          </select>
        ) : (
          <div className="org-name">{org?.orgName}</div>
        )}
        <nav>
          <span className="nav-title">Compras</span>
          {BUYER.map(link)}
          <span className="nav-title">Ventas</span>
          {SUPPLIER.map(link)}
          <span className="nav-title">Cuenta</span>
          {ACCOUNT.map(link)}
        </nav>
        <div className="user">
          <span>{me?.user.name}</span>
          <button className="link" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
