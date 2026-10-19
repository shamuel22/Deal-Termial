# Etapa 1 — Prueba de viabilidad financiera (PayPal sandbox)

Documento de hallazgos. Scripts en [`spikes/paypal-vault/`](../spikes/paypal-vault/), ejecutables con
`node --env-file=.env spikes/paypal-vault/<script>.mjs`.

## Objetivo (gate del brief §8 y §16)

1. Consentimiento inicial del comprador → token persistente.
2. Pago posterior al proveedor A **sin nuevo checkout**.
3. Mismo token usado para pagar al proveedor B.

## Diseño objetivo

| Paso                         | API                                                                                                    | Notas                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conexión del proveedor       | `POST /v2/customer/partner-referrals` → `action_url`                                                   | Features `PAYMENT`, `REFUND`. Estado vía `GET /v1/customer/partners/{partner}/merchant-integrations/{seller}` (`payments_receivable`, `primary_email_confirmed`) |
| Consentimiento del comprador | `POST /v3/vault/setup-tokens` → enlace `approve`                                                       | `payment_source.paypal`, `usage_type`                                                                                                                            |
| Token persistente            | `POST /v3/vault/payment-tokens` con `{ token: { id, type: 'SETUP_TOKEN' } }`                           | Solo tras aprobación; el setup token aprobado no es un token de pago                                                                                             |
| Cobro sin checkout           | `POST /v2/checkout/orders` con `payment_source.paypal.vault_id` y `purchase_units[].payee.merchant_id` | `intent: CAPTURE`                                                                                                                                                |

## Resultados (2026-10-19)

| Prueba                                              | Resultado                                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| OAuth client credentials                            | ✅ App `APP-8UL28863847477405` con scopes de partner-referrals, vault payment-tokens (readwrite), billing-agreements y partnerfee |
| Setup token PayPal `usage_type: PLATFORM`           | ❌ `403 NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE` (debug `f591822908002`)                                                              |
| Setup token PayPal `usage_type: MERCHANT`           | ✅ `201 PAYER_ACTION_REQUIRED`                                                                                                    |
| Setup token de tarjeta                              | ✅ `201 APPROVED`                                                                                                                 |
| Partner Referrals (enlace de conexión de proveedor) | ✅ `201` con `action_url`                                                                                                         |

### Recorrido con cuenta compradora (2026-10-19)

| Paso                                                        | Resultado                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Reintento `usage_type: PLATFORM`                            | ❌ mismo error (debug `f2891912d6dde`). Solicitud enviada a PayPal                                   |
| Setup token `MERCHANT` aprobado por el comprador en sandbox | ✅ `APPROVED`; PayPal redirige a `return_url` con `approval_token_id`                                |
| Conversión a payment token                                  | ✅ `201`, token persistente con `customer.id` y `payer_id`                                           |
| Orden con `vault_id`, **sin checkout**                      | ✅ `COMPLETED` (orden `4JU408499W196332S`, captura `6UF50818X4681181H`)                              |
| Reembolso de la captura                                     | ✅ `COMPLETED` (`6F687870T4466520B`)                                                                 |
| Pago a **otro** comerciante con el mismo token              | ⏳ Pendiente: la cuenta business disponible es la dueña de la app (`EY95RKLNXCGUW`), no un proveedor |

Conclusiones parciales:

- El consentimiento único y el cobro posterior sin checkout funcionan en sandbox.
- El setup token aprobado se verifica (`GET /v3/vault/setup-tokens/{id}` → `APPROVED`) antes de convertirlo; se cumple
  el requisito del brief de no tratarlo como token de pago.
- Queda por validar el punto crítico: pagar a proveedores distintos de la plataforma con el token `MERCHANT`.

### Interpretación

- La app puede guardar medios de pago PayPal **a nivel comerciante** (el token pertenece a la cuenta de la plataforma),
  pero el **guardado a nivel plataforma** requiere una habilitación de PayPal sobre la cuenta partner.
- La conexión de proveedores está operativa.

### Próximas pruebas

1. Solicitar a PayPal la habilitación de vault a nivel plataforma para la app sandbox (vía soporte / canal del hackatón).
2. En paralelo, validar con cuentas sandbox:
   - Conectar proveedores A y B mediante Partner Referrals y obtener sus `merchant_id`.
   - Aprobar el setup token `MERCHANT` con la cuenta compradora y convertirlo en payment token.
   - Crear una orden con ese `vault_id` y `payee.merchant_id` = proveedor A; repetir con proveedor B.
   - Si funciona, el recorrido cumple el brief sin depender de la habilitación de plataforma; si PayPal lo rechaza,
     la habilitación del punto 1 es imprescindible.
