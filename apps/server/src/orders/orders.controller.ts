import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { DbHandle } from '@deal/db';
import {
  acceptQuote,
  acceptQuoteInput,
  cancelOrder,
  cancelOrderInput,
  getOrder,
  listOrders,
  ownerAcceptQuote,
  type AcceptQuoteInput,
  type Actor,
  type AgentActor,
  type CancelOrderInput,
  type UserActor,
} from '@deal/core';
import { DB } from '../database.module.js';
import { ApiZodBody } from '../http/zod.js';
import { Auth, CurrentActor, CurrentAgent, CurrentUser } from '../auth/auth.guard.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Retries with the same key return the same result',
};

/** La clave puede llegar en la cabecera estándar o en el cuerpo. */
function withKey<T extends { idempotencyKey?: string }>(body: T, header?: string): T {
  return header && !body?.idempotencyKey ? { ...body, idempotencyKey: header } : body;
}

function sideOf(side?: string): { side?: 'buyer' | 'supplier' } {
  return side === 'buyer' || side === 'supplier' ? { side } : {};
}

@ApiTags('agent')
@ApiBearerAuth()
@Controller('agent/orders')
@Auth('agent')
export class AgentOrdersController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Post()
  @ApiOperation({
    summary:
      'accept_quote: accept the quote and create the order (full_autonomy, within your authorized limits; idempotent)',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiZodBody(acceptQuoteInput)
  accept(
    @CurrentAgent() agent: AgentActor,
    @Body() body: AcceptQuoteInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return acceptQuote(this.handle.db, agent, withKey(body, key));
  }

  @Get()
  @ApiQuery({ name: 'side', required: false, enum: ['buyer', 'supplier'] })
  list(@CurrentActor() actor: Actor, @Query('side') side?: string) {
    return listOrders(this.handle.db, actor, sideOf(side));
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'get_order: commercial, payment and delivery status' })
  get(@CurrentActor() actor: Actor, @Param('orderId') id: string) {
    return getOrder(this.handle.db, actor, id);
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'cancel_order: cancel before payment and release reservations' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiZodBody(cancelOrderInput)
  cancel(
    @CurrentActor() actor: Actor,
    @Param('orderId') id: string,
    @Body() body: CancelOrderInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return cancelOrder(this.handle.db, actor, id, withKey(body ?? {}, key));
  }
}

@ApiTags('portal: orders')
@ApiCookieAuth()
@Controller('orgs/:orgId/orders')
@Auth('org-user')
export class PortalOrdersController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Post()
  @ApiOperation({ summary: 'The owner accepts a proposal; the order awaits manual checkout' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiZodBody(acceptQuoteInput)
  accept(
    @CurrentUser() user: UserActor,
    @Body() body: AcceptQuoteInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return ownerAcceptQuote(this.handle.db, user, withKey(body, key));
  }

  @Get()
  @ApiQuery({ name: 'side', required: false, enum: ['buyer', 'supplier'] })
  list(@CurrentUser() user: UserActor, @Query('side') side?: string) {
    return listOrders(this.handle.db, user, sideOf(side));
  }

  @Get(':orderId')
  get(@CurrentUser() user: UserActor, @Param('orderId') id: string) {
    return getOrder(this.handle.db, user, id);
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  @ApiZodBody(cancelOrderInput)
  cancel(
    @CurrentUser() user: UserActor,
    @Param('orderId') id: string,
    @Body() body: CancelOrderInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return cancelOrder(this.handle.db, user, id, withKey(body ?? {}, key));
  }
}
