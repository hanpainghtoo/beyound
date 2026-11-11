# Telegram shopping bot — implementation plan

Based on [`current_stage.md`](./current_stage.md). Existing/reused work is tracked separately from new work; only new work contributes to progress.

## Decisions

- Step 4 approval amendments: `tenant.payment_methods.edit` defaults to owner/admin only; supervisors require the tenant setting and agents never receive it by default. Publishing is one confirmed Save and publish action, creates a redacted audit event, and notifies the tenant owner through the existing in-app notification and SMTP email paths. Forms show last changed by/at. Published versions and order snapshots are immutable; historical snapshots are never rewritten.
- Proofs without a selected method (Stage 2) auto-select when exactly one enabled method exists; otherwise persist a nullable/unspecified method and show a reviewer warning. Design proof attempt and invalid-file retry limits per customer now; implement the counters/enforcement in Stage 2.
- Media files referenced by an enabled payment method or any payment snapshot cannot be deleted; the media library archives them only after reference checks. PDFs are download-only in the workspace. Evidence is retained for 12 months after order completion and removed by a deletion job; v1 has no malware scan.
- Account numbers are masked in logs and audit payloads. Unmasked values are available only to owner/admin/actors with edit permission; encryption is optional if the existing credential facility makes it trivial. The latest proof will be prominent with older proofs collapsed.
- No negative stock or approval override: resolve stock through the audited stock adjustment, then approve. Method changes are allowed after rejection before replacement proof. Queue count is `payment_submitted` orders. Workspace signed URLs live 10–15 minutes.
- Review aging reminders go out-of-band to reviewers and the owner after a tenant-set threshold, defaulting to 2 hours and then 24 hours; this is Stage 3. Myanmar copy requires native-speaker review; English-first is allowed for the pilot.

