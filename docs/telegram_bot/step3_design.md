# Telegram shopping bot — Step 3 design

_Status: proposal for approval. This document is design-only; implementation remains pending._

## 1. Scope and current baseline

Step 3 adds an API-first, transactional order path for Telegram checkout and makes it safe to share inventory with orders created by agents. It reuses the existing `Order` and `OrderItem` model rather than introducing a Telegram-only order model. Step 3 also adds a small, read-only Telegram Orders list/detail surface. Cancellation, reorder, COD, payment proof review, and customer-facing payment screens remain Step 5/4 work as listed in `plan_task.md`.

The inspected current model and flow are:

- `Order` is tenant-scoped and currently contains `orderNumber`, a free-form `status`, a separate `paymentStatus`, payment amounts/method, currency, shipping/billing JSON, attachments, and JSON `statusHistory`.
- `OrderItem` stores product/name/SKU/variation snapshots, quantity, unit price, and total price. This is suitable for immutable customer-facing snapshots, provided the new bot contract computes them from authoritative product rows.
- `Product` contains `price`, `stockQuantity`, `trackInventory`, and catalog status. Telegram browsing displays `stockQuantity` and caps quantity at the per-order cap, but this is only a read-time display check.
- Agent-created orders enter through `AgentService.createOrderFromChat`. The DTO currently requires `unitPrice`; the service loads the product, uses `item.unitPrice ?? product.price`, calculates totals, saves the order, then saves items. It creates status `new`, payment status based on supplied amounts/method, and an order number based on `count + 1001`.
- The existing `OrderService` and `DeliveryService` permit the legacy lifecycle values and do not enforce a transition table. `updateOrderLifecycle` can set status/payment fields directly after role checks. `updateOrderDetails` can replace items and prices without a reservation operation.
- There is no reservation ledger, no order expiry implementation, no payment-proof entity for customer orders, and no stock decrement/release path in the inspected order/product code.

### Where the current flow decrements stock

It does not currently decrement `Product.stockQuantity`. Repository search found only reads of `stockQuantity` in product/catalog, Telegram browse, tenant/product/report queries, and seed data; no order path assigns or updates it. The current flow therefore has no protection against two orders consuming the same last unit. The proposed reservation ledger must be the sole stock-availability mechanism for both bot and agent orders. `stockQuantity` remains the physical/on-hand quantity maintained by catalog operations; it is not decremented at checkout confirmation.

## 2. Stock and reservation model

### 2.1 Availability

For a tracked product:

`available = max(stockQuantity - sum(active reservation quantities), 0)`

An active reservation is a ledger row for an order item whose reservation state is `active`. Reservations for `released`, `converted`, or otherwise terminal rows do not count. Products with `trackInventory = false` have unlimited availability and do not create reservation rows.

The product detail and checkout APIs may show a derived availability, but only the checkout/agent order transaction decides whether stock can be reserved. The product status `out_of_stock` is a presentation/catalog signal; the authoritative check is `stockQuantity - active reservations`.

### 2.2 Reserve at checkout confirmation

The bot keeps the selected product and quantity in Redis while collecting delivery data. At `Confirm`, the server re-reads product status, price, currency, track-inventory flag, quantity cap, and stock under a database transaction. It then:

1. resolves or creates the customer identity in the tenant/channel/Telegram-user scope;
2. checks the one-active-unpaid-order rule;
3. locks the product row (or uses an atomic conditional update/ledger insert equivalent);
4. computes authoritative line-item and order totals;
5. inserts the order and item snapshot;
6. inserts one active reservation row per tracked order item; and
7. commits the order, reservation, status history, and idempotency record together.

The reservation is created when the order enters `pending_payment`, which is the checkout confirmation point. A customer who only browses or changes quantity holds nothing.

Agent-created orders use the same reservation service and transaction. This is mandatory even when the order starts in a legacy/operational status or is created from an inbox conversation. A bot reservation and an agent reservation therefore compete on the same product row/ledger and cannot oversell one another.

### 2.3 Exactly-once reservation lifecycle

Each order item has at most one active reservation row. State transitions are guarded by the current reservation state and occur in the same transaction as the order transition:

