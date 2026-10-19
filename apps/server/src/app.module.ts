import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module, type DynamicModule } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import type { AppConfig } from '@deal/shared';
import { ConfigModule } from './config.module.js';
import { DatabaseModule } from './database.module.js';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AgentSelfController, AgentsController } from './agents/agents.controller.js';
import { AuthController } from './auth/auth.controller.js';
import {
  AgentAuthorizationController,
  AuthorizationsController,
} from './authorizations/authorizations.controller.js';
import { CatalogController, AgentCatalogController } from './catalog/catalog.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { HealthController } from './health/health.controller.js';
import { McpController } from './mcp/mcp.controller.js';
import {
  AgentPaymentsController,
  PayPalReturnController,
  PayPalWebhookController,
  PortalPaymentsController,
} from './payments/payments.controller.js';
import { PaymentsModule } from './payments/payments.module.js';
import { SchedulerService } from './payments/scheduler.service.js';
import { AgentOrdersController, PortalOrdersController } from './orders/orders.controller.js';
import { AgentMarketController, PortalMarketController } from './market/market.controller.js';
import {
  AgentNegotiationController,
  PortalNegotiationController,
} from './negotiation/negotiation.controller.js';
import { DomainExceptionFilter } from './http/domain-exception.filter.js';

/** Portal React compilado (apps/portal/dist), servido por el mismo proceso. */
export const portalDist = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'portal',
  'dist',
);

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    const imports: DynamicModule['imports'] = [
      ConfigModule.forRoot(config),
      DatabaseModule,
      PaymentsModule,
    ];
    if (existsSync(portalDist)) {
      imports.push(
        ServeStaticModule.forRoot({
          rootPath: portalDist,
          exclude: ['/api/{*path}', '/mcp/{*path}', '/webhooks/{*path}'],
        }),
      );
    }
    return {
      module: AppModule,
      imports,
      controllers: [
        HealthController,
        AuthController,
        AgentsController,
        AgentSelfController,
        AuthorizationsController,
        AgentAuthorizationController,
        AgentMarketController,
        PortalMarketController,
        AgentNegotiationController,
        PortalNegotiationController,
        AgentOrdersController,
        PortalOrdersController,
        PortalPaymentsController,
        AgentPaymentsController,
        PayPalReturnController,
        PayPalWebhookController,
        McpController,
        CatalogController,
        AgentCatalogController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
        SchedulerService,
      ],
    };
  }
}
