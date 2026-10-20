import { Module, type DynamicModule } from '@nestjs/common';
import { DocsController } from './docs.controller.js';
import { DocsService, PORTAL_DIST } from './docs.service.js';

@Module({})
export class DocsModule {
  static forRoot(portalDist: string): DynamicModule {
    return {
      module: DocsModule,
      controllers: [DocsController],
      providers: [DocsService, { provide: PORTAL_DIST, useValue: portalDist }],
    };
  }
}
