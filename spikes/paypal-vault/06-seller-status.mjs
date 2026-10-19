// Paso 1.2: obtiene el merchant_id de un proveedor por tracking_id y verifica que pueda cobrar.
// Uso: node --env-file=.env spikes/paypal-vault/06-seller-status.mjs <partner_merchant_id> <tracking_id>
import { pp } from './pp.mjs';

const [partnerId, trackingId] = process.argv.slice(2);
if (!partnerId || !trackingId) throw new Error('Uso: <partner_merchant_id> <tracking_id>');

const lookup = await pp(
  'GET',
  `/v1/customer/partners/${partnerId}/merchant-integrations?tracking_id=${trackingId}`,
);
const merchantId = lookup.body?.merchant_id;
if (!merchantId) {
  console.log(trackingId, lookup.status, JSON.stringify(lookup.body));
  process.exit(1);
}
const r = await pp('GET', `/v1/customer/partners/${partnerId}/merchant-integrations/${merchantId}`);
const b = r.body;
console.log(
  JSON.stringify(
    {
      tracking_id: trackingId,
      merchant_id: merchantId,
      primary_email: b.primary_email,
      payments_receivable: b.payments_receivable,
      primary_email_confirmed: b.primary_email_confirmed,
      country: b.country,
      oauth_scopes: b.oauth_integrations?.flatMap(
        (i) => i.oauth_third_party?.flatMap((t) => t.scopes ?? []) ?? [],
      ).length,
      products: b.products?.map((p) => `${p.name}:${p.vetting_status ?? p.status ?? ''}`),
    },
    null,
    1,
  ),
);
