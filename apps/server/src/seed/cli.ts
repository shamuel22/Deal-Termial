import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb, runMigrations } from '@deal/db';
import { seedDemo } from './seed-demo.js';

async function main(): Promise<void> {
  const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not defined');
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
    console.log('Demo data created: 3 organizations, 5 agents and 6 active offers.');
    console.log('\nOwner accounts');
    console.table(
      result.owners.map((owner) => ({
        Organization: owner.organizationName,
        Email: owner.email,
        Password: password,
      })),
    );
    console.log('\nAgents - save these API keys; they are shown only when issued');
    console.table(
      result.agents.map((agent) => ({
        Name: agent.name,
        Level: agent.buyerLevel ?? 'seller (no buyer access level)',
        'API key': agent.apiKey,
      })),
    );
    console.log('\nDemo authorizations - authorized budget US$80.00 each');
    console.table(
      result.authorizations.map((authorization) => ({
        Agent: authorization.agentName,
        'Authorization ID': authorization.id,
        'Agent ID': authorization.agentId,
      })),
    );
    console.log(`Delivery deadline (UTC): ${result.deliverBy}. Expires: ${result.expiresAt}.`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    `Could not load demo data: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
