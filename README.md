# n8n-nodes-paymob

n8n community node for [Paymob Accept](https://developers.paymob.com/paymob-docs). It creates payment intentions, refunds or voids a transaction, retrieves a transaction by ID, and starts a workflow from a transaction-processed callback after verifying Paymob's HMAC signature.

[n8n](https://n8n.io/) is a workflow automation platform.

## Installation

Install the package from n8n with Community Nodes:

1. Open **Settings → Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-paymob` and confirm the installation.

n8n installs the package into the instance and restarts the node loader. After that, search for **Paymob** and **Paymob Trigger** in the nodes panel.

To work on the node from this repository:

```bash
npm install
npm run dev
```

`npm run dev` starts a local n8n instance with the node loaded.

## Credentials

Create a **Paymob API** credential. All four values come from the Paymob merchant dashboard under **Developers**.

| Field | Used for |
| --- | --- |
| API Key | `POST /api/auth/tokens`, which mints the bearer token for transaction lookup |
| Secret Key | `Authorization: Token <secret key>` on the Intention API, refund, and void |
| HMAC Secret | SHA-512 signature check on transaction processed callbacks |
| Region | Accept API host. Egypt (`https://accept.paymob.com`) is the default. |

Regions:

| Country | Base URL |
| --- | --- |
| Egypt | `https://accept.paymob.com` |
| KSA | `https://ksa.paymob.com` |
| UAE | `https://uae.paymob.com` |
| Oman | `https://oman.paymob.com` |
| Pakistan | `https://pakistan.paymob.com` |

The credential test calls `POST /api/auth/tokens` with the API key on the selected host. A successful test means the API key and region are accepted. The secret key and HMAC secret are checked when you run an operation or receive a callback.

Use test keys with test integration IDs, and live keys with live integration IDs. Paymob rejects a mix of the two.

## Operations

The **Paymob** node has four operations. Amounts are minor units (piastres, cents, or halalas): `15000` is 150.00 in a two-decimal currency.

### Create payment intention

`POST {region}/v1/intention/` with `Authorization: Token <secret key>`.

The body follows the [Intention API](https://developers.paymob.com/paymob-docs/intention-apis/create-intention): `amount`, `currency`, `payment_methods`, `items`, and `billing_data`, plus optional `special_reference`, `expiration`, `notification_url`, `redirection_url`, and `extras`.

- Payment methods are a comma-separated list. `158, card` is sent as `[158, "card"]`.
- Item amounts must add up to the intention amount. The node checks that before calling Paymob.
- Required billing fields are first name, last name, email, and phone number.
- If you set **Public Key** under Additional Fields, the output includes `checkout_url` for Unified Checkout: `{region}/unifiedcheckout/?publicKey=...&clientSecret=...`. The public key is not sent to Paymob.

### Refund

`POST {region}/api/acceptance/void_refund/refund`

```json
{ "transaction_id": 123456, "amount_cents": 1000 }
```

`amount_cents` is the amount to return and cannot exceed the remaining captured amount. Refunds are available for every Paymob method except kiosk.

### Void

`POST {region}/api/acceptance/void_refund/void`

```json
{ "transaction_id": 123456 }
```

Void cancels a card payment before settlement, usually on the same business day.

### Get transaction

Transaction inquiry uses the API key, as described in [By Transaction ID](https://developers.paymob.com/paymob-docs/developers/transaction-inquiry-apis/by-transaction-id):

1. `POST {region}/api/auth/tokens` with `{ "api_key": "<API key>" }`.
2. `GET {region}/api/acceptance/transactions/{transaction_id}` with `Authorization: Bearer <token>`.

## HMAC verification

Paymob adds an `hmac` query parameter to transaction callbacks. The **Paymob Trigger** rebuilds that signature and rejects the callback when it does not match. A rejected callback returns HTTP 401 and does not start the workflow.

The calculation follows [Paymob's transaction callback HMAC](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback):

1. Read the transaction from `obj` on a processed (POST) callback.
2. Concatenate these fields in this order, with no separator. Keep Paymob's spelling of `error_occured`. Nested fields are `order.id`, `source_data.pan`, `source_data.sub_type`, and `source_data.type`.

| # | Field |
| --- | --- |
| 1 | `amount_cents` |
| 2 | `created_at` |
| 3 | `currency` |
| 4 | `error_occured` |
| 5 | `has_parent_transaction` |
| 6 | `id` |
| 7 | `integration_id` |
| 8 | `is_3d_secure` |
| 9 | `is_auth` |
| 10 | `is_capture` |
| 11 | `is_refunded` |
| 12 | `is_standalone_payment` |
| 13 | `is_voided` |
| 14 | `order.id` |
| 15 | `owner` |
| 16 | `pending` |
| 17 | `source_data.pan` |
| 18 | `source_data.sub_type` |
| 19 | `source_data.type` |
| 20 | `success` |

3. Turn booleans into the literals `true` and `false`, and numbers into their plain decimal form. Missing values become an empty string.
4. Compute HMAC-SHA512 with the HMAC secret and encode it as lowercase hex.
5. Compare that digest with the `hmac` query parameter using a timing-safe comparison.

Paymob's published sample concatenation is:

```text
1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue
```

The trigger's **Events** setting can limit which verified callbacks start the workflow:

- **All Transactions** runs for every valid signature.
- **Successful Only** runs when `success` is true.
- **Failed Only** runs when `success` is false.

A valid callback that the filter skips returns HTTP 200 and does not start the workflow, so Paymob does not retry it. A missing or tampered signature is rejected even when the filter would otherwise have matched.

Paymob does not expose a webhook-registration API for this callback. Copy the trigger's production URL into the intention **Notification URL**, or into the dashboard transaction callback. Notification URLs on an intention are supported for card integration IDs.

## Examples

Import these workflows from **Workflows → Import from File**:

| Workflow | What it does |
| --- | --- |
| [examples/create-payment-intention.json](examples/create-payment-intention.json) | Creates an Intention API payment for a single item |
| [examples/get-and-refund-transaction.json](examples/get-and-refund-transaction.json) | Loads a transaction, then refunds its full amount. The refund node can be switched to Void. |
| [examples/transaction-processed-webhook.json](examples/transaction-processed-webhook.json) | Receives a verified successful callback and keeps the transaction summary |

Select your Paymob credential on each Paymob node after import.

## Compatibility

Built with the current n8n community node tooling (`@n8n/node-cli`) for n8n instances that support community nodes. Node.js 22 is used in CI.

## Development

```bash
npm install
npm run lint
npm run build
npm test
```

Tests mock Paymob HTTP and cover HMAC verification (valid, tampered, and missing signatures) plus request building for each operation.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/installation/)
- [Paymob documentation](https://developers.paymob.com/paymob-docs)
- [Create intention](https://developers.paymob.com/paymob-docs/intention-apis/create-intention)
- [Transaction HMAC](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback)
- [Transaction inquiry by ID](https://developers.paymob.com/paymob-docs/developers/transaction-inquiry-apis/by-transaction-id)

## License

[MIT](LICENSE.md)