- v1 is private chats only. Customer key: tenant + channel + Telegram user ID; chat ID is also stored.
- v1 is one product per order. There is no cart or Add to cart; the product screen has Order now only. Orders retain line items for a future cart without migration.
- Payment proof uses a new `OrderPaymentProof` entity linked to `Order`, supporting many proofs per order with status, reviewer, timestamp, reason, media link, and Telegram `file_unique_id`.
- Stock is reserved at checkout confirmation. `expires_at` is set for `pending_payment`, cleared at `payment_submitted`, reset to a fresh window on rejection, and held through rejection. Expiry only transitions `pending_payment`/`rejected` to `expired` and releases stock exactly once.
- Only one active unpaid order per customer is allowed (`pending_payment` or `rejected`), enforced by a tenant + customer partial unique index. A second order requires cancellation of the first; cancellation releases its reservation in the same transaction. `payment_submitted` does not block new orders.
- Proof mode is derived from an active unpaid order. In proof mode photo/document attaches to that order, text goes to the inbox while the mode remains active, and Cancel order/Chat with agent are shown. Outside proof mode, photos/text are normal inbox messages. Proof submission ends proof mode.
- Proof accepts photo or document with size/MIME validation; duplicate `file_unique_id` per tenant is flagged for reviewers.
- v1 updates: `message` (text, photo, document, contact) and `callback_query`; edited messages are deferred.
- Proof is visible in the inbox and order detail; Approve/Reject lives on order detail. Agents get a realtime awaiting-review alert and queue count.
- Bot-created orders always read price/stock server-side. Agent-created orders retain a separately permission-guarded manual price override.
- Phase 4 has a minimal KBZPay/AYA Pay settings form (account name, number, QR). The full template editor remains Phase 6.
- Browse transitions send the new Telegram message first, then delete the old message; deletion failures are ignored because Telegram's deletion window is limited. Current list/detail/menu message IDs are stored in Redis session state.
- Callback payloads use short action codes, compressed UUID IDs (base64url UUID bytes), and the session version; worst-case payloads must remain under Telegram's 64-byte limit.
- Product photos use signed URLs on first send, cache Telegram `file_id` by channel + media ID after success, and use the cached file ID thereafter. Signed URLs must use a public hostname, be reachable by Telegram, remain valid long enough, be redacted from logs, and respect Telegram's 5 MB URL-photo limit; text-only detail is the fallback.
- Profile means shop information, not the customer's account. The Myanmar label is `ဆိုင်အကြောင်း`; all Myanmar strings require native-speaker review.
- Products with `trackInventory=false` have no stock cap or displayed stock number. Otherwise quantity is capped at `min(stock, per-order cap)`; the default per-order cap is 10.
- Quantity taps re-read authoritative stock, always answer the callback, catch Telegram `message is not modified`, and show boundary toasts.
- Commerce messages use escaped HTML, captions are truncated to 1024 characters total, and prices use tenant currency with thousands separators.
- Products are ordered newest first with product ID as the tiebreaker; out-of-stock products remain visible but hide Order now.
- Chat with agent confirms briefly, then later text follows the normal inbox path. Every commerce screen has Back to menu, and `/menu` is registered.
- v1 uses only the tenant default language. Group chats are ignored without inbox creation, with at most a one-time private-chat note.
- Callback handling is rate-limited per customer to a few taps per second; excess taps are ignored but acknowledged.
- Root-menu buttons work from any menu message, including old versions; stale or expired sessions answer the callback and re-send the main menu.
- Step 3 uses a tenant-scoped atomic order number, an existing dashboard-safe status mapping changed only through the transition table, and tenant-configured expiry windows defaulting to 2 hours for `pending_payment` and 12 hours for `rejected`.
- Part A inbox activity: first contact is created on the first eligible shop interaction (`/start` or a callback from an old menu) through one idempotent resolver that reuses the normal provider + channel + external sender/conversation keys; the conversation remains `open`.
- Browse visits end after 30 minutes of inactivity; a later `/start` starts a new browse summary in the same conversation. Browse-summary writes happen immediately on the first event, then use a trailing flush after the throttle window so the last activity is persisted.
- `needs_attention` and `shoppingStage` are shared workspace filters. `first_contact` and always-tier events may update `lastMessageAt`; browse summaries do not and instead use `conversation.metadata.lastShoppingActivityAt`.
- Part A stores `shoppingStage`, `shoppingStageUpdatedAt`, `needsAttention`, `attentionReason`, and `attentionAt` in conversation metadata behind one shared mapper used by all APIs. A separate subtle new-shopping-activity indicator is behind a setting and defaults off until product approval; it clears when an agent opens the conversation.
- Part A internal activity is stored in `messages` with `senderType: system`, `messageType: system_event`, `isInternal: true`, and `provider: null`. Every message consumer must exclude internal rows where appropriate, and outbound command creation has a hard guard against internal messages. If that audit cannot be closed cheaply, stop and propose a separate `conversation_activities` table.
- Shopping activity is visible to all inbox roles. Workspace APIs/UI ship first; platform-console exposure follows later.
- No real tenant may enable `shopEnabled` until Part A is deployed and its rollout gate is verified.
- Step 3 approval amendment: do not backfill historical orders into canonical statuses. Existing orders retain legacy statuses; add `reservation_managed` (or equivalent), and scope the active-unpaid index and expiry worker to managed orders only. The worker never touches an order without `expires_at`.
- Step 3 stock accounting: reservations are converted at `payment_submitted -> confirmed`; conversion decrements `Product.stockQuantity` and writes a tenant/product/order/delta/reason/actor `stock_movements` audit row in the same transaction. Confirmed-order cancellation restocks only after an explicit actor choice.
- Step 3 compatibility mode: the transition service enforces the new state machine for managed orders, passes legacy-to-legacy `preparing`, `packed`, `out_for_delivery`, `failed_delivery`, `returned`, and `cod_collected` transitions through unchanged, and logs them as compatibility-mode transitions. Existing delivery workflows remain operational.
- Telegram ordering is separately gated by per-channel `telegramShopping.orderingEnabled`, defaulting to false; `telegram:shop:set` must manage the flag and Order now must be hidden or unavailable while disabled.
- The expiry worker runs every minute with `FOR UPDATE SKIP LOCKED`, transitions and releases atomically, notifies Telegram while honoring `Customer.botBlockedAt`, emits structured logs, and reports overdue orders through a metric/alert. All reservation paths use one documented lock order: product first, then order.
- Step 3 answers: stock decrements at conversion; `payment_submitted` may start another order; active uniqueness will be on `Customer.id`; customers cannot cancel after `payment_submitted` (agent only); legacy delivery statuses remain operational; `orders.payment.review` defaults to owner/admin/supervisor/agent through tenant settings; currency is MMK only; shared contact is preferred with a normalized `+959` typed fallback and matching Telegram `user_id`; addresses are structured as recipient name, phone, address, township, city, and notes; payment deadline is shown to the customer.
- Tenant communication requirement: before enabling reservation-managed ordering, communicate that payment approval converts the reservation into consumed stock and deducts `Product.stockQuantity`; cancellation after confirmation only restocks when an authorized actor explicitly selects restock.
- Stage 2 managed orders: orders created by the new flow set `reservation_managed = true`. The active-unpaid index is managed-only: `UNIQUE (tenant_id, customer_id) WHERE reservation_managed AND status IN ('pending_payment', 'rejected') AND customer_id IS NOT NULL`. Run a duplicate audit before creating it; legacy orders are never included.
- Stage 2 bot contract: the internal bot order request contains tenant, Telegram identity, idempotency key, product, quantity, delivery data, payment method, and checkout-session version only. Price, subtotal, total, currency, and stock are server-authoritative. A displayed-price mismatch returns `price_changed` without creating an order; insufficient stock returns `out_of_stock` with current availability; an existing active unpaid order returns `existing_order`, including when discovered after a unique-violation race. The response includes order number, canonical status, payment status, currency, total, and `expires_at`.
- Stage 2 agent contract: `AgentService.createOrderFromChat` uses the same order/reservation service. Manual unit-price overrides require a price-override permission and audit requested price, catalog price, actor, and reason. Because legacy stock data is not reliable, agent orders warn and log on insufficient stock by default; `orders.stock.override` may proceed, and `inventory.enforceOnAgentOrders` defaults false and can later make the check blocking. Telegram orders always block.
- Stage 2 idempotency: order creation uses `telegram-order:{tenantId}:{customerId}:{checkoutSessionVersion}`, storing request hash and result for 30 days. Same key and hash returns the original order; a different hash is a conflict. Cancel-first replacement uses `telegram-replace-order:{tenantId}:{customerId}:{checkoutSessionVersion}:{existingOrderId}` in one transaction, with product locked before order.
- Stage 2 payment proof: add `OrderPaymentProof` for tenant/order, `pending_review`/`approved`/`rejected`, media link, Telegram `file_unique_id`, MIME, size, submission/review timestamps, reviewer, rejection reason, and source IDs. Stage 2 persists and links proofs only; review UI is deferred.
- Step 4 payment configuration: support enabled KBZPay, AYA Pay, and at most two tenant-defined methods, with versioned settings, display order, permission-guarded edits, and no account-number logging. Ordering is unavailable when no method is enabled.
- Step 4 proof handling: customers choose a method after order creation; the selected method and exact order-total snapshot are stored with the order. Proof intake accepts validated JPG/PNG/WebP/PDF files up to 10 MB through Telegram `getFile` and tenant file storage, supports many proofs per order, flags duplicate tenant `file_unique_id` values for review, and never auto-rejects them.
- Step 4 review: approval/rejection is state-checked and idempotent from workspace order detail or inbox. Approval converts the reservation and decrements stock in one transaction; rejection keeps the reservation and starts a fresh 12-hour window. Customers cannot cancel after `payment_submitted` in v1.
- Step 4 alerts/messages: one `order.payment_submitted` event drives the awaiting-review realtime alert and queue count; it is cleared only by approve, reject, or cancel. Customer notifications are English/Myanmar, cover submitted/approved/rejected/expired, and honor `Customer.botBlockedAt`.
- Stage 2 ordering gate: `orderingEnabled` is required for Telegram order creation only; agent-created orders are unaffected.
- P3-T8 checkout decisions: the Telegram flow is `Order now -> name -> phone -> address -> summary -> confirm`; Redis stores only the draft/step for 30 minutes and orders/profile data remain in PostgreSQL. Names, phones, addresses, and other personal input are never logged. Name may use the saved profile; shared Telegram contacts are accepted only when `contact.user_id` matches the sender; typed phones normalize to `+959...`. Address fields are structured, non-empty values overwrite saved profile fields, and blanks never erase them. Confirm calls the Stage 2 contract with the server-held displayed-price snapshot and sends no client price/total.
- P3-T8 result handling: created shows order number, canonical status, deadline, payment-instructions-next, and Chat with agent; price changes, stock shortages, existing unpaid orders, disabled ordering, blocked bots, stale callbacks, and expired drafts each receive an explicit recovery path. Existing unpaid replacement uses the Stage 2 atomic cancel-first contract. Input text is consumed as checkout data rather than persisted as a normal inbox message; `/menu`, `/start`, Cancel, and Chat with agent leave checkout.
- P3-T8 Orders scope: Step 3 exposes a read-only customer Orders list/detail, five newest orders per page, line item, localized status, total, and pending-payment deadline. Back to menu is present everywhere and callbacks use the existing compact version guard. Cancel, reorder, COD, payment screens, and proof remain Step 5/4 work. New English/Myanmar strings require native-speaker review.
- P3-T8 localization review list: `Order summary` / `အော်ဒါအကျဉ်းချုပ်`, `Use saved name` / `သိမ်းထားသောအမည်ကို သုံးမည်`, `Share phone number` / `ဖုန်းမျှဝေရန်`, `Use saved address` / `သိမ်းထားသောလိပ်စာကို သုံးမည်`, `Confirm` / `အတည်ပြုမည်`, `Cancel` / `ပယ်ဖျက်ရန်`, `Chat with agent` / `အေးဂျင့်နှင့် ဆက်သွယ်ရန်`, `Orders` / `အော်ဒါများ`, and localized status labels. A native speaker must review before rollout.
- Stage 2 verification: the real-PostgreSQL suite uses Docker Compose (`postgres:16`, tmpfs, throwaway credentials, port 55432), refuses non-test database names, creates an empty database, runs all migrations with `DB_SYNCHRONIZE=false`, reverts/reapplies the last four migrations, and runs concurrent transaction tests. This repository has no checked-in CI workflow; `npm run ci:integration` is the CI entry point and the CI runner must provide the matching Postgres 16 service container and `TEST_DATABASE_URL`.