| Order event | Reservation action | Result |
|---|---|---|
| Confirm checkout into `pending_payment` | Insert active ledger row | Quantity counts against available stock. |
| `pending_payment` -> `payment_submitted` | Keep active | Payment review must not lose the stock hold. `expires_at` is cleared. |
| `payment_submitted` -> `confirmed` | Convert active to converted/committed | The hold becomes consumed stock for the order. It is no longer an active reservation. Physical `stockQuantity` is reduced only by the approved stock-accounting operation, if the tenant chooses that accounting model; it is never reduced by both reservation and conversion. |
| `pending_payment`/`rejected` -> `cancelled` | Release active row | Available quantity increases once. |
| `pending_payment`/`rejected` -> `expired` | Release active row | Available quantity increases once. |
| `payment_submitted` -> `rejected` | Keep active and reset expiry | The customer may submit another proof; the hold remains. |
| `confirmed` or later operational statuses | No active hold | No release is possible because the reservation was converted/committed. |

The `release` operation must be an idempotent compare-and-set: `UPDATE ... WHERE state = 'active'`. A second cancellation, duplicate expiry run, retry after crash, or duplicate transition observes zero affected active rows and does not add stock a second time. A unique constraint on `(order_item_id, reservation_kind)` or an equivalent one-reservation-per-item invariant prevents duplicate holds.

`trackInventory = false` skips reservation and conversion. A product changing from untracked to tracked while an order is open is an operational migration concern; Step 3 should reject retroactive reservation creation unless a repair command explicitly reconciles open orders.

## 3. Existing status values and compatibility strategy

### 3.1 What exists today

The current `Order.status` entity/API/dashboard vocabulary is:

`new`, `confirmed`, `preparing`, `packed`, `out_for_delivery`, `delivered`, `failed_delivery`, `cod_collected`, `cancelled`, `returned`.

The current `Order.paymentStatus` vocabulary is:

`pending`, `partially_paid`, `paid`, `failed`, `refunded`, `cod_pending`, `cod_collected`.

Workspace order queries filter `order.status` and `order.payment_status` independently. Delivery queries treat `preparing`, `packed`, `out_for_delivery`, `delivered`, `cod_collected`, `failed_delivery`, `returned`, and `cancelled` as delivery-related. The platform console sales-orders page filters the legacy order statuses and payment statuses. Reports and platform-admin exports expose both fields. Inbox intent classification also reads open payment statuses and delivery order statuses.

### 3.2 Proposal: canonical lifecycle plus compatibility projection

Use the requested canonical lifecycle in `Order.status`:

`pending_payment`, `payment_submitted`, `confirmed`, `rejected`, `processing`, `delivered`, `cancelled`, `expired`.

Keep `Order.paymentStatus` as a separate accounting/payment field. It remains useful for `pending`, `partially_paid`, `paid`, `failed`, `refunded`, `cod_pending`, and `cod_collected`; it must not be overloaded to represent proof-review state.

For delivery compatibility, add a small explicit projection rather than silently inventing new meanings in every consumer:

| Canonical status | Legacy/dashboard interpretation during migration |
|---|---|
| `pending_payment` | `new` / awaiting customer payment; not a delivery order |
| `payment_submitted` | `new` plus open payment-review indicator; not delivery |
| `confirmed` | `confirmed` |
| `rejected` | no legacy direct equivalent; remains visible through canonical status and payment-review filters |
| `processing` | `preparing` for delivery lists and exports |
| `delivered` | `delivered` |
| `cancelled` | `cancelled` |
| `expired` | no legacy direct equivalent; excluded from active delivery and sales totals |

`failed_delivery`, `returned`, and `cod_collected` need an explicit decision before the canonical enum is finalized. Recommended compatibility treatment is to retain them as operational sub-statuses or legacy values during the first migration, while the eight Step 3 states govern the Telegram payment/reservation lifecycle. If they are folded into the canonical enum later, that must be a separate migration with delivery UI changes.

### 3.3 One transition table for all status changes

No controller, agent service, delivery service, proof service, expiry worker, or bot handler may assign `Order.status` directly. They call one transition service that validates actor, current state, target state, reason, and side effects. The transition service appends the existing `statusHistory` entry and a durable domain event in the same transaction.

The dashboard/query migration should use canonical status helpers or a compatibility view/query projection. Existing filters must continue returning old orders while new orders become visible under both the appropriate canonical filter and its legacy-compatible bucket. Exports must include `status` (canonical), `paymentStatus`, and optionally `legacyStatus`/`statusLabel` during the transition period so historical reports do not change meaning silently.

