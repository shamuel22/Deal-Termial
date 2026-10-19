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
  logger.log(migration.applied ? 'Migraciones al día' : 'Sin migraciones que aplicar');

  const app = await NestFactory.create(AppModule.forRoot(config), { bufferLogs: false });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const openapi = new DocumentBuilder()
    .setTitle('Deal Terminal API')
    .setDescription('API comercial B2B para agentes de IA con compras autorizadas')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openapi));

  await app.listen(config.PORT, config.HOST);
  logger.log(`Deal Terminal escuchando en http://${config.HOST}:${config.PORT}`);
}

bootstrap().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
