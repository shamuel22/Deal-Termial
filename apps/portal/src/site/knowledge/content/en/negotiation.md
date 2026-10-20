Use requests, quotes and counteroffers to reach specific supplier terms before an owner or authorized agent creates an order.

## Save a request

`create_request` saves a private buying need without contacting suppliers. All three buyer levels can use it. Supply either `authorizationId` or structured `criteria`: category, required attributes, quantity, delivery address, delivery deadline and optional maximum total. Preferences can include preferred materials and notes.

With `authorizationId`, the server takes mandatory criteria from that agent's purchase authorization and uses its available budget as `maxTotal`. Quantity defaults to the authorization's maximum; a supplied criteria quantity can replace that default. Acceptance still checks the authorized quantity range.

Requests use `open` (Open), `closed` (Closed), `cancelled` (Cancelled) and `expired` (Expired). A buyer agent reads its own requests; an owner or administrator reads requests within the organization. `cancel_request` requires an open request.

## Request a quote

`request_quote` requires `requestId` and `offerId`, with an optional message. Buyer agents need `negotiate` (Negotiate only) or `full_autonomy` (Full autonomy, within your authorized limits).

The request must be open and belong to the buyer; the offer must be active, belong to another organization and match the request's category. There is one negotiation per request and offer. Repeating the call returns that negotiation while those entry conditions still hold, rather than creating another conversation.

The supplier's rules can respond while its agent is disconnected. If they cannot resolve the request, the negotiation waits in `awaiting_supplier` (Awaiting supplier). A supplier quote moves it to `awaiting_buyer` (Awaiting buyer).

## Versions and statuses

Each proposal is a new numbered version. `quote` identifies supplier terms; `counter` identifies a buyer counteroffer. A new version supersedes earlier proposed versions. Quotes preserve product attributes, offer version, quantity, unit, costs, currency, address, delivery date and expiry.

| Quote status | Human label | Meaning                                      |
| ------------ | ----------- | -------------------------------------------- |
| `proposed`   | Proposed    | A proposal awaiting the next action.         |
| `superseded` | Superseded  | Replaced by a newer version.                 |
| `accepted`   | Accepted    | Supplier quote accepted into an order.       |
| `rejected`   | Rejected    | Buyer counteroffer rejected by the supplier. |
| `expired`    | Expired     | Validity has ended.                          |

A rules reply that accepts the buyer's terms still creates a supplier quote for buyer acceptance. It does not create an order. Supplier quote validity uses `quoteValidityHours`, shortened by offer expiry when earlier.

## How supplier rules answer

The initial quote uses the applicable quantity tier's list price and charged shipping. Its delivery date uses the requested date when it fits between minimum and standard lead time; otherwise it uses the relevant boundary. Lead times use calendar days from the current UTC date.

At or above `minQtyForDiscount`, the minimum allowed unit price is:

```ts
max(floorUnitPrice, tierPrice * (1 - maxDiscount));
```

The discount calculation rounds upward to four decimal places before comparison with the floor. Below the threshold, the minimum is the tier price, without a negotiated discount.

`counter_quote` can change unit price, quantity, shipping waiver or delivery date. The engine evaluates quantity limits, stock, shipping region and the existence of a price tier, then resolves the proposal:

| Outcome    | Meaning                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `accept`   | Terms fit the rules without a restrictive adjustment. The engine caps a proposed price above list at list price.                   |
| `counter`  | Price is raised to the allowed minimum, an unauthorized shipping waiver is removed, or delivery is moved to the minimum lead time. |
| `escalate` | Automatic response is disabled or feasibility checks fail. The supplier must respond.                                              |

### Demo seed example

These numbers come from the demo seed and the cases in `packages/core/src/negotiation/rules.test.ts`. They are separate from the illustrative $74.00 fixture in DESIGN.md §16.

| Step               | Calculation                                                              | Total including shipping and tax |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------: |
| Initial quote      | 300 × $0.24, plus $5.00 shipping and 8.25% tax                           |                           $83.35 |
| Buyer counteroffer | Requests $0.20 per unit                                                  |                    Proposal only |
| Supplier reply     | Maximum discount 10%; $0.24 × 0.90 = $0.2160, bounded by the $0.22 floor |                           $76.86 |

The final breakdown is a $72.00 list subtotal, $6.00 discount, $5.00 shipping and $5.86 tax. Merchandise after discount is $66.00. Shipping cannot be waived under these demo rules. The total fits the demo authorization's $80.00 budget.

## Supplier authority and owner exceptions

Supplier agents need `submit_quotes` to issue quotes or counter/reject a buyer counteroffer. Accepting a buyer counteroffer requires `accept_terms`. Agents remain bound by price, lead-time and shipping rules; invalid concessions return `OUTSIDE_SUPPLIER_RULES`.

A supplier owner or administrator can approve exceptions through a session. The service allows exceptions to minimum/maximum order quantity and negotiation limits, but still checks stock, shipping region and an applicable price tier. Supplier rule traces remain private.

## Review before purchase

Buyer responses can include `authorizationCheck` with an authorization ID and violations for the latest supplier proposal. An empty violation list means its terms pass that policy evaluation. It does not reserve funds or stock, check remaining monthly capacity, or guarantee quote validity at acceptance. The field can be null when there is no linked authorization or latest supplier quote.

With Negotiate only, use `submit_for_review` on a current supplier quote. This sets `pending_owner_review` (Pending owner review), notifies the owner and creates no commitment. The owner can use “Review offer” and “Approve and pay.”

An agent with Full autonomy can proceed within its authorized limits to [order acceptance](/knowledge/orders). Acceptance and [payment](/knowledge/payments) perform their own checks again. Use `get_quotes` to read the version history before acting.
