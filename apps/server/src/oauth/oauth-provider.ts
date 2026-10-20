import type { RequestHandler, Response } from 'express';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { metadataHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/metadata.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthMetadata,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Database } from '@deal/db';
import {
  createOAuthAuthorization,
  exchangeOAuthCode,
  getOAuthClient,
  OAUTH_SCOPE,
  oauthCodeChallenge,
  refreshOAuthToken,
  registerOAuthClient,
  resolveOAuthAccessToken,
  revokeOAuthToken,
  type OAuthClientInfo,
} from '@deal/core';
import { DomainError } from '@deal/shared';

/** URL canónica del servidor MCP: el `resource` (RFC 8707) para el que se emiten los tokens. */
export function mcpResourceUrl(publicBaseUrl: string): URL {
  return new URL('/mcp', publicBaseUrl);
}

/** Los errores de dominio del canje se devuelven como `invalid_grant`, sin detalles internos. */
async function asGrant<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError) throw new InvalidGrantError(error.message);
    throw error;
  }
}

/**
 * Servidor de autorización OAuth 2.1 para clientes MCP, montado con el router del SDK de MCP
 * (metadatos, registro dinámico, PKCE, tokens y revocación). La decisión la toma el dueño en la
 * consola: /authorize solo guarda la solicitud y redirige a la pantalla de consentimiento.
 */
export class DealTerminalOAuthProvider implements OAuthServerProvider {
  private readonly resource: URL;

  constructor(
    private readonly db: Database,
    publicBaseUrl: string,
  ) {
    this.resource = mcpResourceUrl(publicBaseUrl);
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId) =>
        (await getOAuthClient(this.db, clientId)) as OAuthClientInformationFull | undefined,
      registerClient: async (client) =>
        (await registerOAuthClient(
          this.db,
          client as unknown as OAuthClientInfo,
        )) as unknown as OAuthClientInformationFull,
    };
  }

  /** Solo se emiten tokens para este servidor MCP (con o sin barra final). */
  private checkResource(resource: URL | undefined): string | undefined {
    if (!resource) return undefined;
    const normalize = (u: URL) => `${u.origin}${u.pathname.replace(/\/$/, '')}`;
    if (normalize(resource) !== normalize(this.resource)) {
      throw new InvalidTargetError(`Unknown resource; use ${this.resource.href}`);
    }
    return this.resource.href;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const id = await createOAuthAuthorization(this.db, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes?.length ? params.scopes : [OAUTH_SCOPE],
      resource: this.checkResource(params.resource),
    });
    res.redirect(`/oauth/consent?request=${id}`);
  }

  challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    return asGrant(() => oauthCodeChallenge(this.db, client.client_id, authorizationCode));
  }

  exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    return asGrant(() =>
      exchangeOAuthCode(this.db, {
        clientId: client.client_id,
        code: authorizationCode,
        redirectUri,
        resource: this.checkResource(resource),
      }),
    );
  }

  exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.checkResource(resource);
    return asGrant(() => refreshOAuthToken(this.db, { clientId: client.client_id, refreshToken }));
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const access = await resolveOAuthAccessToken(this.db, token);
      return {
        token,
        clientId: access.clientId,
        scopes: [OAUTH_SCOPE],
        expiresAt: Math.floor(access.expiresAt.getTime() / 1000),
        resource: access.resource ? new URL(access.resource) : undefined,
      };
    } catch (error) {
      if (error instanceof DomainError) throw new InvalidTokenError(error.message);
      throw error;
    }
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await revokeOAuthToken(this.db, { clientId: client.client_id, token: request.token });
  }
}

/**
 * Rutas del servidor de autorización bajo /oauth/ (el router del SDK las monta en la raíz y /register
 * chocaría con el alta de empresas del portal). Se reutilizan los handlers del SDK tal cual:
 * validación, PKCE, autenticación del cliente y límites de frecuencia.
 */
export function oauthRoutes(
  provider: DealTerminalOAuthProvider,
  publicBaseUrl: string,
): Array<[path: string, handler: RequestHandler]> {
  const base = new URL(publicBaseUrl);
  const issuer = base.origin;
  const at = (path: string) => new URL(path, base).href;
  const metadata: OAuthMetadata = {
    issuer,
    service_documentation: at('/knowledge/mcp'),
    authorization_endpoint: at('/oauth/authorize'),
    token_endpoint: at('/oauth/token'),
    registration_endpoint: at('/oauth/register'),
    revocation_endpoint: at('/oauth/revoke'),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: [OAUTH_SCOPE],
  };
  const resource = {
    resource: mcpResourceUrl(publicBaseUrl).href,
    authorization_servers: [issuer],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Deal Terminal',
    resource_documentation: at('/knowledge/mcp'),
  };
  return [
    ['/.well-known/oauth-authorization-server', metadataHandler(metadata)],
    // RFC 9728: ruta específica del recurso (/mcp) y, por compatibilidad, la raíz.
    ['/.well-known/oauth-protected-resource/mcp', metadataHandler(resource)],
    ['/.well-known/oauth-protected-resource', metadataHandler(resource)],
    ['/oauth/authorize', authorizationHandler({ provider })],
    ['/oauth/token', tokenHandler({ provider })],
    ['/oauth/register', clientRegistrationHandler({ clientsStore: provider.clientsStore })],
    ['/oauth/revoke', revocationHandler({ provider })],
  ];
}
