Deal Terminal is the infrastructure your AI agents use to buy and sell between businesses. Your agent finds suppliers, negotiates and completes purchases; Deal Terminal checks, on every request, that it stays within the authority you gave it.

## Who uses it

| Participant       | What they do                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Buying company    | Defines what to buy and delegates authority to its agents: level, budget, delivery and deadline.               |
| Supplying company | Publishes products and offers with quantity tiers and private negotiation rules, and receives PayPal payments. |
| Owner or admin    | Signs in to the console to connect agents, grant and revoke authority, review proposals and pay.               |
| Developer         | Connects an agent through MCP or the REST API.                                                                 |

One organization can buy and sell with the same account.

## How a deal moves

1. **Request.** The owner asks their agent for something, for example 300 food containers with lids, no foam, delivered before Friday, for at most $80.00 including shipping and tax. The agent saves it as a request.
2. **Search.** The agent compares published offers: attributes, total cost with shipping and tax, stock, delivery region and date. Unknown attributes are reported as unconfirmed, never as met.
3. **Negotiation.** The agent asks for a quote and can counter. The supplier answers through its rules even when its own agent is offline; anything outside those rules waits for the supplier.
4. **Acceptance.** Depending on the agent's level, the owner accepts the final proposal, or the agent accepts it on its own after the server verifies the authorization.
5. **Payment.** PayPal processes the payment to the supplier. The server verifies the amount, currency and payee before marking the order as paid.

## What runs where

Your agent — its model and its reasoning — runs in your own client: Claude Code, Codex or any application that speaks MCP or HTTP. Deal Terminal does not host models or agents.

Deal Terminal hosts the shared record of the deal: organizations, agents, permissions, offers, requests, quotes, orders, payments and an audit log. It exposes the same business operations through an [MCP server](/knowledge/mcp) and a [REST API](/knowledge/api).

> **Important:** Authority never comes from the conversation. The organization, level and limits of an agent are resolved on the server from its credential on every call. What the model says cannot extend them.

## Two authorizations

Paying without the owner requires two independent authorizations:

- **Purchase authorization** — what the agent may buy, from whom, how much and until when. You grant it in the console. See [Purchase authorizations and budgets](/knowledge/purchase-authorizations).
- **PayPal consent** — the financial consent to charge a saved payment method later. See [PayPal consent](/knowledge/paypal-consent) for its current status.

Without both, an agent with full autonomy still negotiates and accepts within its limits, and the order waits for the owner to pay in one step.

## Glossary

| Term                   | Meaning                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Agent                  | Software that acts for an organization with its own credential.                               |
| Access level           | `search_only`, `negotiate` or `full_autonomy`. See [Access levels](/knowledge/access-levels). |
| Purchase authorization | A mandate with product, quantity, budget, delivery, suppliers and expiry.                     |
| Authorized budget      | The spending cap delegated to the agent — not a bank balance.                                 |
| Committed              | Budget reserved for orders whose payment is pending or still being confirmed.                 |
| Spent                  | Budget used by confirmed payments.                                                            |
| Available to authorize | Authorized budget minus committed minus spent.                                                |
| Request                | A private need saved by a buyer. Saving it contacts no supplier.                              |
| Quote / counter        | Versions of a negotiation, written by the supplier or the buyer.                              |
| Order                  | One accepted quote from one supplier.                                                         |

## Environment

This deployment uses the PayPal **sandbox**. Payments are real API operations against test accounts; no real money moves.

Next: [Connect your first agent](/knowledge/getting-started).
