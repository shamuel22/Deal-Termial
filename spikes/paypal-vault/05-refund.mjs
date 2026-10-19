// Paso 1.6: reembolsa (total o parcialmente) una captura.
// Uso: node --env-file=.env spikes/paypal-vault/05-refund.mjs <capture_id> [importe]
import { pp, show } from './pp.mjs';

const [captureId, value] = process.argv.slice(2);
if (!captureId) throw new Error('Falta capture_id');
const body = value ? { amount: { currency_code: 'USD', value } } : {};
show('refund', await pp('POST', `/v2/payments/captures/${captureId}/refund`, body));
