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
import { ApiZodBody, ZodPipe } from '../http/zod.js';
import { Auth, CurrentAgent, CurrentUser } from '../auth/auth.guard.js';

@ApiTags('portal: agentes')
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
  @ApiOperation({ summary: 'Conecta un agente nuevo y fija su nivel inicial' })
  @ApiZodBody(createAgentInput)
  create(
    @CurrentUser() actor: UserActor,
    @Body(new ZodPipe(createAgentInput)) body: CreateAgentInput,
  ) {
    return createAgent(this.handle.db, actor, body);
  }

  @Get(':agentId')
  get(@CurrentUser() actor: UserActor, @Param('agentId') agentId: string) {
    return getAgent(this.handle.db, actor, agentId);
  }

  @Put(':agentId/access')
  @ApiOperation({ summary: 'Cambia nivel de compra y facultades de venta (nueva versión)' })
  @ApiZodBody(accessInput)
  setAccess(
    @CurrentUser() actor: UserActor,
    @Param('agentId') agentId: string,
    @Body(new ZodPipe(accessInput)) body: AccessInput,
  ) {
    return setAgentAccess(this.handle.db, actor, agentId, body);
  }

  @Post(':agentId/credentials')
  @ApiOperation({ summary: 'Emite una credencial; el secreto solo se muestra en esta respuesta' })
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
  @ApiOperation({ summary: 'Deshabilita el agente y revoca todas sus credenciales' })
  async disable(@CurrentUser() actor: UserActor, @Param('agentId') agentId: string): Promise<void> {
    await disableAgent(this.handle.db, actor, agentId);
  }
}

@ApiTags('agente')
@ApiBearerAuth()
@Controller('agent')
@Auth('agent')
export class AgentSelfController {
  @Get('me')
  @ApiOperation({ summary: 'Identidad, organización y nivel vigente del agente autenticado' })
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
