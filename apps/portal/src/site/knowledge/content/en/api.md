Use the REST API to manage permissions, search offers, negotiate and track orders through the same services used by MCP.

## Base URL and schemas

The base path is `/api`. OpenAPI is available at `/api/docs` with its JSON document at `/api/docs-json`.

```bash
curl https://your-domain.example/api/docs-json
```

Use OpenAPI for request schemas. Organization and resource IDs in the paths below are UUID parameters; replace placeholders such as `<orgId>` with your own values. [MCP](/knowledge/mcp) uses a separate `/mcp` endpoint, and [PayPal webhooks](/knowledge/webhooks) use `/webhooks/paypal`.

## Two authentication modes

| Mode            | Credentials                                                    | Route family           |
| --------------- | -------------------------------------------------------------- | ---------------------- |
| Console session | `dt_session` HTTP-only cookie, issued by registration or login | `/api/orgs/:orgId/...` |
| Agent           | `Authorization: Bearer dtk_your_agent_credential`              | `/api/agent/...`       |

The console session identifies a human; organization membership and the required role are checked separately. An agent credential identifies its organization and current access grant. It cannot call session-only administration or owner checkout routes. Agent levels and seller scopes are checked on the server for each operation.

```bash
curl https://your-domain.example/api/agent/authorization-status \
  -H 'Authorization: Bearer dtk_your_agent_credential'
```

Keep the actual credential in client configuration rather than model-visible instructions. See [access levels](/knowledge/access-levels) for the permission model.

## Account and administration routes

| Group                | Method    | Path                                                         | Purpose                                              |
| -------------------- | --------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| Account              | POST      | `/api/auth/register`                                         | Create organization and owner; issue session cookie. |
| Account              | POST      | `/api/auth/login`                                            | Start console session.                               |
| Account              | POST      | `/api/auth/logout`                                           | End session.                                         |
| Account              | GET       | `/api/me`                                                    | Session user and memberships.                        |
| Agent identity       | GET       | `/api/agent/me`                                              | Agent identity and current access.                   |
| Agent administration | GET, POST | `/api/orgs/:orgId/agents`                                    | List or create agents.                               |
| Agent administration | PUT       | `/api/orgs/:orgId/agents/:agentId/access`                    | Change buyer level and seller scopes.                |
| Agent administration | POST      | `/api/orgs/:orgId/agents/:agentId/credentials`               | Issue a credential, shown once.                      |
| Agent administration | DELETE    | `/api/orgs/:orgId/agents/:agentId/credentials/:credentialId` | Revoke credential.                                   |
| Agent administration | DELETE    | `/api/orgs/:orgId/agents/:agentId`                           | Disable agent and revoke credentials.                |
| Authorization        | GET, POST | `/api/orgs/:orgId/authorizations`                            | List or create purchase authorizations.              |
| Authorization        | GET       | `/api/orgs/:orgId/authorizations/:authorizationId`           | Read authorization.                                  |
| Authorization        | PUT       | `/api/orgs/:orgId/authorizations/:authorizationId/terms`     | Replace terms with a new version.                    |
| Authorization        | POST      | `/api/orgs/:orgId/authorizations/:authorizationId/revoke`    | Revoke authorization.                                |
| Budget               | GET, PUT  | `/api/orgs/:orgId/budget/monthly`                            | Read or set the shared monthly UTC limit.            |
| Agent permissions    | GET       | `/api/agent/authorization-status`                            | Read access, authorizations and budget.              |
| Change requests      | GET, POST | `/api/agent/change-requests`                                 | List own requests or propose changes.                |
| Change requests      | GET       | `/api/orgs/:orgId/change-requests`                           | List organization requests.                          |
| Change requests      | POST      | `/api/orgs/:orgId/change-requests/:requestId/approve`        | Approve a proposed change.                           |
| Change requests      | POST      | `/api/orgs/:orgId/change-requests/:requestId/reject`         | Reject a proposed change.                            |

## Commerce routes

For this table only, each path is a suffix under **either** `/api/orgs/:orgId` with a session **or** `/api/agent` with a bearer credential. For example, `POST /orders` means `POST /api/orgs/:orgId/orders` for owner acceptance or `POST /api/agent/orders` for agent acceptance.