## Progress — new work only

| Step                            | Existing (reused) | New (to build) | New done / total |
| ------------------------------- | ----------------: | -------------: | ---------------: |
| 1. Bot foundation               |                 4 |              9 |            9 / 9 |
| 2. Browse                       |                 1 |              4 |            4 / 4 |
| 2.5 Inbox activity              |                 0 |              9 |           9 / 9 |
| 3. Order API then checkout      |                 2 |             15 |         15 / 15 |
| 4. Payment/review               |                 1 |             10 |            0 / 10 |
| 5. Orders/expiry                |                 1 |              5 |            0 / 5 |
| 6. Template/hardening/pilot     |                 3 |              8 |            0 / 8 |
| Pilot prerequisites             |                 0 |              1 |            0 / 1 |
| Hotfixes and production rollout |                 0 |             18 |           7 / 18 |
| **Total**                       |            **12** |         **76** |      **42 / 76** |

## Step 1 — Bot foundation

**Acceptance:** existing Telegram channels can be re-registered for `message` + `callback_query`; Redis-TTL state is keyed by tenant/channel/user; compact callbacks reject >64 bytes and stale state; helper failures expose safe 403/429/retry details; the pending end-to-end skeleton is present.

- [x] **P0-T5** Set `allowed_updates` to `message` + `callback_query`, and mark existing Telegram channels for re-registration through migration `1782447000000-EnableTelegramCallbackUpdates.ts`. Target: tenant service, integration client, migration.
- [x] **P1-T3** Add Redis-backed session state with TTL and tenant + channel + Telegram user key while storing chat ID in the update contract. Target: `backend-core-service/src/telegram-bot/telegram-session.service.ts`, `telegram-bot.types.ts`.
- [x] **P1-T4** Add compact `action:id:page` callback parsing, 64-byte enforcement, private-chat guard, state/version checks, and stale callback response. Target: `telegram-bot.router.ts` and unit tests.
- [x] **P1-T5** Add `answerCallbackQuery`, edit text/caption/markup, photo/document wrappers, safe 403/429 mapping, and `setMyCommands`. Target: `services/integration-service/src/telegram.client.ts` and tests.
- [x] **P1-T6a** Wire the foundation module into core. Target: `telegram-bot.module.ts`, `app.module.ts`.
- [x] **P1-T6b** Add unit coverage for router, state guard, callback byte limit, helper calls, and 403/429 handling. Target: router/client specs.
- [x] **P1-T6c** Add the empty end-to-end journey skeleton and keep it pending until later steps fill it. Target: `telegram-bot.e2e-pending.spec.ts`.
- [x] **P0-T6** Require `TELEGRAM_TOKEN_ENCRYPTION_KEY` in production, remove `JWT_SECRET` as a write-time fallback, retain legacy-key decrypt during migration, and document dry-run rotation. Target: environment validation, credential utility, re-encryption script, deployment/onboarding docs.
- [x] **P1-T6d** Track Telegram bot reachability on customers: persist blocked-user 403s, clear the flag on inbound message/callback, skip blocked sends without retry, and expose the backend fields in agent responses. Target: `Customer`, provider adapter, conversation ingestion, migration, tests.

