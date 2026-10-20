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
      {currency === 'USD' ? 'US$' : `${currency} `}
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
  search_only: 'Solo búsqueda',
  negotiate: 'Solo negociación',
  full_autonomy: 'Autonomía total',
  pending_payment: 'Pendiente de pago',
  pending_review: 'Pendiente de revisión',
  pending_owner_review: 'Para tu revisión',
  awaiting_buyer: 'Espera al comprador',
  awaiting_supplier: 'Espera al proveedor',
  requires_action: 'Requiere acción',
  owner_action_required: 'Pago del dueño',
  needs_confirmation: 'Por confirmar',
  needs_attention: 'Requiere atención',
  not_connected: 'No conectada',
  not_shipped: 'Sin enviar',
  active: 'Activa',
  paid: 'Pagado',
  completed: 'Completado',
  agreed: 'Acordada',
  accepted: 'Aceptada',
  proposed: 'Propuesta',
  superseded: 'Reemplazada',
  processing: 'Procesando',
  requested: 'Solicitado',
  authorized: 'Autorizado',
  revoked: 'Revocada',
  failed: 'Fallido',
  cancelled: 'Cancelado',
  expired: 'Vencido',
  exhausted: 'Agotada',
  rejected: 'Rechazada',
  closed: 'Cerrada',
  open: 'Abierta',
  draft: 'Borrador',
  paused: 'Pausada',
  archived: 'Archivada',
  compatible: 'Compatible',
  incompatible: 'Incompatible',
  unknown: 'Por reconciliar',
};

export function label(value: string | null | undefined): string {
  if (!value) return '—';
  return LABEL[value] ?? value;
}

export function Badge({ value }: { value: string | null | undefined }) {
  return <span className={`badge ${TONE[value ?? ''] ?? 'neutral'}`}>{label(value)}</span>;
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
  return <p className="muted">Cargando…</p>;
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
    ? d.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('es', { dateStyle: 'medium', timeZone: 'UTC' });
}

/** Placeholder de páginas aún no implementadas. */
export function Pending({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Empty>En construcción.</Empty>
    </>
  );
}
