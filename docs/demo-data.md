# Datos de demostración

Ejecuta `pnpm build && pnpm seed:demo` desde la raíz con `DATABASE_URL` definida. El CLI carga
el `.env` raíz si existe, sin reemplazar variables ya presentes en el entorno, y aplica las
migraciones antes de cargar los datos. No requiere levantar el servidor ni credenciales de PayPal.

El seed usa los servicios de `@deal/core` dentro de una única transacción, incluida la auditoría.
La única inserción directa es `seller_accounts`, porque todavía no existe un servicio.
Si existe `owner@taqueria-elsol.demo`, el CLI informa el email y sale con código 1; no actualiza,
duplica ni recupera claves de una carga anterior. Cualquier fallo intermedio revierte toda la carga.
Las migraciones se ejecutan antes de esa transacción.

## Cuentas y agentes

| Empresa                      | Email del dueño             | Agentes / nivel                                                                                                 |
| ---------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Taquería El Sol (Austin, TX) | `owner@taqueria-elsol.demo` | Asistente de compras: `full_autonomy`; Asistente investigador: `search_only`; Asistente negociador: `negotiate` |
| EcoPack Texas                | `owner@ecopack.demo`        | Agente de ventas EcoPack: `buyerLevel: null`                                                                    |
| GreenBox Supply              | `owner@greenbox.demo`       | Agente de ventas GreenBox: `buyerLevel: null`                                                                   |

Contraseña común: `DEMO_PASSWORD`, por defecto `DealTerminal-demo-2026`. El servicio de registro
exige entre 12 y 200 caracteres. Cada uno de los cinco agentes recibe una API key aleatoria nueva;
el CLI la muestra tras confirmar la transacción y la base almacena solo su hash. No hay API keys
predefinidas ni secretos financieros en este documento.

Ambos vendedores tienen las facultades `publish_offers`, `submit_quotes`, `accept_terms` y
`approve_refunds`. Los productos y las ofertas los publican sus agentes, identificados mediante
`resolveAgentKey`; los eventos de auditoría conservan ese actor.

| Proveedor       | Tracking ID     | Merchant ID predeterminado | Variable opcional           | Regiones   |
| --------------- | --------------- | -------------------------- | --------------------------- | ---------- |
| EcoPack Texas   | `demo-seller-a` | `4Z22N6RZVZKAC`            | `DEMO_SELLER_A_MERCHANT_ID` | TX, OK, LA |
| GreenBox Supply | `demo-seller-b` | `VW92JVJ8JBR7Q`            | `DEMO_SELLER_B_MERCHANT_ID` | TX, CA, AZ |

Se cargan cuentas de vendedor de demostración con estado `active`, `paymentsReceivable: true` y
`primaryEmailConfirmed: true`. Estos valores sembrados no constituyen una comprobación con PayPal.
El seed no crea conexiones financieras del comprador, tokens de pago, pedidos ni pagos. El
consentimiento financiero y el onboarding real de sandbox se verifican por separado para el §14.

## Encargo y autorizaciones

La compradora tiene un límite mensual compartido de US$500.00. El Asistente de compras y el
Asistente negociador reciben cada uno una autorización activa de US$80.00, con cantidad mínima
y máxima de 300 y categoría `food_containers`. El investigador no recibe autorización de compra.

> Compra 300 envases con tapa para comida caliente, sin foam. Entrega antes del viernes en esta dirección.
> Puedes negociar y pagar hasta US$80, incluyendo transporte e impuestos.

Restricciones: `hot_food_safe: {eq: true}`, `has_lid: {eq: true}` y
`material: {not_in: ['foam_eps']}`. Dirección: 1100 E 6th St, Austin, TX 78702, US.
El esquema de organizaciones no tiene dirección; Austin/TX queda representado en el encargo.

`nextFriday(now)` devuelve una fecha `YYYY-MM-DD`: el primer viernes cuya medianoche UTC esté
al menos 72 horas después de `now`, sin modificarlo. Un lunes apunta al viernes de esa semana;
jueves y viernes apuntan al siguiente. Un martes después de las 00:00 UTC apunta a la semana
siguiente para respetar las 72 horas completas. La expiración es exactamente `now + 30 días`.

## Catálogo

Precios unitarios en USD; tramos expresados como cantidad mínima → precio. Todas las ofertas
están activas, usan impuesto informado `0.0825` y tienen un pedido mínimo igual al primer tramo.
Los plazos son días naturales; el impuesto de demo se aplica a mercancía neta más transporte.

