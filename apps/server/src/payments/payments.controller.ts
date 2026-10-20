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

@ApiTags('portal: payments')
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
  @ApiOperation({ summary: 'Status of the seller payment connection and PayPal consent' })
  async status(@CurrentUser() user: UserActor) {
    return {
      sellerAccount: await getSellerAccount(this.handle.db, user),
      ...(await getFinancialStatus(this.handle.db, user)),
    };
  }

  @Post('payments/seller-account/onboarding')
  @HttpCode(200)
  @ApiOperation({ summary: "PayPal link to connect the supplier's account to receive payments" })
  onboard(@CurrentUser() user: UserActor) {
    const returnUrl = `${this.config.PUBLIC_BASE_URL}/api/paypal/seller/return?orgId=${user.orgId}`;
    return startSellerOnboarding(this.handle.db, this.gateway, user, returnUrl);
  }

  @Post('payments/seller-account/refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: "Check with PayPal whether the supplier's account can receive payments",
  })
  refresh(@CurrentUser() user: UserActor) {
    return refreshSellerAccount(this.handle.db, this.gateway, user.orgId);
  }

  @Post('orders/:orderId/checkout')
  @HttpCode(200)
  @ApiOperation({ summary: "Start the owner's PayPal checkout for an order awaiting payment" })
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

@ApiTags('agent')
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
      'execute_purchase: accept or retrieve the order and execute the authorized payment; without PayPal consent, await payment by the owner',
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
  @ApiOperation({ summary: 'request_refund: request a refund review' })
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
    summary: 'approve_refund: the supplier authorizes the refund (approve_refunds permission)',
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

  /** Sin sesión (p. ej. el pago se aprobó en otro navegador) no hay usuario: se pide iniciar sesión. */
  private async user(req: Request, orgId: string | undefined): Promise<UserActor | null> {
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? await resolveSession(this.handle.db, token) : null;
    if (!session) return null;
    if (!orgId) throw new DomainError('VALIDATION_FAILED', 'The organization is missing');
    return resolveUserActor(this.handle.db, session.userId, orgId);
  }

  /** Tras iniciar sesión, el portal vuelve a esta misma URL y la verificación continúa. */
  private signIn(req: Request, res: Response): void {
    res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }

  @Get('checkout/return')
  async checkoutReturn(
    @Req() req: Request,
    @Res() res: Response,
    @Query('orgId') orgId: string,
    @Query('token') paypalOrderId: string,
  ) {
    const user = await this.user(req, orgId);
    if (!user) return this.signIn(req, res);
    const result = await completeCheckout(this.handle.db, this.gateway, user, paypalOrderId);
    res.redirect(`/console/orders/${result.orderId}?payment=${result.payment.status}`);
  }

  @Get('checkout/cancel')
  checkoutCancel(@Res() res: Response, @Query('orderId') orderId: string) {
    res.redirect(`/console/orders/${encodeURIComponent(orderId ?? '')}?payment=cancelled`);
  }

  @Get('seller/return')
  async sellerReturn(@Req() req: Request, @Res() res: Response, @Query('orgId') orgId: string) {
    const user = await this.user(req, orgId);
    if (!user) return this.signIn(req, res);
    await refreshSellerAccount(this.handle.db, this.gateway, user.orgId).catch(() => undefined);
    res.redirect('/console/settings/payments');
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
    if (!raw) throw new DomainError('VALIDATION_FAILED', 'Empty body');
    const event = JSON.parse(raw) as WebhookEvent;
    const verified = await this.gateway.client.verifyWebhookSignature({
      webhookId: this.config.PAYPAL_WEBHOOK_ID,
      headers: req.headers as Record<string, string | undefined>,
      event,
    });
    if (!verified) {
      this.logger.warn(`Rejected webhook with invalid signature (${event.id ?? 'no id'})`);
      throw new DomainError('UNAUTHENTICATED', 'Invalid webhook signature');
    }
    const recorded = await recordWebhook(this.handle.db, event);
    if (recorded.isNew) {
      // Si falla, el planificador lo reintenta; PayPal recibe 200 porque el evento quedó guardado.
      await processWebhook(this.handle.db, this.gateway, recorded.id).catch((error: unknown) =>
        this.logger.error(`Error processing ${event.id}: ${(error as Error).message}`),
      );
    }
    return { received: true, duplicate: !recorded.isNew };
  }
}
