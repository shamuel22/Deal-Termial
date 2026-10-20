import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { post } from '../api';
import { ErrorBox } from '../components/ui';
import { useAction } from '../hooks';
import { useSession } from '../session';

export default function LoginPage() {
  const { status, refresh } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAction((body: { email: string; password: string }) => post('/auth/login', body));

  if (status === 'authenticated') return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((await login.run({ email, password })) !== undefined) {
      await refresh();
      navigate('/');
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Deal Terminal</h1>
        <p className="muted">
          Configura y supervisa a los agentes que compran y venden por tu empresa.
        </p>
        <form className="stack" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorBox error={login.error} />
          <button className="primary" disabled={login.pending}>
            {login.pending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="muted">
          ¿Empresa nueva? <Link to="/register">Crear cuenta</Link>
        </p>
      </div>
    </div>
  );
}