| Proveedor | SKU / producto                                   | Material / capacidad | Caliente / microondas / tapa | Unidades por paquete | Tramos                             | Envío | Plazo | Stock |
| --------- | ------------------------------------------------ | -------------------- | ---------------------------- | -------------------- | ---------------------------------- | ----- | ----- | ----- |
| EcoPack   | ENV-KR16-L — Envase kraft 16 oz con tapa         | kraft_paper / 16 oz  | Sí / No / Sí                 | 50                   | 50→0.3100; 250→0.2400; 1000→0.2200 | 5.00  | 2     | 4000  |
| EcoPack   | ENV-PP32-L — Contenedor PP 32 oz apto microondas | pp / 32 oz           | Sí / Sí / Sí                 | 100                  | 100→0.4200; 500→0.3600             | 8.00  | 3     | 2500  |
| EcoPack   | ENV-FOAM9 — Clamshell de foam 9 in               | foam_eps / 24 oz     | Sí / Sin confirmar / Sí      | 100                  | 100→0.1200                         | 4.00  | 1     | 10000 |
| GreenBox  | GB-BAG24 — Bowl de bagazo 24 oz con tapa         | bagasse / 24 oz      | Sí / Sí / Sí                 | 50                   | 50→0.3000; 300→0.2500              | 0.00  | 2     | 3000  |
| GreenBox  | GB-PET16 — Contenedor PET 16 oz para ensaladas   | pet / 16 oz          | No / Sin confirmar / Sí      | 50                   | 50→0.2000                          | 3.00  | 2     | 5000  |
| GreenBox  | GB-ALU-L — Bandeja de aluminio con tapa          | aluminum / 32 oz     | Sí / Sin confirmar / Sí      | 50                   | 50→0.5500                          | 10.00 | 5     | 800   |

La aptitud para microondas solo se publica donde fue especificada; no se inventan valores para
foam, PET o aluminio. Todos los atributos obligatorios de la categoría están presentes.

| SKU        | Descuento máximo | Piso unitario | Cantidad mínima para descuento | Plazo mínimo | Puede quitar envío |
| ---------- | ---------------- | ------------- | ------------------------------ | ------------ | ------------------ |
| ENV-KR16-L | 0.1000           | 0.2200        | 250                            | 1            | No                 |
| ENV-PP32-L | 0.0500           | 0.3400        | 1                              | 2            | No                 |
| ENV-FOAM9  | 0                | 0.1200        | 1                              | 1            | No                 |
| GB-BAG24   | 0.0800           | 0.2350        | 300                            | 2            | Sí                 |
| GB-PET16   | 0                | 0.2000        | 1                              | 2            | No                 |
| GB-ALU-L   | 0.0500           | 0.5200        | 1                              | 4            | No                 |

Se conservan los valores predeterminados de core para reglas no especificadas: respuesta
automática habilitada, vigencia de cotización 48 horas, mínimo para descuento 1 y envío no condonable.

## Compatibilidad y ajustes necesarios

- **Piso frente a tramos:** core rechaza una oferta cuyo piso supere cualquier tramo. El dato solicitado
  `1000→0.2100` de ENV-KR16-L contradice su piso `0.2200`. Se ajusta ese tramo a `0.2200` para
  conservar el piso y el caso de negociación de 300 unidades, sin modificar core.
- **Presupuesto frente a compatibilidad técnica:** para un lunes como `2026-10-19T12:00:00Z`, la búsqueda
  por atributos, cantidad, región y viernes devuelve exactamente ENV-KR16-L, ENV-PP32-L y GB-BAG24.
  Foam y PET incumplen atributos; el aluminio llega después del viernes. Con `maxTotal: '80.00'`,
  core clasifica también esas tres alternativas como incompatibles por `OVER_BUDGET`: sus precios
  de lista exceden el presupuesto. Usa `includeIncompatible: true` para verlas y negociar. El plazo
  del aluminio puede resultar compatible cuando el viernes calculado está a cinco días o más.
- **Totales reales de core:** ENV-KR16-L para 300 cuesta US$83.35 de lista y US$76.86 a `0.2200`.
  GB-BAG24 cuesta US$81.19 de lista y **US$76.32** a `0.2350`; el valor solicitado US$76.31
  difiere del redondeo de core: `70.50 × 0.0825 = 5.81625`, impuesto redondeado a `5.82`.

Las pruebas en `apps/server/test/seed.test.ts` importan el seed compilado desde `dist`, usan
PostgreSQL real con `createTestDatabase()` y verifican fechas, datos, claves resueltas, actores de
auditoría, búsquedas, totales, rechazo de duplicados y rollback tras un fallo intermedio.
