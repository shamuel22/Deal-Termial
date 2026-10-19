import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { DbHandle } from '@deal/db';
import {
  counterInput,
  counterQuote,
  counterResponseInput,
  getNegotiation,
  getQuotesForRequest,
  listSupplierNegotiations,
  requestQuote,
  requestQuoteInput,
  respondToCounterquote,
  submitForReview,
  submitQuote,
  supplierQuoteInput,
  type Actor,
  type CounterInput,
  type CounterResponseInput,
  type NegotiationView,
  type RequestQuoteInput,
  type SupplierQuoteInput,
} from '@deal/core';
import { DB } from '../database.module.js';
import { ApiZodBody } from '../http/zod.js';
import { Auth, CurrentActor } from '../auth/auth.guard.js';

type NegotiationStatus = NegotiationView['status'];

/** Rutas de negociación comunes a agente y portal (comprador y proveedor). */
class NegotiationRoutes {
  constructor(protected readonly handle: DbHandle) {}

  @Post('negotiations')
  @ApiOperation({
    summary: 'request_quote: pide cotización a una oferta para una solicitud propia',
  })
  @ApiZodBody(requestQuoteInput)
  requestQuote(@CurrentActor() actor: Actor, @Body() body: RequestQuoteInput) {
    return requestQuote(this.handle.db, actor, body);
  }

  @Get('negotiations/:negotiationId')
  @ApiOperation({ summary: 'get_quotes: historial de versiones de una negociación' })
  get(@CurrentActor() actor: Actor, @Param('negotiationId') id: string) {
    return getNegotiation(this.handle.db, actor, id);
  }

  @Get('requests/:requestId/quotes')
  @ApiOperation({ summary: 'get_quotes: negociaciones y cotizaciones de una solicitud' })
  quotesForRequest(@CurrentActor() actor: Actor, @Param('requestId') id: string) {
    return getQuotesForRequest(this.handle.db, actor, id);
  }

  @Post('negotiations/:negotiationId/counter')
  @HttpCode(200)
  @ApiOperation({
    summary: 'counter_quote: propone cambios de precio, cantidad, transporte o fecha',
  })
  @ApiZodBody(counterInput)
  counter(
    @CurrentActor() actor: Actor,
    @Param('negotiationId') id: string,
    @Body() body: CounterInput,
  ) {
    return counterQuote(this.handle.db, actor, id, body);
  }

  @Post('negotiations/:negotiationId/submit-for-review')
  @HttpCode(200)
  @ApiOperation({ summary: 'submit_for_review: deja la propuesta final para revisión del dueño' })
  submitForReview(
    @CurrentActor() actor: Actor,
    @Param('negotiationId') id: string,
    @Body() body: { message?: string },
  ) {
    return submitForReview(this.handle.db, actor, id, body ?? {});
  }

  @Get('supplier/negotiations')
  @ApiOperation({ summary: 'list_pending_negotiations: negociaciones del proveedor' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Por defecto awaiting_supplier; "all" para todas',
  })
  supplierList(@CurrentActor() actor: Actor, @Query('status') status?: string) {
    const filter =
      status === 'all' ? {} : { status: (status ?? 'awaiting_supplier') as NegotiationStatus };
    return listSupplierNegotiations(this.handle.db, actor, filter);
  }

  @Post('supplier/negotiations/:negotiationId/quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'submit_quote: el proveedor cotiza una negociación pendiente' })
  @ApiZodBody(supplierQuoteInput)
  supplierQuote(
    @CurrentActor() actor: Actor,
    @Param('negotiationId') id: string,
    @Body() body: SupplierQuoteInput,
  ) {
    return submitQuote(this.handle.db, actor, id, body);
  }

  @Post('supplier/negotiations/:negotiationId/respond')
  @HttpCode(200)
  @ApiOperation({ summary: 'respond_to_counterquote: aceptar, rechazar o contraofertar' })
  @ApiZodBody(counterResponseInput)
  respond(
    @CurrentActor() actor: Actor,
    @Param('negotiationId') id: string,
    @Body() body: CounterResponseInput,
  ) {
    return respondToCounterquote(this.handle.db, actor, id, body);
  }
}

@ApiTags('agente')
@ApiBearerAuth()
@Controller('agent')
@Auth('agent')
export class AgentNegotiationController extends NegotiationRoutes {
  constructor(@Inject(DB) handle: DbHandle) {
    super(handle);
  }
}

@ApiTags('portal: negociación')
@ApiCookieAuth()
@Controller('orgs/:orgId')
@Auth('org-user')
export class PortalNegotiationController extends NegotiationRoutes {
  constructor(@Inject(DB) handle: DbHandle) {
    super(handle);
  }
}
