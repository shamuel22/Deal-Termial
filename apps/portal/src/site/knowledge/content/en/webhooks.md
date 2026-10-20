Configure PayPal webhooks so operators can reconcile payment, refund and seller events without trusting event arrival order.

## Endpoint and verification

PayPal sends events to `POST /webhooks/paypal`, outside the `/api` prefix. This endpoint uses PayPal signature verification rather than a console cookie or agent credential.

The server enables raw request-body capture. The controller reads the original UTF-8 body, parses its JSON and sends that event, the configured webhook ID and PayPal transmission headers to PayPal's `POST /v1/notifications/verify-webhook-signature` API. It accepts only a `SUCCESS` verification result. This is remote verification using the event from the raw body, not a local HMAC check over the raw bytes.

The required headers are `paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig` and `paypal-transmission-time`. Missing verification headers fail verification. An empty body produces `VALIDATION_FAILED`; an invalid signature produces `UNAUTHENTICATED` with HTTP 401. Signature verification happens before event recording.

## Deduplication and acknowledgement

The database stores one webhook record per PayPal event ID. A verified event is inserted with its type, resource ID and payload. A duplicate reuses the existing record and is acknowledged without immediate reprocessing.

A new event is processed immediately after it is saved. If processing fails, the controller logs the failure and still returns HTTP 200 because the event is durable and the scheduler can retry it. A successful acknowledgement has this shape:

```json
{
  "received": true,
  "duplicate": false
}
```

For an already recorded event, `duplicate` is `true`. This response confirms receipt, not successful payment or completion of the event's business action.

## Event handling

| Event type                                             | Lookup and effect                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHECKOUT.ORDER.*`                                     | Find the local attempt using the resource's PayPal order ID, then reconcile it.                                                                           |
| `PAYMENT.CAPTURE.*`, except the two cases below        | Read `supplementary_data.related_ids.order_id`, find the attempt and reconcile it.                                                                        |
| `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED` | Treat `resource.id` as a candidate known PayPal refund ID and invoke refund reconciliation. If there is no matching local refund, mark the event ignored. |
| `PAYMENT.REFUND.*`                                     | Reconcile a local refund matching `resource.id`.                                                                                                          |
| `MERCHANT.*`                                           | Read `resource.merchant_id` and refresh the matching seller account from PayPal.                                                                          |
| `VAULT.PAYMENT-TOKEN.DELETED`                          | Revoke financial connections matching the token ID in `resource.id`, record revocation time and audit the change.                                         |
| Other or unmatched events                              | Mark ignored; do not invent an order, refund or connection.                                                                                               |

The refund branches reconcile existing locally tracked refunds. They do not automatically create a refund record for an unrelated refund or reversal performed outside Deal Terminal.

## Why arrival order does not decide payment state

Payment, refund and merchant events trigger lookups through the PayPal gateway. The server applies the retrieved financial or integration state instead of copying an event's claimed status directly into an order. A manual PayPal order found approved can be captured only while the local order remains pending payment. Completed payment attempts are not downgraded by an older event.

There is one explicit exception: a verified token-deletion event directly revokes matching local connections. That branch does not fetch the token from PayPal. It removes authority to dispatch future delegated payments; it does not reverse captures already sent.

> **Important:** A webhook acknowledgement is not a payment receipt. Use [order details](/knowledge/orders), PayPal capture references and any recorded incident to assess the result.

## Scheduler retries

| Stored webhook status | Human label | Scheduler treatment                              |
| --------------------- | ----------- | ------------------------------------------------ |
| `received`            | Received    | Retry once the event is at least 30 seconds old. |
| `failed`              | Failed      | Retry once the event is at least 30 seconds old. |
| `processed`           | Processed   | No further processing.                           |
| `ignored`             | Ignored     | No automatic retry.                              |

`SCHEDULER_INTERVAL_MS` controls the scheduler interval; zero disables it. The configuration default is 60000 milliseconds. A PostgreSQL advisory lock allows one scheduler instance to run the sweeps at a time. Each task catches failures so other sweeps can continue.

The scheduler also reconciles payment attempts and refunds independently of webhook delivery, and expires quotes, authorizations and unpaid orders. Unknown payment outcomes keep reservations until they can be resolved. See [payments and refunds](/knowledge/payments).

## Configure a deployment

Open the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), select the sandbox REST app, and register:

```http
POST https://your-domain.example/webhooks/paypal
```

Subscribe to the event families listed above, or all events. Copy the registered webhook ID into `PAYPAL_WEBHOOK_ID` and restart the service. Use the app's sandbox client credentials and set `PUBLIC_BASE_URL` to your HTTPS origin for browser returns. Keep those secrets on the server.

The repository deployment guide, `docs/deploy.md`, describes the single Node process, PostgreSQL, environment configuration, systemd, nginx/TLS and PayPal setup. Preserve the request body through the proxy and ensure the public webhook path reaches that process.

> **Note:** Local tests of duplicate and reordered events do not prove live delivery from PayPal. The acceptance evidence leaves live webhook delivery for validation on a deployment with a public URL.