## Step 2 — `/start` and product browsing

**Acceptance:** private customers can start, see welcome/profile/orders controls, page 5–8 products, view detail, and adjust quantity without duplicate messages. No Add to cart exists.

- [x] **P2-T1** Implement `/start`/`/menu` welcome, tenant-default-language shop info, command registration, and Products/Profile/Orders/Chat with agent buttons.
- [x] **P2-T2** Implement stable six-per-page active-product lists using in-place text edits, compressed callbacks, send-first cleanup, and private-chat/group guards.
- [x] **P2-T3** Implement product detail with authoritative price/stock/image, signed-URL/file-ID delivery fallback, HTML escaping, out-of-stock labels, and Order now only when available.
- [x] **P2-T4** Implement quantity stepper with state/version guards, per-customer callback rate limit, stock re-read, track-inventory bounds, boundary toasts, and not-modified handling; categories/search remain deferred.

## Hotfixes and production rollout

- [x] **R1** Harden the webhook re-registration script with `--channel`, `--limit`, and `--all` safety controls. One localhost channel failed with `credentials_not_encrypted`; no localhost-specific guard was added. Evidence: `backend-core-service/scripts/reregister-telegram-webhooks.ts` and rollout log in `current_stage.md`.
- [x] **R2** Re-register existing channels with `message` + `callback_query` updates. Evidence: production rollout log; one localhost channel failed because its credentials were unencrypted.
- [x] **R3** Fix stale menus after Back to menu or repeated `/start`; root navigation accepts old/new menu callbacks while strict browse callbacks remain guarded. Evidence: `telegram-commerce.service.ts`, `telegram-bot.router.ts`, and targeted router/commerce tests.
- [x] **R4** Audit webhook route format. Both `/webhooks/telegram/bots/:channelId` (dedicated handler) and `/webhooks/telegram/:channelId` (generic `webhooks/:provider/:channelId` handler) are served; managed-bot registration remains canonical on `/bots/`. Evidence: `services/webhook-handler-service/src/app.controller.ts` and HTTP route tests.
- [x] **R5** Add per-channel `telegramShopping.shopEnabled` (default false) and the `telegram:shop:set --channel=<id> --enabled=true|false` CLI. No existing channel is enabled by migration; explicitly enable `jjk_bot` after deploy. Evidence: commerce gate and `backend-core-service/scripts/set-telegram-shop-enabled.ts`.

  Per-tenant template gate: commerce additionally requires the tenant's `telegram_bot_template='commerce'` row in `tenant_channel_settings`. The CLI now warns when enabling shop for a tenant whose template is off ("no effect until the tenant's Telegram bot template is enabled in platform-console"); enabling the template is a platform-admin action in the merchants Channel settings tab, and normal Telegram chat is unaffected either way.
