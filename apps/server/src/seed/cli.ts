import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb, runMigrations } from '@deal/db';
import { seedDemo } from './seed-demo.js';

async function main(): Promise<void> {
  const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está definida');
  const password = process.env.DEMO_PASSWORD ?? 'DealTerminal-demo-2026';
  await runMigrations(url);
  const handle = createDb(url);
  try {
    const result = await seedDemo(handle.db, {
      now: new Date(),
      password,
      sellerMerchantIds: {
        a: process.env.DEMO_SELLER_A_MERCHANT_ID ?? '4Z22N6RZVZKAC',
        b: process.env.DEMO_SELLER_B_MERCHANT_ID ?? 'VW92JVJ8JBR7Q',
      },
    });
    console.log('Datos de demostración creados: 3 organizaciones, 5 agentes y 6 ofertas activas.');
    console.log('\nCuentas de dueños');
    console.table(
      result.owners.map((owner) => ({
        Empresa: owner.organizationName,
        Email: owner.email,
        Contraseña: password,
      })),
    );
    console.log('\nAgentes — guarda estas API keys; se muestran solo al emitirlas');
    console.table(
      result.agents.map((agent) => ({
        Nombre: agent.name,
        Nivel: agent.buyerLevel ?? 'vendedor (sin nivel comprador)',
        'API key': agent.apiKey,
      })),
    );
    console.log('\nAutorizaciones demo — presupuesto US$80.00 cada una');
    console.table(
      result.authorizations.map((authorization) => ({
        Agente: authorization.agentName,
        'ID autorización': authorization.id,
        'ID agente': authorization.agentId,
      })),
    );
    console.log(`Entrega límite (UTC): ${result.deliverBy}. Vencimiento: ${result.expiresAt}.`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    `No se pudo cargar la demo: ${error instanceof Error ? error.message : 'error desconocido'}`,
  );
  process.exitCode = 1;
});
