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

### Pago a proveedores distintos de la plataforma (2026-10-19)

Cuentas: plataforma `EY95RKLNXCGUW` (dueña de la app), proveedor A `4Z22N6RZVZKAC`, proveedor B `VW92JVJ8JBR7Q`.

| Prueba                                                                                                     | Resultado                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Conexión de A y B por Partner Referrals (`PAYMENT`, `REFUND`)                                              | ✅ `payments_receivable: true`, `primary_email_confirmed: true`               |
| Orden con token `MERCHANT` de la plataforma y `payee` = A / B                                              | ❌ `422 BILLING_AGREEMENT_NOT_FOUND` (debug `f875749a668a0`, `f407519de6005`) |
| Setup token en nombre de A (`PayPal-Auth-Assertion`)                                                       | ❌ `403 NOT_AUTHORIZED`: A no concedió permisos de vault                      |
| Partner Referrals con `VAULT`, `BILLING_AGREEMENT`, `ADVANCED_VAULTING`, `PAYPAL_WALLET_VAULTING_ADVANCED` | ✅ `201`; pendiente que A y B completen la reconexión                         |

Reconexión con permisos de vault (A y B): `oauth_scopes` 8, incluye `vault/payment-tokens/readwrite`,
`billing-agreements`; capacidad `PAYPAL_WALLET_VAULTING_ADVANCED` **ACTIVE**.

| Prueba                                                                   | Resultado                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Orden simple en nombre de A (`PayPal-Auth-Assertion`)                    | ✅ `201 CREATED` (la cabecera es válida)                                                   |
| Setup token en nombre de A (PayPal, tarjeta, con/sin BN code)            | ❌ `403 NOT_AUTHORIZED` (debug `f871540fbb82e`, `f510437979d00`)                           |
| Guardado durante compra en nombre de A                                   | ❌ `422 NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE` (debug `f3368345d6add`)                       |
| Guardado durante compra, plataforma como titular `MERCHANT`, `payee` = A | ✅ `PAYER_ACTION_REQUIRED` (orden `75L64192JX774693M`); pendiente aprobación del comprador |

Interpretación: la cuenta partner no está habilitada para guardar medios de pago **en nombre** de comerciantes ni a
nivel plataforma; ambas son habilitaciones de PayPal sobre el partner. Queda por comprobar si un acuerdo creado
durante una compra con `payee` = A permite cobros posteriores a A (y a B).

Guardado durante compra aprobado por el comprador (orden `75L64192JX774693M`, captura `9F014419EH276064D`):
PayPal reutiliza el mismo payment token (`VAULTED`) de la plataforma. Cobro posterior a A y B con ese token:
❌ `BILLING_AGREEMENT_NOT_FOUND` (debug `ca4d2cb5499e0`, `ca4d2cb5d6deb`). Hacer la primera compra a A no liga el acuerdo a A.

### Investigación documental (2026-10-19)

