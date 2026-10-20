A purchase authorization is the mandate an agent buys under. It turns an instruction such as "buy 300 food containers with lids, no foam, before Friday, up to $80.00" into structured terms the server can verify.

## What it contains

| Field               | Meaning                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Agent               | The one agent that may use it. It must have a buying level.                                   |
| Mandate             | Your instruction in plain language. It is informative; authority comes from the fields below. |
| Category            | `food_containers` in this version.                                                            |
| Required attributes | Constraints the product must meet, such as `hot_food_safe = true` or material not `foam_eps`. |
| Quantity            | Minimum and maximum units.                                                                    |
| Allowed suppliers   | Optional list of supplier organizations. Empty means any supplier.                            |
| Budget              | Maximum total in USD, **including shipping and tax**.                                         |
| Delivery address    | The only destination the agent may accept.                                                    |
| Deliver by          | The latest acceptable delivery date.                                                          |
| Expires             | After this moment the authorization can no longer be used.                                    |

Before you activate it, the console shows the terms in a structured summary so you can check exactly what the agent will be allowed to do.

> **Important:** A required attribute the supplier has not confirmed is never treated as met. The purchase is blocked with `ATTRIBUTE_UNCONFIRMED` until it is confirmed or you change the terms.

## Budget: committed, spent and available

The budget is a delegated spending cap, not a bank balance. The server tracks it with reservations:

- **Committed** — reserved for an accepted order whose payment is pending or still being confirmed.
- **Spent** — used by a confirmed payment.
- **Available to authorize** — budget minus committed minus spent.

With a budget of $80.00 and an accepted order of $74.00:

| Moment                         | Committed |  Spent | Available |
| ------------------------------ | --------: | -----: | --------: |
| Order accepted, not yet paid   |    $74.00 |  $0.00 |     $6.00 |
| Payment confirmed              |     $0.00 | $74.00 |     $6.00 |
| Order cancelled before payment |     $0.00 |  $0.00 |    $80.00 |

A payment with an uncertain result keeps its reservation until it is reconciled with PayPal. A refund is recorded on the order but **does not** restore delegated budget; if you want the agent to spend more, raise the budget.

Reservations are taken inside a database transaction that locks the organization and the authorization. Two agents, or two concurrent requests from the same agent, cannot spend the same remaining budget.

## Monthly limit

You can also set a monthly limit for the whole organization. It is shared by all agents and authorizations, and months are counted in **UTC**. A purchase must fit both the authorization's available budget and the month's available limit.

Purchases you accept yourself in the console are recorded against the month, but the limits delegated to agents do not block you.

## Checks at purchase time

When an agent accepts a quote, and again right before payment, the server verifies:

1. The agent's current level is `full_autonomy`.
2. The authorization is active: not revoked, expired or exhausted.
3. Category, required attributes, unit and quantity range.
4. The supplier is allowed.
5. Currency, total within the budget, destination and delivery date.
6. Available budget for the authorization and for the month.

Any failure returns an actionable error, for example `BUDGET_EXCEEDED`, `AUTHORIZATION_REVOKED`, `AUTHORIZATION_EXPIRED` or `TERMS_OUTSIDE_AUTHORIZATION`, with every violation listed in `details`.

## Changing, revoking and expiring

- **Amend** — editing the terms creates a new version. Orders already accepted keep the version they were accepted with.
- **Revoke** — new acceptances and payments not yet sent are blocked immediately. Payments already sent to PayPal are still checked and reconciled; revoking does not cancel them.
- **Expire** — after the expiry moment the authorization stops working on its own.
- **Exhausted** — when confirmed spending reaches the budget.

## When the agent needs more

An agent cannot raise its own limits. It can propose a new authorization, an amendment or a level change with `request_authorization_change`; the proposal appears in the console and takes effect only if you approve it.

Next: [PayPal consent](/knowledge/paypal-consent).
