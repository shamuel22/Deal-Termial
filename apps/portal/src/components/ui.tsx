import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ApiError } from '../api';

/** Importe en USD a partir del string decimal del servidor (sin convertir a float para calcular). */
export function Money({
  value,
  currency = 'USD',
}: {
  value: string | null | undefined;
  currency?: string;
}) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  const [int, dec = '00'] = value.split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (
    <span className="money">
      {currency === 'USD' ? '$' : `${currency} `}
      {grouped}.{dec.padEnd(2, '0')}
    </span>
  );
}

const TONE: Record<string, string> = {
  active: 'ok',
  paid: 'ok',
  completed: 'ok',
  agreed: 'ok',
  compatible: 'ok',
  accepted: 'ok',
  pending: 'warn',
  pending_payment: 'warn',
  pending_review: 'warn',
  pending_owner_review: 'warn',
  awaiting_buyer: 'warn',
  awaiting_supplier: 'warn',
  requires_action: 'warn',
  owner_action_required: 'warn',
  needs_confirmation: 'warn',
  needs_attention: 'warn',
  processing: 'info',
  requested: 'info',
  authorized: 'info',
  proposed: 'info',
  open: 'info',
  revoked: 'bad',
  failed: 'bad',
  cancelled: 'bad',
  expired: 'bad',
  exhausted: 'bad',
  rejected: 'bad',
  incompatible: 'bad',
  unknown: 'bad',
};

const LABEL: Record<string, string> = {
  search_only: 'Search only',
  negotiate: 'Negotiate only',
  full_autonomy: 'Full autonomy',
  pending: 'Pending',
  pending_payment: 'Pending payment',
  pending_review: 'Pending review',
  pending_owner_review: 'For your review',
  awaiting_buyer: 'Awaiting buyer',
  awaiting_supplier: 'Awaiting supplier',
  requires_action: 'Requires action',
  owner_action_required: 'Owner payment',
  needs_confirmation: 'Unconfirmed',
  needs_attention: 'Needs attention',
  not_connected: 'Not connected',
  not_shipped: 'Not shipped',
  active: 'Active',
  paid: 'Paid',
  completed: 'Completed',
  agreed: 'Agreed',
  accepted: 'Accepted',
  proposed: 'Proposed',
  superseded: 'Superseded',
  processing: 'Processing',
  requested: 'Requested',
  authorized: 'Authorized',
  revoked: 'Revoked',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  exhausted: 'Exhausted',
  rejected: 'Rejected',
  closed: 'Closed',
  open: 'Open',
  draft: 'Draft',
  paused: 'Paused',
  archived: 'Archived',
  compatible: 'Compatible',
  incompatible: 'Incompatible',
  unknown: 'To reconcile',
};

// DESIGN §14: un estado combina etiqueta, símbolo y color.
const TONE_ICON: Record<string, LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
  info: Info,
  neutral: CircleDashed,
};

export function label(value: string | null | undefined): string {
  if (!value) return '—';
  return LABEL[value] ?? value;
}

export function Badge({ value }: { value: string | null | undefined }) {
  const tone = TONE[value ?? ''] ?? 'neutral';
  const Icon = TONE_ICON[tone]!;
  return (
    <span className={`badge ${tone}`}>
      <Icon size={14} strokeWidth={2} aria-hidden />
      {label(value)}
    </span>
  );
}

export function ErrorBox({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <strong>{error.body.message}</strong>
      {error.body.hint && <p>{error.body.hint}</p>}
      <code>{error.body.code}</code>
    </div>
  );
}

export function Loading() {
  return (
    <p className="muted loading" role="status">
      <span className="spinner" aria-hidden />
      Loading…
    </p>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return withTime
    ? d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : d.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
}

/** Placeholder de páginas aún no implementadas. */
export function Pending({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Empty>Coming soon.</Empty>
    </>
  );
}
