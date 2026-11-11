# Telegram shopping bot — Step 4 design

_Status: proposal for approval. This document is design-only; implementation remains pending._

## 1. Scope and decisions

Step 4 adds tenant payment-method configuration, customer payment instructions, Telegram proof intake, manual review, and customer notifications for the reservation-managed order flow from Step 3. COD remains Step 5.

The flow is `order created -> customer chooses method -> customer submits proof -> reviewer approves or rejects`. The order exists before method selection. The selected method, exact order-total snapshot, and proof history are durable order data; Redis contains only disposable Telegram navigation state.

Decisions:

- Built-in methods are KBZPay and AYA Pay. A tenant may define up to two additional methods.
- Every method has an enabled flag and display order. Methods store a name, account name, account number, and QR media reference as applicable.
- Configuration is versioned and requires permission to edit. Account numbers and signed media URLs are never logged.
- If no method is enabled, Telegram ordering is unavailable. Existing orders remain readable and reviewable.
- The customer may change the selected method until proof is submitted. A change after rejection is allowed before replacement proof; a separate post-submission change action is not exposed in v1.
- Proof is accepted only while exactly one active unpaid order is `pending_payment` or `rejected`.
- Proof accepts photo or document: JPG, PNG, WebP, or PDF; maximum 10 MB. MIME is validated from file content, not only Telegram's declared type.
- An order may have many proof rows. A duplicate Telegram `file_unique_id` within a tenant raises a reviewer warning and never auto-rejects the proof.
- Approval and rejection are idempotent, state-checked operations from workspace order detail and the inbox. Approval converts the reservation and decrements stock in one transaction, following Stage 1 stock-accounting logic.
- Rejection requires a reason, keeps the reservation, and starts a fresh 12-hour payment window. Customers cannot cancel after `payment_submitted` in v1.

## 2. Payment-method configuration

### 2.1 Data model

Use a versioned tenant configuration rather than mutable payment fields directly on an order.

`tenant_payment_method_configs`

| Field | Meaning |
|---|---|
| `id`, `tenant_id` | Tenant-scoped identity and foreign key. |
| `version` | Monotonic version per tenant; unique with `tenant_id`. |
| `status` | `draft` or `published`; only one published version is active. |
| `created_by`, `created_at` | Configuration audit. |
| `published_by`, `published_at` | Publication audit. |
| `change_reason` | Optional reason for the version change. |

`tenant_payment_methods`

| Field | Meaning |
|---|---|
| `id`, `config_id` | Method row within a version. |
| `kind` | `kbzpay`, `aya_pay`, or `other`. |
| `name` | Display name; required for `other`. |
| `enabled` | Whether the method is offered to customers. |
| `display_order` | Stable ascending display order. |
| `account_name` | Payee/account holder name. |
| `account_number` | Sensitive destination value; encrypt at rest if the existing secret facility supports it. |
| `qr_media_id` | Tenant-owned media-library reference, never a signed URL. |
| `metadata` | Extensible non-secret display fields, if approved later. |

Constraints: at most one row for each built-in kind per version, at most two `other` rows per version, and at most two enabled `other` rows. A published configuration with zero enabled methods is valid for history but makes ordering unavailable. The API rejects a third tenant-defined method rather than silently dropping it.

Account numbers must be redacted in logs, audit payloads, errors, metrics, traces, SQL logging, and support exports. QR media remains tenant-owned; the customer-facing API resolves it to a short-lived signed URL only when sending or displaying it.

### 2.2 Editing and publication API

Require `tenant.payment_methods.edit` to create or publish configuration. By default only owner/admin have it; supervisors require an explicit tenant setting and agents never receive it. Reading configuration for a customer payment screen is separate from editing and remains tenant/channel scoped.

Suggested contracts:

```text
GET  /api/v1/tenants/:tenantId/payment-methods
POST /api/v1/tenants/:tenantId/payment-methods/drafts
POST /api/v1/tenants/:tenantId/payment-methods/:version/publish
```

