import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { DbHandle } from '@deal/db';
import {
  listActivity,
  listBuyerNegotiations,
  listNotifications,
  markNotificationsRead,
  requireAdmin,
  type Actor,
  type NegotiationView,
  type UserActor,
} from '@deal/core';
import { DB } from '../database.module.js';
import { Auth, CurrentActor, CurrentUser } from '../auth/auth.guard.js';

@ApiTags('portal: consola')
@ApiCookieAuth()
@Controller('orgs/:orgId')
@Auth('org-user')
export class ConsoleController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get('activity')
  @ApiOperation({ summary: 'Consola de actividad: qué se autorizó, quién actuó y qué pasó' })
  @ApiQuery({ name: 'resourceType', required: false })
  @ApiQuery({ name: 'resourceId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  activity(
    @CurrentUser() user: UserActor,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('limit') limit?: string,
  ) {
    requireAdmin(user);
    return listActivity(this.handle.db, user.orgId, {
      resourceType,
      resourceId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('negotiations')
  @ApiOperation({
    summary: 'Negociaciones del comprador; por defecto, propuestas pendientes de revisión',
  })
  @ApiQuery({ name: 'status', required: false, description: '"all" para todas' })
  negotiations(@CurrentUser() user: UserActor, @Query('status') status?: string) {
    const filter =
      status === 'all'
        ? {}
        : { status: (status ?? 'pending_owner_review') as NegotiationView['status'] };
    return listBuyerNegotiations(this.handle.db, user, filter);
  }

  @Get('notifications')
  @ApiQuery({ name: 'unread', required: false })
  notifications(@CurrentActor() actor: Actor, @Query('unread') unread?: string) {
    return listNotifications(this.handle.db, actor, { unreadOnly: unread === 'true' });
  }

  @Post('notifications/read')
  @HttpCode(204)
  async read(@CurrentActor() actor: Actor, @Body() body: { ids?: string[] }): Promise<void> {
    await markNotificationsRead(this.handle.db, actor, body?.ids ?? 'all');
  }
}

@ApiTags('agente')
@ApiBearerAuth()
@Controller('agent')
@Auth('agent')
export class AgentNotificationsController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get('notifications')
  notifications(@CurrentActor() actor: Actor) {
    return listNotifications(this.handle.db, actor, {});
  }
}
