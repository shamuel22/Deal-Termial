import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { runMigrations } from '@deal/db';
import { ConfigError, loadConfig } from '@deal/shared';
import { AppModule } from './app.module.js';

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
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');

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
