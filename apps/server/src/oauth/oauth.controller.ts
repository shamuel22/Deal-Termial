import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { DbHandle } from '@deal/db';
import { decideOAuthAuthorization, getOAuthAuthorization, type UserActor } from '@deal/core';
import { Auth, CurrentUser, type AuthedRequest } from '../auth/auth.guard.js';
import { DB } from '../database.module.js';
import { ApiZodBody } from '../http/zod.js';

const approveInput = z.object({ agentId: z.uuid() });

/** Pantalla de consentimiento OAuth: el dueño elige qué agente representa a la aplicación. */
@ApiTags('portal: connected apps')
@ApiCookieAuth()
@Controller()
export class OAuthConsentController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get('oauth/requests/:requestId')
  @Auth('session')
  @ApiOperation({
    summary: 'Connection request from an MCP application, with the agents you can choose',
  })
  request(@Req() req: AuthedRequest, @Param('requestId') requestId: string) {
    return getOAuthAuthorization(this.handle.db, req.authSession!.userId, requestId);
  }

  @Post('orgs/:orgId/oauth/requests/:requestId/approve')
  @Auth('org-user')
  @HttpCode(200)
  @ApiOperation({ summary: 'Connect the application as one of your agents' })
  @ApiZodBody(approveInput)
  approve(
    @CurrentUser() user: UserActor,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ) {
    const { agentId } = approveInput.parse(body);
    return decideOAuthAuthorization(this.handle.db, user, requestId, { approve: true, agentId });
  }

  @Post('orgs/:orgId/oauth/requests/:requestId/deny')
  @Auth('org-user')
  @HttpCode(200)
  @ApiOperation({ summary: 'Decline the connection' })
  deny(@CurrentUser() user: UserActor, @Param('requestId') requestId: string) {
    return decideOAuthAuthorization(this.handle.db, user, requestId, { approve: false });
  }
}
