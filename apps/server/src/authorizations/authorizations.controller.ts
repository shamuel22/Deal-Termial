import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { DbHandle } from '@deal/db';
import {
  amendAuthorization,
  approveChangeRequest,
  authorizationTerms,
  changeRequestInput,
  createAuthorization,
  createAuthorizationInput,
  getAgentAuthorizationStatus,
  getAuthorization,
  listAuthorizations,
  listChangeRequests,
  monthlyBudgetSummary,
  monthlyLimitInput,
  rejectChangeRequest,
  revokeAuthorization,
  setMonthlyLimit,
  submitChangeRequest,
  type AgentActor,
  type AuthorizationTermsInput,
  type ChangeRequestInput,
  type CreateAuthorizationInput,
  type MonthlyLimitInput,
  type UserActor,
} from '@deal/core';
import { DB } from '../database.module.js';
import { ApiZodBody } from '../http/zod.js';
import { Auth, CurrentAgent, CurrentUser } from '../auth/auth.guard.js';

@ApiTags('portal: autorizaciones')
@ApiCookieAuth()
@Controller('orgs/:orgId')
@Auth('org-user')
export class AuthorizationsController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get('authorizations')
  @ApiQuery({ name: 'agentId', required: false })
  list(@CurrentUser() actor: UserActor, @Query('agentId') agentId?: string) {
    return listAuthorizations(this.handle.db, actor, agentId ? { agentId } : {});
  }

  @Post('authorizations')
  @ApiOperation({ summary: 'Crea y activa una autorización de compra estructurada para un agente' })
  @ApiZodBody(createAuthorizationInput)
  create(@CurrentUser() actor: UserActor, @Body() raw: CreateAuthorizationInput) {
    return createAuthorization(this.handle.db, actor, raw);
  }

  @Get('authorizations/:authorizationId')
  get(@CurrentUser() actor: UserActor, @Param('authorizationId') id: string) {
    return getAuthorization(this.handle.db, actor, id);
  }

  @Put('authorizations/:authorizationId/terms')
  @ApiOperation({ summary: 'Modifica condiciones (nueva versión de la autorización)' })
  @ApiZodBody(authorizationTerms)
  amend(
    @CurrentUser() actor: UserActor,
    @Param('authorizationId') id: string,
    @Body() raw: AuthorizationTermsInput,
  ) {
    return amendAuthorization(this.handle.db, actor, id, raw);
  }

  @Post('authorizations/:authorizationId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoca la autorización; bloquea nuevas aceptaciones y pagos' })
  revoke(@CurrentUser() actor: UserActor, @Param('authorizationId') id: string) {
    return revokeAuthorization(this.handle.db, actor, id);
  }

  @Get('budget/monthly')
  monthly(@CurrentUser() actor: UserActor) {
    return monthlyBudgetSummary(this.handle.db, actor.orgId, new Date());
  }

  @Put('budget/monthly')
  @ApiOperation({
    summary: 'Fija el límite mensual (UTC) compartido por los agentes; null = sin límite',
  })
  @ApiZodBody(monthlyLimitInput)
  setMonthly(@CurrentUser() actor: UserActor, @Body() raw: MonthlyLimitInput) {
    return setMonthlyLimit(this.handle.db, actor, raw);
  }

  @Get('change-requests')
  listRequests(@CurrentUser() actor: UserActor) {
    return listChangeRequests(this.handle.db, actor);
  }

  @Post('change-requests/:requestId/approve')
  @HttpCode(200)
  approve(@CurrentUser() actor: UserActor, @Param('requestId') id: string) {
    return approveChangeRequest(this.handle.db, actor, id);
  }

  @Post('change-requests/:requestId/reject')
  @HttpCode(200)
  reject(@CurrentUser() actor: UserActor, @Param('requestId') id: string) {
    return rejectChangeRequest(this.handle.db, actor, id);
  }
}

@ApiTags('agente')
@ApiBearerAuth()
@Controller('agent')
@Auth('agent')
export class AgentAuthorizationController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get('authorization-status')
  @ApiOperation({
    summary: 'Nivel, autorizaciones, presupuesto disponible y estado financiero (sin secretos)',
  })
  status(@CurrentAgent() agent: AgentActor) {
    return getAgentAuthorizationStatus(this.handle.db, agent);
  }

  @Post('change-requests')
  @ApiOperation({ summary: 'Propone un cambio de permisos para revisión del dueño' })
  @ApiZodBody(changeRequestInput)
  submit(@CurrentAgent() agent: AgentActor, @Body() raw: ChangeRequestInput) {
    return submitChangeRequest(this.handle.db, agent, raw);
  }

  @Get('change-requests')
  list(@CurrentAgent() agent: AgentActor) {
    return listChangeRequests(this.handle.db, agent);
  }
}
