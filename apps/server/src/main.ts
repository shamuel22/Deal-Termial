import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { DbHandle } from '@deal/db';
import { runMigrations } from '@deal/db';
import { ConfigError, loadConfig } from '@deal/shared';
import { AppModule } from './app.module.js';
import { DB } from './database.module.js';
import { DealTerminalOAuthProvider, oauthRoutes } from './oauth/oauth-provider.js';

const envFile = join(process.cwd(), '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const config = loadConfig();

  const migration = await runMigrations(config.DATABASE_URL);
  logger.log(migration.applied ? 'Migrations are up to date' : 'No migrations to apply');

  // rawBody: la firma de los webhooks de PayPal se verifica sobre el cuerpo original.
  const app = await NestFactory.create(AppModule.forRoot(config), {
    bufferLogs: false,
    rawBody: true,
  });
  app.setGlobalPrefix('api', { exclude: ['webhooks/{*path}', 'mcp'] });
  app.enableShutdownHooks();
  // Detrás de nginx en la misma máquina: la IP real del cliente llega en X-Forwarded-For.
  // Solo se confía en un proxy local, así nadie puede falsearla desde fuera.
  const http = app.getHttpAdapter().getInstance();
  http.set('trust proxy', 'loopback');
  http.disable('x-powered-by');

  // OAuth 2.1 para clientes MCP (claude.ai, ChatGPT…): metadatos, registro dinámico, autorización,
  // token y revocación con los handlers del SDK de MCP. Va antes que el portal estático.
  const provider = new DealTerminalOAuthProvider(app.get<DbHandle>(DB).db, config.PUBLIC_BASE_URL);
  for (const [path, handler] of oauthRoutes(provider, config.PUBLIC_BASE_URL))
    http.use(path, handler);

  const openapi = new DocumentBuilder()
    .setTitle('Deal Terminal API')
    .setDescription('B2B commerce API for AI agents with authorized purchases')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openapi));

  await app.listen(config.PORT, config.HOST);
  logger.log(`Deal Terminal listening at http://${config.HOST}:${config.PORT}`);
}

bootstrap().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