### 3.4 Migration plan for existing orders

1. Add the canonical status/expiry/reservation/payment-proof columns and tables without rewriting existing rows.
2. Backfill canonical status deterministically: `new` -> `pending_payment` when unpaid and customer-originated/eligible; `confirmed` -> `confirmed`; `preparing`, `packed`, `out_for_delivery` -> `processing`; `delivered` -> `delivered`; `cancelled` -> `cancelled`; `failed_delivery`/`returned`/`cod_collected` remain legacy operational values until the compatibility decision is approved.
3. Preserve original status in a `legacy_status` column or migration metadata and append a migration history event; never infer payment proof state solely from an old status.
4. Do not create reservations for historical orders automatically without an inventory reconciliation. Existing physical stock may already reflect manual operations, and creating holds could double-count it. Provide a dry-run report of open orders/items and let the owner approve any seed reservations.
5. Deploy read compatibility first, then write all new transitions through the transition table, then update workspace/platform filters and exports, then remove direct status writes.

## 4. Canonical transition table

The table below is the Step 3 state machine. “System” includes expiry workers and trusted internal service calls. An agent means an authorized tenant user; role checks remain in the controller/service boundary.

| From | To | Trigger/meaning | Who may trigger |
|---|---|---|---|
| — | `pending_payment` | Bot or agent creates an unpaid order and reservation | customer checkout service, agent |
| `pending_payment` | `payment_submitted` | A validated payment proof is attached/submitted | customer, agent on behalf of customer |
| `pending_payment` | `cancelled` | Customer/agent cancels before proof submission | customer, agent |
| `pending_payment` | `expired` | Reservation window elapses | system |
| `payment_submitted` | `confirmed` | Authorized reviewer approves proof or trusted payment confirmation | agent/manager; system only for an explicitly configured trusted provider |
| `payment_submitted` | `rejected` | Reviewer rejects proof with reason | agent/manager |
| `payment_submitted` | `cancelled` | Authorized cancellation before approval | customer, agent |
| `rejected` | `payment_submitted` | Customer submits a replacement proof | customer, agent |
| `rejected` | `cancelled` | Customer/agent abandons the order | customer, agent |
| `rejected` | `expired` | Fresh rejection window elapses | system |
| `confirmed` | `processing` | Fulfilment starts | agent/manager/system integration |
| `confirmed` | `cancelled` | Authorized post-confirm cancellation/refund path | agent/manager; customer only if policy permits |
| `processing` | `delivered` | Delivery completes | agent/delivery role/system integration |
| `processing` | `cancelled` | Fulfilment cancellation | agent/manager |
| `delivered` | — | Terminal for Step 3 | nobody |
| `cancelled` | — | Terminal | nobody |
| `expired` | — | Terminal; reorder creates a new order | nobody |

Repeated transition requests with the same idempotency key return the original result. A different request against an already changed state returns a state-conflict response and performs no side effect. Rejection must not release stock; cancellation/expiry must release only an active reservation.

## 5. Data model proposal

### 5.1 Order additions

Add the following to `orders`:

- `expires_at timestamptz nullable`: reservation deadline. Set on entry to `pending_payment`; clear on entry to `payment_submitted`; set to `now + rejectedWindow` on entry to `rejected`; remain cleared/unchanged for other states. It is not a generic row TTL.
- `checkout_session_version` or equivalent request metadata for idempotency/audit.
- `source`/`creation_source` (`telegram`, `agent`, other existing source) if not already available in metadata.
- `legacy_status` during migration, if the compatibility approach needs a durable original value.

### 5.2 Reservation ledger

Proposed `order_item_reservations` fields:

`id`, `tenant_id`, `order_id`, `order_item_id`, `product_id`, `quantity`, `state` (`active`, `converted`, `released`), `reserved_at`, `released_at`, `converted_at`, `release_reason`, `idempotency_key`, `created_at`, `updated_at`.

Required constraints/indexes:

- foreign keys and tenant columns on every reference;
- unique active reservation per order item;
- index `(tenant_id, product_id, state)` for availability and reconciliation;
- index `(state, expires_at)` through the order relation or a denormalized expiry column for the worker; and
- non-negative quantity check.

If the implementation keeps expiry only on `orders`, the worker must lock the order and its active reservations before releasing. A denormalized reservation `expires_at` may improve worker scans but must be updated in the same transaction as the order deadline.