| Group       | Method    | Path suffix                                      | Purpose                                            |
| ----------- | --------- | ------------------------------------------------ | -------------------------------------------------- |
| Catalog     | GET, POST | `/products`                                      | List own products or create one.                   |
| Catalog     | GET, PUT  | `/products/:productId`                           | Read or replace own product.                       |
| Catalog     | GET, POST | `/offers`                                        | List own offers or create one for a product.       |
| Catalog     | GET, PUT  | `/offers/:offerId`                               | Read or replace own offer conditions.              |
| Catalog     | PUT       | `/offers/:offerId/status`                        | Activate, pause or archive.                        |
| Search      | POST      | `/matches`                                       | Search with `{ criteria, options }`.               |
| Requests    | GET, POST | `/requests`                                      | List or create private requests.                   |
| Requests    | GET       | `/requests/:requestId`                           | Read accessible request.                           |
| Requests    | POST      | `/requests/:requestId/matches`                   | Search using saved criteria.                       |
| Requests    | POST      | `/requests/:requestId/cancel`                    | Cancel open request.                               |
| Negotiation | POST      | `/negotiations`                                  | Request quote for request and offer.               |
| Negotiation | GET       | `/negotiations/:negotiationId`                   | Read version history.                              |
| Negotiation | GET       | `/requests/:requestId/quotes`                    | Read request's negotiations.                       |
| Negotiation | POST      | `/negotiations/:negotiationId/counter`           | Submit buyer counteroffer.                         |
| Negotiation | POST      | `/negotiations/:negotiationId/submit-for-review` | Notify owner of final proposal.                    |
| Supplier    | GET       | `/supplier/negotiations`                         | List pending negotiations; `status=all` lists all. |
| Supplier    | POST      | `/supplier/negotiations/:negotiationId/quote`    | Submit supplier terms.                             |
| Supplier    | POST      | `/supplier/negotiations/:negotiationId/respond`  | Accept, counter or reject buyer terms.             |
| Orders      | GET, POST | `/orders`                                        | List orders or accept an exact quote version.      |
| Orders      | GET       | `/orders/:orderId`                               | Read order, payment and delivery states.           |
| Orders      | POST      | `/orders/:orderId/cancel`                        | Cancel before payment when permitted.              |
| Refunds     | GET, POST | `/orders/:orderId/refunds`                       | List refunds or request one.                       |
| Refunds     | GET       | `/supplier/refunds`                              | List refunds awaiting supplier decision.           |
| Refunds     | POST      | `/supplier/refunds/:refundId/approve`            | Authorize and dispatch refund.                     |
| Refunds     | POST      | `/supplier/refunds/:refundId/reject`             | Reject with a reason.                              |

## Payment and activity routes

| Mode    | Method | Full path                                             | Purpose                                               |
| ------- | ------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Agent   | POST   | `/api/agent/purchases`                                | Execute purchase or return owner-payment requirement. |
| Session | GET    | `/api/orgs/:orgId/payments/status`                    | Seller and financial connection status.               |
| Session | POST   | `/api/orgs/:orgId/payments/seller-account/onboarding` | Start Partner Referrals.                              |
| Session | POST   | `/api/orgs/:orgId/payments/seller-account/refresh`    | Check seller readiness.                               |
| Session | POST   | `/api/orgs/:orgId/orders/:orderId/checkout`           | Start or retrieve owner checkout.                     |
| Session | GET    | `/api/orgs/:orgId/activity`                           | Read audit activity.                                  |
| Session | GET    | `/api/orgs/:orgId/notifications`                      | Read notifications.                                   |
| Session | POST   | `/api/orgs/:orgId/notifications/read`                 | Mark notifications read.                              |
| Agent   | GET    | `/api/agent/notifications`                            | Read agent notifications.                             |

## Money and retries

Send money as decimal strings, such as `"74.00"`, never floating-point JSON numbers. Unit prices accept up to four decimal places, such as `"0.2200"`. The current commerce flow uses USD. The human display of `"74.00"` is $74.00.

`Idempotency-Key` is accepted by order acceptance, order cancellation and agent purchase execution. These routes also accept body `idempotencyKey`; a nonempty body key takes precedence. Refund requests accept the key in the body only. Do not assume every POST reads this header.

