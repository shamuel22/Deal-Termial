import { describe, expect, it } from 'vitest';
import { LoginLimiter } from '../src/auth/login-limiter.js';

describe('LoginLimiter', () => {
  it('bloquea tras demasiados fallos y libera al pasar la ventana', () => {
    const limiter = new LoginLimiter(3, 1000);
    for (let i = 0; i < 3; i++) limiter.recordFailure('Ana@x.test', '1.1.1.1', i);
    expect(() => limiter.assertAllowed('ana@x.test', '1.1.1.1', 10)).toThrow(/Demasiados intentos/);
    // Otra IP o pasado el tiempo, se permite.
    expect(() => limiter.assertAllowed('ana@x.test', '2.2.2.2', 10)).not.toThrow();
    expect(() => limiter.assertAllowed('ana@x.test', '1.1.1.1', 1001)).not.toThrow();
  });

  it('un acceso correcto reinicia el contador', () => {
    const limiter = new LoginLimiter(2, 1000);
    limiter.recordFailure('a@x.test', 'ip', 0);
    limiter.reset('a@x.test', 'ip');
    limiter.recordFailure('a@x.test', 'ip', 1);
    expect(() => limiter.assertAllowed('a@x.test', 'ip', 2)).not.toThrow();
  });
});
