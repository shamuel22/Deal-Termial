import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { del, post, put } from '../api';
import {
  AccessFields,
  Table,
  accessFrom,
  type Agent,
  type Authorization,
} from '../components/forms';
import { Badge, Empty, ErrorBox, Loading, PageHeader, formatDate } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';

interface IssuedCredential {
  credentialId: string;
  keyPrefix: string;
  apiKey: string;
}
export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const { orgPath } = useSession();
  const base = orgPath(`/agents/${agentId ?? ''}`);
  return (
    <AgentDetail
      key={base}
      base={base}
      authorizationsPath={orgPath(`/authorizations?agentId=${encodeURIComponent(agentId ?? '')}`)}
    />
  );
}
function AgentDetail({ base, authorizationsPath }: { base: string; authorizationsPath: string }) {
  const { me } = useSession();
  const agent = useResource<Agent>(base);
  const authorizations = useResource<Authorization[]>(authorizationsPath);
  const [secret, setSecret] = useState<IssuedCredential | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const change = useAction((form: FormData) => put<Agent>(`${base}/access`, accessFrom(form)));
  const issue = useAction(() => post<IssuedCredential>(`${base}/credentials`));
  const revoke = useAction(async (id: string) => {
    await del(`${base}/credentials/${id}`);
    return true;
  });
  const disable = useAction(async () => {
    await del(base);
    return true;
  });
  const copy = useAction(async () => {
    if (secret) await navigator.clipboard.writeText(secret.apiKey);
    return true;
  });
  const pending = change.pending || issue.pending || revoke.pending || disable.pending;
  const reload = () => {
    agent.reload();
    authorizations.reload();
  };
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = accessFrom(form);
    const current = agent.data?.access;
    const levels = ['search_only', 'negotiate', 'full_autonomy'];
    const reducing =
      current &&
      (levels.indexOf(next.buyerLevel ?? '') < levels.indexOf(current.buyerLevel ?? '') ||
        current.sellerScopes.some((scope) => !next.sellerScopes.includes(scope)));
    if (
      reducing &&
      !window.confirm(
        'Reduce this agent’s permissions? New operations outside its permissions will be blocked. Payments already processing will still be checked.',
      )
    )
      return;
    setMessage('');
    if (await change.run(form)) {
      reload();
      setMessage('Permissions updated. They apply to the agent’s next operation.');
    }
  }
  async function emit() {
    const result = await issue.run();
    if (result) {
      setSecret(result);
      setCopied(false);
      reload();
    }
  }
  async function revokeKey(id: string) {
    if (
      !window.confirm(
        'Revoke this credential? The client using it will lose access. New purchases will be blocked. Payments already processing will still be checked.',
      )
    )
      return;
    if (await revoke.run(id)) {
      if (secret?.credentialId === id) setSecret(null);
      reload();
      setMessage('Credential revoked.');
    }
  }
  async function disableAgent() {
    if (
      !window.confirm(
        'Disable this agent and revoke all its credentials? New purchases will be blocked. Payments already processing will still be checked.',
      )
    )
      return;
    if (await disable.run()) {
      setSecret(null);
      reload();
      setMessage('Agent disabled and credentials revoked.');
    }
  }
  const mcpUrl = `${location.origin}/mcp`;
  return (
    <>
      <PageHeader
        title={agent.data?.name ?? 'Agent'}
        subtitle={agent.data?.description ?? undefined}
        actions={<Link to="/console/agents">All agents</Link>}
      />
      <ErrorBox error={agent.error} />
      {agent.loading && <Loading />}
      {message && (
        <p className="alert ok" role="status">
          {message}
        </p>
      )}
      {agent.data && (
        <>
          {agent.data.disabledAt && (
            <p className="alert warn">
              Agent disabled on {formatDate(agent.data.disabledAt, true)}.
            </p>
          )}
          <section className="card">
            <h2>Access granted by the owner</h2>
            <p>
              Current version: {agent.data.access.version}. Granted by{' '}
              {agent.data.access.grantedByUserId === me?.user.id
                ? me.user.name
                : `user ${agent.data.access.grantedByUserId}`}{' '}
              on {formatDate(agent.data.access.grantedAt, true)}.
            </p>
            <form key={agent.data.access.version} className="stack" onSubmit={save}>
              <fieldset className="stack" disabled={pending || !!agent.data.disabledAt}>
                <AccessFields initial={agent.data.access} />
                <button className="primary">
                  {change.pending ? 'Saving…' : 'Save permissions'}
                </button>
              </fieldset>
              <ErrorBox error={change.error} />
            </form>
            <p className="muted">
              New purchases will be blocked. Payments already processing will still be checked.
              Payments already collected require a refund.
            </p>
          </section>
          <section className="card">
            <h2>Credentials</h2>
            <button
              onClick={() => void emit()}
              disabled={pending || !!agent.data.disabledAt || !!secret}
            >
              Issue credential
            </button>
            <ErrorBox error={issue.error} />
            <ErrorBox error={revoke.error} />
            {secret && (
              <div className="alert warn">
                <strong>Save it now. It won’t be shown again.</strong>
                <p>Set it in your MCP client. Don’t paste it into a conversation with the model.</p>
                <div className="secret">{secret.apiKey}</div>
                <div className="actions">
                  <button
                    disabled={copy.pending}
                    onClick={async () => {
                      if (await copy.run()) setCopied(true);
                    }}
                  >
                    {copied ? 'Copied' : 'Copy credential'}
                  </button>
                  <button onClick={() => setSecret(null)}>Hide credential</button>
                </div>
                <ErrorBox error={copy.error} />
              </div>
            )}
            {agent.data.credentials.length ? (
              <Table title="Agent credentials">
                <thead>
                  <tr>
                    <th>Prefix</th>
                    <th>Created</th>
                    <th>Last used</th>
                    <th>Revoked</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.data.credentials.map((c) => (
                    <tr key={c.id}>
                      <td>{c.label ? `${c.label} (OAuth)` : <code>{c.keyPrefix}</code>}</td>
                      <td>{formatDate(c.createdAt, true)}</td>
                      <td>{formatDate(c.lastUsedAt, true)}</td>
                      <td>{c.revokedAt ? formatDate(c.revokedAt, true) : 'No'}</td>
                      <td>
                        {!c.revokedAt && (
                          <button
                            className="danger"
                            disabled={pending}
                            onClick={() => void revokeKey(c.id)}
                          >
                            Revoke access
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>Issue a credential to connect the agent’s client.</Empty>
            )}
          </section>
          <section className="card">
            <h2>MCP connection</h2>
            <dl className="kv">
              <dt>URL</dt>
              <dd>
                <code>{mcpUrl}</code>
              </dd>
              <dt>Header</dt>
              <dd>
                <code>Authorization: Bearer &lt;credential&gt;</code>
              </dd>
            </dl>
            <p>
              In Claude Code, set the environment variable <code>DEAL_TERMINAL_KEY</code> to your
              credential and run:
            </p>
            <pre className="secret portal-message">{`claude mcp add --transport http deal-terminal ${mcpUrl} \\\n  --header "Authorization: Bearer \${DEAL_TERMINAL_KEY}"`}</pre>
          </section>
          <section className="card">
            <h2>Agent purchase authorizations</h2>
            <ErrorBox error={authorizations.error} />
            {authorizations.loading && <Loading />}
            {authorizations.data &&
              (authorizations.data.length ? (
                <ul>
                  {authorizations.data.map((a) => (
                    <li key={a.id}>
                      {a.terms.mandate} <Badge value={a.status} /> · version {a.version}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No purchase authorizations.</Empty>
              ))}
            <Link to="/console/authorizations">Manage purchase authorizations</Link>
          </section>
          <section className="card">
            <h2>Disable agent</h2>
            <p>Revokes all its credentials and blocks new operations.</p>
            <ErrorBox error={disable.error} />
            <button
              className="danger"
              disabled={pending || !!agent.data.disabledAt}
              onClick={() => void disableAgent()}
            >
              Disable agent
            </button>
          </section>
        </>
      )}
    </>
  );
}