### 5.3 `OrderPaymentProof`

Add a new entity/table linked to `Order`, supporting many proofs per order. Minimum fields: `id`, `tenant_id`, `order_id`, `status` (`pending_review`, `approved`, `rejected`), `media_link`/file reference, Telegram `file_unique_id`, MIME/size metadata, `submitted_at`, `reviewed_at`, `reviewer_id`, `rejection_reason`, source message/update identifiers, and timestamps. The proof record and the `payment_submitted` transition must be idempotent; duplicate Telegram media can be flagged for review without attaching the same proof twice.

### 5.4 Active unpaid uniqueness

Add a PostgreSQL partial unique index for one active unpaid order per tenant and customer:

`UNIQUE (tenant_id, customer_id) WHERE status IN ('pending_payment', 'rejected') AND customer_id IS NOT NULL`

This rule deliberately excludes `payment_submitted`: once proof is submitted, the customer is allowed to start a new unpaid order. The bot must catch a unique-violation race and return the existing order rather than creating a second order.

### 5.5 Tenant-scoped atomic order number

Replace the current `count + 1001` approach, which collides under concurrency and can reuse numbers after filtering assumptions, with a tenant-scoped sequence/counter row. Recommended shape: `tenant_order_counters(tenant_id primary key, next_value bigint)` updated with `UPDATE ... SET next_value = next_value + 1 RETURNING next_value` inside the order transaction. Format can remain readable, for example `MM-ORD-1001`, but uniqueness must be enforced on `(tenant_id, order_number)`. The generated number is allocated only in the same transaction that creates the order/idempotency record.

## 6. Idempotency

### 6.1 Order creation

The bot sends an idempotency key derived from the tenant/customer identity and checkout session version, for example:

`telegram-order:{tenantId}:{customerId}:{checkoutSessionVersion}`

The version increments when a checkout starts or is reset. Store a request/result record with tenant, customer, key, request hash, order ID, and outcome. A retry with the same key and same request hash returns the original order. Reuse with a different payload is a conflict, not a second order.

The server must not trust the Redis snapshot for price or stock. It uses the key only to deduplicate the authoritative transaction.

### 6.2 Cancel-first-then-create

When an existing `pending_payment`/`rejected` order blocks checkout, the bot offers “Cancel existing order and create this order.” The server receives one idempotency key, for example:

`telegram-replace-order:{tenantId}:{customerId}:{checkoutSessionVersion}:{existingOrderId}`

In one database transaction it locks the existing order, verifies it is cancellable, transitions it to `cancelled`, releases its active reservations, then creates the replacement order/reservation and commits. A retry returns the replacement order from the idempotency record. If any part fails, both orders remain unchanged.

## 7. Concurrency and test plan

### 7.1 Concurrency strategy

The reserve operation must serialize contenders per product. Preferred implementation: lock the product row `FOR UPDATE`, calculate active reservations within the transaction, reject if requested quantity exceeds availability, then insert the reservation. An equivalent atomic SQL conditional update is acceptable if it preserves the ledger as the source of truth. Every path—bot creation, agent creation, replacement, expiry, cancellation, and conversion—must use this service and consistent lock order (`order` then `product`, or `product` then `order`, documented once) to avoid deadlocks.

### 7.2 Required tests

- Two buyers confirm the last tracked unit concurrently: exactly one succeeds; exactly one receives out-of-stock; active reservations sum to one.
- A bot confirmation races an agent-created order for the last unit: only one reservation commits regardless of arrival order.
- Two agent-created orders race: same invariant; manual price differences do not affect stock correctness.
- Double-tap Confirm and retry after a network timeout: one order, one item snapshot, one active reservation, one order number.
- Two cancel requests: one transition/history entry and one release; the second is idempotent/state-conflict according to the API contract.
- Expiry worker races with proof submission at the deadline: exactly one wins the row lock/valid transition; proof cannot attach to an expired order unless the transition transaction wins first.
- Expiry worker runs twice: second run finds no active reservation and changes nothing.
- Expiry worker restarts after committing the order transition but before its process returns: retry completes/reconciles release exactly once.
- Rejected proof resets `expires_at`, keeps the reservation active, and allows replacement proof submission.
- Confirmed conversion cannot later release stock as if it were an active hold.
- Unique active-unpaid index under concurrent create requests; one request returns the existing order.
- Cancel-first replacement rolls back both cancellation and creation on any failure.
- Tenant isolation for reservations, counters, idempotency records, orders, and customer order reads.
- `trackInventory = false` creates no reservation and remains available without a stock cap.
- Existing legacy statuses continue to appear in workspace delivery views, platform sales orders, reports, and exports during migration.