- [x] **R6** Add the stale-menu regression journey: `/start` twice, old/new Products, Back to menu then Products, stale paging/stepper rejection, TTL expiry recovery, and disabled-shop coverage. Evidence: targeted router/commerce tests.
- [ ] **R7** Add a read-only webhook audit script for allowed updates, route, secret state, and channel reachability. After re-registration, refresh stored `telegramWebhook` metadata (`allowedUpdates`, `checkedAt`) from `getWebhookInfo`; the audit script reads `getWebhookInfo` directly rather than trusting stored metadata.
- [ ] **R8** Complete the remaining live smoke-test items for the production shopping flow.
- [ ] **R9** Invalidate cached Telegram `file_id` values when a channel bot token changes.
- [ ] **R10** Verify the Redis-backed callback rate limiter in production-like conditions, including expiry and per-customer scope.
- [ ] **R11** Identify the Telegram channel with unencrypted database credentials, then delete it or encrypt its credentials; confirm no other Telegram channel has unencrypted credentials.
- [ ] **R12** Complete native-speaker review of all Myanmar Telegram strings.
- [ ] **R13** Back up the production database, run `credentials:reencrypt` with `--dry-run`, verify the result, then run it for real; remove the `JWT_SECRET` legacy read path in a later release.
- [x] **R14** Scope Telegram webhook idempotency keys per channel as `telegram-<channelId>-<update_id>` and verify same-update behavior across channels. Core inbound dedupe already includes `provider`, `channelId`, and `providerEventId`; no core fix was required.
- [ ] **R15** Add an AppModule boot test to CI and configure the core API PM2 process with `min_uptime`, `max_restarts`, and `exp_backoff_restart_delay`.
- [ ] **R16** Triage the 22 old webhook dead-letter events and explicitly replay or delete each one with an auditable outcome.
- [ ] **R17** Allow one failed Telegram manager readiness check before logging the manager as degraded; preserve the degraded signal when the retry also fails.
- [ ] **R18** Revoke the leaked GitHub token and switch the server deployment to a read-only deploy key.

