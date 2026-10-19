// Captura una orden aprobada por el comprador y muestra el token guardado (si lo hubo).
// Uso: node --env-file=.env spikes/paypal-vault/07-capture.mjs <order_id>
import { pp } from './pp.mjs';

const orderId = process.argv[2];
if (!orderId) throw new Error('Falta order_id');
const r = await pp('POST', `/v2/checkout/orders/${orderId}/capture`, {});
const b = r.body;
console.log(`capture → ${r.status} (debug ${r.debugId})`, b?.status ?? JSON.stringify(b?.details));
console.log('vault', JSON.stringify(b?.payment_source?.paypal?.attributes?.vault));
const cap = b?.purchase_units?.[0]?.payments?.captures?.[0];
console.log(
  'capture',
  cap?.id,
  cap?.status,
  'payee',
  JSON.stringify(b?.purchase_units?.[0]?.payee),
);
