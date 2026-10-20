# MCP tool catalog

> Generated with `pnpm docs:mcp` from `apps/server/src/mcp/tools.ts`. Do not edit manually.

## Common

### `get_authorization_status` — Check my permissions

Get your access level (search_only, negotiate, full_autonomy), seller permissions, purchase authorizations with their available budgets, and whether PayPal consent exists. Call this first to learn what you can do. No secrets are included.

Read only: yes

### `request_authorization_change` — Request a permission change

Propose a new authorization, an increase or an access level change to the owner. This grants nothing: the proposal awaits owner approval in the portal.

| Parameter         | Required | Description                                                                                                                                                       |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`            | yes      |                                                                                                                                                                   |
| `authorizationId` | no       | Authorization to extend ID (UUID)                                                                                                                                 |
| `buyerLevel`      | no       |                                                                                                                                                                   |
| `terms`           | no       | Complete proposed terms: mandate, category, requiredAttributes, quantityMin, quantityMax, budgetTotal, deliveryAddress, deliverBy, expiresAt (ISO with timezone). |
| `reason`          | no       |                                                                                                                                                                   |

Read only: no

### `get_quotes` — View quotes

Get the version history for a negotiation (negotiationId) or all negotiations for a purchase request (requestId), including amounts, validity and checks against your purchase authorization.

| Parameter       | Required | Description                |
| --------------- | -------- | -------------------------- |
| `negotiationId` | no       | Negotiation ID (UUID)      |
| `requestId`     | no       | Purchase request ID (UUID) |

Read only: yes

### `get_order` — Get an order

Get an order's commercial, payment and delivery status. Without orderId, list your orders.

| Parameter | Required | Description     |
| --------- | -------- | --------------- |
| `orderId` | no       | Order ID (UUID) |
| `side`    | no       |                 |

Read only: yes

### `list_refunds` — Refunds

With orderId: list refunds for that order. Without orderId: list refunds awaiting your decision as supplier.

| Parameter | Required | Description     |
| --------- | -------- | --------------- |
| `orderId` | no       | Order ID (UUID) |

Read only: yes

## Buyer

### `create_request` — Save a purchase request

Save a private purchase request without contacting suppliers (allowed at all access levels). If you have a purchase authorization, pass only authorizationId: its terms provide the criteria and your available budget sets the maximum.

| Parameter         | Required | Description                                         |
| ----------------- | -------- | --------------------------------------------------- |
| `authorizationId` | no       | Your purchase authorization ID (UUID)               |
| `criteria`        | no       | Criteria, only if you are not using authorizationId |
| `preferences`     | no       |                                                     |

Read only: no

### `find_matches` — Search and compare offers

Search compatible published offers and compare totals (including shipping and tax), delivery, stock and unconfirmed attributes. Pass requestId to use a saved purchase request, or pass criteria. An offer over budget appears with budget.withinBudget=false: you can negotiate it.

| Parameter             | Required | Description                                         |
| --------------------- | -------- | --------------------------------------------------- |
| `requestId`           | no       | Saved purchase request ID (UUID)                    |
| `criteria`            | no       |                                                     |
| `includeIncompatible` | no       | Also include incompatible offers with their reasons |

Read only: yes

### `get_request` — Get a purchase request

Get one of your saved purchase requests. Without requestId, list all your requests.

| Parameter   | Required | Description                |
| ----------- | -------- | -------------------------- |
| `requestId` | no       | Purchase request ID (UUID) |

Read only: yes

### `cancel_request` — Cancel a purchase request

Cancel an open purchase request.

| Parameter   | Required | Description                |
| ----------- | -------- | -------------------------- |
| `requestId` | yes      | Purchase request ID (UUID) |

Read only: no

### `request_quote` — Request a quote

Request a quote for an offer using your own purchase request (negotiate or full_autonomy access level). The supplier responds using its rules even if its agent is disconnected; if it cannot, the negotiation awaits the supplier's response. Repeating the call returns the same negotiation.

| Parameter   | Required | Description                     |
| ----------- | -------- | ------------------------------- |
| `requestId` | yes      | Your purchase request ID (UUID) |
| `offerId`   | yes      | Offer ID (UUID)                 |
| `message`   | no       |                                 |

Read only: no

### `counter_quote` — Make a counterproposal

Propose changes to the supplier's latest quote: unit price, quantity, waived shipping or date. The supplier accepts, counters with the best terms its rules permit, or leaves the negotiation pending. Check authorizationCheck in the response to see whether the terms now fit your purchase authorization.

| Parameter       | Required | Description                                                  |
| --------------- | -------- | ------------------------------------------------------------ |
| `negotiationId` | yes      | Negotiation ID (UUID)                                        |
| `unitPrice`     | no       | Unit price in USD with up to 4 decimal places, e.g. "0.2200" |
| `quantity`      | no       |                                                              |
| `waiveShipping` | no       |                                                              |
| `deliverBy`     | no       | New delivery date (YYYY-MM-DD)                               |
| `message`       | no       |                                                              |

Read only: no

### `submit_for_review` — Submit the final proposal to the owner

negotiate access level: submit the latest quote as the final proposal for the owner to review, accept and pay in the portal. This creates no commitments.

| Parameter       | Required | Description           |
| --------------- | -------- | --------------------- |
| `negotiationId` | yes      | Negotiation ID (UUID) |
| `message`       | no       |                       |

Read only: no

### `accept_quote` — Accept a quote

full_autonomy access level: accept the specified quote and create the order, reserving stock and budget. The server checks your access level, purchase authorization and all terms. Repeating the call returns the same order.

| Parameter        | Required | Description                                                                |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `negotiationId`  | yes      | Negotiation ID (UUID)                                                      |
| `quoteId`        | yes      | Quote version to accept ID (UUID)                                          |
| `idempotencyKey` | no       | Optional key: repeating the call with the same key returns the same result |

Read only: no

### `execute_purchase` — Execute a purchase

full_autonomy access level: accept (or retrieve) the order and execute the authorized payment. If no PayPal consent covers that supplier, the order remains accepted and awaits payment by the owner, who is notified (payment.status = owner_action_required). Never charges twice.

| Parameter        | Required | Description                                                                |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `orderId`        | no       | Previously accepted order ID (UUID)                                        |
| `negotiationId`  | no       | Negotiation ID (UUID)                                                      |
| `quoteId`        | no       | Quote version to accept ID (UUID)                                          |
| `idempotencyKey` | no       | Optional key: repeating the call with the same key returns the same result |

Read only: no

### `cancel_order` — Cancel an order

Cancel an order before payment and release stock and budget.

| Parameter        | Required | Description                                                                |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `orderId`        | yes      | Order ID (UUID)                                                            |
| `reason`         | no       |                                                                            |
| `idempotencyKey` | no       | Optional key: repeating the call with the same key returns the same result |

Read only: no

### `request_refund` — Request a refund

Request a refund review for a paid order. The supplier decides; a refund does not restore delegated budget.

| Parameter        | Required | Description                                                                |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `orderId`        | yes      | Order ID (UUID)                                                            |
| `amount`         | no       | Amount in USD as a decimal string, e.g. "80.00"                            |
| `reason`         | yes      |                                                                            |
| `idempotencyKey` | no       | Optional key: repeating the call with the same key returns the same result |

Read only: no

## Supplier

### `publish_offer` — Publish an offer

publish_offers permission: create a product with normalized attributes and its offer (quantity price tiers, stock, regions, lead times and private negotiation rules). The rules are never shown to buyers.

| Parameter | Required | Description                                                                                                                                                                                                                                                                                                                               |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product` | yes      | Product; attributes: material, capacity_oz, hot_food_safe, microwave_safe?, has_lid, compartments?, pack_size                                                                                                                                                                                                                             |
| `offer`   | yes      | Offer: status ("draft"\|"active"), stockAvailable, minOrderQty, maxOrderQty?, shipRegions ["TX",...], leadTimeDays, shippingFlat "5.00", taxRate "0.0825", priceTiers [{minQty, unitPrice}], negotiationRules {autoRespond, maxDiscount "0.10", floorUnitPrice, minQtyForDiscount, minLeadTimeDays, canWaiveShipping, quoteValidityHours} |