- [Guía multiparty, guardar PayPal durante compra](https://developer.paypal.com/docs/multiparty/checkout/save-payment-methods/during-purchase/js-sdk/paypal/):
  nivel plataforma = `attributes.vault.usage_type: PLATFORM` + `payee.merchant_id` + cabecera `PayPal-Partner-Attribution-ID`,
  **sin** `PayPal-Auth-Assertion`. Probado con varios BN codes: ❌ `NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE` en órdenes y setup tokens.
- [Onboarding a nivel plataforma](https://developer.paypal.com/docs/multiparty/checkout/save-payment-methods/onboarding/platform/):
  no describe un paso de habilitación por API; la habilitación es de cuenta.
- Foro de PayPal: el mismo error se resuelve activando _Vault_ en las opciones avanzadas de la app sandbox, o por soporte.
- [Braintree Vault](https://developer.paypal.com/braintree/docs/guides/paypal/vault/javascript/v3/): producto distinto
  (cuenta Braintree, SDK propio); no cubre pagos a múltiples vendedores.
- Blogs de pagos agénticos de PayPal: alto nivel, sin mecanismo multi-vendedor documentado.

Con el BN code real de la app (`FLAVORsb-ri3ol51889760_MP`, sección _Multiparty features_ del dashboard):
setup token `PLATFORM` ❌ `403` (debug `f545532967a80`), orden `PLATFORM` con `payee` A ❌ `422` (debug `f5455326e3461`),
setup token en nombre de A ❌ `403 NOT_AUTHORIZED` (debug `f45026047a28e`). El dashboard no ofrece ninguna opción de
vault a nivel plataforma; solo _Save payment methods_ (activa). **Se requiere habilitación por parte de PayPal.**

**Conclusión:** un acuerdo de pago guardado a nivel comerciante solo sirve para pagar al comerciante que lo creó.
Hay dos caminos que cumplen el brief (pago dirigido al proveedor, sin checkout por compra):

1. **Vault a nivel plataforma** (preferido): un consentimiento sirve para todos los proveedores. Requiere habilitación de PayPal (solicitada).
2. **Vault por proveedor** (alternativa prevista en §8): la plataforma, en nombre de cada proveedor conectado, obtiene
   un consentimiento del comprador una vez por proveedor; las compras siguientes a ese proveedor no requieren checkout.

El diseño del producto soportará ambos: la conexión financiera del comprador guarda tokens con su alcance
(`platform` o `merchant:<id>`), y la autorización financiera de una compra exige un token cuyo alcance cubra al proveedor.

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

## Respuesta de PayPal (2026-10-19)

PayPal respondió que lo disponible es lo publicado en su documentación de desarrolladores y que no puede
habilitar el vault a nivel plataforma ni el vault en nombre de los vendedores para esta cuenta.

**Decisión (P9 del plan):** el MVP mantiene la autonomía comercial completa (buscar, negociar, aceptar y reservar
dentro de la autorización). El pago lo completa el dueño con un checkout de un clic, salvo que exista una
autorización financiera que cubra al proveedor. La ruta de cobro sin checkout está implementada y probada con
una pasarela simulada; se activa sin cambios de diseño si PayPal habilita el vault multi-vendedor. El spike
demuestra que el mecanismo (consentimiento único + cobro sin checkout) funciona en sandbox cuando el beneficiario
es el titular del acuerdo.

## Validación en producto contra sandbox (2026-10-19)

Recorrido ejecutado con el servidor real (`apps/server`), datos de `pnpm seed:demo` y la API:

| Paso                                                                                  | Resultado                                                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Búsqueda del encargo (300 envases, sin foam, ≤ US$80)                                 | GB-BAG24 81.19 · ENV-KR16-L 83.35 · ENV-PP32-L 145.06 (todas compatibles; por encima del presupuesto → negociar) |
| Cotización inicial de EcoPack                                                         | 83.35                                                                                                            |
| Contrapropuesta del agente (0.20) → respuesta por reglas                              | 0.22 → **76.86**, sin violaciones de la autorización                                                             |
| Revisión y aceptación del dueño                                                       | Pedido `pending_payment`, stock y presupuesto reservados                                                         |
| Checkout PayPal y aprobación del comprador                                            | Orden `66Y57409W3161101E`                                                                                        |
| Captura verificada                                                                    | `74983976NW1421130` COMPLETED, **76.86 USD a 4Z22N6RZVZKAC (EcoPack)**, invoice `DT-<pedido>` (criterio 9)       |
| Pedido                                                                                | `paid`; presupuesto y stock consumidos                                                                           |
| Reembolso parcial aprobado por el agente de ventas de EcoPack (PayPal-Auth-Assertion) | `258063294T6704230` COMPLETED; captura `PARTIALLY_REFUNDED`                                                      |
| Presupuesto delegado tras el reembolso                                                | Sin restaurar: consumido 76.86, disponible 3.14 (criterio 14)                                                    |

## Validación en producción con webhooks en vivo (2026-10-20)

Recorrido en `https://dealterminal.lucuo.dev` (VPS, detrás de Cloudflare + nginx), con el webhook del dashboard
apuntando a `/webhooks/paypal`. El agente actuó por la API REST con una credencial temporal, revocada al terminar.

| Paso                                                               | Resultado                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Agente `full_autonomy` intenta comprar la oferta de 81.19          | Bloqueado: `BUDGET_EXCEEDED` (total 81.19 > presupuesto 80.00)                                               |
| Contrapropuesta del agente (0.22) → respuesta por reglas           | 0.235 → **76.32** (GreenBox), sin violaciones                                                                |
| `execute_purchase`                                                 | Pedido `pending_payment`, pago `owner_action_required` (sin consentimiento de PayPal que cubra al proveedor) |
| Checkout del dueño y aprobación de la compradora                   | Orden PayPal `8YX23237FB653270Y`                                                                             |
| Retorno del navegador                                              | Sin sesión en ese navegador: devolvía JSON `UNAUTHENTICATED` (corregido: ahora lleva a `/login?next=…`)      |
| Webhook en vivo                                                    | El servidor verificó la firma y capturó: `5E313384YM373420J`, pedido `paid`, actor del evento `PayPal`       |
| Reembolso parcial 10.00 pedido por el dueño, aprobado por GreenBox | `30W639730E039930V` COMPLETED; `refund.completed` registrado por el webhook                                  |

Conclusión: los webhooks firmados llegan, se verifican y completan el pago aunque el navegador no vuelva al portal.
