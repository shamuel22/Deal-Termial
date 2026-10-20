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
  new_authorization: 'Nueva autorización',
  amend_authorization: 'Modificar autorización',
  change_level: 'Cambiar nivel de compra',
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
  const name = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? `Agente ${id}`;
  async function decide(path: string, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    setMessage('');
    if (await action.run(path)) {
      reload();
      setMessage('Cambio registrado.');
    }
  }
  async function saveLimit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const limit = form.has('unlimited') ? null : textFrom(form, 'limit');
    if (
      limit === null &&
      !window.confirm(
        '¿Quitar el límite mensual compartido? Cada encargo conservará su propio presupuesto.',
      )
    )
      return;
    setMessage('');
    if (await limitAction.run(limit)) {
      reload();
      setMessage('Límite mensual actualizado.');
    }
  }
  return (
    <>
      <PageHeader
        title="Autorizaciones"
        subtitle="Define los encargos y límites que tus agentes deben respetar."
        actions={<Link to="/authorizations/new">Nueva autorización</Link>}
      />
      {message && (
        <p className="alert ok" role="status">
          {message}
        </p>
      )}
      <section className="card">
        <h2>Límite mensual compartido</h2>
        <ErrorBox error={monthly.error} />
        {monthly.loading && <Loading />}
        {!monthly.loading && !monthly.error && (
          <>
            {monthly.data ? (
              <>
                <p>Mes {monthly.data.period} (UTC)</p>
                <BudgetView budget={monthly.data} />
              </>
            ) : (
              <p>
                Sin límite mensual. La API no ofrece reservado, consumido ni disponible del mes
                cuando no hay límite.
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
          Es un límite de gasto delegado, no el saldo de tu cuenta bancaria. Los reembolsos no
          restauran automáticamente el presupuesto.
        </p>
      </section>
      <section className="card">
        <h2>Encargos autorizados</h2>
        <ErrorBox error={authorizations.error} />
        <ErrorBox error={agents.error} />
        <ErrorBox error={action.error} />
        {authorizations.loading && <Loading />}
        {authorizations.data?.length === 0 && (
          <Empty>No hay autorizaciones. Crea una para definir el encargo de un agente.</Empty>
        )}
        {authorizations.data?.map((a) => (
          <article className="card" key={a.id}>
            <h3>
              {name(a.agentId)} · <Badge value={a.status} />
            </h3>
            <p className="muted">
              Versión {a.version} · Identificador {a.id}
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
                    '¿Revocar este encargo? Bloqueará nuevas aceptaciones y pagos aún no enviados; no revierte pagos ya enviados.',
                  )
                }
              >
                Revocar autorización
              </button>
            )}
          </article>
        ))}
      </section>
      <section className="card">
        <h2>Solicitudes de los agentes</h2>
        <p>
          Revisa la propuesta completa antes de aprobar: tu aprobación concede los nuevos permisos o
          condiciones.
        </p>
        <ErrorBox error={requests.error} />
        {requests.loading && <Loading />}
        {requests.data?.length === 0 && <Empty>No hay solicitudes de cambio.</Empty>}
        {requests.data?.map((r) => (
          <article className="card" key={r.id}>
            <h3>
              {kinds[r.proposal.kind]} · {name(r.agentId)}
            </h3>
            <RequestStatus status={r.status} />
            <p>Motivo: {r.reason || 'Sin motivo indicado'}</p>
            {r.proposal.kind === 'change_level' ? (
              <p>{levelHelp[r.proposal.buyerLevel]}</p>
            ) : (
              <>
                {r.proposal.authorizationId && (
                  <p>Autorización a modificar: {r.proposal.authorizationId}</p>
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
                      '¿Aprobar esta propuesta con todas las condiciones mostradas y concederlas al agente?',
                    )
                  }
                >
                  Aprobar
                </button>
                <button
                  className="danger"
                  disabled={action.pending}
                  onClick={() =>
                    void decide(
                      `${base}/change-requests/${r.id}/reject`,
                      '¿Rechazar esta solicitud del agente?',
                    )
                  }
                >
                  Rechazar
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
          title="Sin límite mensual"
          name="unlimited"
          checked={unlimited}
          onChange={(e) => setUnlimited(e.target.checked)}
        />
        <MoneyField
          title="Límite mensual (USD)"
          name="limit"
          disabled={unlimited}
          required={!unlimited}
          defaultValue={initial ?? ''}
        />
        <button className="primary">{pending ? 'Guardando…' : 'Guardar límite mensual'}</button>
      </fieldset>
    </form>
  );
}
