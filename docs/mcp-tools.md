# Catálogo de herramientas MCP

> Generado con `pnpm docs:mcp` desde `apps/server/src/mcp/tools.ts`. No editar a mano.

## Comunes

### `get_authorization_status` — Estado de mis permisos

Devuelve tu nivel de acceso (search_only, negotiate, full_autonomy), facultades de venta, autorizaciones de compra con su presupuesto disponible y si existe autorización financiera. Úsala primero para saber qué puedes hacer. No incluye secretos.

Solo lectura: sí

### `request_authorization_change` — Solicitar cambio de permisos

Propone al dueño una autorización nueva, una ampliación o un cambio de nivel. No concede nada: queda pendiente de que el dueño la apruebe en el portal.

| Parámetro         | Obligatorio | Descripción                                                                                                                                                           |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`            | sí          |                                                                                                                                                                       |
| `authorizationId` | no          | ID (UUID) de la autorización a ampliar                                                                                                                                |
| `buyerLevel`      | no          |                                                                                                                                                                       |
| `terms`           | no          | Condiciones completas propuestas: mandate, category, requiredAttributes, quantityMin, quantityMax, budgetTotal, deliveryAddress, deliverBy, expiresAt (ISO con zona). |
| `reason`          | no          |                                                                                                                                                                       |

Solo lectura: no

### `get_quotes` — Ver cotizaciones

Historial de versiones de una negociación (negotiationId) o de todas las negociaciones de una necesidad (requestId), con importes, vigencia y comprobación contra tu autorización.

| Parámetro       | Obligatorio | Descripción                 |
| --------------- | ----------- | --------------------------- |
| `negotiationId` | no          | ID (UUID) de la negociación |
| `requestId`     | no          | ID (UUID) de la necesidad   |

Solo lectura: sí

### `get_order` — Consultar pedido

Estado comercial, financiero y de entrega de un pedido. Sin orderId, lista tus pedidos.

| Parámetro | Obligatorio | Descripción            |
| --------- | ----------- | ---------------------- |
| `orderId` | no          | ID (UUID) de el pedido |
| `side`    | no          |                        |

Solo lectura: sí

### `list_refunds` — Devoluciones

Con orderId: devoluciones de ese pedido. Sin orderId: devoluciones pendientes de tu decisión como proveedor.

| Parámetro | Obligatorio | Descripción            |
| --------- | ----------- | ---------------------- |
| `orderId` | no          | ID (UUID) de el pedido |

Solo lectura: sí

## Comprador

### `create_request` — Guardar necesidad de compra

Guarda una necesidad privada sin contactar proveedores (permitido en todos los niveles). Si tienes una autorización de compra, pasa solo authorizationId: los criterios se toman de ella y el máximo es tu presupuesto disponible.

| Parámetro         | Obligatorio | Descripción                                |
| ----------------- | ----------- | ------------------------------------------ |
| `authorizationId` | no          | ID (UUID) de tu autorización de compra     |
| `criteria`        | no          | Criterios, solo si no usas authorizationId |
| `preferences`     | no          |                                            |

Solo lectura: no

### `find_matches` — Buscar y comparar ofertas

Busca ofertas publicadas compatibles y las compara con total (incluye transporte e impuestos), entrega, stock y atributos sin confirmar. Pasa requestId para usar una necesidad guardada, o criteria. Una oferta por encima del presupuesto aparece con budget.withinBudget=false: se puede negociar.

| Parámetro             | Obligatorio | Descripción                                     |
| --------------------- | ----------- | ----------------------------------------------- |
| `requestId`           | no          | ID (UUID) de una necesidad guardada             |
| `criteria`            | no          |                                                 |
| `includeIncompatible` | no          | Incluir también las incompatibles con su motivo |

Solo lectura: sí

### `get_request` — Consultar una necesidad

Consulta una de tus necesidades guardadas. Sin requestId, lista todas las tuyas.

| Parámetro   | Obligatorio | Descripción               |
| ----------- | ----------- | ------------------------- |
| `requestId` | no          | ID (UUID) de la necesidad |

Solo lectura: sí

### `cancel_request` — Cancelar una necesidad

Cancela una necesidad abierta.

| Parámetro   | Obligatorio | Descripción               |
| ----------- | ----------- | ------------------------- |
| `requestId` | sí          | ID (UUID) de la necesidad |

Solo lectura: no

### `request_quote` — Pedir cotización

Pide cotización de una oferta para una necesidad tuya (nivel negotiate o full_autonomy). El proveedor responde con sus reglas aunque su agente no esté conectado; si no puede, queda pendiente de su respuesta. Repetir la llamada devuelve la misma negociación.

| Parámetro   | Obligatorio | Descripción               |
| ----------- | ----------- | ------------------------- |
| `requestId` | sí          | ID (UUID) de tu necesidad |
| `offerId`   | sí          | ID (UUID) de la oferta    |
| `message`   | no          |                           |

Solo lectura: no

### `counter_quote` — Contraofertar

Propone cambios sobre la última cotización del proveedor: precio unitario, cantidad, bonificar transporte o fecha. El proveedor acepta, contraoferta con lo máximo que permiten sus reglas o deja la negociación pendiente. Revisa authorizationCheck en la respuesta para saber si ya cabe en tu autorización.

| Parámetro       | Obligatorio | Descripción                                                   |
| --------------- | ----------- | ------------------------------------------------------------- |
| `negotiationId` | sí          | ID (UUID) de la negociación                                   |
| `unitPrice`     | no          | Precio unitario en USD con hasta 4 decimales, p. ej. "0.2200" |
| `quantity`      | no          |                                                               |
| `waiveShipping` | no          |                                                               |
| `deliverBy`     | no          | Nueva fecha de entrega (AAAA-MM-DD)                           |
| `message`       | no          |                                                               |

Solo lectura: no

### `submit_for_review` — Enviar propuesta final al dueño

Nivel negotiate: deja la última cotización como propuesta final para que el dueño la revise, acepte y pague en el portal. No crea compromisos.

| Parámetro       | Obligatorio | Descripción                 |
| --------------- | ----------- | --------------------------- |
| `negotiationId` | sí          | ID (UUID) de la negociación |
| `message`       | no          |                             |

Solo lectura: no

### `accept_quote` — Aceptar cotización

Nivel full_autonomy: acepta la cotización indicada y crea el pedido, reservando stock y presupuesto. El servidor verifica tu nivel, tu autorización y todas las condiciones. Repetirla devuelve el mismo pedido.

| Parámetro        | Obligatorio | Descripción                                                                       |
| ---------------- | ----------- | --------------------------------------------------------------------------------- |
| `negotiationId`  | sí          | ID (UUID) de la negociación                                                       |
| `quoteId`        | sí          | ID (UUID) de la versión a aceptar                                                 |
| `idempotencyKey` | no          | Clave opcional: repetir la llamada con la misma clave devuelve el mismo resultado |

Solo lectura: no

### `execute_purchase` — Ejecutar compra

Nivel full_autonomy: acepta (o recupera) el pedido y ejecuta el pago autorizado. Si no hay autorización financiera para ese proveedor, el pedido queda aceptado y pendiente de pago del dueño, que es notificado (payment.status = owner_action_required). Nunca cobra dos veces.

| Parámetro        | Obligatorio | Descripción                                                                       |
| ---------------- | ----------- | --------------------------------------------------------------------------------- |
| `orderId`        | no          | ID (UUID) de un pedido ya aceptado                                                |
| `negotiationId`  | no          | ID (UUID) de la negociación                                                       |
| `quoteId`        | no          | ID (UUID) de la versión a aceptar                                                 |
| `idempotencyKey` | no          | Clave opcional: repetir la llamada con la misma clave devuelve el mismo resultado |

Solo lectura: no

### `cancel_order` — Cancelar pedido

Cancela un pedido antes del pago y libera stock y presupuesto.

| Parámetro        | Obligatorio | Descripción                                                                       |
| ---------------- | ----------- | --------------------------------------------------------------------------------- |
| `orderId`        | sí          | ID (UUID) de el pedido                                                            |
| `reason`         | no          |                                                                                   |
| `idempotencyKey` | no          | Clave opcional: repetir la llamada con la misma clave devuelve el mismo resultado |

Solo lectura: no

### `request_refund` — Solicitar devolución

Solicita revisión de una devolución sobre un pedido pagado. El proveedor decide; un reembolso no devuelve presupuesto delegado.

| Parámetro        | Obligatorio | Descripción                                                                       |
| ---------------- | ----------- | --------------------------------------------------------------------------------- |
| `orderId`        | sí          | ID (UUID) de el pedido                                                            |
| `amount`         | no          | Importe en USD como texto decimal, p. ej. "80.00"                                 |
| `reason`         | sí          |                                                                                   |
| `idempotencyKey` | no          | Clave opcional: repetir la llamada con la misma clave devuelve el mismo resultado |

Solo lectura: no

## Proveedor

### `publish_offer` — Publicar oferta

Facultad publish_offers: crea un producto con atributos normalizados y su oferta (tramos de precio por cantidad, stock, regiones, plazos y reglas privadas de negociación). Las reglas nunca se muestran a compradores.

| Parámetro | Obligatorio | Descripción                                                                                                                                                                                                                                                                                                                                |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `product` | sí          | Producto; attributes: material, capacity_oz, hot_food_safe, microwave_safe?, has_lid, compartments?, pack_size                                                                                                                                                                                                                             |
| `offer`   | sí          | Oferta: status ("draft"\|"active"), stockAvailable, minOrderQty, maxOrderQty?, shipRegions ["TX",...], leadTimeDays, shippingFlat "5.00", taxRate "0.0825", priceTiers [{minQty, unitPrice}], negotiationRules {autoRespond, maxDiscount "0.10", floorUnitPrice, minQtyForDiscount, minLeadTimeDays, canWaiveShipping, quoteValidityHours} |

Solo lectura: no

### `update_offer` — Actualizar oferta

Facultad publish_offers: reemplaza las condiciones de una oferta propia (nueva versión) o, con solo status, la activa, pausa o archiva.

| Parámetro    | Obligatorio | Descripción                                  |
| ------------ | ----------- | -------------------------------------------- |
| `offerId`    | sí          | ID (UUID) de la oferta                       |
| `status`     | no          |                                              |
| `conditions` | no          | Condiciones completas, como en publish_offer |

Solo lectura: no

### `list_my_offers` — Mis ofertas

Facultad publish_offers: ofertas propias con tramos y reglas privadas.

Solo lectura: sí

### `list_pending_negotiations` — Negociaciones pendientes

Negociaciones de tus ofertas que esperan tu respuesta (o todas con status "all"). Incluye la traza de reglas aplicadas.

| Parámetro | Obligatorio | Descripción                                                           |
| --------- | ----------- | --------------------------------------------------------------------- |
| `status`  | no          | awaiting_supplier (por defecto), awaiting_buyer, agreed, closed o all |

Solo lectura: sí

### `submit_quote` — Enviar cotización

Facultad submit_quotes: cotiza una negociación pendiente. Un agente no puede conceder fuera de las reglas de su oferta (precio mínimo, plazo mínimo, transporte).

| Parámetro       | Obligatorio | Descripción                                                   |
| --------------- | ----------- | ------------------------------------------------------------- |
| `negotiationId` | sí          | ID (UUID) de la negociación                                   |
| `quantity`      | sí          |                                                               |
| `unitPrice`     | sí          | Precio unitario en USD con hasta 4 decimales, p. ej. "0.2200" |
| `waiveShipping` | no          |                                                               |
| `deliverBy`     | sí          | Fecha de entrega comprometida (AAAA-MM-DD)                    |
| `message`       | no          |                                                               |

Solo lectura: no

### `respond_to_counterquote` — Responder contrapropuesta

Responde a la contrapropuesta del comprador: accept (facultad accept_terms, dentro de tus reglas), reject, o counter con nuevas condiciones (submit_quotes).

| Parámetro       | Obligatorio | Descripción                 |
| --------------- | ----------- | --------------------------- |
| `negotiationId` | sí          | ID (UUID) de la negociación |
| `action`        | sí          |                             |
| `message`       | no          |                             |
| `terms`         | no          | Solo para counter           |

Solo lectura: no

### `approve_refund` — Aprobar devolución

Facultad approve_refunds: autoriza la devolución y la plataforma la ejecuta en PayPal en tu nombre.

| Parámetro  | Obligatorio | Descripción                |
| ---------- | ----------- | -------------------------- |
| `refundId` | sí          | ID (UUID) de la devolución |

Solo lectura: no

### `reject_refund` — Rechazar devolución

Facultad approve_refunds: rechaza la solicitud indicando el motivo.

| Parámetro  | Obligatorio | Descripción                |
| ---------- | ----------- | -------------------------- |
| `refundId` | sí          | ID (UUID) de la devolución |
| `reason`   | sí          |                            |

Solo lectura: no