## Step 2.5 — Workspace inbox shopping activity

**Dependencies:** Step 2 browse flow. No Step 3 transition-service dependency for Part A.

**Acceptance:** shop-enabled `/start` and old-menu callbacks create one shared customer/conversation through the normal provider identity keys; first-contact and browsing activity are internal-only, deduplicated, throttled with trailing flush, visible in the workspace, and never sent to Telegram or treated as customer messages. No real tenant enables `shopEnabled` before this step is deployed.

- [x] **P3-A1** Define the internal `system_event` inbox entry contract, event names/metadata, visibility rules, idempotency constraints, and the no-Telegram/no-auto-reply/SLA exclusion boundary; audit every message consumer and add the outbound-command hard guard.
- [x] **P3-A2** Resolve/create the shop-enabled Telegram customer/conversation on first contact and eligible browse visits without persisting raw callback taps as customer messages; reuse normal provider + channel + external sender/conversation upsert keys and preserve disabled-shop behavior.
- [x] **P3-A3** Add one throttled, in-place `telegram.browse_summary` per 30-minute browse visit, writing immediately on first event and trailing-flushing the final activity using Redis expiry/delayed-job infrastructure.
- [x] **P3-A4** Expose derived `shoppingStage` (`browsing`, `checkout`) plus `needs_attention` and shared metadata mapping in workspace inbox/customer APIs; add `lastShoppingActivityAt` metadata without moving `lastMessageAt` for browse summaries.
- [x] **P3-A5** Add the subtle new-shopping-activity indicator behind a default-off setting, clearing when an agent opens the conversation; keep conversation status `open` and expose stage/attention filters.
- [x] **P3-A6** Add workspace internal-activity rendering for all inbox roles, with customer-message unread semantics preserved and no customer-facing rendering.
- [x] **P3-A7** Add post-commit realtime activity/conversation upserts and deduplicate client handling; ensure internal entries never enter outbound Telegram delivery.
- [x] **P3-A8** Add Part A tests for shop gate, disabled-shop behavior, no Telegram outbound path, no fake callback messages, deduplication, throttling/trailing flush, tenant isolation, unread/SLA/auto-reply exclusions, and websocket behavior.
- [x] **P3-A9** Document and verify the rollout gate: no real tenant may enable `shopEnabled` until Part A is deployed; keep platform-console exposure deferred.

## Step 3 — Order API foundations, then bot checkout

**Dependencies:** Step 2 selection; owner-defined reservation window.

