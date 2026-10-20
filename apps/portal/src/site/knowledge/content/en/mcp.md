Deal Terminal exposes its commercial operations as Model Context Protocol (MCP) tools. Your agent's model decides which tool to call; the server authenticates the agent, enforces its permissions and executes the operation.

## Connection

| Setting        | Value                                                                         |
| -------------- | ----------------------------------------------------------------------------- |
| URL            | `https://your-domain.example/mcp` (locally `http://localhost:3029/mcp`)       |
| Transport      | Streamable HTTP, stateless: every call is a `POST` with JSON-RPC              |
| Authentication | OAuth 2.1 for chat apps, or `Authorization: Bearer dtk_your_agent_credential` |

Step-by-step setup for chat apps (OAuth), Claude Code, Codex and the TypeScript SDK is in [Connect your first agent](/knowledge/getting-started).

### OAuth

Chat apps discover authorization on their own: an unauthenticated request to `/mcp` returns `401` with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"`. Deal Terminal implements the MCP authorization specification:

| Endpoint                                  | Purpose                                    |
| ----------------------------------------- | ------------------------------------------ |
| `/.well-known/oauth-protected-resource`   | Protected resource metadata (RFC 9728)     |
| `/.well-known/oauth-authorization-server` | Authorization server metadata (RFC 8414)   |
| `/oauth/register`                         | Dynamic client registration (RFC 7591)     |
| `/oauth/authorize`                        | Authorization code with PKCE (`S256` only) |
| `/oauth/token`                            | Code exchange and refresh-token rotation   |
| `/oauth/revoke`                           | Token revocation (RFC 7009)                |

The owner approves each connection and chooses the agent it acts as; tokens are bound to that agent and to the `/mcp` resource. Access tokens expire after one hour; refresh tokens rotate on every use, and reusing an old one revokes the connection's tokens.

The server is stateless: each request is authenticated and served on its own, so a lost connection loses nothing. Requests, negotiations and orders persist in Deal Terminal; an agent can resume any of them later by ID.

## Instructions sent to the model

When a client connects, the server sends instructions that summarize the buyer flow and the rules of the platform. Clients that support server instructions pass them to the model automatically, so a model can work out the flow without reading this documentation.

## Recommended buyer flow

1. `get_authorization_status` — learn your level, your purchase authorizations and their available budget.
2. `create_request` with `authorizationId` — the criteria and maximum total come from the authorization.
3. `find_matches` with `requestId` — compatible offers with full totals. Offers above the budget appear with `budget.withinBudget = false`: they are candidates for negotiation, not purchases.
4. `request_quote` — the supplier answers with its rules, or the negotiation waits for the supplier.
5. `counter_quote` — propose price, quantity, shipping waiver or date. Read `authorizationCheck` in the response: an empty `violations` list means the latest quote fits your authorization.
6. Depending on your level:
   - `negotiate` → `submit_for_review` leaves the final proposal to the owner.
   - `full_autonomy` → `execute_purchase` accepts and pays, or leaves payment to the owner if no PayPal consent covers the supplier.
7. `get_order` — follow the commercial, payment and delivery status.

> **Note:** Use the same `idempotencyKey` when you retry `accept_quote`, `execute_purchase`, `cancel_order` or `request_refund`. A retry returns the original result and never creates a second order or charge.

## Supplier flow

A supplier agent works with its selling scopes:

1. `publish_offer` and `update_offer` to manage the catalog (`publish_offers`).
2. `list_pending_negotiations` to see what waits for an answer.
3. `submit_quote` or `respond_to_counterquote` (`submit_quotes`, `accept_terms`) — always within the offer's private rules.
4. `list_refunds`, `approve_refund` and `reject_refund` (`approve_refunds`).

Suppliers do not need an agent connected: offers stay published and the rules answer automatically.

## Errors

A failed tool call returns `isError: true` and a JSON body:

```json
{
  "error": {
    "code": "BUDGET_EXCEEDED",
    "message": "Total 83.35 exceeds the authorized budget 80.00",
    "hint": "Negotiate a lower total or ask for a budget increase; the total exceeds the budget available to authorize.",
    "details": {
      "total": "83.35",
      "budgetTotal": "80.00",
      "violations": [
        {
          "code": "BUDGET_EXCEEDED",
          "message": "Total 83.35 exceeds the authorized budget 80.00"
        }
      ]
    }
  }
}
```

Build your agent's decisions on `code`, which is stable. `message` and `hint` are human-readable English text. Input validation errors use `VALIDATION_FAILED` with the list of `issues`.

## Security guarantees

- The organization, level and limits come from the credential, never from tool arguments or the conversation.
- Every tool enforces the same checks as the REST API, because both call the same services.
- Responses pass through a final filter that removes token, hash and credential fields; an automated test checks every MCP response for secrets.
- Resources of other organizations, and of other agents in your organization, respond as not found.

## Reference

The full list of tools, with who can use them and their inputs, is in the [MCP tool reference](/knowledge/mcp-tools).
