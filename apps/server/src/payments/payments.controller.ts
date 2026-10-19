import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExcludeController,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { DbHandle } from '@deal/db';
import {
  approveRefund,
  completeCheckout,
  executePurchase,
  executePurchaseInput,
  getFinancialStatus,
  getSellerAccount,
  listPendingRefunds,
  listRefunds,
  processWebhook,
  recordWebhook,
  refreshSellerAccount,
  rejectRefund,
  requestRefund,
  requestRefundInput,
  resolveSession,
  resolveUserActor,
  startCheckout,
  startSellerOnboarding,
  type Actor,
  type AgentActor,
  type ExecutePurchaseInput,
  type PaymentGateway,
  type RequestRefundInput,
  type UserActor,
  type WebhookEvent,
} from '@deal/core';
import { DomainError, type AppConfig } from '@deal/shared';
import { APP_CONFIG } from '../config.module.js';
import { DB } from '../database.module.js';
import { ApiZodBody } from '../http/zod.js';
import {
  Auth,
  CurrentActor,
  CurrentAgent,
  CurrentUser,
  readCookie,
  SESSION_COOKIE,
} from '../auth/auth.guard.js';
import { PAYMENT_GATEWAY } from './payments.module.js';
import type { PayPalGateway } from './paypal-gateway.js';

@ApiTags('portal: pagos')
@ApiCookieAuth()
@Controller('orgs/:orgId')
@Auth('org-user')
export class PortalPaymentsController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('payments/status')
  @ApiOperation({ summary: 'Estado de la conexión de cobro y de la autorización financiera' })
  async status(@CurrentUser() user: UserActor) {
    return {
      sellerAccount: await getSellerAccount(this.handle.db, user),
      ...(await getFinancialStatus(this.handle.db, user)),
    };
  }

  @Post('payments/seller-account/onboarding')
  @HttpCode(200)
  @ApiOperation({ summary: 'Enlace de PayPal para conectar la cuenta de cobro del proveedor' })
  onboard(@CurrentUser() user: UserActor) {
    const returnUrl = `${this.config.PUBLIC_BASE_URL}/api/paypal/seller/return?orgId=${user.orgId}`;
    return startSellerOnboarding(this.handle.db, this.gateway, user, returnUrl);
  }

  @Post('payments/seller-account/refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Consulta a PayPal si la cuenta del proveedor ya puede cobrar' })
  refresh(@CurrentUser() user: UserActor) {
    return refreshSellerAccount(this.handle.db, this.gateway, user.orgId);
  }

  @Post('orders/:orderId/checkout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inicia el checkout PayPal del dueño para un pedido pendiente de pago' })
  checkout(@CurrentUser() user: UserActor, @Param('orderId') orderId: string) {
    const base = `${this.config.PUBLIC_BASE_URL}/api/paypal/checkout`;
    return startCheckout(this.handle.db, this.gateway, user, orderId, {
      returnUrl: `${base}/return?orgId=${user.orgId}`,
      cancelUrl: `${base}/cancel?orgId=${user.orgId}&orderId=${orderId}`,
    });
  }

  @Get('orders/:orderId/refunds')
  refunds(@CurrentUser() user: UserActor, @Param('orderId') orderId: string) {
    return listRefunds(this.handle.db, user, orderId);
  }

  @Post('orders/:orderId/refunds')
  @ApiZodBody(requestRefundInput)
  requestRefund(
    @CurrentUser() user: UserActor,
    @Param('orderId') orderId: string,
    @Body() body: RequestRefundInput,
  ) {
    return requestRefund(this.handle.db, user, orderId, body);
  }

  @Get('supplier/refunds')
  pendingRefunds(@CurrentUser() user: UserActor) {
    return listPendingRefunds(this.handle.db, user);
  }

  @Post('supplier/refunds/:refundId/approve')
  @HttpCode(200)
  approveRefund(@CurrentUser() user: UserActor, @Param('refundId') id: string) {
    return approveRefund(this.handle.db, this.gateway, user, id);
  }

  @Post('supplier/refunds/:refundId/reject')
  @HttpCode(200)
  rejectRefund(
    @CurrentUser() user: UserActor,
    @Param('refundId') id: string,
    @Body() body: { reason: string },
  ) {
    return rejectRefund(this.handle.db, user, id, body?.reason);
  }
}

