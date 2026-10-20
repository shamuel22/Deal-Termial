import { DomainError } from '@deal/shared';

/**
 * Limita intentos fallidos de inicio de sesión por email e IP (ventana deslizante en memoria).
 * Suficiente para el despliegue de un solo proceso del MVP.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  private key(email: string, ip: string): string {
    return `${email.trim().toLowerCase()}|${ip}`;
  }

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length === 0) this.failures.delete(key);
    else this.failures.set(key, list);
    return list;
  }

  assertAllowed(email: string, ip: string, now = Date.now()): void {
    const list = this.recent(this.key(email, ip), now);
    if (list.length >= this.maxFailures) {
      const retryAfter = Math.ceil((list[0]! + this.windowMs - now) / 1000);
      throw new DomainError('FORBIDDEN', 'Too many failed attempts; wait before trying again', {
        retryAfterSeconds: retryAfter,
      });
    }
  }

  recordFailure(email: string, ip: string, now = Date.now()): void {
    const key = this.key(email, ip);
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(email: string, ip: string): void {
    this.failures.delete(this.key(email, ip));
  }
}
