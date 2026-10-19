// Utilidad mínima del spike: autenticación y llamadas a PayPal sandbox. Lee credenciales de .env.
import { randomUUID } from 'node:crypto';

const BASE = 'https://api-m.sandbox.paypal.com';
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET)
  throw new Error('Faltan credenciales PayPal en .env');

let cached;
export async function token() {
  if (cached && cached.exp > Date.now()) return cached.value;
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${JSON.stringify(body)}`);
  cached = { value: body.access_token, exp: Date.now() + (body.expires_in - 60) * 1000 };
  return cached.value;
}

export async function pp(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': randomUUID(),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, debugId: res.headers.get('paypal-debug-id'), body: json };
}

export function show(label, r) {
  console.log(`\n=== ${label} → ${r.status} (debug ${r.debugId})`);
  console.log(JSON.stringify(r.body, null, 2));
}