The write request contains the complete method set and `expectedVersion`. A stale version returns `409 config_version_conflict` and never overwrites a newer draft. The response contains safe display fields; an authorized workspace form may reveal the account number, but logs and generic API errors must mask it. Publishing writes an audit event with actor, version, and changed field names, never raw account values.

### 2.3 Order snapshot

When the customer selects a method, store an immutable snapshot on the order (or an order-payment-selection table): config version, method ID/kind/name, account name, account number snapshot, QR media ID, selected-at, and selector identity. Resolve QR through the media library; do not expose a permanent URL. Store the exact total snapshot already held by the order: amount, currency, and decimal representation. Never recompute the displayed payment amount from current catalog or method configuration.

## 3. Customer payment screen

The customer sees methods only after order creation and only when at least one is enabled. Show:

- order number and exact order total snapshot, including currency;
- selected method, account name, and account number;
- QR from a tenant-owned media-library signed URL;
- payment deadline (`expires_at`) for `pending_payment` or `rejected`; and
- controls to choose another enabled method, submit proof, view order, or chat with an agent.

Cache the Telegram QR `file_id` by `channel_id + media_id`, following the existing product-media pattern. On a bot-token/channel change, use the existing file-ID invalidation behavior. Signed URLs are redacted from logs and never persisted as durable customer data.

Method selection is idempotent with a request key scoped to tenant, order, customer, and payment-screen version. A repeat returns the same selection. A different method may replace it while the order is `pending_payment` or `rejected`, before a new proof is submitted. If the method disappears after selection, retain the order snapshot and show it; a reviewer can still inspect it.

If no method is enabled when checkout would otherwise begin, the order contract returns `payment_unavailable` and creates no order. If configuration becomes empty after an order exists, do not invalidate that order; show its stored snapshot and route the customer to an agent if needed.

## 4. Proof intake and routing

### 4.1 Eligibility and modes

Proof mode is derived from the active unpaid order, not from a client flag. When active:

- a valid photo/document is treated as proof for that order;
- text is a normal inbox message and proof mode remains active;
- an extra photo/document after the first accepted submission is a normal inbox message because the order is now `payment_submitted`;
- `/menu`, Cancel order, and Chat with agent use existing escape rules; and
- a photo/document with no eligible order is a normal inbox message, never an orphan proof.

The customer cannot submit proof after `expires_at` or after the order leaves `pending_payment`/`rejected`. State and deadline are rechecked in the same transaction as persistence, so a proof racing expiry either commits first or receives a state conflict.

### 4.2 Telegram download and validation

For a photo, choose the largest Telegram photo size and retain its `file_unique_id`; for a document, use its file ID and unique ID. Call Telegram `getFile`, download through the integration service, and stream bytes into tenant file storage. Never expose the Telegram download URL to the browser or write it to logs.

Validation sequence:

1. Reject declared size over 10 MB before download where possible.
2. Download with a bounded stream and abort if actual bytes exceed 10 MB.
3. Detect MIME from file content/magic bytes using a trusted detector.
4. Accept only `image/jpeg`, `image/png`, `image/webp`, and `application/pdf`.
5. Reject malformed content; retain the original if any normalization pipeline changes a derivative.
6. Store a tenant-owned file reference and hash, then create the proof row and transition transactionally.

Signed storage URLs are generated only for authorized workspace/order reads and are redacted from logs, traces, exception text, and audit metadata. Every file read verifies tenant ownership.

| Input | Result |
|---|---|
| Text while awaiting proof | Normal inbox message; proof mode remains active; no proof row. |
| First valid photo/document with active unpaid order | Download, validate, persist one proof, transition to `payment_submitted`, clear `expires_at`, and notify customer/reviewer. |
| Extra photo/document after accepted submission | Normal inbox message; do not attach automatically. |
| Photo/document with no eligible order | Normal inbox message. |
| Wrong extension, invalid content, unsupported MIME, oversized file, failed download, or storage failure | No proof/transition; localized failure message; eligibility remains if order is still active. |
| Duplicate webhook/update retry | Return original proof/transition result without a second row or notification. |