@ApiTags('agente')
@ApiBearerAuth()
@Controller('agent')
@Auth('agent')
export class AgentPaymentsController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  @Post('purchases')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'execute_purchase: acepta o recupera el pedido y ejecuta el pago autorizado; sin autorización financiera queda pendiente del dueño',
  })
  @ApiZodBody(executePurchaseInput)
  execute(
    @CurrentAgent() agent: AgentActor,
    @Body() body: ExecutePurchaseInput,
    @Headers('idempotency-key') key?: string,
  ) {
    const input = key && body && !body.idempotencyKey ? { ...body, idempotencyKey: key } : body;
    return executePurchase(this.handle.db, this.gateway, agent, input);
  }

  @Get('orders/:orderId/refunds')
  refunds(@CurrentActor() actor: Actor, @Param('orderId') orderId: string) {
    return listRefunds(this.handle.db, actor, orderId);
  }

  @Post('orders/:orderId/refunds')
  @ApiOperation({ summary: 'request_refund: solicita revisión de una devolución' })
  @ApiZodBody(requestRefundInput)
  requestRefund(
    @CurrentAgent() agent: AgentActor,
    @Param('orderId') orderId: string,
    @Body() body: RequestRefundInput,
  ) {
    return requestRefund(this.handle.db, agent, orderId, body);
  }

  @Get('supplier/refunds')
  pendingRefunds(@CurrentAgent() agent: AgentActor) {
    return listPendingRefunds(this.handle.db, agent);
  }

  @Post('supplier/refunds/:refundId/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'approve_refund: el proveedor autoriza la devolución (facultad approve_refunds)',
  })
  approveRefund(@CurrentAgent() agent: AgentActor, @Param('refundId') id: string) {
    return approveRefund(this.handle.db, this.gateway, agent, id);
  }

  @Post('supplier/refunds/:refundId/reject')
  @HttpCode(200)
  rejectRefund(
    @CurrentAgent() agent: AgentActor,
    @Param('refundId') id: string,
    @Body() body: { reason: string },
  ) {
    return rejectRefund(this.handle.db, agent, id, body?.reason);
  }
}

/**
 * Retornos del navegador desde PayPal. PayPal añade sus parámetros a la URL; el resultado se
 * verifica siempre con la API (nunca se confía en la redirección) y se vuelve al portal.
 */
@ApiExcludeController()
@Controller('paypal')
export class PayPalReturnController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  private async user(req: Request, orgId: string | undefined): Promise<UserActor> {
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? await resolveSession(this.handle.db, token) : null;
    if (!session || !orgId) throw new DomainError('UNAUTHENTICATED', 'Inicia sesión en el portal');
    return resolveUserActor(this.handle.db, session.userId, orgId);
  }

  @Get('checkout/return')
  async checkoutReturn(
    @Req() req: Request,
    @Res() res: Response,
    @Query('orgId') orgId: string,
    @Query('token') paypalOrderId: string,
  ) {
    const user = await this.user(req, orgId);
    const result = await completeCheckout(this.handle.db, this.gateway, user, paypalOrderId);
    res.redirect(`/orders/${result.orderId}?payment=${result.payment.status}`);
  }

  @Get('checkout/cancel')
  checkoutCancel(@Res() res: Response, @Query('orderId') orderId: string) {
    res.redirect(`/orders/${encodeURIComponent(orderId ?? '')}?payment=cancelled`);
  }

  @Get('seller/return')
  async sellerReturn(@Req() req: Request, @Res() res: Response, @Query('orgId') orgId: string) {
    const user = await this.user(req, orgId);
    await refreshSellerAccount(this.handle.db, this.gateway, user.orgId).catch(() => undefined);
    res.redirect('/settings/payments');
  }
}

interface RawRequest extends Request {
  rawBody?: Buffer;
}

/** Webhooks de PayPal: firma verificada, registro único por evento y procesamiento idempotente. */
@ApiExcludeController()
@Controller('webhooks')
export class PayPalWebhookController {
  private readonly logger = new Logger('PayPalWebhook');

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PayPalGateway,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('paypal')
  @HttpCode(200)
  async receive(@Req() req: RawRequest) {
    const raw = req.rawBody?.toString('utf8');
    if (!raw) throw new DomainError('VALIDATION_FAILED', 'Cuerpo vacío');
    const event = JSON.parse(raw) as WebhookEvent;
    const verified = await this.gateway.client.verifyWebhookSignature({
      webhookId: this.config.PAYPAL_WEBHOOK_ID,
      headers: req.headers as Record<string, string | undefined>,
      event,
    });
    if (!verified) {
      this.logger.warn(`Webhook con firma inválida rechazado (${event.id ?? 'sin id'})`);
      throw new DomainError('UNAUTHENTICATED', 'Firma de webhook inválida');
    }
    const recorded = await recordWebhook(this.handle.db, event);
    if (recorded.isNew) {
      // Si falla, el planificador lo reintenta; PayPal recibe 200 porque el evento quedó guardado.
      await processWebhook(this.handle.db, this.gateway, recorded.id).catch((error: unknown) =>
        this.logger.error(`Error procesando ${event.id}: ${(error as Error).message}`),
      );
    }
    return { received: true, duplicate: !recorded.isNew };
  }
}
