import { useState } from 'react';
import { Table } from '../components/forms';
import { Badge, Empty, ErrorBox, Loading, PageHeader, formatDate } from '../components/ui';
import { useResource } from '../hooks';
import { useSession } from '../session';

interface ActivityEvent {
  id: string;
  at: string;
  actor: { type: string; id: string | null; name: string | null };
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  details: Record<string, unknown> | null;
}
const actions: Record<string, string> = {
  'organization.created': 'Empresa registrada',
  'organization.monthly_limit_set': 'Límite mensual actualizado',
  'agent.created': 'Agente conectado',
  'agent.access_changed': 'Facultades del agente modificadas',
  'agent.credential_issued': 'Credencial emitida',
  'agent.credential_revoked': 'Credencial revocada',
  'agent.disabled': 'Agente deshabilitado',
  'authorization.created': 'Autorización de compra activada',
  'authorization.amended': 'Condiciones de autorización modificadas',
  'authorization.revoked': 'Autorización revocada',
  'change_request.submitted': 'Solicitud de cambio enviada',
  'change_request.approved': 'Solicitud de cambio aprobada',
  'change_request.rejected': 'Solicitud de cambio rechazada',
  'product.created': 'Producto creado',
  'product.updated': 'Producto actualizado',
  'offer.created': 'Oferta creada',
  'offer.updated': 'Condiciones de oferta actualizadas',
  'offer.status_changed': 'Estado de oferta modificado',
  'request.created': 'Necesidad de compra registrada',
  'request.cancelled': 'Solicitud de compra cancelada',
  'negotiation.quote_requested': 'Cotización solicitada',
  'negotiation.countered': 'Contrapropuesta del comprador enviada',
  'negotiation.quote_submitted': 'Cotización del proveedor enviada',
  'negotiation.submitted_for_review': 'Propuesta enviada al dueño para revisión',
  'negotiation.counter_accepted': 'Contrapropuesta aceptada por el proveedor',
  'negotiation.counter_rejected': 'Contrapropuesta rechazada por el proveedor',
  'negotiation.counter_countered': 'Contraoferta del proveedor enviada',
  'order.accepted': 'Acuerdo aceptado y pedido creado',
  'order.accept_denied': 'Aceptación del acuerdo bloqueada',
  'order.cancelled': 'Pedido cancelado',
  'order.expired': 'Reserva del pedido vencida',
  'payment.checkout_started': 'Checkout PayPal iniciado',
  'payment.owner_action_required': 'Pago pendiente del dueño',
  'payment.dispatched': 'Pago enviado a PayPal',
  'payment.completed': 'Pago confirmado',
  'payment.failed': 'Pago fallido',
  'payment.requires_action': 'Pago requiere intervención',
  'payment_connection.revoked': 'Autorización financiera revocada',
  'refund.requested': 'Devolución solicitada',
  'refund.authorized': 'Devolución autorizada',
  'refund.rejected': 'Devolución rechazada',
  'refund.completed': 'Reembolso confirmado',
  'refund.failed': 'Reembolso fallido',
  'seller_account.onboarding_started': 'Conexión PayPal del proveedor iniciada',
  'seller_account.status_changed': 'Estado de cobro del proveedor actualizado',
};
const resources: Record<string, string> = {
  organization: 'Empresa',
  agent: 'Agente',
  purchase_authorization: 'Autorización de compra',
  authorization_change_request: 'Solicitud de cambio',
  product: 'Producto',
  offer: 'Oferta',
  purchase_request: 'Solicitud de compra',
  negotiation: 'Negociación',
  order: 'Pedido',
  refund: 'Devolución',
  seller_account: 'Cuenta PayPal del proveedor',
  payment_connection: 'Autorización financiera',
};
const actors: Record<string, string> = {
  user: 'Persona',
  agent: 'Agente',
  system: 'Sistema',
  paypal: 'PayPal',
  operator: 'Operador',
};
const outcomes: Record<string, string> = {
  allowed: 'Permitida',
  denied: 'Denegada',
  succeeded: 'Completada',
  failed: 'Fallida',
};
export default function ActivityPage() {
  const { orgPath } = useSession();
  const base = orgPath('/activity');
  return <Activity key={base} base={base} />;
}
function Activity({ base }: { base: string }) {
  const [resourceType, setResourceType] = useState('');
  return (
    <>
      <PageHeader
        title="Consola de actividad"
        subtitle="Quién actuó, qué se autorizó y qué ocurrió. Se muestran hasta 200 eventos recientes."
      />
      <section className="card">
        <label>
          Tipo de recurso
          <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(resources).map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </select>
        </label>
      </section>
      <ActivityResults
        key={resourceType}
        path={`${base}?limit=200${resourceType ? `&resourceType=${encodeURIComponent(resourceType)}` : ''}`}
      />
    </>
  );
}
function ActivityResults({ path }: { path: string }) {
  const events = useResource<ActivityEvent[]>(path);
  return (
    <>
      <ErrorBox error={events.error} />
      {events.loading && <Loading />}
      {events.data &&
        (events.data.length ? (
          <section className="card">
            <Table title="Trazabilidad de tu empresa">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Actor</th>
                  <th>Acción</th>
                  <th>Recurso</th>
                  <th>Resultado</th>
                  <th>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.at, true)}</td>
                    <td>
                      {actors[event.actor.type] ?? 'Actor'}
                      <div>{event.actor.name ?? event.actor.id ?? 'Sin nombre disponible'}</div>
                    </td>
                    <td>
                      {actions[event.action] ?? 'Otra acción registrada'}
                      <div className="muted">
                        <code>{event.action}</code>
                      </div>
                    </td>
                    <td>
                      {resources[event.resourceType] ?? 'Otro recurso'}
                      <div className="portal-id">{event.resourceId ?? 'Sin identificador'}</div>
                    </td>
                    <td>
                      <span className={`portal-outcome ${event.outcome}`}>
                        <Badge value={outcomes[event.outcome] ?? 'Sin resultado conocido'} />
                      </span>
                    </td>
                    <td>
                      <details>
                        <summary>Ver detalles</summary>
                        <pre className="portal-json">
                          {JSON.stringify(event.details ?? {}, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        ) : (
          <Empty>No hay actividad para este filtro.</Empty>
        ))}
    </>
  );
}