## 5. Proof and review data model

### 5.1 `order_payment_proofs`

Minimum fields: `id`, `tenant_id`, `order_id`, `status`, `file_id`, `file_sha256`, `file_unique_id`, `media_type`, `detected_mime`, `size_bytes`, `storage_key`, `telegram_channel_id`, `telegram_message_id`, `telegram_update_id`, `submitted_at`, `reviewed_at`, `reviewer_id`, `rejection_reason`, `duplicate_warning`, and timestamps.

There may be many rows per order. `file_unique_id` is not globally unique and is not a sole identity key. Add a tenant-scoped lookup index on `(tenant_id, file_unique_id)` and set `duplicate_warning = true` when a prior proof in that tenant has the same value. The warning is advisory; reviewers decide whether the screenshot was reused.

Idempotency uses tenant, Telegram update identity, order, and file identity. A retry returns the existing proof and transition outcome. Do not deduplicate by content hash alone: identical-looking screenshots may be legitimate evidence.

### 5.2 Order payment fields

Add or confirm selected method/config version, selected-method snapshot, exact payment total snapshot, `payment_submitted_at`, and review event linkage.

- `pending_payment -> payment_submitted`: clear `expires_at`.
- `payment_submitted -> rejected`: set `expires_at = now + 12 hours` and keep the reservation.
- `payment_submitted -> confirmed`: no active payment deadline.
- `rejected -> payment_submitted`: clear `expires_at` again.

The selected method and amount snapshot become immutable historical facts once proof is submitted. A reviewer may flag a wrong amount, but v1 does not auto-reject based on OCR or amount comparison.

## 6. Review API and workspace behavior

### 6.1 Permissions and surfaces

Show payment review on workspace order detail and the inbox order/proof panel. Require `orders.payment.review`; by default owner/admin/supervisor have it, while agents have it only when the tenant setting grants it. Reads include proofs, selected-method snapshot, exact total, duplicate warning, and review history.

Suggested contracts:

```text
GET  /api/v1/orders/:orderId/payment-proofs
POST /api/v1/orders/:orderId/payment-proofs/:proofId/approve
POST /api/v1/orders/:orderId/payment-proofs/:proofId/reject
```

Approve accepts an idempotency key and expected order/proof version. Reject additionally requires a non-empty reason. Responses return canonical order status, proof status, reviewer, review timestamp, and resulting deadline. A repeated request with the same key returns the original outcome; a changed-state request returns `409 payment_review_state_conflict` with no side effect.

### 6.2 Approval transaction

Use the documented product-first, order-second lock order:

1. Lock product, then order/proof rows.
2. Verify order is `payment_submitted`, proof is `pending_review`, and actor has permission.
3. Recheck reservation and stock/accounting constraints.
4. Mark the selected proof approved; keep other evidence visible and mark it superseded if that policy is accepted.
5. Convert the active reservation and decrement `Product.stockQuantity` by reserved quantity in the same transaction.
6. Insert the stock movement audit row with tenant, product, order, delta, reason, actor, and transition event ID.
7. Transition the order to `confirmed`, write history/audit, and persist one `order.payment_approved` domain event.
8. Commit, then emit realtime and Telegram notifications.

If stock became unavailable because legacy/manual operations changed it, fail atomically with `stock_conflict`; proof remains pending for an agent decision and the order is not confirmed. Do not silently create negative stock.

### 6.3 Rejection transaction

Reject locks order/proof, verifies `payment_submitted` plus `pending_review`, requires a reason, marks the proof rejected, transitions to `rejected`, keeps the reservation, sets a fresh 12-hour `expires_at`, writes reviewer/timestamp/reason/audit data, and emits one event after commit. A replacement proof can then be submitted. A competing approve/reject receives a state conflict or its original idempotent result.

Wrong-amount screenshots, reused screenshots, unclear evidence, and account mismatch are reviewer decisions. The system displays warnings and immutable evidence; it does not auto-reject them.

## 7. Awaiting-review alert and inbox activity

