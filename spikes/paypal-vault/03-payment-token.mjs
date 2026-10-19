// Paso 1.3b: comprueba el setup token aprobado y lo convierte en payment token persistente.
// Uso: node --env-file=.env spikes/paypal-vault/03-payment-token.mjs <setup_token_id>
import { pp, show } from './pp.mjs';

const setupTokenId = process.argv[2];
if (!setupTokenId) throw new Error('Falta setup_token_id');

const status = await pp('GET', `/v3/vault/setup-tokens/${setupTokenId}`);
show('setup-token status', status);
if (status.body?.status !== 'APPROVED') {
  console.log('\nEl setup token aún no está aprobado; no se crea payment token.');
  process.exit(1);
}
const r = await pp('POST', '/v3/vault/payment-tokens', {
  payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } },
});
show('payment-token', r);
