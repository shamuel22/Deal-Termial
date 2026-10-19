import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { DbHandle } from '@deal/db';
import {
  resolveAgentKey,
  resolveSession,
  resolveUserActor,
  type Actor,
  type AgentActor,
  type UserActor,
} from '@deal/core';
import { DomainError } from '@deal/shared';
import { DB } from '../database.module.js';

export const SESSION_COOKIE = 'dt_session';

/** Qué tipo de actor admite una ruta. */
export type AuthMode = 'session' | 'org-user' | 'agent' | 'org-actor';
const AUTH_MODE = 'auth_mode';

/**
 * - `session`: usuario con sesión, sin organización (p. ej. /me).
 * - `org-user`: usuario miembro de la organización `:orgId` de la ruta.
 * - `agent`: agente autenticado por credencial.
 * - `org-actor`: agente, o usuario miembro de `:orgId`.
 */
export const Auth = (mode: AuthMode) => SetMetadata(AUTH_MODE, mode);

export interface AuthedRequest extends Request {
  authSession?: { userId: string; email: string; name: string; token: string };
  actor?: Actor;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function bearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

/**
 * Guard global. Las rutas sin `@Auth` son públicas. La identidad, la organización y el nivel
 * se resuelven siempre en el servidor a partir de la credencial o la sesión.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DB) private readonly handle: DbHandle,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.getAllAndOverride<AuthMode | undefined>(AUTH_MODE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!mode) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const db = this.handle.db;
    const apiKey = bearer(req);

    if (mode === 'agent' || (mode === 'org-actor' && apiKey)) {
      if (!apiKey) throw new DomainError('UNAUTHENTICATED', 'Falta la credencial del agente');
      const actor = await resolveAgentKey(db, apiKey);
      const orgId = req.params.orgId;
      if (typeof orgId === 'string' && orgId !== actor.orgId) {
        throw new DomainError('NOT_FOUND', 'Organización no encontrada');
      }
      req.actor = actor;
      return true;
    }

    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? await resolveSession(db, token) : null;
    if (!session || !token) {
      throw new DomainError('UNAUTHENTICATED', 'Inicia sesión en el portal');
    }
    req.authSession = { ...session, token };
    if (mode === 'session') return true;

    const orgId = req.params.orgId;
    if (typeof orgId !== 'string') throw new Error('La ruta requiere el parámetro :orgId');
    req.actor = await resolveUserActor(db, session.userId, orgId);
    return true;
  }
}

/** Actor resuelto por el guard (usuario de la organización o agente). */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<AuthedRequest>().actor;
  if (!actor) throw new Error('Ruta sin @Auth que resuelva un actor');
  return actor;
});

export const CurrentAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AgentActor => {
    const actor = ctx.switchToHttp().getRequest<AuthedRequest>().actor;
    if (actor?.kind !== 'agent') throw new Error('Ruta sin @Auth(agent)');
    return actor;
  },
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserActor => {
    const actor = ctx.switchToHttp().getRequest<AuthedRequest>().actor;
    if (actor?.kind !== 'user') throw new Error('Ruta sin @Auth(org-user)');
    return actor;
  },
);

export const CurrentSession = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const session = ctx.switchToHttp().getRequest<AuthedRequest>().authSession;
  if (!session) throw new Error('Ruta sin @Auth(session)');
  return session;
});
