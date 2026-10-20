import { AlertCircle, ArrowRight } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { post } from '../../api';
import { useAction, useResource } from '../../hooks';
import { useSession } from '../../session';
import { BrandLockup } from '../components/Brand';
import { SiteShell } from '../components/SiteShell';
import { useCopy } from '../i18n';

function AuthFrame({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <SiteShell title={`${title} — Deal Terminal`}>
      <header className="dt-header">
        <div className="dt-container dt-header__inner">
          <BrandLockup />
        </div>
      </header>
      <main id="main" className="dt-container dt-auth">
        <div className="dt-auth__card">
          <h1>{title}</h1>
          <p className="dt-auth__lede">{lede}</p>
          {children}
        </div>
      </main>
    </SiteShell>
  );
}

function Field(props: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  minLength?: number;
}) {
  const id = useId();
  return (
    <div className="dt-field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        name={props.name}
        type={props.type ?? 'text'}
        spellCheck={props.type === 'email' ? false : undefined}
        autoComplete={props.autoComplete}
        required
        minLength={props.minLength}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-describedby={props.help ? `${id}-help` : undefined}
      />
      {props.help && <small id={`${id}-help`}>{props.help}</small>}
    </div>
  );
}

function ErrorNotice({ message, hint }: { message?: string; hint?: string }) {
  if (!message) return null;
  return (
    <div className="dt-notice dt-notice--error" role="alert">
      <AlertCircle size={18} strokeWidth={1.75} aria-hidden />
      <div>
        <strong>{message}</strong>
        {hint && <p>{hint}</p>}
      </div>
    </div>
  );
}

/** Solo destinos internos: la consola o los retornos de PayPal. Evita redirecciones abiertas. */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return null;
  return value.startsWith('/console') ||
    value.startsWith('/api/paypal/') ||
    value.startsWith('/oauth/consent')
    ? value
    : null;
}

export function SignInPage() {
  const t = useCopy();
  const { status, refresh } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAction((body: { email: string; password: string }) => post('/auth/login', body));
  const next = safeNext(new URLSearchParams(useLocation().search).get('next'));

  // Los retornos de PayPal son rutas del servidor: se recargan fuera del router.
  useEffect(() => {
    if (status === 'authenticated' && next?.startsWith('/api/')) window.location.assign(next);
  }, [status, next]);

  if (status === 'authenticated') {
    return next?.startsWith('/api/') ? null : <Navigate to={next ?? '/console'} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((await login.run({ email, password })) !== undefined) {
      await refresh();
      if (!next?.startsWith('/api/')) navigate(next ?? '/console');
    }
  }

  return (
    <AuthFrame title={t.auth.signInTitle} lede={t.auth.signInLede}>
      <form className="dt-form" onSubmit={submit} noValidate={false}>
        <Field
          name="email"
          label={t.auth.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
        />
        <Field
          name="password"
          label={t.auth.password}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        <ErrorNotice message={login.error?.body.message} hint={login.error?.body.hint} />
        <button
          className="dt-btn dt-btn--primary"
          disabled={login.pending}
          aria-busy={login.pending}
        >
          {login.pending ? t.auth.signingIn : t.auth.signIn}
        </button>
      </form>
      <p className="dt-auth__switch">
        {t.auth.noAccount} <Link to="/register">{t.auth.createAccount}</Link>
      </p>
      <p className="dt-auth__env">{t.auth.environment}</p>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const t = useCopy();
  const { status, refresh } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ organizationName: '', name: '', email: '', password: '' });
  const register = useAction((body: typeof form) => post('/auth/register', body));
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (status === 'authenticated') return <Navigate to="/console" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((await register.run(form)) !== undefined) {
      await refresh();
      navigate('/console/agents');
    }
  }

  return (
    <AuthFrame title={t.auth.registerTitle} lede={t.auth.registerLede}>
      <form className="dt-form" onSubmit={submit}>
        <Field
          name="organizationName"
          label={t.auth.organization}
          autoComplete="organization"
          value={form.organizationName}
          onChange={set('organizationName')}
        />
        <Field
          name="name"
          label={t.auth.name}
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
        />
        <Field
          name="email"
          label={t.auth.email}
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
        />
        <Field
          name="password"
          label={t.auth.password}
          type="password"
          autoComplete="new-password"
          minLength={12}
          help={t.auth.passwordHelp}
          value={form.password}
          onChange={set('password')}
        />
        <ErrorNotice message={register.error?.body.message} hint={register.error?.body.hint} />
        <button
          className="dt-btn dt-btn--primary"
          disabled={register.pending}
          aria-busy={register.pending}
        >
          {register.pending ? t.auth.creating : t.auth.create}
          {!register.pending && <ArrowRight size={18} strokeWidth={1.75} aria-hidden />}
        </button>
      </form>
      <p className="dt-auth__switch">
        {t.auth.haveAccount} <Link to="/login">{t.auth.signIn}</Link>
      </p>
      <p className="dt-auth__env">{t.auth.environment}</p>
    </AuthFrame>
  );
}

