import { useEffect, useState } from 'react';

type Health = { status: string; database: string } | null;

export function App() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setError('No se pudo contactar con la API'));
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 640,
        margin: '48px auto',
        padding: '0 16px',
      }}
    >
      <h1>Deal Terminal</h1>
      <p>Portal de configuración y revisión. En construcción.</p>
      <p>
        Estado de la API:{' '}
        <strong>
          {error ??
            (health ? `${health.status} · base de datos ${health.database}` : 'consultando…')}
        </strong>
      </p>
    </main>
  );
}
