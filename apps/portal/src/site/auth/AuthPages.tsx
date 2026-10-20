import { AlertCircle, ArrowRight } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { post } from '../../api';
import { useAction } from '../../hooks';
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

export function SignInPage() {
  const t = useCopy();
  const { status, refresh } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAction((body: { email: string; password: string }) => post('/auth/login', body));

  if (status === 'authenticated') return <Navigate to="/console" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((await login.run({ email, password })) !== undefined) {
      await refresh();
      navigate('/console');
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
