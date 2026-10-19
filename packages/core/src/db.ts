import type { Database } from '@deal/db';

/** Transacción de Drizzle sobre la base de datos de la aplicación. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Cualquier ejecutor de consultas: la conexión o una transacción en curso. */
export type Executor = Database | Tx;

/** Ejecuta `fn` en una transacción; si ya estamos dentro de una, la reutiliza. */
export async function inTransaction<T>(db: Executor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (isTransaction(db)) return fn(db);
  return (db as Database).transaction(fn);
}

function isTransaction(db: Executor): db is Tx {
  return 'rollback' in db;
}
