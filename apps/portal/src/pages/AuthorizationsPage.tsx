import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { post, put } from '../api';
import {
  BudgetView,
  Check,
  MoneyField,
  RequestStatus,
  TermsSummary,
  levelHelp,
  textFrom,
  type Agent,
  type Authorization,
  type Budget,
  type BuyerLevel,
  type TermsInput,
} from '../components/forms';
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';

type Proposal =
  | { kind: 'change_level'; buyerLevel: BuyerLevel }
  | {
      kind: 'new_authorization' | 'amend_authorization';
      authorizationId?: string;
      terms: TermsInput;
    };
interface ChangeRequest {
  id: string;
  agentId: string;
  reason: string | null;
  status: string;
  proposal: Proposal;
}
const kinds = {
  new_authorization: 'New purchase authorization',
  amend_authorization: 'Amend purchase authorization',
  change_level: 'Change purchase level',
};
export default function AuthorizationsPage() {
  const { orgPath } = useSession();
  const base = orgPath('');
  return <Authorizations key={base} base={base} />;
}
function Authorizations({ base }: { base: string }) {
  const monthly = useResource<(Budget & { period: string }) | null>(`${base}/budget/monthly`);
  const authorizations = useResource<Authorization[]>(`${base}/authorizations`);
  const agents = useResource<Agent[]>(`${base}/agents`);
  const requests = useResource<ChangeRequest[]>(`${base}/change-requests`);
  const [message, setMessage] = useState('');
  const action = useAction(async (path: string) => {
    await post(path);
    return true;
  });
  const limitAction = useAction((limit: string | null) =>
    put<{ monthlySpendLimit: string | null }>(`${base}/budget/monthly`, {
      monthlySpendLimit: limit,
    }),
  );
  const reload = () => {
    monthly.reload();
    authorizations.reload();
    agents.reload();
    requests.reload();
  };
  const name = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? `Agent ${id}`;
  async function decide(path: string, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    setMessage('');
    if (await action.run(path)) {
      reload();
      setMessage('Change recorded.');
    }
  }
  async function saveLimit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const limit = form.has('unlimited') ? null : textFrom(form, 'limit');
    if (
      limit === null &&
      !window.confirm(
        'Remove the shared monthly limit? Each assignment will keep its own authorized budget.',
      )
    )
      return;
    setMessage('');
    if (await limitAction.run(limit)) {
      reload();
      setMessage('Monthly limit updated.');
    }
  }
  return (
    <>
      <PageHeader
        title="Purchase authorizations"
        subtitle="Set the assignments and limits your agents must follow."
        actions={<Link to="/console/authorizations/new">New purchase authorization</Link>}
      />
      {message && (
        <p className="alert ok" role="status">
          {message}
        </p>
      )}
      <section className="card">
        <h2>Shared monthly limit</h2>
        <ErrorBox error={monthly.error} />
        {monthly.loading && <Loading />}
        {!monthly.loading && !monthly.error && (
          <>
            {monthly.data ? (
              <>
                <p>Month {monthly.data.period} (UTC)</p>
                <BudgetView budget={monthly.data} />
              </>
            ) : (
              <p>
                No monthly limit. Monthly committed, spent and available amounts are not provided
                when no limit is set.
              </p>
            )}
            <MonthlyForm
              key={monthly.data?.limit ?? 'unlimited'}
              initial={monthly.data?.limit ?? null}
              pending={limitAction.pending}
              onSubmit={saveLimit}
            />
          </>
        )}
        <ErrorBox error={limitAction.error} />
        <p className="muted">
          This is a delegated spending limit, not your bank balance. Refunds do not automatically
          restore the budget.
        </p>
      </section>
      <section className="card">
        <h2>Authorized assignments</h2>
        <ErrorBox error={authorizations.error} />
        <ErrorBox error={agents.error} />
        <ErrorBox error={action.error} />
        {authorizations.loading && <Loading />}
        {authorizations.data?.length === 0 && (
          <Empty>No purchase authorizations. Create one to define an agent’s assignment.</Empty>
        )}
        {authorizations.data?.map((a) => (
          <article className="card" key={a.id}>
            <h3>
              {name(a.agentId)} · <Badge value={a.status} />
            </h3>
            <p className="muted">
              Version {a.version} · ID {a.id}
            </p>
            <div className="grid">
              <TermsSummary terms={a.terms} />
              <BudgetView budget={a.budget} />
            </div>
            {a.status !== 'revoked' && (
              <button
                className="danger"
                disabled={action.pending}
                onClick={() =>
                  void decide(
                    `${base}/authorizations/${a.id}/revoke`,
                    'Revoke access for this assignment? New purchases will be blocked. Payments already processing will still be checked.',
                  )
                }
              >
                Revoke access
              </button>
            )}
          </article>
        ))}
      </section>
      <section className="card">
        <h2>Agent requests</h2>
        <p>
          Review the full proposal before approving. Your approval grants the new permissions or
          terms.
        </p>
        <ErrorBox error={requests.error} />
        {requests.loading && <Loading />}
        {requests.data?.length === 0 && <Empty>No change requests.</Empty>}
        {requests.data?.map((r) => (
          <article className="card" key={r.id}>
            <h3>
              {kinds[r.proposal.kind]} · {name(r.agentId)}
            </h3>
            <RequestStatus status={r.status} />
            <p>Reason: {r.reason || 'No reason provided'}</p>
            {r.proposal.kind === 'change_level' ? (
              <p>{levelHelp[r.proposal.buyerLevel]}</p>
            ) : (
              <>
                {r.proposal.authorizationId && (
                  <p>Purchase authorization to amend: {r.proposal.authorizationId}</p>
                )}
                <TermsSummary terms={r.proposal.terms} />
              </>
            )}
            {r.status === 'pending' && (
              <div className="actions">
                <button
                  className="primary"
                  disabled={action.pending}
                  onClick={() =>
                    void decide(
                      `${base}/change-requests/${r.id}/approve`,
                      'Approve this proposal with all the terms shown and grant them to the agent?',
                    )
                  }
                >
                  Approve
                </button>
                <button
                  className="danger"
                  disabled={action.pending}
                  onClick={() =>
                    void decide(
                      `${base}/change-requests/${r.id}/reject`,
                      'Reject this agent’s request?',
                    )
                  }
                >
                  Reject
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
function MonthlyForm({
  initial,
  pending,
  onSubmit,
}: {
  initial: string | null;
  pending: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [unlimited, setUnlimited] = useState(initial === null);
  return (
    <form className="stack" onSubmit={onSubmit}>
      <fieldset className="stack" disabled={pending}>
        <Check
          title="No monthly limit"
          name="unlimited"
          checked={unlimited}
          onChange={(e) => setUnlimited(e.target.checked)}
        />
        <MoneyField
          title="Monthly limit (USD, UTC)"
          name="limit"
          disabled={unlimited}
          required={!unlimited}
          defaultValue={initial ?? ''}
        />
        <button className="primary">{pending ? 'Saving…' : 'Save monthly limit'}</button>
      </fieldset>
    </form>
  );
}
