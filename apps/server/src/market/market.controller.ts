import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { DbHandle } from '@deal/db';
import {
  cancelRequest,
  createRequest,
  createRequestInput,
  findMatches,
  findMatchesForRequest,
  getRequest,
  listRequests,
  searchCriteria,
  searchOptions,
  type Actor,
  type CreateRequestInput,
  type SearchCriteriaInput,
  type SearchOptionsInput,
} from '@deal/core';
import { DB } from '../database.module.js';
import { ApiZodBody } from '../http/zod.js';
import { Auth, CurrentActor } from '../auth/auth.guard.js';

const matchesBody = z.object({ criteria: searchCriteria, options: searchOptions.optional() });
type MatchesBody = { criteria: SearchCriteriaInput; options?: SearchOptionsInput };

/** Operaciones de mercado del comprador, compartidas por agente y portal. */
class MarketRoutes {
  constructor(protected readonly handle: DbHandle) {}

  protected matches(actor: Actor, body: MatchesBody) {
    return findMatches(this.handle.db, actor, body?.criteria, body?.options ?? {});
  }
  protected create(actor: Actor, body: CreateRequestInput) {
    return createRequest(this.handle.db, actor, body);
  }
  protected list(actor: Actor) {
    return listRequests(this.handle.db, actor);
  }
  protected get(actor: Actor, id: string) {
    return getRequest(this.handle.db, actor, id);
  }
  protected requestMatches(actor: Actor, id: string, options?: SearchOptionsInput) {
    return findMatchesForRequest(this.handle.db, actor, id, options ?? {});
  }
  protected cancel(actor: Actor, id: string) {
    return cancelRequest(this.handle.db, actor, id);
  }
}

@ApiTags('agent')
@ApiBearerAuth()
@Controller('agent')
@Auth('agent')
export class AgentMarketController extends MarketRoutes {
  constructor(@Inject(DB) handle: DbHandle) {
    super(handle);
  }

  @Post('matches')
  @HttpCode(200)
  @ApiOperation({ summary: 'find_matches: search and compare published offers' })
  @ApiZodBody(matchesBody)
  findMatches(@CurrentActor() actor: Actor, @Body() body: MatchesBody) {
    return this.matches(actor, body);
  }

  @Post('requests')
  @ApiOperation({
    summary: 'create_request: save a private purchase request without contacting suppliers',
  })
  @ApiZodBody(createRequestInput)
  createRequest(@CurrentActor() actor: Actor, @Body() body: CreateRequestInput) {
    return this.create(actor, body);
  }

  @Get('requests')
  listRequests(@CurrentActor() actor: Actor) {
    return this.list(actor);
  }

  @Get('requests/:requestId')
  @ApiOperation({ summary: 'get_request: retrieve your own purchase request' })
  getRequest(@CurrentActor() actor: Actor, @Param('requestId') id: string) {
    return this.get(actor, id);
  }

  @Post('requests/:requestId/matches')
  @HttpCode(200)
  @ApiOperation({ summary: 'Repeat the search with the saved criteria' })
  findRequestMatches(
    @CurrentActor() actor: Actor,
    @Param('requestId') id: string,
    @Body() body: { options?: SearchOptionsInput },
  ) {
    return this.requestMatches(actor, id, body?.options);
  }

  @Post('requests/:requestId/cancel')
  @HttpCode(200)
  cancelRequest(@CurrentActor() actor: Actor, @Param('requestId') id: string) {
    return this.cancel(actor, id);
  }
}

@ApiTags('portal: marketplace')
@ApiCookieAuth()
@Controller('orgs/:orgId')
@Auth('org-user')
export class PortalMarketController extends MarketRoutes {
  constructor(@Inject(DB) handle: DbHandle) {
    super(handle);
  }

  @Post('matches')
  @HttpCode(200)
  @ApiZodBody(matchesBody)
  findMatches(@CurrentActor() actor: Actor, @Body() body: MatchesBody) {
    return this.matches(actor, body);
  }

  @Post('requests')
  @ApiZodBody(createRequestInput)
  createRequest(@CurrentActor() actor: Actor, @Body() body: CreateRequestInput) {
    return this.create(actor, body);
  }

  @Get('requests')
  listRequests(@CurrentActor() actor: Actor) {
    return this.list(actor);
  }

  @Get('requests/:requestId')
  getRequest(@CurrentActor() actor: Actor, @Param('requestId') id: string) {
    return this.get(actor, id);
  }

  @Post('requests/:requestId/matches')
  @HttpCode(200)
  findRequestMatches(
    @CurrentActor() actor: Actor,
    @Param('requestId') id: string,
    @Body() body: { options?: SearchOptionsInput },
  ) {
    return this.requestMatches(actor, id, body?.options);
  }

  @Post('requests/:requestId/cancel')
  @HttpCode(200)
  cancelRequest(@CurrentActor() actor: Actor, @Param('requestId') id: string) {
    return this.cancel(actor, id);
  }
}
