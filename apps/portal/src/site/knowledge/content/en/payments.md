Use PayPal sandbox to complete an accepted order, confirm its financial result and handle supplier-approved refunds.

## Connect the seller

The supplier owner or administrator starts PayPal Partner Referrals from a console session. The server records the onboarding reference, then queries PayPal for the merchant integration. Returning to the portal does not itself prove the account is ready.

The seller account becomes `active` (Active) only when PayPal reports both `paymentsReceivable=true` and `primaryEmailConfirmed=true`. Other seller states are `not_connected` (Not connected), `pending` (Pending) and `needs_attention` (Needs attention). The order records the active seller's merchant ID at acceptance. Payment requires that recorded payee.

> **Note:** This integration uses sandbox money. An active seller connection describes eligibility to receive payments; it does not guarantee a buyer balance or a successful charge.

## Owner checkout

After accepting a quote, the buyer owner or administrator starts checkout from the portal. The server creates or retrieves the payment attempt and returns a PayPal approval link. The buyer approves on PayPal; the server handles the return and captures only while the order is still `pending_payment` (Pending payment).

If the order has been cancelled or expired, the checkout return does not capture. The scheduler can also capture an approved manual checkout when the buyer did not return, provided the order remains pending payment. The redirect alone never marks an order paid.

For a proposal awaiting human review, use “Review offer” and “Approve and pay.” Show “Continue in PayPal” only when there is a valid action link.

## Delegated payment and the current limitation

`execute_purchase` requires `full_autonomy` (Full autonomy, within your authorized limits). It accepts a quote or retrieves an existing order, then reuses an existing active payment attempt if present. Before dispatching a new delegated payment, it checks the order is pending payment, uses delegated mode, has a linked authorization assigned to the agent, and still satisfies that authorization.

Automatic payment also needs an active financial connection with a stored payment token covering the order's seller: either `platform` scope or `merchant` scope matching the payee merchant ID. Commercial purchase authorization and financial consent are separate. See [purchase authorizations](/knowledge/purchase-authorizations) and [PayPal consent](/knowledge/paypal-consent).

The repository's PayPal feasibility report, `docs/paypal-spike.md`, records that PayPal does not offer multi-seller vaulting for this integration/account. Checkout-free payment is implemented and tested with a simulated gateway; the sandbox spike demonstrated it when the payee was the agreement holder. It does not establish reusable consent across participating sellers.

Without financial authorization covering the supplier, the accepted order stays pending owner payment. The owner is notified. The purchase response has `payment.status=owner_action_required` (Owner payment required), `attemptId=null` and `mode=null`; no charge is dispatched. This is a response status, not one of the stored payment-attempt statuses.

## Confirm the financial result

The server compares a completed capture's amount, currency and payee merchant ID with the recorded attempt. A mismatch is recorded as an incident. The implementation still records the capture as completed and the order as paid, preserving the incident for explicit resolution. A capture received after cancellation or expiry also records an incident.

An ordinary completed capture consumes active stock and budget reservations. It does not confirm physical delivery. Inspect `get_order` for both payment references and `incident`.

| Payment-attempt status | Human label         | What to do                                                                            |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `created`              | Created             | Attempt recorded. Payment summaries expose this as `processing`.                      |
| `processing`           | Processing payment  | “We’re confirming the payment.” Wait for confirmation.                                |
| `requires_action`      | Requires action     | Follow the available PayPal action or complete owner checkout.                        |
| `completed`            | Payment completed   | Show the capture reference. Check for an incident.                                    |
| `failed`               | Payment failed      | Show the confirmed reason. The order remains pending payment for an allowed recovery. |
| `unknown`              | Payment unconfirmed | “We’re confirming the payment. Don’t submit it again.”                                |

## Unknown outcomes and reconciliation

The server records an attempt before calling PayPal and uses its stable request ID for the provider operation. If a PayPal order ID exists, reconciliation fetches that order. For a delegated attempt without a returned order ID, it repeats creation with the same request ID. Capture uses the attempt's stable key with a `:capture` suffix.

Do not create a fresh payment to resolve a timeout. Poll `get_order` while the scheduler or [verified webhooks](/knowledge/webhooks) reconcile. Pending or unknown attempts retain reservations. A definitive failed attempt does not immediately release them: the order may still be paid manually, cancelled, or expired under the [order rules](/knowledge/orders).

Revocation blocks new delegated dispatches; an operation already sent to PayPal must still be checked. “New purchases will be blocked. Payments already processing will still be checked.”

## Refunds

The buyer requests a refund on a paid order with a completed PayPal capture. A buyer agent needs Full autonomy, within its authorized limits, and must be the agent that accepted the order. Supply a reason and optional decimal-string amount. Without an amount, the request uses the remaining refundable amount after existing nonfailed refund commitments.

| Refund status | Human label      | Meaning                                                            |
| ------------- | ---------------- | ------------------------------------------------------------------ |
| `requested`   | Refund requested | Waiting for the supplier's decision; money has not been recovered. |
| `authorized`  | Authorized       | Supplier approved dispatch.                                        |
| `processing`  | Processing       | PayPal result is pending or uncertain.                             |
| `completed`   | Refunded         | Confirmed refund with its amount and PayPal reference.             |
| `failed`      | Failed           | Provider failure or supplier rejection; inspect the reason.        |

Supplier agents need `approve_refunds` to approve or reject; owners and administrators can decide through a session. Approval dispatches the refund on the seller's behalf. It can complete immediately without remaining in `processing`; otherwise the scheduler reconciles it with the same request ID. Rejection is stored as `failed` with a reason.

> **Important:** Refunds are recorded separately and never restore delegated budget. Increasing spending authority requires an owner decision, even after money is refunded.
