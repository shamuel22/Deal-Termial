import { and, eq } from 'drizzle-orm';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { inTransaction, type Executor, type Tx } from '../db.js';
import { sha256 } from '../identity/secrets.js';

/**
 * Ejecuta una escritura una sola vez por clave de idempotencia (brief §12).
 *
 * La clave se inserta dentro de la misma transacción que la operación: un reintento concurrente
 * queda bloqueado por el índice único hasta que la primera transacción confirma, y entonces
 * devuelve la respuesta guardada. La misma clave con otros datos es un error.
 */
export async function withIdempotency<T>(
  db: Executor,
  args: { scope: string; key: string | undefined; operation: string; payload: unknown },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!args.key) return inTransaction(db, fn);
  if (args.key.length > 200) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'La clave de idempotencia admite hasta 200 caracteres',
    );
  }
  const requestHash = sha256(
    JSON.stringify({ operation: args.operation, payload: args.payload ?? null }),
  );
  return inTransaction(db, async (tx) => {
    const inserted = await tx
      .insert(schema.idempotencyKeys)
      .values({ scope: args.scope, key: args.key!, operation: args.operation, requestHash })
      .onConflictDoNothing({ target: [schema.idempotencyKeys.scope, schema.idempotencyKeys.key] })
      .returning({ id: schema.idempotencyKeys.id });

    if (inserted.length === 0) {
      const [existing] = await tx
        .select()
        .from(schema.idempotencyKeys)
        .where(
          and(
            eq(schema.idempotencyKeys.scope, args.scope),
            eq(schema.idempotencyKeys.key, args.key!),
          ),
        );
      if (!existing || existing.requestHash !== requestHash) {
        throw new DomainError(
          'IDEMPOTENCY_KEY_REUSED',
          'La clave ya se usó con otra operación o datos',
        );
      }
      return existing.response as T;
    }

    const result = await fn(tx);
    await tx
      .update(schema.idempotencyKeys)
      .set({ response: JSON.parse(JSON.stringify(result ?? null)), completedAt: new Date() })
      .where(eq(schema.idempotencyKeys.id, inserted[0]!.id));
    return result;
  });
}
