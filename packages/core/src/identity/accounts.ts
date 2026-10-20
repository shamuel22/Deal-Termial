import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { inTransaction, type Executor } from '../db.js';
import type { MemberRole, UserActor } from './actor.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './secrets.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const registerInput = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12, 'The password must contain at least 12 characters').max(200),
  organizationName: z.string().trim().min(1).max(160),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInput>;

export interface SessionIssued {
  token: string;
  expiresAt: Date;
  userId: string;
}

export interface Membership {
  orgId: string;
  orgName: string;
  role: MemberRole;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Alta de una empresa: crea el usuario dueño, la organización y la membresía en una transacción. */
export async function registerOwner(
  db: Executor,
  input: RegisterInput,
): Promise<{ userId: string; orgId: string }> {
  const data = registerInput.parse(input);
  const passwordHash = await hashPassword(data.password);
  return inTransaction(db, async (tx) => {
    const existing = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${normalizeEmail(data.email)}`);
    if (existing.length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'An account with that email already exists', {
        field: 'email',
      });
    }
    const [user] = await tx
      .insert(schema.users)
      .values({ email: normalizeEmail(data.email), name: data.name, passwordHash })
      .returning({ id: schema.users.id });
    const [org] = await tx
      .insert(schema.organizations)
      .values({ name: data.organizationName })
      .returning({ id: schema.organizations.id });
    await tx.insert(schema.memberships).values({ orgId: org!.id, userId: user!.id, role: 'owner' });
    await audit(tx, {
      orgId: org!.id,
      actorType: 'user',
      actorId: user!.id,
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: org!.id,
      outcome: 'succeeded',
    });
    return { userId: user!.id, orgId: org!.id };
  });
}

// Hash ficticio para igualar el tiempo de respuesta cuando el email no existe.
let dummyHash: Promise<string> | undefined;

export async function login(db: Executor, input: LoginInput): Promise<SessionIssued> {
  const data = loginInput.parse(input);
  const [user] = await db
    .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${normalizeEmail(data.email)}`);

  dummyHash ??= hashPassword(randomToken());
  const valid = await verifyPassword(data.password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid) {
    throw new DomainError('UNAUTHENTICATED', 'Incorrect email or password');
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({ userId: user.id, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt, userId: user.id };
}

export async function logout(db: Executor, token: string): Promise<void> {
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), isNull(schema.sessions.revokedAt)));
}

/** Devuelve el usuario de una sesión vigente, o null si no existe, venció o fue revocada. */
export async function resolveSession(
  db: Executor,
  token: string,
): Promise<{ userId: string; email: string; name: string } | null> {
  const [row] = await db
    .select({ userId: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(
      and(
        eq(schema.sessions.tokenHash, sha256(token)),
        isNull(schema.sessions.revokedAt),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

export async function listMemberships(db: Executor, userId: string): Promise<Membership[]> {
  return db
    .select({
      orgId: schema.memberships.orgId,
      orgName: schema.organizations.name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, userId));
}

/**
 * Construye el actor de un usuario dentro de una organización. Si no es miembro, responde
 * NOT_FOUND (no FORBIDDEN) para no revelar la existencia de organizaciones ajenas.
 */
export async function resolveUserActor(
  db: Executor,
  userId: string,
  orgId: string,
): Promise<UserActor> {
  if (!z.uuid().safeParse(orgId).success) {
    throw new DomainError('NOT_FOUND', 'Organization not found');
  }
  const [membership] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.orgId, orgId)));
  if (!membership) {
    throw new DomainError('NOT_FOUND', 'Organization not found');
  }
  return { kind: 'user', userId, orgId, role: membership.role };
}
