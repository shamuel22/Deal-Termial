import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { post } from '../api';
import { ErrorBox } from '../components/ui';
import { useAction } from '../hooks';
import { useSession } from '../session';

export default function RegisterPage() {
  const { status, refresh } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ organizationName: '', name: '', email: '', password: '' });
  const register = useAction((body: typeof form) => post('/auth/register', body));

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((await register.run(form)) !== undefined) {
      await refresh();
      navigate('/');
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Crear cuenta de empresa</h1>
        <p className="muted">Serás la persona dueña: decides qué pueden hacer tus agentes.</p>
        <form className="stack" onSubmit={submit}>
          <label>
            Empresa
            <input required value={form.organizationName} onChange={set('organizationName')} />
          </label>
          <label>
            Tu nombre
            <input required value={form.name} onChange={set('name')} />
          </label>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
            />
          </label>
          <label>
            Contraseña (mínimo 12 caracteres)
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={form.password}
              onChange={set('password')}
            />
          </label>
          <ErrorBox error={register.error} />
          <button className="primary" disabled={register.pending}>
            Crear cuenta
          </button>
        </form>
        <p className="muted">
          ¿Ya tienes cuenta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
