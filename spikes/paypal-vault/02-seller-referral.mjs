// Paso 1.2: genera el enlace de conexión (Partner Referrals) para un proveedor sandbox.
// Uso: node --env-file=.env spikes/paypal-vault/02-seller-referral.mjs <tracking_id> [vault]
// Con "vault" se piden además los permisos para guardar medios de pago en nombre del proveedor.
import { pp, show } from './pp.mjs';

const trackingId = process.argv[2] ?? `seller-${Date.now()}`;
const vault = process.argv[3] === 'vault';
const features = vault
  ? ['PAYMENT', 'REFUND', 'PARTNER_FEE', 'VAULT', 'BILLING_AGREEMENT']
  : ['PAYMENT', 'REFUND'];
const r = await pp('POST', '/v2/customer/partner-referrals', {
  tracking_id: trackingId,
  operations: [
    {
      operation: 'API_INTEGRATION',
      api_integration_preference: {
        rest_api_integration: {
          integration_method: 'PAYPAL',
          integration_type: 'THIRD_PARTY',
          third_party_details: { features },
        },
      },
    },
  ],
  products: vault ? ['EXPRESS_CHECKOUT', 'ADVANCED_VAULTING'] : ['EXPRESS_CHECKOUT'],
  ...(vault ? { capabilities: ['PAYPAL_WALLET_VAULTING_ADVANCED'] } : {}),
  legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }],
  partner_config_override: {
    return_url: `${process.env.PUBLIC_BASE_URL}/paypal/seller/return?tracking_id=${trackingId}`,
  },
});
show(`partner-referral ${trackingId}`, r);
