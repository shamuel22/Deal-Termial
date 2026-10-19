// Paso 1.3a: crea un setup token de PayPal wallet a nivel plataforma y muestra el enlace de aprobación.
import { pp, show } from './pp.mjs';

const r = await pp('POST', '/v3/vault/setup-tokens', {
  payment_source: {
    paypal: {
      description: 'Deal Terminal: compras autorizadas por tu agente',
      permit_multiple_payment_tokens: false,
      usage_pattern: 'IMMEDIATE',
      usage_type: 'PLATFORM',
      customer_type: 'CONSUMER',
      experience_context: {
        brand_name: 'Deal Terminal',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        return_url: `${process.env.PUBLIC_BASE_URL}/paypal/vault/return`,
        cancel_url: `${process.env.PUBLIC_BASE_URL}/paypal/vault/cancel`,
      },
    },
  },
});
show('setup-token', r);