For keyed acceptance/cancellation, repeat the same operation and inputs. A conflicting reuse returns `IDEMPOTENCY_KEY_REUSED`. Refund request keys instead retrieve the existing refund for that order; they do not compare changed payloads. Payment provider retries use stable server-generated request IDs. See [orders](/knowledge/orders) and [payments](/knowledge/payments).

## Error responses

Domain errors use `{ error: { code, message, hint, details } }`, with `details` omitted when absent. Messages and hints are human-readable English text; branch on `code` rather than message text. Validation responses include field issues. Framework and unexpected errors may have only `code` and `message`, including `HTTP_ERROR` or `INTERNAL` outside the domain catalog.

Every code in `ERROR_CATALOG` is listed below.

| Code                          | HTTP | Meaning                                                                            |
| ----------------------------- | ---: | ---------------------------------------------------------------------------------- |
| `UNAUTHENTICATED`             |  401 | Missing or invalid session/credential.                                             |
| `FORBIDDEN`                   |  403 | Actor cannot perform this operation.                                               |
| `NOT_FOUND`                   |  404 | Resource absent or outside permitted access.                                       |
| `VALIDATION_FAILED`           |  400 | Input fields need correction.                                                      |
| `INVALID_STATE`               |  409 | Resource state prevents the action.                                                |
| `IDEMPOTENCY_KEY_REUSED`      |  409 | Key already used with another operation or payload.                                |
| `LEVEL_INSUFFICIENT`          |  403 | Buyer level does not permit the action.                                            |
| `SELLER_SCOPE_MISSING`        |  403 | Required seller scope is missing.                                                  |
| `AUTHORIZATION_NOT_FOUND`     |  403 | No applicable active purchase authorization.                                       |
| `AUTHORIZATION_REVOKED`       |  403 | Owner revoked authorization.                                                       |
| `AUTHORIZATION_EXPIRED`       |  403 | Authorization validity ended.                                                      |
| `AUTHORIZATION_EXHAUSTED`     |  403 | Delegated budget is exhausted.                                                     |
| `BUDGET_EXCEEDED`             |  403 | Total exceeds authorization ceiling or available budget.                           |
| `MONTHLY_LIMIT_EXCEEDED`      |  403 | Organization's available monthly limit is insufficient.                            |
| `SUPPLIER_NOT_ALLOWED`        |  403 | Supplier is outside the allowed list.                                              |
| `TERMS_OUTSIDE_AUTHORIZATION` |  403 | Category, attributes, quantity, unit, currency, address or delivery violate terms. |
| `ATTRIBUTE_UNCONFIRMED`       |  422 | Required product attribute is missing.                                             |
| `QUOTE_EXPIRED`               |  409 | Quote validity ended.                                                              |
| `QUOTE_SUPERSEDED`            |  409 | Quote is superseded or a newer version exists.                                     |
| `QUOTE_NOT_ACCEPTABLE`        |  409 | Quote kind, status, negotiation state or offer status prevents acceptance.         |
| `STOCK_INSUFFICIENT`          |  409 | Available stock cannot cover quantity.                                             |
| `OUTSIDE_SUPPLIER_RULES`      |  422 | Supplier agent's terms exceed its rules.                                           |
| `PAYMENT_CONNECTION_INACTIVE` |  409 | No active financial authorization covers the supplier.                             |
| `PAYPAL_ACTION_REQUIRED`      |  409 | PayPal requires owner action.                                                      |
| `PAYMENT_FAILED`              |  402 | Payment was rejected.                                                              |
| `SELLER_NOT_CONNECTED`        |  409 | No active seller payee was recorded for payment.                                   |

Catalog membership does not mean every condition throws an HTTP error. For example, `execute_purchase` normally reports missing financial consent in its successful `owner_action_required` response with reason `PAYMENT_CONNECTION_INACTIVE`.

## Organization isolation

Private resources belonging to another organization return 404 rather than revealing their existence. Agent organization comes from the credential, not a supplied organization ID. Buyers can still search other organizations' published offers and access negotiations or orders in which their organization participates; this does not expose private seller rules or financial tokens.
