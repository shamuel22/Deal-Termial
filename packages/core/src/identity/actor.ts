import { DomainError } from '@deal/shared';

export type MemberRole = 'owner' | 'admin' | 'member';
export type BuyerLevel = 'search_only' | 'negotiate' | 'full_autonomy';
export type SellerScope = 'publish_offers' | 'submit_quotes' | 'accept_terms' | 'approve_refunds';

/** Persona autenticada en el portal, actuando dentro de una organización concreta. */
export interface UserActor {
  kind: 'user';
  userId: string;
  orgId: string;
  role: MemberRole;
}

/**
 * Agente autenticado por credencial. Su organización y facultades las resuelve el servidor
 * a partir de la credencial; nunca se toman de lo que diga el modelo.
 */
export interface AgentActor {
  kind: 'agent';
  agentId: string;
  orgId: string;
  credentialId: string;
  grant: {
    id: string;
    version: number;
    buyerLevel: BuyerLevel | null;
    sellerScopes: SellerScope[];
  };
}

export type Actor = UserActor | AgentActor;

/** Administra permisos, límites y conexiones: solo dueño o administrador con sesión. */
export function requireAdmin(actor: Actor): UserActor {
  if (actor.kind !== 'user') {
    throw new DomainError(
      'FORBIDDEN',
      'Solo una sesión de dueño o administrador puede realizar esta operación',
    );
  }
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Se requiere rol de dueño o administrador');
  }
  return actor;
}

/**
 * Operaciones de venta: las puede hacer el dueño/administrador con sesión, o un agente con la
 * facultad de venta indicada. Las facultades de venta son independientes del nivel de compra.
 */
export function requireSellerScope(actor: Actor, scope: SellerScope): Actor {
  if (actor.kind === 'user') {
    requireAdmin(actor);
    return actor;
  }
  if (!actor.grant.sellerScopes.includes(scope)) {
    throw new DomainError(
      'SELLER_SCOPE_MISSING',
      `El agente no tiene la facultad de venta "${scope}"`,
      {
        requiredScope: scope,
        currentScopes: actor.grant.sellerScopes,
      },
    );
  }
  return actor;
}

export function requireUser(actor: Actor): UserActor {
  if (actor.kind !== 'user') {
    throw new DomainError('FORBIDDEN', 'Esta operación requiere una sesión del portal');
  }
  return actor;
}

export function actorRef(actor: Actor): { actorType: 'user' | 'agent'; actorId: string } {
  return actor.kind === 'user'
    ? { actorType: 'user', actorId: actor.userId }
    : { actorType: 'agent', actorId: actor.agentId };
}