One tenant-scoped `order.payment_submitted` event, created in the same transaction as proof submission and the order transition, is the durable source for the alert. Its idempotency key is the order transition/event ID, so retries cannot create duplicate alerts.

Derive the workspace queue count from `payment_submitted` orders or the deduplicated event projection, not from countable UI notifications. Emit realtime after commit and upsert by event ID. Clear alert/attention only on approve, reject, or cancel. Failed delivery is retryable without another domain event or queue count.

Map the event to inbox activity as `telegram.payment_proof_submitted`, with the generic `order.payment_submitted` event as its one source. Set `needsAttention` with `attentionReason = payment_review`; approval/rejection/cancel projections clear it. Internal activity rows never enter the Telegram outbound queue.

## 8. Customer notifications and localization

Send after commit through the existing bot path and honor `Customer.botBlockedAt`:

| Event | English intent | Myanmar intent |
|---|---|---|
| Submitted | Proof received; order is awaiting review. | အထောက်အထားရရှိပြီး စစ်ဆေးနေသည်။ |
| Approved | Payment approved; order is confirmed and will be processed. | ငွေပေးချေမှု အတည်ပြုပြီး အော်ဒါကို ဆက်လက်လုပ်ဆောင်မည်။ |
| Rejected | Proof rejected with reason and a prompt to upload new proof before the deadline. | အထောက်အထား ပယ်ချခံရသည့်အကြောင်းရင်းနှင့် သတ်မှတ်ချိန်အတွင်း အသစ်ပြန်တင်ရန် တောင်းဆိုချက်။ |
| Expired | Payment window expired; reservation released and a new order can be started. | ငွေပေးချေရန်အချိန်ကုန်ဆုံးပြီး ပစ္စည်းကြိုတင်ထားမှုကို ဖြုတ်ပြီးဖြစ်သည်။ |

These are intent-level translations pending native-speaker review. Final copy includes order number and exact total/deadline where relevant. If the bot is blocked, persist state/audit and skip sending without retrying the known 403.

## 9. Migrations and compatibility

1. Add versioned tenant payment configuration/method tables, constraints, permission and tenant-setting defaults, and audit support.
2. Add order payment-selection/snapshot and exact-total fields.
3. Add proof file metadata, storage references, duplicate-warning index, source/idempotency fields, and review timestamps.
4. Add payment domain-event and alert-projection storage with unique event keys.
5. Add API/workspace read contracts; backfill no historical payment selections or proofs.
6. Enable writes only after duplicate-event and active-order audits, then run real-PostgreSQL concurrency tests.

All migrations must work with `DB_SYNCHRONIZE=false`, be tenant-scoped, and avoid sensitive values in logs. Existing orders without a method snapshot remain readable and may require agent-assisted resolution.

## 10. Three-stage implementation order and review stops

### Stage 1 — configuration and customer payment screen

Implement versioned payment settings, permission checks, workspace form, media-library QR references, order selection/snapshot, signed URL/file-ID delivery, and the no-enabled-method gate. Test method limits, stale versions, tenant isolation, redaction, exact-total display, and QR ownership.

**Review stop:** approve schema, permission mapping, account-number handling, QR ownership, method replacement rules, and English/Myanmar copy before enabling a tenant.

### Stage 2 — proof intake and durable submission

Implement proof-mode routing, Telegram `getFile`, bounded download, content-based MIME validation, tenant storage, idempotent many-proof persistence, duplicate warning, `payment_submitted` transition, expiry clearing, one domain event, and submitted/expired messages. Test text, extra photos, no-awaiting-order photos, malformed/oversized files, retries, blocked bots, URL redaction, and tenant isolation.

**Review stop:** inspect stored files and logs in a throwaway tenant, verify no account numbers/signed URLs leak, approve retention/scanning policy, and verify exactly one awaiting-review item per submitted order.

### Stage 3 — review, stock conversion, and pilot

Implement workspace/inbox review APIs/UI, permission enforcement, idempotent approve/reject, product-first locking, stock conversion/decrement plus stock movement audit, rejection reset, notifications, realtime queue projection, and race tests. Run the real-PostgreSQL suite and a tenant-isolated pilot only after review.

