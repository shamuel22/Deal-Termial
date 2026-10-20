import {
  Activity,
  Bell,
  Bot,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Store,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { useResource } from '../hooks';
import { useSession } from '../session';
import { BrandLockup, BrandSymbol } from '../site/components/Brand';
import { useFocusTrap } from '../site/components/useFocusTrap';
import { Loading } from './ui';

type Item = { to: string; label: string; icon: LucideIcon };

// DESIGN §10: una organización puede comprar y vender sin dos cuentas.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Buying',
    items: [
      { to: '/console', label: 'Overview', icon: LayoutDashboard },
      { to: '/console/review', label: 'Proposals', icon: ClipboardCheck },
      { to: '/console/orders', label: 'Orders', icon: ReceiptText },
      { to: '/console/agents', label: 'Agents', icon: Bot },
      { to: '/console/authorizations', label: 'Authorizations', icon: FileSignature },
    ],
  },
  {
    title: 'Selling',
    items: [
      { to: '/console/catalog', label: 'Catalog', icon: Store },
      { to: '/console/supplier/negotiations', label: 'Negotiations', icon: Handshake },
      { to: '/console/supplier/refunds', label: 'Refunds', icon: Undo2 },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/console/settings/payments', label: 'PayPal payments', icon: CreditCard },
      { to: '/console/activity', label: 'Activity', icon: Activity },
      { to: '/console/notifications', label: 'Notifications', icon: Bell },
    ],
  },
];

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** Sección activa para las migas: la ruta más larga que coincide. */
function currentItem(pathname: string): Item | undefined {
  return GROUPS.flatMap((g) => g.items)
    .filter((i) => pathname === i.to || (i.to !== '/console' && pathname.startsWith(`${i.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

/** ConsoleShell (DESIGN §15): sidebar, organización, migas, cuenta y badge de entorno. */
export function Layout() {
  const { status, me, org, setOrg, logout, orgPath } = useSession();
  const unread = useResource<{ unread: number }>(
    org ? orgPath('/notifications?unread=true') : null,
  );
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useFocusTrap(drawer, open);
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (status === 'loading') {
    return (
      <div className="center">
        <Loading />
      </div>
    );
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />;

  const unreadCount = unread.data?.unread ?? 0;
  const current = currentItem(location.pathname);

  const sidebar = (
    <>
      <div className="org">
        <span className="org-label">Organization</span>
        {me && me.memberships.length > 1 ? (
          <select
            className="org-select"
            aria-label="Organization"
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
          <span className="org-name">{org?.orgName}</span>
        )}
      </div>
      <nav aria-label="Console">
        {GROUPS.map((group) => (
          <div className="nav-group" key={group.title}>
            <span className="nav-title">{group.title}</span>
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/console'}>
                <Icon {...ICON} />
                <span className="nav-label">{label}</span>
                {to === '/console/notifications' && unreadCount > 0 && (
                  <span className="count" aria-label={`${unreadCount} unread`}>
                    {unreadCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="user">
        <div className="user-id">
          <span className="user-name">{me?.user.name}</span>
          <span className="user-email">{me?.user.email}</span>
        </div>
        <button type="button" className="ghost icon" onClick={() => void logout()}>
          <LogOut {...ICON} />
          <span className="sr-only">Sign out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="shell">
      <a className="skip" href="#console-main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandLockup small />
        </div>
        {sidebar}
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            ref={toggle}
            type="button"
            className="menu-button"
            aria-expanded={open}
            aria-controls="console-drawer"
            onClick={() => setOpen(true)}
          >
            <Menu {...ICON} />
            <span className="sr-only">Menu</span>
          </button>
          <Link to="/console" className="topbar-symbol" aria-label="Console overview">
            <BrandSymbol size={28} />
          </Link>
          <nav className="crumbs" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link to="/console">Console</Link>
              </li>
              {current && current.to !== '/console' && <li aria-current="page">{current.label}</li>}
            </ol>
          </nav>
          <span
            className="env"
            title="Sandbox environment. Payments use PayPal; no real money moves."
          >
            Sandbox
          </span>
        </header>
        <main className="content" id="console-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <div
            ref={drawer}
            className="drawer"
            id="console-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-top">
              <BrandLockup small />
              <button
                type="button"
                className="ghost icon"
                autoFocus
                onClick={() => {
                  setOpen(false);
                  toggle.current?.focus();
                }}
              >
                <X {...ICON} />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}
