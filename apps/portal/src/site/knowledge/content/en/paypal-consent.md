Paying without a new checkout needs a second, financial authorization: the buyer's consent in PayPal to charge a saved payment method later. This page explains how it fits with the purchase authorization and its status today.

## Two independent authorizations

| Authorization          | Answers                                         | Where it lives                      |
| ---------------------- | ----------------------------------------------- | ----------------------------------- |
| Purchase authorization | What may the agent buy, from whom, how much?    | Deal Terminal                       |
| PayPal consent         | May this saved payment method be charged later? | PayPal, referenced by Deal Terminal |

Neither replaces the other. Signing in to PayPal does not authorize future charges, and a saved payment method does not give an agent commercial authority. The console shows both separately and only says an agent is ready to purchase when both are active.

## How a delegated payment works

When an agent with full autonomy calls `execute_purchase`:

1. The server accepts the quote, or recovers the order already accepted for it.
2. It verifies the purchase authorization again, right before paying.
3. It looks for an active PayPal consent that covers the order's supplier.
4. If one exists, it creates the PayPal order with the saved payment method and the supplier as payee, without a checkout, and verifies amount, currency and payee in PayPal's response.
5. If none exists, nothing is charged. The order stays **accepted and pending payment**, and the owner is notified to pay it in one step.

The saved payment method's token is stored on the server only. It never appears in MCP responses, API responses or logs.

## Status today

> **Important:** In the PayPal sandbox available to this project, a saved PayPal payment method can be charged only by the merchant that saved it. PayPal confirmed that saving a buyer's payment method at platform level — reusable with every seller on a marketplace — is not available for this integration.

What this means in practice:

- Agents with full autonomy search, negotiate, accept and reserve stock and budget on their own, within their authorization.
- Payment then waits for the owner, who approves it with a PayPal checkout from the console. The response to the agent says so explicitly: `payment.status = owner_action_required`.
- The delegated payment path is implemented and tested, and becomes active as soon as a consent that covers the supplier exists. Our tests in the sandbox confirmed both halves of the mechanism: a single approval followed by a payment without checkout, and the restriction to the merchant that holds the agreement.

The details and evidence are documented in the repository (`docs/paypal-spike.md`).

## The owner's checkout

When you pay an order from the console:

1. Deal Terminal creates a PayPal order for the exact total, with the supplier as payee.
2. You approve it in PayPal's own page. Deal Terminal never asks for your PayPal password.
3. On return, the server checks the order with PayPal — never the redirect parameters alone — and captures it only if the order is still payable.

If the stock reservation expired while you were in PayPal, the payment is not captured, so no money moves for an order that is no longer valid.

Next: [Payments and refunds](/knowledge/payments).
