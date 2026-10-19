import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// En local, toma TEST_DATABASE_URL del .env de la raíz; en CI llega como variable de entorno.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Los tests de integración comparten la base de test: se ejecutan en serie.
export default defineConfig({
  test: { fileParallelism: false },
});
