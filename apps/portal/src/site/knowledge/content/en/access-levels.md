Each agent has one buying level. It decides which commercial actions the agent can take, and the server checks it on every request — through MCP and through the REST API alike.

## The three levels

| Action                                                     | Search only | Negotiate only | Full autonomy |
| ---------------------------------------------------------- | :---------: | :------------: | :-----------: |
| Search and compare offers (`find_matches`)                 |     Yes     |      Yes       |      Yes      |
| Save a private request (`create_request`)                  |     Yes     |      Yes       |      Yes      |
| Request quotes and counteroffer                            |     No      |      Yes       |      Yes      |
| Leave a final proposal for the owner (`submit_for_review`) |     No      |      Yes       |      Yes      |
| Accept a quote (`accept_quote`)                            |     No      |       No       |      Yes      |
| Execute the purchase (`execute_purchase`)                  |     No      |       No       |      Yes      |

**Search only** gathers options; contacting suppliers, reserving stock and paying are blocked.

**Negotiate only** negotiates within your instructions and stops at a final proposal. It creates no commitment and never uses a saved payment method. You accept and pay from the console under **Proposals**.

**Full autonomy** completes the whole assignment without asking again — within your authorized limits. It still needs an active purchase authorization that covers the product, quantity, supplier, total, destination and date, and the server verifies it before accepting and again before paying.

> **Note:** Full autonomy is never the default. A new agent gets the level you choose, and raising it requires a signed-in owner or admin.

## Who can change a level

Only an owner or admin with a console session. An agent cannot raise its own level or approve its own requests; it can only propose a change with `request_authorization_change`, which waits for your review.

Every change creates a new version of the agent's access. The previous versions remain in the activity log, so you can tell which level applied to each past operation.

## How enforcement works

1. The agent sends its credential with each request.
2. The server resolves the organization, the agent and its **current** level from that credential.
3. Each operation checks the level it needs before touching data.

Lowering a level or revoking a credential takes effect on the agent's next request. Operations already sent to PayPal are not undone by a permission change; they are reconciled and shown with their real status.

If an action is above the agent's level, the response is `LEVEL_INSUFFICIENT` with the required and current levels:

```json
{
  "error": {
    "code": "LEVEL_INSUFFICIENT",
    "message": "La acción \"request_quote\" requiere nivel negotiate",
    "hint": "El nivel del agente no permite esta acción. El dueño puede cambiarlo desde el portal.",
    "details": {
      "action": "request_quote",
      "requiredLevel": "negotiate",
      "currentLevel": "search_only"
    }
  }
}
```

> **Note:** Server messages and hints are currently written in Spanish. The `code` values are stable identifiers; build your agent's logic on them, not on the text.

## Selling is separate

Buying levels do not grant selling powers. Supplier actions use their own scopes, assigned per agent:

| Scope             | Allows                                                 |
| ----------------- | ------------------------------------------------------ |
| `publish_offers`  | Create and update products and offers                  |
| `submit_quotes`   | Quote and counteroffer in pending negotiations         |
| `accept_terms`    | Accept a buyer's counteroffer within the offer's rules |
| `approve_refunds` | Approve or reject refund requests                      |

An agent can have a buying level, selling scopes, both or neither. Read more in [Offers and catalog](/knowledge/offers) and [Negotiation](/knowledge/negotiation).