**Acceptance:** API-first order creation is authoritative and idempotent; one active unpaid order is enforced; reservations and expiry are transactional; bot checkout captures and reuses delivery data.

- [x] **P3-T0a** Add a tenant-scoped atomic order number, with uniqueness and concurrency protection.
- [x] **P3-T0b** Define compatibility mode for legacy delivery statuses without breaking dashboards; route managed states through the transition table and log legacy-to-legacy transitions unchanged as compatibility-mode events.
- [x] **P3-T0c** Add tenant settings for expiry windows with defaults of 2 hours for `pending_payment` and 12 hours for `rejected`.
- [x] **P3-T1** Define order status enum and transition table including `pending_payment`, `payment_submitted`, `confirmed`, `rejected`, `processing`, `delivered`, `cancelled`, and `expired`; managed transitions are enforced by `OrderTransitionService`, while legacy-to-legacy delivery transitions remain compatibility mode.
- [x] **P3-T2** Add reservation ledger and atomic reserve/release operations.
- [x] **P3-T3** Add `expires_at`, reservation window behavior, and exactly-once expiry release.
- [x] **P3-T4** Add server-side pricing/stock lookup for bot-created orders; preserve permission-guarded manual price override only for agent-created orders. Implemented by the shared order creation service with Telegram ordering gating, MMK-only authoritative totals, price-change/out-of-stock results, and agent stock warning/override settings.
- [x] **P3-T5** Add idempotent one-product order creation with authoritative line-item snapshots. Implemented with managed reservations, tenant counter allocation, request-hash records retained for 30 days, unique-race recovery, and atomic replacement support.
- [x] **P3-T6** Add tenant + customer partial unique index for active unpaid orders. Migration `1782447400000` audits managed duplicates first and excludes all legacy orders.
- [x] **P3-T7** Add `OrderPaymentProof` entity and order linkage. Persistence-only in Stage 2; review UI and proof workflow remain deferred.
- [x] **P3-T8** Add bot checkout for name, share-contact phone, structured address, summary, profile save, authoritative/idempotent confirmation, explicit failure recovery, and the minimal read-only customer Orders list/detail. Cancellation, reorder, COD, payment screens, and proof remain deferred.

Stage 2 verification coverage: `backend-core-service/src/order/order-creation.integration-spec.ts` uses the real PostgreSQL container, real TypeORM transactions, and concurrent `Promise.all`. It covers last-unit buyer races, double-tap idempotency, hash conflicts, bot/agent races, active-unpaid unique races, replacement rollback/release, price and stock failures, exactly-once release/convert, concurrent expiry workers, unseeded counter allocation, tenant isolation, agent warnings and price-override audit, ordering gate, cleanup retention, and default tenant settings. Existing order/reservation/transition unit suites use mocks and remain complementary; they are not counted as Stage 2 acceptance evidence.

### Part B — order activity (requires the Step 3 transition service)

- [x] **P3-B1** Emit durable tenant-scoped `order.placed`, `order.payment_submitted`, `order.confirmed`, `order.rejected`, `order.cancelled`, and `order.expired` events inside the same transaction as creation/status changes. Legacy-to-legacy transitions emit no order activity event.
- [x] **P3-B2** Add a restart-safe, idempotent activity projector using `processed_at`, `FOR UPDATE SKIP LOCKED`, and `order-activity:{eventId}` internal-message keys. Only Telegram-linked customers/conversations receive activity.
- [x] **P3-B3** Derive `awaiting_payment`, `payment_submitted`, and `confirmed`; set attention only for Telegram order placed/payment submitted, clear placed attention when an agent acknowledges/opens the conversation, and clear submitted attention only on approval/rejection/cancellation. Agent/dashboard orders are excluded.
- [x] **P3-B4** Add post-commit internal activity projection/realtime contracts and real-PostgreSQL coverage for replay, worker races, tenant isolation, unlinked orders, and Telegram outbound exclusion.

## Step 4 — Minimal payment and manual review

**Dependencies:** Step 3 order API, reservation, media storage.

**Acceptance:** customer sees exact amount/QR, photo/document proof uploads are validated and stored, proof appears in inbox and order detail, agents receive realtime/count alerts, and Approve/Reject/re-upload are state-checked.

