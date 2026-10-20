import { createDb, type DbHandle } from './client.js';
import { runMigrations } from './migrate.js';

/**
 * Prepara una base de datos de test limpia y migrada. Por seguridad, se niega a operar
 * sobre una base cuyo nombre no termine en `_test`.
 */
export async function createTestDatabase(url = process.env.TEST_DATABASE_URL): Promise<DbHandle> {
  if (!url) throw new Error('TEST_DATABASE_URL is not defined');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Test database rejected: "${name}" does not end in _test`);
  }
  const reset = createDb(url, { max: 1 });
  try {
    await reset.pool.query(
      'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;',
    );
  } finally {
    await reset.close();
  }
  await runMigrations(url);
  return createDb(url);
}