Read only: no

### `update_offer` — Update an offer

publish_offers permission: replace the terms of your own offer (new version), or pass only status to activate, pause or archive it.

| Parameter    | Required | Description                         |
| ------------ | -------- | ----------------------------------- |
| `offerId`    | yes      | Offer ID (UUID)                     |
| `status`     | no       |                                     |
| `conditions` | no       | Complete terms, as in publish_offer |

Read only: no

### `list_my_offers` — List my offers

publish_offers permission: list your own offers with price tiers and private rules.

Read only: yes

### `list_pending_negotiations` — List pending negotiations

List negotiations for your offers awaiting your response (or all negotiations with status "all"). Includes the trace of applied rules.

| Parameter | Required | Description                                                        |
| --------- | -------- | ------------------------------------------------------------------ |
| `status`  | no       | awaiting_supplier (default), awaiting_buyer, agreed, closed or all |

Read only: yes

### `submit_quote` — Submit a quote

submit_quotes permission: quote a pending negotiation. An agent cannot grant terms outside its offer's rules (minimum price, minimum lead time, shipping).

| Parameter       | Required | Description                                                  |
| --------------- | -------- | ------------------------------------------------------------ |
| `negotiationId` | yes      | Negotiation ID (UUID)                                        |
| `quantity`      | yes      |                                                              |
| `unitPrice`     | yes      | Unit price in USD with up to 4 decimal places, e.g. "0.2200" |
| `waiveShipping` | no       |                                                              |
| `deliverBy`     | yes      | Committed delivery date (YYYY-MM-DD)                         |
| `message`       | no       |                                                              |

Read only: no

### `respond_to_counterquote` — Respond to a counterproposal

Respond to the buyer's counterproposal: accept (accept_terms permission, within your rules), reject, or counter with new terms (submit_quotes).

| Parameter       | Required | Description           |
| --------------- | -------- | --------------------- |
| `negotiationId` | yes      | Negotiation ID (UUID) |
| `action`        | yes      |                       |
| `message`       | no       |                       |
| `terms`         | no       | Only for counter      |

Read only: no

### `approve_refund` — Approve a refund

approve_refunds permission: authorize the refund and the platform executes it in PayPal on your behalf.

| Parameter  | Required | Description      |
| ---------- | -------- | ---------------- |
| `refundId` | yes      | Refund ID (UUID) |

Read only: no

### `reject_refund` — Reject a refund

approve_refunds permission: reject the request and provide a reason.

| Parameter  | Required | Description      |
| ---------- | -------- | ---------------- |
| `refundId` | yes      | Refund ID (UUID) |
| `reason`   | yes      |                  |

Read only: no
