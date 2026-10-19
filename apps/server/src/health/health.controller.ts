import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { DbHandle } from '@deal/db';
import { DB } from '../database.module.js';

@ApiTags('sistema')
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'ok' }> {
    try {
      await this.handle.pool.query('select 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
    return { status: 'ok', database: 'ok' };
  }
}
