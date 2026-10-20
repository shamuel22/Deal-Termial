import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { post } from '../api';
import {
  AccessFields,
  Field,
  Table,
  accessFrom,
  scopes,
  textFrom,
  type Agent,
} from '../components/forms';
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import { useAction, useResource } from '../hooks';
import { useSession } from '../session';

export default function AgentsPage() {
  const { orgPath } = useSession();
  const base = orgPath('/agents');
  return <Agents key={base} base={base} />;
}
function Agents({ base }: { base: string }) {
  const agents = useResource<Agent[]>(base);
  const [formVersion, setFormVersion] = useState(0);
  const [message, setMessage] = useState('');
  const create = useAction((form: FormData) =>
    post<Agent>(base, {
      name: textFrom(form, 'name'),
      description: textFrom(form, 'description'),
      access: accessFrom(form),
    }),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage('');
    const result = await create.run(new FormData(e.currentTarget));
    if (result) {
      agents.reload();
      setFormVersion((v) => v + 1);
      setMessage(`Agent ${result.name} connected. Open its details to issue a credential.`);
    }
  }
  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="You decide what each agent can do for your organization."
      />
      <ErrorBox error={agents.error} />
      {agents.loading && <Loading />}
      {agents.data &&
        (agents.data.length ? (
          <div className="card">
            <Table title="Organization agents">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Purchase level</th>
                  <th>Sales permissions</th>
                  <th>Active credentials</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/console/agents/${a.id}`}>{a.name}</Link>
                      <div className="muted">{a.description}</div>
                    </td>
                    <td>
                      <Badge value={a.access.buyerLevel ?? 'No purchasing'} />
                    </td>
                    <td>
                      {a.access.sellerScopes.map((scope) => scopes[scope]).join(', ') ||
                        'No sales permissions'}
                    </td>
                    <td className="num">{a.credentials.filter((c) => !c.revokedAt).length}</td>
                    <td>
                      {a.disabledAt ? (
                        <span className="badge bad">Disabled</span>
                      ) : (
                        <Badge value="active" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <Empty>You haven’t connected any agents yet.</Empty>
        ))}
      <section className="card">
        <h2>Connect agent</h2>
        <form key={formVersion} className="stack" onSubmit={submit}>
          <fieldset className="stack" disabled={create.pending}>
            <Field title="Name" name="name" required maxLength={120} />
            <label>
              Description
              <textarea name="description" maxLength={500} rows={3} />
            </label>
            <AccessFields />
            <ErrorBox error={create.error} />
            <button className="primary">{create.pending ? 'Connecting…' : 'Connect agent'}</button>
          </fieldset>
        </form>
        {message && (
          <p className="alert ok" role="status">
            {message}
          </p>
        )}
      </section>
    </>
  );
}
