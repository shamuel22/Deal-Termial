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
        '¿Reducir las facultades de este agente? Bloqueará las nuevas operaciones que ya no estén permitidas. Los pagos enviados no se revierten.',
      )
    )
      return;
    setMessage('');
    if (await change.run(form)) {
      reload();
      setMessage('Facultades actualizadas. Se aplicarán en la próxima operación del agente.');
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
    if (!window.confirm('¿Revocar esta credencial? El cliente que la use perderá el acceso.'))
      return;
    if (await revoke.run(id)) {
      if (secret?.credentialId === id) setSecret(null);
      reload();
      setMessage('Credencial revocada.');
    }
  }
  async function disableAgent() {
    if (
      !window.confirm(
        '¿Deshabilitar este agente y revocar todas sus credenciales? No podrá realizar nuevas operaciones. Esto no revierte pagos ya enviados.',
      )
    )
      return;
    if (await disable.run()) {
      setSecret(null);
      reload();
      setMessage('Agente deshabilitado y credenciales revocadas.');
    }
  }
  const mcpUrl = `${location.origin}/mcp`;
  return (
    <>
      <PageHeader
        title={agent.data?.name ?? 'Agente'}
        subtitle={agent.data?.description ?? undefined}
        actions={<Link to="/agents">Todos los agentes</Link>}
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
              Agente deshabilitado el {formatDate(agent.data.disabledAt, true)}.
            </p>
          )}
          <section className="card">
            <h2>Acceso concedido por el dueño</h2>
            <p>
              Versión vigente: {agent.data.access.version}. Concedida por{' '}
              {agent.data.access.grantedByUserId === me?.user.id
                ? me.user.name
                : `usuario ${agent.data.access.grantedByUserId}`}{' '}
              el {formatDate(agent.data.access.grantedAt, true)}.
            </p>
            <form key={agent.data.access.version} className="stack" onSubmit={save}>
              <fieldset className="stack" disabled={pending || !!agent.data.disabledAt}>
                <AccessFields initial={agent.data.access} />
                <button className="primary">
                  {change.pending ? 'Guardando…' : 'Guardar facultades'}
                </button>
              </fieldset>
              <ErrorBox error={change.error} />
            </form>
            <p className="muted">
              Reducir o revocar permisos bloquea nuevas aceptaciones y pagos aún no enviados. Los
              pagos en curso se concilian; los ya cobrados requieren devolución.
            </p>
          </section>
          <section className="card">
            <h2>Credenciales</h2>
            <button
              onClick={() => void emit()}
              disabled={pending || !!agent.data.disabledAt || !!secret}
            >
              Emitir credencial
            </button>
            <ErrorBox error={issue.error} />
            <ErrorBox error={revoke.error} />
            {secret && (
              <div className="alert warn">
                <strong>Guárdala ahora: no se volverá a mostrar.</strong>
                <p>
                  Configúrala en tu cliente MCP. No la pegues en una conversación con el modelo.
                </p>
                <div className="secret">{secret.apiKey}</div>
                <div className="actions">
                  <button
                    disabled={copy.pending}
                    onClick={async () => {
                      if (await copy.run()) setCopied(true);
                    }}
                  >
                    {copied ? 'Copiada' : 'Copiar credencial'}
                  </button>
                  <button onClick={() => setSecret(null)}>Ocultar credencial</button>
                </div>
                <ErrorBox error={copy.error} />
              </div>
            )}
            {agent.data.credentials.length ? (
              <Table title="Credenciales del agente">
                <thead>
                  <tr>
                    <th>Prefijo</th>
                    <th>Creada</th>
                    <th>Último uso</th>
                    <th>Revocada</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.data.credentials.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <code>{c.keyPrefix}</code>
                      </td>
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
                            Revocar credencial
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>Emite una credencial para conectar el cliente del agente.</Empty>
            )}
          </section>
          <section className="card">
            <h2>Conexión MCP</h2>
            <dl className="kv">
              <dt>URL</dt>
              <dd>
                <code>{mcpUrl}</code>
              </dd>
              <dt>Cabecera</dt>
              <dd>
                <code>Authorization: Bearer &lt;credencial&gt;</code>
              </dd>
            </dl>
            <p>
              En Claude Code, configura la variable de entorno <code>DEAL_TERMINAL_KEY</code> con tu
              credencial y ejecuta:
            </p>
            <pre className="secret portal-message">{`claude mcp add --transport http deal-terminal ${mcpUrl} \\\n  --header "Authorization: Bearer \${DEAL_TERMINAL_KEY}"`}</pre>
          </section>
          <section className="card">
            <h2>Autorizaciones del agente</h2>
            <ErrorBox error={authorizations.error} />
            {authorizations.loading && <Loading />}
            {authorizations.data &&
              (authorizations.data.length ? (
                <ul>
                  {authorizations.data.map((a) => (
                    <li key={a.id}>
                      {a.terms.mandate} <Badge value={a.status} /> · versión {a.version}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Sin autorizaciones de compra.</Empty>
              ))}
            <Link to="/authorizations">Administrar autorizaciones</Link>
          </section>
          <section className="card">
            <h2>Deshabilitar agente</h2>
            <p>Revoca todas sus credenciales e impide nuevas operaciones.</p>
            <ErrorBox error={disable.error} />
            <button
              className="danger"
              disabled={pending || !!agent.data.disabledAt}
              onClick={() => void disableAgent()}
            >
              Deshabilitar agente
            </button>
          </section>
        </>
      )}
    </>
  );
}
