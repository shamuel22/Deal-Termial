import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.js';

/** Carpeta de migraciones SQL, publicada junto al paquete (fuera de dist). */
export const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Aplica las migraciones pendientes. Es seguro ejecutarlo en cada arranque. */
export async function runMigrations(connectionString: string): Promise<{ applied: boolean }> {
  if (!existsSync(join(migrationsFolder, 'meta', '_journal.json'))) {
    return { applied: false };
  }
  const handle = createDb(connectionString, { max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
    return { applied: true };
  } finally {
    await handle.close();
  }
}
