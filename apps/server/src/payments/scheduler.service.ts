import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { DbHandle } from '@deal/db';
import {
  expireAuthorizations,
  expireQuotes,
  expireUnpaidOrders,
  reconcilePendingPayments,
  reconcileRefunds,
  retryWebhooks,
  type PaymentGateway,
} from '@deal/core';
import type { AppConfig } from '@deal/shared';
import { APP_CONFIG } from '../config.module.js';
import { DB } from '../database.module.js';
import { PAYMENT_GATEWAY } from './payments.module.js';

/** Clave del advisory lock de Postgres: una sola instancia ejecuta los barridos a la vez. */
const LOCK_KEY = 7_342_001;

/**
 * Tareas periódicas en el mismo proceso: vencimientos, reconciliación de pagos y reembolsos,
 * y reintento de webhooks. Cada tarea es idempotente; un fallo no detiene las demás.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Scheduler');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.SCHEDULER_INTERVAL_MS === 0) return;
    this.timer = setInterval(() => void this.tick(), this.config.SCHEDULER_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    const client = await this.handle.pool.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'select pg_try_advisory_lock($1) as locked',
        [LOCK_KEY],
      );
      if (!rows[0]?.locked) return;
      try {
        const db = this.handle.db;
        const tasks: Array<[string, () => Promise<number>]> = [
          ['expired quotes', () => expireQuotes(db, now)],
          ['expired authorizations', () => expireAuthorizations(db, now)],
          ['payments to reconcile', () => reconcilePendingPayments(db, this.gateway, now)],
          ['expired unpaid orders', () => expireUnpaidOrders(db, now)],
          ['refunds in progress', () => reconcileRefunds(db, this.gateway)],
          ['pending webhooks', () => retryWebhooks(db, this.gateway, now)],
        ];
        for (const [name, task] of tasks) {
          try {
            const count = await task();
            if (count > 0) this.logger.log(`${name}: ${count}`);
          } catch (error) {
            this.logger.error(`${name}: ${(error as Error).message}`);
          }
        }
      } finally {
        await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
      }
    } finally {
      client.release();
      this.running = false;
    }
  }
}
