import { Global, Module } from '@nestjs/common';
import type { AppConfig } from '@deal/shared';
import { PayPalClient } from '@deal/paypal';
import { APP_CONFIG } from '../config.module.js';
import { PayPalGateway } from './paypal-gateway.js';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new PayPalGateway(
          new PayPalClient({
            clientId: config.PAYPAL_CLIENT_ID,
            clientSecret: config.PAYPAL_CLIENT_SECRET,
            bnCode: config.PAYPAL_BN_CODE,
          }),
          config.PAYPAL_PARTNER_MERCHANT_ID,
        ),
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
