// Pasos 1.4/1.5: cobra con el payment token, sin checkout, a un beneficiario concreto.
// Uso: node --env-file=.env spikes/paypal-vault/04-order-with-vault.mjs <vault_id> <payee_email|merchant_id> <importe>
import { pp, show } from './pp.mjs';

const [vaultId, payee, value = '10.00'] = process.argv.slice(2);
if (!vaultId || !payee) throw new Error('Uso: <vault_id> <payee_email|merchant_id> [importe]');

const r = await pp('POST', '/v2/checkout/orders', {
  intent: 'CAPTURE',
  purchase_units: [
    {
      reference_id: 'spike',
      description: 'Deal Terminal spike: pago delegado',
      amount: { currency_code: 'USD', value },
      payee: payee.includes('@') ? { email_address: payee } : { merchant_id: payee },
    },
  ],
  payment_source: { paypal: { vault_id: vaultId } },
});
show('order', r);