interface ConnectionRequest {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'exchanged' | 'expired';
  client: { name: string; redirectHost: string };
  organizations: Array<{
    orgId: string;
    orgName: string;
    agents: Array<{
      id: string;
      name: string;
      buyerLevel: 'search_only' | 'negotiate' | 'full_autonomy' | null;
      sellerScopes: string[];
    }>;
  }>;
}

/**
 * Consentimiento OAuth (claude.ai, ChatGPT…): el dueño elige qué agente representa a la aplicación.
 * La aplicación hereda el nivel y las autorizaciones de ese agente; el servidor decide el resto.
 */
export function ConsentPage() {
  const t = useCopy();
  const c = t.consent;
  const { status } = useSession();
  const location = useLocation();
  const requestId = new URLSearchParams(location.search).get('request') ?? '';
  const request = useResource<ConnectionRequest>(
    status === 'authenticated' && requestId ? `/oauth/requests/${requestId}` : null,
  );
  const [orgId, setOrgId] = useState('');
  const [agentId, setAgentId] = useState('');
  const decide = useAction((path: string, body?: unknown) =>
    post<{ redirectTo: string }>(path, body),
  );

  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  const data = request.data;
  const org = data?.organizations.find((o) => o.orgId === orgId) ?? data?.organizations[0];
  const app = data?.client.name ?? 'The app';

  async function finish(path: string, body?: unknown) {
    const result = await decide.run(path, body);
    if (result) window.location.assign(result.redirectTo);
  }

  function levelLabel(agent: ConnectionRequest['organizations'][number]['agents'][number]) {
    if (agent.buyerLevel) return c.levels[agent.buyerLevel];
    return agent.sellerScopes.length ? c.levels.sellingOnly : c.levels.none;
  }

  return (
    <AuthFrame title={c.title} lede={data ? c.lede(app) : c.loading}>
      {request.error && (
        <ErrorNotice message={request.error.body.message} hint={request.error.body.hint} />
      )}
      {!requestId && <ErrorNotice message={c.expired('the app')} />}
      {data && data.status !== 'pending' && (
        <div className="dt-notice dt-notice--error" role="alert">
          <AlertCircle size={18} strokeWidth={1.75} aria-hidden />
          <p>{c.expired(app)}</p>
        </div>
      )}
      {data && data.status === 'pending' && !org && (
        <p className="dt-consent__note">{c.notOwner}</p>
      )}
      {data && data.status === 'pending' && org && (
        <form
          className="dt-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void finish(`/orgs/${org.orgId}/oauth/requests/${data.id}/approve`, { agentId });
          }}
        >
          {data.organizations.length > 1 && (
            <div className="dt-field">
              <label htmlFor="consent-org">{c.organization}</label>
              <select
                id="consent-org"
                value={org.orgId}
                onChange={(e) => {
                  setOrgId(e.target.value);
                  setAgentId('');
                }}
              >
                {data.organizations.map((o) => (
                  <option key={o.orgId} value={o.orgId}>
                    {o.orgName}
                  </option>
                ))}
              </select>
            </div>
          )}
          {org.agents.length === 0 ? (
            <p className="dt-consent__note">
              {c.noAgents} <Link to="/console/agents">{c.createAgent}</Link>
            </p>
          ) : (
            <fieldset className="dt-choices">
              <legend>{c.actAs}</legend>
              {org.agents.map((agent) => (
                <label key={agent.id} className="dt-choice">
                  <input
                    type="radio"
                    name="agent"
                    value={agent.id}
                    required
                    checked={agentId === agent.id}
                    onChange={() => setAgentId(agent.id)}
                  />
                  <span>
                    <strong>{agent.name}</strong>
                    <span>{levelLabel(agent)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <p className="dt-consent__note">{c.scope}</p>
          <ErrorNotice message={decide.error?.body.message} hint={decide.error?.body.hint} />
          <div className="dt-consent__actions">
            <button
              type="button"
              className="dt-btn dt-btn--secondary"
              disabled={decide.pending}
              onClick={() => void finish(`/orgs/${org.orgId}/oauth/requests/${data.id}/deny`)}
            >
              {c.cancel}
            </button>
            <button
              className="dt-btn dt-btn--primary"
              disabled={decide.pending || !agentId}
              aria-busy={decide.pending}
            >
              {decide.pending ? c.connecting : c.connect}
            </button>
          </div>
          <p className="dt-auth__env">{c.returnTo(data.client.redirectHost)}</p>
        </form>
      )}
    </AuthFrame>
  );
}
