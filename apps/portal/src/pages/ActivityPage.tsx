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
export const actions: Record<string, string> = {
  'organization.created': 'Organization registered',
  'organization.monthly_limit_set': 'Monthly limit updated',
  'agent.created': 'Agent connected',
  'agent.access_changed': 'Agent permissions changed',
  'agent.credential_issued': 'Credential issued',
  'agent.credential_revoked': 'Credential revoked',
  'agent.disabled': 'Agent disabled',
  'authorization.created': 'Purchase authorization activated',
  'authorization.amended': 'Authorization terms changed',
  'authorization.revoked': 'Purchase authorization revoked',
  'change_request.submitted': 'Change request submitted',
  'change_request.approved': 'Change request approved',
  'change_request.rejected': 'Change request rejected',
  'product.created': 'Product created',
  'product.updated': 'Product updated',
  'offer.created': 'Offer created',
  'offer.updated': 'Offer terms updated',
  'offer.status_changed': 'Offer status changed',
  'request.created': 'Purchase need recorded',
  'request.cancelled': 'Purchase request cancelled',
  'negotiation.quote_requested': 'Quote requested',
  'negotiation.countered': 'Buyer counteroffer submitted',
  'negotiation.quote_submitted': 'Supplier quote submitted',
  'negotiation.submitted_for_review': 'Offer submitted for owner review',
  'negotiation.counter_accepted': 'Counteroffer accepted by supplier',
  'negotiation.counter_rejected': 'Counteroffer rejected by supplier',
  'negotiation.counter_countered': 'Supplier counteroffer submitted',
  'order.accepted': 'Agreement accepted and order created',
  'order.accept_denied': 'Agreement acceptance blocked',
  'order.cancelled': 'Order cancelled',
  'order.expired': 'Order reservation expired',
  'payment.checkout_started': 'PayPal checkout started',
  'payment.owner_action_required': 'Payment awaiting owner action',
  'payment.dispatched': 'Payment sent to PayPal',
  'payment.completed': 'Payment confirmed',
  'payment.failed': 'Payment failed',
  'payment.requires_action': 'Payment requires action',
  'payment_connection.revoked': 'PayPal consent revoked',
  'refund.requested': 'Refund requested',
  'refund.authorized': 'Refund authorized',
  'refund.rejected': 'Refund rejected',
  'refund.completed': 'Refund confirmed',
  'refund.failed': 'Refund failed',
  'seller_account.onboarding_started': 'Supplier PayPal connection started',
  'seller_account.status_changed': 'Supplier payment status updated',
};
const resources: Record<string, string> = {
  organization: 'Organization',
  agent: 'Agent',
  purchase_authorization: 'Purchase authorization',
  authorization_change_request: 'Change request',
  product: 'Product',
  offer: 'Offer',
  purchase_request: 'Purchase request',
  negotiation: 'Negotiation',
  order: 'Order',
  refund: 'Refund',
  seller_account: 'Supplier PayPal account',
  payment_connection: 'PayPal consent',
};
const actors: Record<string, string> = {
  user: 'Person',
  agent: 'Agent',
  system: 'System',
  paypal: 'PayPal',
  operator: 'Operator',
};
const outcomes: Record<string, string> = {
  allowed: 'Allowed',
  denied: 'Denied',
  succeeded: 'Completed',
  failed: 'Failed',
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
        title="Activity console"
        subtitle="Who acted, what was authorized and what happened. Shows up to 200 recent events."
      />
      <section className="card">
        <label>
          Resource type
          <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
            <option value="">All</option>
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
            <Table title="Organization activity log">
              <thead>
                <tr>
                  <th>Date and time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Outcome</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.at, true)}</td>
                    <td>
                      {actors[event.actor.type] ?? 'Actor'}
                      <div>{event.actor.name ?? event.actor.id ?? 'Name unavailable'}</div>
                    </td>
                    <td>
                      {actions[event.action] ?? 'Other recorded action'}
                      <div className="muted">
                        <code>{event.action}</code>
                      </div>
                    </td>
                    <td>
                      {resources[event.resourceType] ?? 'Other resource'}
                      <div className="portal-id">{event.resourceId ?? 'No ID'}</div>
                    </td>
                    <td>
                      <span className={`portal-outcome ${event.outcome}`}>
                        <Badge value={outcomes[event.outcome] ?? 'Outcome unknown'} />
                      </span>
                    </td>
                    <td>
                      <details>
                        <summary>View details</summary>
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
          <Empty>No activity matches this filter.</Empty>
        ))}
    </>
  );
}