## 8. API and service contracts

### 8.1 Bot path

Expose an internal/core order-creation contract receiving tenant, Telegram customer/channel identity, checkout idempotency key, product ID, quantity, delivery data, payment method, and session version. It returns order number, canonical status, payment status, currency, total, and reservation deadline.

The bot request must not contain an authoritative price, subtotal, total, stock quantity, or currency override. The service reads current product data and tenant commerce settings, validates the product is orderable, snapshots the price/name/SKU/product metadata, and calculates money server-side. If the current price differs from the Redis summary, the API returns a price-changed result with the current server price; it does not silently charge the old displayed value.

### 8.2 Agent path

The existing agent order endpoint remains the operational entry point, but it must call the same order/reservation service. Manual price override is allowed only for an explicitly permission-guarded role/capability, with an audit event recording requested price, authoritative catalog price, actor, reason, and resulting snapshot. Ordinary agents cannot use the override merely because the DTO contains `unitPrice`.

Agent creation must support the canonical initial status appropriate to the order source, normally `pending_payment` for an unpaid customer order, and must reserve tracked stock in the same transaction. Legacy operational/manual orders that intentionally bypass payment review need an explicit transition/source policy rather than an accidental direct `new` write.

### 8.3 Money and currency

Use integer minor units or a decimal-money value object at service boundaries; do not use binary floating-point arithmetic for totals. The database currently uses `numeric(10,2)`, so the migration must either retain two decimal places with strict decimal arithmetic or establish tenant currency minor-unit metadata before supporting currencies with different scales. Every order and line item stores the currency snapshot used at checkout. All order money values must share that currency; conversion is out of scope for Step 3. The bot formats the stored amount using the tenant currency and locale, while exports preserve raw numeric value plus currency.

## 9. Bot checkout state machine

### 9.1 User journey

`Order now -> name -> share-contact phone -> address -> summary -> confirm`

The contact step should prefer Telegram’s contact-share control and verify that the shared contact belongs to the Telegram user where the provider payload permits it. Typed phone fallback is an explicit product decision; it must be normalized and validated.

At summary, show product name, quantity, server-fetched current unit price, total, currency, delivery name/phone/address, and the fact that stock is reserved only after confirmation. Confirm calls the idempotent API; it does not trust the summary as an order.

### 9.2 Redis session versus database

Redis session (TTL, tenant/channel/Telegram-user scoped) contains temporary navigation/checkout state only: session version, product ID, quantity, current step, draft name/phone/address, summary message ID, and safe display metadata needed to render the next screen. It is disposable and may be stale.

The database contains the durable Customer profile, Order, OrderItem authoritative snapshots, reservation ledger, idempotency result, status history, and later payment proofs. No Redis draft is an order and no Redis quantity is a reservation.

### 9.3 Customer profile save and overwrite behavior

On successful confirmation, save the captured delivery fields to the existing customer record. Recommended mapping:

- name -> `Customer.fullName`;
- phone -> `Customer.phone`;
- structured delivery address -> `Customer.location` and/or a defined `profileData.deliveryAddress` schema; and
- optional raw checkout metadata -> namespaced `profileData` only if needed for audit/display.

The order keeps an immutable `shippingAddress` snapshot regardless of future profile edits. Captured non-empty checkout values overwrite the corresponding profile fields because the customer has just supplied them intentionally. Blank/omitted values do not erase an existing profile value. This overwrite rule must be documented and tested.

### 9.4 Failure responses

- **Out of stock:** show that the selected quantity is no longer available, re-read/display current available quantity, and offer a lower quantity or return to product detail. No order or reservation is created.
- **Existing unpaid order:** show its order number/status and offer “View existing order,” “Cancel existing and create this order,” or “Back.” The replacement operation uses the single cancel-first idempotency transaction.
- **Price changed:** show the current server price and updated total, ask the customer to accept the new summary, and require a fresh confirm/session version. Never create using the stale client/Redis price.
- **Validation/temporary failure:** retain the draft in Redis until TTL, explain that nothing was charged/reserved if the transaction did not commit, and allow retry with the same idempotency key.

