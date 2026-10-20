import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DbHandle } from '@deal/db';
import {
  accessInput,
  createAgent,
  createAgentInput,
  disableAgent,
  getAgent,
  issueCredential,
  listAgents,
  revokeCredential,
  setAgentAccess,
  type AccessInput,
  type AgentActor,
  type CreateAgentInput,
  type UserActor,
} from '@deal/core';
import { DB } from '../database.module.js';
import { ApiZodBody } from '../http/zod.js';
import { Auth, CurrentAgent, CurrentUser } from '../auth/auth.guard.js';

@ApiTags('portal: agents')
@ApiCookieAuth()
@Controller('orgs/:orgId/agents')
@Auth('org-user')
export class AgentsController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get()
  list(@CurrentUser() actor: UserActor) {
    return listAgents(this.handle.db, actor);
  }

  @Post()
  @ApiOperation({ summary: 'Connect a new agent and set its initial access level' })
  @ApiZodBody(createAgentInput)
  create(@CurrentUser() actor: UserActor, @Body() body: CreateAgentInput) {
    return createAgent(this.handle.db, actor, body);
  }

  @Get(':agentId')
  get(@CurrentUser() actor: UserActor, @Param('agentId') agentId: string) {
    return getAgent(this.handle.db, actor, agentId);
  }

  @Put(':agentId/access')
  @ApiOperation({ summary: 'Change the buyer access level and seller permissions (new version)' })
  @ApiZodBody(accessInput)
  setAccess(
    @CurrentUser() actor: UserActor,
    @Param('agentId') agentId: string,
    @Body() body: AccessInput,
  ) {
    return setAgentAccess(this.handle.db, actor, agentId, body);
  }

  @Post(':agentId/credentials')
  @ApiOperation({ summary: 'Issue a credential; the secret is shown only in this response' })
  issue(@CurrentUser() actor: UserActor, @Param('agentId') agentId: string) {
    return issueCredential(this.handle.db, actor, agentId);
  }

  @Delete(':agentId/credentials/:credentialId')
  @HttpCode(204)
  async revoke(
    @CurrentUser() actor: UserActor,
    @Param('agentId') agentId: string,
    @Param('credentialId') credentialId: string,
  ): Promise<void> {
    await revokeCredential(this.handle.db, actor, agentId, credentialId);
  }

  @Delete(':agentId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Disable the agent and revoke all its credentials' })
  async disable(@CurrentUser() actor: UserActor, @Param('agentId') agentId: string): Promise<void> {
    await disableAgent(this.handle.db, actor, agentId);
  }
}

@ApiTags('agent')
@ApiBearerAuth()
@Controller('agent')
@Auth('agent')
export class AgentSelfController {
  @Get('me')
  @ApiOperation({
    summary: 'Identity, organization and current access level of the authenticated agent',
  })
  me(@CurrentAgent() agent: AgentActor) {
    return {
      agentId: agent.agentId,
      orgId: agent.orgId,
      access: {
        version: agent.grant.version,
        buyerLevel: agent.grant.buyerLevel,
        sellerScopes: agent.grant.sellerScopes,
      },
    };
  }
}