**Review stop:** approve stock-conflict handling, duplicate/reused-proof reviewer UX, rejection copy, alert clearing, audit records, and rollback/runbook evidence before production activation.

## 11. Real-PostgreSQL test plan

Use the repository's PostgreSQL 16 integration pattern with `DB_SYNCHRONIZE=false`, a throwaway database name, all migrations applied, and production-equivalent indexes. Do not substitute SQLite or mocks for transaction-race coverage.

Required cases:

- Two concurrent approvals for one `payment_submitted` order: one commits; the other returns the original idempotent result or a state conflict; stock decrements once and one stock movement exists.
- Concurrent approve/reject: exactly one transition commits, one customer event is emitted, and alert/attention clears once.
- Concurrent approvals for two orders competing for the last product unit: one confirms/decrements; the other returns `stock_conflict` with proof still reviewable.
- Proof submission racing expiry: exactly one wins the row/transition lock; no proof attaches to expired order and no reservation releases twice.
- Rejection followed by concurrent replacement proofs: one active order remains, proofs may be many rows, and event/count contributions remain once per transition.
- Duplicate Telegram update/retry: one proof row, one `payment_submitted` transition, one domain event, one queue contribution.
- Duplicate `file_unique_id` across two orders in one tenant: both persist, later row is warning-flagged, neither auto-rejects; another tenant is unaffected.
- Oversized or content/MIME-invalid files: no proof/transition, partial object cleanup, order remains eligible while valid.
- Permission and tenant isolation for settings, proof reads/files, review actions, alerts, and websocket payloads.
- Restart after commit before notification: durable state/event survives and notification retry does not duplicate event or queue item.

Assert after every race: order status, proof status, `expires_at`, active reservation count, `Product.stockQuantity`, stock movements, audit events, inbox attention, alert count, and notification outbox rows.

## 12. Failure cases and operational rules

- **Wrong amount:** retain exact total and evidence; reviewer decides approve/reject.
- **Screenshot reused across orders:** flag duplicate `file_unique_id` and show related tenant orders; never auto-reject.
- **Proof after expiry:** reject intake with expired-order response; expiry worker owns release/notification.
- **Concurrent approve/reject:** lock and state-check; one transition and no duplicate stock/notifications.
- **Stock conflict:** leave proof pending/reviewable, do not decrement below zero, and require authorized inventory resolution.
- **Oversized file:** reject before/during bounded download, clean partial object, retain eligibility, and provide localized retry guidance.
- **Telegram/API/storage outage:** no partial proof; return retryable error and preserve active order/deadline.

## 13. Resolved

- Account numbers are masked in logs and audit payloads. Unmasked reveal is owner/admin/edit-permission only; encryption is optional if the existing credential facility makes it trivial.
- Evidence retention is 12 months after order completion with a deletion job. No malware scan in v1.
- The latest proof is prominent; older proofs are collapsed.
- Negative stock and approval overrides are disallowed. Stock is corrected through the audited stock-adjustment flow before approval.
- Method changes are allowed after rejection before replacement proof.
- Queue count is orders in `payment_submitted`.
- Signed URLs are 10–15 minutes; PDFs are download-only in the workspace. QR `file_id` invalidation follows the existing media pattern.
- Save and publish is one confirmed action while draft/version tables remain. Publishing audits the actor/version/method and notifies the owner through both the existing in-app notification and SMTP email paths.
- `tenant.payment_methods.edit` defaults to owner/admin; supervisors require a tenant setting and agents are never included by default. Forms show last changed by/at. Past order snapshots are immutable.
- Proofs with no selected method auto-select only when exactly one method is enabled; otherwise use nullable/unspecified and warn reviewers. Per-customer proof-attempt and invalid-file retry limits are designed now and implemented in Stage 2.
- Review aging reminders are Stage 3, out-of-band, sent to reviewers and the owner after tenant-set hours (default 2, then 24).
- Myanmar copy requires native-speaker review; English-first is acceptable for the pilot.