## 10. Minimal Telegram Orders list/detail in Step 3

Replace the current Orders placeholder with read-only customer-scoped APIs and screens:

- `GET` list: newest first, tenant + customer + Telegram identity constrained; return order ID/callback token, order number, canonical status, payment status, total, currency, created time, and optional expires-at display for active unpaid orders.
- `GET` detail: same scope; return order number, status, total/currency, created time, one-product line-item snapshot, delivery summary, and reservation/payment-review state sufficient to explain the next action.

The bot must never accept an arbitrary order ID from a callback without re-checking tenant/customer ownership. Stale callbacks return a safe refresh. This Step 3 surface has no cancel, reorder, COD, proof upload, or review action; those remain Step 5/4. If the customer has several channels, list identity follows the resolved tenant customer record, while private-chat authorization remains tenant + channel + Telegram user ID.

## 11. Migration, backward compatibility, and implementation order

### 11.1 Migration list

1. Add tenant expiry settings with defaults of two hours for `pending_payment` and twelve hours for `rejected`.
2. Add atomic tenant order counter and `(tenant_id, order_number)` uniqueness.
3. Add canonical status compatibility fields/constraints and `expires_at`.
4. Add reservation ledger and indexes/checks.
5. Add `OrderPaymentProof` and its indexes/foreign keys.
6. Add the active-unpaid partial unique index after a data audit and cleanup plan for any existing duplicate unpaid orders.
7. Add idempotency storage/indexes.
8. Backfill status compatibility metadata; do not create historical reservations automatically.
9. Update API/dashboard types and queries to read canonical plus compatibility values.

All migrations must be reversible where practical, tenant-scoped, and safe with `DB_SYNCHRONIZE=false`. Before the partial unique index, report duplicate `(tenant_id, customer_id)` rows in the intended active states and require an explicit resolution policy.

### 11.2 P3 implementation order

1. **P3-T0a:** tenant counter, uniqueness, concurrency tests.
2. **P3-T0b:** canonical status compatibility mapping and the single transition service; route existing write paths through it.
3. **P3-T0c:** tenant expiry settings and default resolution.
4. **P3-T2:** reservation ledger plus shared atomic reserve/release/convert service.
5. **P3-T3:** `expires_at`, cancellation/expiry semantics, restart-safe worker contract and tests.
6. **P3-T4:** authoritative bot pricing/stock contract and guarded agent manual override.
7. **P3-T5:** idempotent one-product order creation and immutable snapshots.
8. **P3-T6:** active-unpaid partial unique index and cancel-first replacement transaction.
9. **P3-T7:** `OrderPaymentProof` persistence/linkage, without Step 4 review UI.
10. **P3-T8:** Redis/DB checkout state machine, profile save, failure copy, and Orders list/detail.
11. Run migration compatibility checks across workspace orders, delivery, platform console, reports, exports, inbox intent, and agent-created orders before declaring Step 3 complete.

## 12. Open questions for approval

1. Should `stockQuantity` remain physical/on-hand while reservations are ledger-only, with a separate stock-consumption adjustment on confirmation, or should confirmation decrement `stockQuantity` and conversion remain ledger-only? The design recommends one accounting operation only, but the owner should choose the source-of-truth policy.
2. Should `payment_submitted` remain allowed to create a second unpaid order, as the current plan says, or should one customer have only one open order across payment-review states?
3. What exact tenant/channel customer identity should the partial unique index use if one tenant has multiple Telegram channels: the `Customer.id`, or a provider/channel/user identity key?
4. Should a customer be able to cancel after `payment_submitted` and, if so, who owns refund/reversal responsibility?
5. Should legacy `failed_delivery`, `returned`, and `cod_collected` remain operational statuses alongside the eight canonical Step 3 statuses, or should they be migrated into a separate delivery/payment sub-status model now?
6. What roles may approve/reject payment proof and trigger post-confirm cancellation?
7. What are the permitted currency codes and minor-unit scales beyond the current default `MMK`/two-decimal database columns?
8. Should typed phone fallback be allowed, or must Telegram checkout require the share-contact button?
9. What is the exact structured customer address schema and which profile fields should be overwritten when the customer supplies a new address?
10. Should Step 3 expose reservation expiry time to customers, or only a generic “awaiting payment” status?