- [ ] **P4-T1** Add versioned payment settings for KBZPay, AYA Pay, and up to two tenant-defined methods, with owner/admin default edit permission, supervisor setting gate, audit/owner notification, redaction, and media-reference protection. Implemented; pending Stage 1 review.
- [ ] **P4-T2** Add method selection/snapshot and customer payment screen with exact order total, signed QR reference contract, no-enabled-method gate, and stale-version protection. Implemented; pending Stage 1 review.
- [ ] **P4-T3** Add Telegram `getFile` for photo/document and upload into tenant file storage with MIME/size limits.
- [ ] **P4-T4** Add proof-mode routing derived from active unpaid order; text stays in inbox, photo/document attaches to order.
- [ ] **P4-T5** Add duplicate `file_unique_id` tenant flag and many-proof persistence.
- [ ] **P4-T6** Add inbox/order-detail review UI/API with Approve/Reject, reviewer, reason, timestamp, and audit.
- [ ] **P4-T7** Add realtime awaiting-review alert and queue count.
- [ ] **P4-T8** Add customer notifications and rejected-proof re-upload; proof submission ends proof mode.
- [ ] **P4-T9** Add per-customer proof-attempt and invalid-file retry counters/limits with tenant defaults and reset/retention rules.
- [ ] **P4-T10** Add review-aging reminders to reviewers and the tenant owner after tenant-configured hours (default 2, then 24), using the out-of-band notification path.

## Step 5 — Orders, cancellation, reorder, COD

**Acceptance:** Telegram customers can manage orders with server-side state restrictions, cancel pending orders transactionally, reorder using fresh price/stock, and use enabled COD.

- [ ] **P5-T1** Add Telegram Orders list/detail with proof state and line item.
- [ ] **P5-T2** Add cancel while pending and reservation release in the same transaction as replacement creation.
- [ ] **P5-T3** Add reorder using current authoritative product data.
- [ ] **P5-T4** Add COD configuration and collection lifecycle.
- [ ] **P5-T5** Add expiry worker/cron and restart-safe exactly-once release.

## Step 6 — Full template editor, hardening, pilot

**Acceptance:** tenant admins can publish versioned templates safely; the full v1 journey and security cases pass; one tenant-owned bot is certified.

- [ ] **P6-T1** Add versioned full template editor: welcome image/text, buttons, language, out-of-stock/closed-hours messages.
- [ ] **P6-T3** Add full vertical-slice e2e journey test and failure/retry coverage.
- [ ] **P6-T4** Add security tests for tenant isolation, callback replay, token leakage, media ownership, MIME/size limits, and signed URLs.
- [ ] **P6-T5** Add structured redacted logs, metrics, alerts, and runbook.
- [ ] **P6-T6** Add pilot seed/configuration and Telegram live certification.
- [ ] **P6-T7** Review agent/manual-order permissions and audit coverage.
- [ ] **P6-T8** Record launch evidence and operational rollback procedure.
- [ ] **P6-T9** Add the agent-inbox “customer blocked the bot” badge using `Customer.botBlockedAt`.

## Pilot prerequisites

**Acceptance:** a tenant can configure at least one payment method and explicitly enable ordering from the workspace, with both changes permission-guarded and auditable.

- P4-T1 is tracked above under Step 4 and remains pending Stage 1 review; this prerequisite tracks only the remaining ordering toggle.
- [ ] **P6-T10** Add a workspace toggle for the per-channel Telegram `shopEnabled`/`orderingEnabled` settings; the CLI remains available for operations.

## Definition of done for v1

- Private-chat-only one-product order journey works end to end with line-item orders.
- Bot pricing/stock is server-authoritative; active unpaid uniqueness, reservation, expiry, and cancellation are transactional.
- Proof uses `OrderPaymentProof`, supports photo/document, is visible in inbox and order detail, and never auto-approves.
- Proof mode is derived from order state and has Cancel order/Chat with agent escape.
- English/Myanmar defaults, minimal payment settings, full template editor, security tests, observability, and pilot evidence are complete.

## Deferred / later

- Multi-item cart and Add to cart.
- Edited Telegram messages.
- Delivery fee by township/zone.
- Abandoned-cart reminders.
- Group-chat commerce and Telegram Mini App UI.
