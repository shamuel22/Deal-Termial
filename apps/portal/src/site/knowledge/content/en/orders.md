Accept a supplier quote to freeze the agreement, reserve stock and budget, and track payment separately from demo delivery.

## What acceptance verifies

An agent calls `accept_quote` with `negotiationId`, the exact `quoteId` and an optional `idempotencyKey`. For a new acceptance, the order service and its policy and budget checks verify:

1. Input IDs and the optional key are valid; the key is no longer than 200 characters.
2. The agent currently has `full_autonomy` (Full autonomy, within your authorized limits).
3. The negotiation belongs to the buyer organization and its request belongs to this agent.
4. The quote belongs to that negotiation and has kind `quote`, a supplier quote rather than a buyer counteroffer.
5. It is not superseded and its version equals the negotiation's latest version.
6. It is not expired and its expiry timestamp is still in the future.
7. Its status is `proposed` (Proposed), and the negotiation is `awaiting_buyer` (Awaiting buyer) or `pending_owner_review` (Pending owner review).
8. The offer is still `active` (Active).
9. The request links to a purchase authorization in the buyer organization, assigned to this agent.
10. That authorization is active, unexpired, unrevoked and not exhausted.
11. Product category and every mandatory attribute satisfy the authorization. Missing attributes produce `ATTRIBUTE_UNCONFIRMED`.
12. Unit and quantity match the authorized unit and quantity range.
13. The supplier is allowed, when a supplier list is configured.
14. Currency matches and the total does not exceed the authorization's total ceiling.
15. The delivery address matches after normalization, and delivery is no later than the authorized deadline.
16. Reported stock minus active reservations covers the quantity.
17. The total fits the remaining authorization budget and the organization's remaining monthly limit, when configured. The monthly period is UTC.

These steps run with transaction locks to protect stock and budgets from concurrent acceptances. Existing orders for the same quote are returned before repeating the new-order checks, after the agent level and resource access checks.

> **Note:** Acceptance checks the latest quote version, not equality between its stored offer version and the current offer version. It freezes the quoted terms and checks the offer's active status and current available stock. PayPal eligibility is checked when payment is dispatched.

## Reservations and frozen terms

Acceptance creates `pending_payment` (Pending payment), holds stock for 60 minutes and reserves the full total, including shipping and tax. It marks the quote accepted, the negotiation agreed, the request closed and the request's other negotiations closed. One request therefore selects one supplier order.

The order preserves product attributes, quantity, quote and offer versions, prices, discounts, shipping, tax, total, currency, address and delivery date. Later catalog changes do not rewrite these accepted terms.

An owner or administrator can accept through a console session for manual payment. This still checks quote acceptability and stock, and records budget reservations, but delegated policy and spending ceilings do not restrict the human acceptance.

## Three separate state tracks

| Track           | Status and human label                                                    | Meaning                                                                                                    |
| --------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Order           | `pending_review` — Pending review                                         | Supported commercial state; `submit_for_review` actually marks the negotiation, without creating an order. |
| Order           | `pending_payment` — Pending payment                                       | Accepted agreement waiting for confirmed payment.                                                          |
| Order           | `paid` — Paid                                                             | Capture recorded; inspect any incident.                                                                    |
| Order           | `cancelled` — Cancelled                                                   | Cancelled before payment.                                                                                  |
| Order           | `expired` — Expired                                                       | Unpaid hold expired and reservations were released.                                                        |
| Payment attempt | `created` — Created; `processing` — Processing payment                    | Payment attempt recorded or in progress.                                                                   |
| Payment attempt | `requires_action` — Requires action                                       | Owner action is needed.                                                                                    |
| Payment attempt | `completed` — Payment completed; `failed` — Payment failed                | Confirmed capture or definitive attempt failure.                                                           |
| Payment attempt | `unknown` — Payment unconfirmed                                           | Outcome needs reconciliation.                                                                              |
| Demo delivery   | `not_shipped` — Not shipped; `shipped` — Shipped; `delivered` — Delivered | Demonstration delivery states, independent of money movement.                                              |

“Payment completed” does not mean “Delivered.” See [payments](/knowledge/payments) for recovery actions and the separate `owner_action_required` purchase response.

## Cancellation and expiry

Only the buyer can cancel. An agent needs Full autonomy, within its authorized limits; an owner or administrator uses a session. The order must be pending review or pending payment. Cancellation releases active stock and budget reservations. Repeating cancellation of an already cancelled order returns it.

Attempts in `created`, `processing`, `unknown` or `completed` block cancellation and unpaid expiry because money may already be moving. A checkout waiting in `requires_action` does not block them: capture must only proceed while the order remains payable.

The scheduler expires unpaid orders after their stock hold is due, unless a blocking attempt exists. Uncertain payments retain reservations until reconciliation determines the outcome. A failed attempt leaves the order pending payment; it does not immediately release reservations. Cancellation or unpaid expiry releases them. A late capture after release records an incident; it cannot guarantee stock availability.

## Retries and order lookup

There is one order per quote, including concurrent retries. REST acceptance and cancellation accept `Idempotency-Key`; MCP uses the `idempotencyKey` input. Reuse the same key and inputs for the same operation. Acceptance/cancellation keys are scoped to the actor; reusing a key with another payload or operation returns `IDEMPOTENCY_KEY_REUSED`.

`get_order` returns accepted terms, parties, applied authorization/version, acceptance actor, reservations, latest payment references, timestamps and incidents. Without `orderId`, it lists accessible orders; `side` selects buyer or supplier. Buyer agents see orders from their own requests. Supplier agents need a seller scope. Other organizations cannot retrieve the order.

Use the [REST reference](/knowledge/api) or [MCP tools](/knowledge/mcp-tools) to choose the correct interface.
