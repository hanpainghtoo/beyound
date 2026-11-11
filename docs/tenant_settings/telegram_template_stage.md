# Telegram bot template — current state (analysis only)

> Read-only scan. No code changed, no migrations run, no SQL executed. No secrets or token values. `not found` marks things that do not exist. zayos-graph MCP queried first for `telegram commerce shopping bot template`, `channel template entities platform admin`, `telegram bot order checkout payment proof flow`; every claim below was confirmed by reading files.

---

## A. Identity of the template

### A1. Literal name search

| Variant | Result |
|---|---|
| `telegram_bot_template` | **not found** (0 matches) |
| `TelegramBotTemplate` | **not found** |
| `telegramTemplate` | **not found** |
| `telegramShopping` / `ShoppingSettings` | Found (~36 matches) — but only as `tenant_channels.configuration.telegramShopping: ShoppingSettings`, a per-channel JSON blob, not a table/entity |
| `channel_template` / `ChannelTemplate` | Found (~21 / ~70 matches) — the shared `channel_templates` table, unrelated to commerce (see A2) |

There is **no entity, table, type, or config literally named `telegram_bot_template`** today. What the task calls "telegram bot template" is, in code terms, the **Telegram commerce/shopping flow**: `TelegramCommerceService` + per-channel `telegramShopping` flags + order/checkout/payment-proof pipeline. It is a behavior bundle, not a stored template row.

### A2. `ChannelTemplate` / `channel_templates` — shared platform definition, NOT commerce

- Entity: `backend-core-service/src/channel/entities/channel-template.entity.ts:10-59` `@Entity('channel_templates')` class `ChannelTemplate`: `id uuid PK (:13-14)`, `channel_type (messenger|viber|telegram|tiktok) (:17-18)`, `template_name (:21-22)`, `app_id nullable (:25-26)`, `bot_token nullable (:29-30)`, `callback_url nullable (:33-34)`, `webhook_events jsonb default [] (:37-38)`, `default_welcome_message text nullable (:41-42)`, `status active|inactive default active (:45-46)`, `configuration jsonb default {} (:49-50)`.
- No `tenantId`, no `channelId` column — **shared global definition**, one row per provider default.
- Seeds: `shared/database-schemas/02_seed_data.sql:23-27` (also `backend-core-service/scripts/02_seed_data.sql:23`): 4 rows — messenger / viber / telegram (`Telegram Bot Default {parse_mode:HTML}`) / tiktok. Schema comment `Channel templates for platform-wide configuration` (`shared/database-schemas/01_create_schema.sql:51-65`; migration `src/database/migrations/1781803237583-InitialCommerceOsSchema.ts:24`).
- CRUD is platform-admin only: `backend-core-service/src/platform-admin/channel-template.controller.ts:32` `@Controller('platform-admin/channel-templates')`, roles `super_admin,ops_admin,it_admin` (`:42-44,55-56,66-67`), delete restricted (`:120-122`), audit `channel_template_{created:77-78, updated:95-96, deleted:116-117}`. Service `platform-admin/channel-template.service.ts:12-64` (`getAll:18-22`, `getById:24-34`, `getByType active only:36-43`, `create:45-50`, `update:52-59`, `delete:61-64`). DTO `platform-admin/dto/channel-template.dto.ts:11-56` (`CreateChannelTemplateDto`; `UpdateChannelTemplateDto extends Create:56`, requires full payload, no `Partial`).
- Dashboard types: `dashboards/platform-console/lib/api.ts:304,319-320,331-332,1781-1807`.
- **Relation to Telegram commerce: none.** It stores connection defaults (bot token placeholder, callback URL, webhook events, welcome message), never `shopEnabled`, products, checkout, or payment config. Do not reuse it as the commerce-template store (see §F).

### A3. `tenant_channels.configuration.telegramShopping` (`ShoppingSettings`)

- Type: `backend-core-service/src/telegram-bot/telegram-commerce.service.ts:76-84`:
  ```ts
  type ShoppingSettings = { shopEnabled?: boolean; orderingEnabled?: boolean; greeting?: string;
    currency?: string; photoFileIds?: Record<string,string>;
    paymentQrFileIds?: Record<string,string>; paymentQrBotTokenHash?: string; }
  ```
- Accessors: `settings(channel) = channel.configuration?.telegramShopping || {}` (`:1837-1839`), `shopEnabled() === true` (`:1841-1843`); QR/photo caches `:1845-1889`.
- Scope: **per-channel**, stored inside `tenant_channels.configuration` (`tenant-channel.entity.ts:80-82` jsonb). Each Telegram channel has its own shop on/off. There is no per-tenant commerce row.
- Only writer besides code caches: CLI `backend-core-service/scripts/set-telegram-shop-enabled.ts:15-64` (`telegram:shop:set --channel=<uuid> --enabled=true|false [--ordering-enabled=] [--dry-run]`; root `package.json:29`). No workspace/platform toggle (deferred `docs/telegram_bot/plan_task.md:215 P6-T10`).

### A4. Docs Phase 6 template editor (future, not built)

- `docs/telegram_bot/plan_task.md:24,48,112,197-208`: Phase 4 ships minimal KBZPay/AYA Pay form; full editor stays Phase 6 (`P6-T1 versioned full template editor: welcome image/text, buttons, language, out-of-stock/closed-hours messages:201`; pilot toggle `P6-T10:215`). Ordering gated by per-channel flags (`:48,61`).
- `docs/telegram_bot/step3_design.md` + `step4_design.md`: zero `template` hits. Template-like but different: `step3` checkout/order fields (`expires_at`, `checkout_session_version`, `order_item_reservations`, `OrderPaymentProof`, partial unique index, `tenant_order_counters`); `step4:30-55` proposed **versioned tenant payment config** (`tenant_payment_method_configs` + `tenant_payment_methods`), order snapshot (`:75`), `order_payment_proofs (:135)` fields.
- `docs/telegram_bot/current_stage.md:11,57,88,122`: `Telegram template editor: Missing; no versioned Telegram template schema/defaults/editor`.

### A5. Other template types / hooks

- Other template types (e.g. booking): **not found**. Grep `booking.*template|template.*booking` in `backend-core-service/src` = 0; `class .*Template|@Entity(.*template` = only `ChannelTemplate`.
- Template today is therefore one of three different things depending on context: (a) shared `ChannelTemplate` connection defaults (global), (b) per-channel `telegramShopping` commerce flags (channel config), (c) future versioned tenant payment/template config (proposed, not built). The new tenant-level `telegram_bot_template` flag would be a fourth: a **per-tenant assignment switch** ("this tenant may use the commerce template"), which composes with (b).

### A6. Data shape, editing, endpoints, UI

| Aspect | Today |
|---|---|
| Fields/defaults/versioning | `ShoppingSettings` above; all optional, absent = disabled (`=== true` checks); no version column; payment QR/file caches keyed by bot-token hash (`ensurePaymentQrCache:1853-1861`) |
| Who can edit | Operators via CLI only; no platform-console or workspace editor (`P6-T10` open) |
| API read/write | No dedicated commerce-settings endpoint (`not found`); channel `POST /tenant/channels` + `PUT` carry `configuration` opaquely; `buildTelegramPayload` (`dashboards/workspace/app/workspace/channels/page.tsx:432-446`) sends only `{provider:telegram}`, no shopping flags |
| UI | Workspace channels page: connect/test/disconnect only (`channels/page.tsx:93,138-148,782-841,883-918`); orders settings: `<PaymentMethodSettings/>` (`orders-settings/page.tsx:21,214-226`); merchants channel tab in platform-console: read-only table (`merchants/[merchantId]/page.tsx:919-1058`, `getTenantChannels:1686` in `platform-console/lib/api.ts`), no shop column |

---

## B. Commerce flow boundary

### B1. Entry gate and fall-through (proven)

- Entry: `backend-core-service/src/telegram-bot/telegram-commerce.service.ts:146-192 handle(event)`:
  - `:147` non-telegram → `{handled:false}`.
  - `:148-150` channel missing → `{handled:true, ignored:true, reason:'channel_missing'}` (swallowed).
  - `:153-161` **template master switch**: `if (!this.shopEnabled(channel))` → callbacks get `answer('Shop unavailable.')`, both branches `return {handled:false}`. This is the fall-through: the same update continues to the normal inbox.
  - `:162-166` group chats → `{handled:true, ignored:true, reason:'private_chats_only'}`.
  - `:168-174` payment-proof photo/doc eligible (`paymentProof:1350-1363`, `canAcceptTelegramProof:1365-1403`) → `submitTelegramProof:1405-1451` → `{handled:true}`.
  - `:175-183` `checkout_*` session text (not `/start`/`/menu`) → `handleCheckoutInput:256-352` → `{handled:true}`.
  - `:184-186` `callback_query` → `handleCallback:840-941` → `{handled:true}` (or rate-limited/stale variants).
  - `:187-190` `/start`|`/menu` → `showMenu:943-1034` → `{handled:true}`.
  - `:191` default → `{handled:false}` — any other text/photo/contact falls through.
- Wiring: `backend-core-service/src/conversation/internal-ingestion.controller.ts:38-59` — telegram path runs `recordTelegramShoppingActivity()` → `telegramCommerceService.handle(body)` → `result.handled ? result : conversationService.ingestProviderMessage(body)` (`:56-58`). Non-telegram goes direct (`:61`).
- Spec proof: `backend-core-service/src/telegram-bot/telegram-commerce.service.spec.ts:131-145` (`/start` with `shopEnabled` false → `{handled:false}`, `sendMessage` not called), `:147-169` (disabled-shop callback → `{handled:false}` + `answerCallbackQuery('Shop unavailable.')`), `:171-186` positive control (`shopEnabled=true` + `/start` → `{handled:true}`). Checkout double: `telegram-checkout.spec.ts:54-56,152-162,223` (ordering-off never calls `createBotOrder`).

### B2. Commerce-only enforcement points (need the tenant-level check)

| # | File:line | Current gate |
|---|---|---|
| 1 | `telegram-commerce.service.ts:153-161 handle()` entry | `shopEnabled===true` else `handled:false` (+ `Shop unavailable.` toast on callbacks) |
| 2 | `telegram-commerce.service.ts:194-210 startCheckout`, `:262-272 handleCheckoutInput` | `orderingEnabled===true` else `Ordering is currently unavailable.` |
| 3 | `telegram-commerce.service.ts:840-941 handleCallback` (actions `p/n/v/d/b/i/r/f/o/h/x/q/y/e/u/c/k/z/a/m`), incl. `:911-912,1244-1268 handleOrdersCallback`, `:1133-1149 showOrders`, menu Orders row `:986-993`, detail/quantity gates `:1514-1519,1605-1610,1718,1737` | reachable only after entry gate; ordering sub-gates per action |
| 4 | `telegram-commerce.service.ts:392-447 confirmCheckout`, `:624-670 replaceExistingOrder` | delegate to `orderCreationService.createBotOrder/replaceBotOrder` (which re-check); `botBlockedAt` order refusal |
| 5 | `telegram-commerce.service.ts:528-622 showPaymentScreen/selectPaymentMethod`, `:1365-1451 canAccept/submitTelegramProof`, `:1453-1483 mirrorTelegramProof` | `paymentService.hasEnabledMethod`, `createdBy IS NULL` pending/rejected scoping |
| 6 | `order/order-creation.service.ts:65-78 createBotOrder` | `orderingEnabled!==true → 409 Telegram ordering is disabled`; `currency MMK`; `hasEnabledMethod` |
| 7 | `order/order-creation.service.ts:385-440 replaceBotOrder` | `payment_unavailable` + `pending/rejected` replaceability; **gap: no `orderingEnabled` re-check** |
| 8 | `conversation/conversation.service.ts:319-345 recordTelegramShoppingActivity` | non-telegram → ignore; disabled/inactive/`shopEnabled!==true` → `{ignored:true, reason:'shop_disabled'}`; non-entrypoint → `not_shop_entrypoint`. Writes `telegram.first_contact`/`browse_summary` internal events + `shoppingVisitId/browseSummaryPending` (`:346-564`) |
| 9 | `order/order-activity.projector.ts:120-137 project()` | `shopping?.shopEnabled!==true → return` (skips inbox internal message + websocket + customer DMs); **gap: no `orderingEnabled` check** |
| 10 | `order/order-expiry.worker.ts:42-75 runOnce()` | **currently ungated** (expires any `pending/rejected` past `expires_at`); `notify():107-137` dead code (never called); customer notice comes from projector |
| 11 | `conversation/telegram-shopping-activity.scheduler.ts:12-16` | 15 s `flushDueTelegramBrowseSummaries()`; indirectly gated (only flushes rows the gated recorder wrote) |
| 12 | `order/order.controller.ts:95-187` agent review (`PUT :id`, `:id/attachments`, `:id/status`, `:id/payment-status`, `:id/delivery-status`) + `order-transition.service.ts:148-190 submitPaymentProof` | role gates (`owner,admin,supervisor,agent[,finance]`) + `@RequireFeature('orders')` (`order.controller.ts:50`); **no shop gate** — must stay open during template-off to drain open orders (see §D) |
| 13 | Dashboards commerce UI: `workspace/app/workspace/orders/page.tsx:16-56`, `order-detail-panel.tsx`, `proof-viewer.tsx:7-13`, `order-actions.tsx`, `orders-list.tsx:10-11`, inbox order/payment tabs (`inbox/page.tsx:120,137,161,197,259-283,553-623,1064-1069,1581-1640`) | display + review actions; hide/disable **new** commerce affordances when template off, keep review/confirm flows |

### B3. What must NOT be gated (with proof)

| Area | Proof it is correctly ungated today |
|---|---|
| Normal ingestion | `conversation.service.ts:653-690 ingestProviderMessage` gates only channel-disabled (`:676-689 → 409 CHANNEL_DISABLED`) + plan allowlist (`:696`); no shop check; callback short-circuit `:761-793` |
| Outbound sender | `channel-adapter/channel-adapter.service.ts:57-129 sendMessage` — only channel-disabled (`:62-73`) + `botBlockedAt` skip (`:88-102`); used by both inbox replies and projector/expiry notices |
| Managed-bot onboarding | `tenant/telegram-managed-bot.service.ts:151,683 setWebhook`, `:327-440` request validation, `:657` channel create; `tenant.controller.ts:586-626`; entity `channel/entities/telegram-managed-bot-onboarding-request.entity.ts:24-28` — no `telegramShopping` check |
| Webhook registration script | `scripts/reregister-telegram-webhooks.ts:20-54` iterates `channelType:'telegram'` (`:118-125`), checks `webhookUrl/credentials/botToken/secretToken`, `setWebhook({allowedUpdates:['message','callback_query']})` — no shop gate |
| Inbox UI + connection | `workspace/app/workspace/inbox/page.tsx` (thread/queue; orders as context tab, not gate); `telegram-bot-api.client.ts:109-120 setWebhook`, `:318-322 setMyCommands`; commerce `setCommands:1931-1940` is best-effort menu-only from gated `showMenu` |
| Agent-created orders | `order-creation.service.ts:168-382 createManagedAgentOrder` (`createdBy=agentId`, `expiresAt=null`) — **not** commerce-gated; do not gate |

### B4. Known gaps (already found, still open)

1. `replaceBotOrder:385-440` does not re-check `orderingEnabled` — a replace can succeed while ordering is off (relies on commerce caller + `createBotOrder` path). The tenant-flag change must add the check here, not just at entry.
2. Projector `:134-137` does not check `orderingEnabled` (relies on adapter throw). Keep as-is for template flag (check template + `shopEnabled`), but document that ordering-only-off still projects.

---

## C. Effective-flag rule

Today (two independent channel flags + plan):

- `commerceActive(channel) = channel.channelType==='telegram' && channel.configuration?.telegramShopping?.shopEnabled === true` (`telegram-commerce.service.ts:1841-1843`; also `conversation.service.ts:330-336`, `order-activity.projector.ts:137`).
- `orderingActive(channel) = commerceActive(channel) && channel.configuration?.telegramShopping?.orderingEnabled === true` (`order-creation.service.ts:73-74`; commerce `:201,264`).
- Plus plan allowlist `allowedProviders includes 'telegram'` (`telegram-managed-bot.service.ts:514-571`, `conversation.service.ts:1105-1140`) — unchanged by this work.

Proposed (tenant flag ANDs with channel flags):

```ts
// single helper, e.g. backend-core-service/src/telegram-bot/telegram-template-policy.ts
isCommerceEnabled(tenantTemplate: 'commerce' | null, channel): boolean =
  tenantTemplate === 'commerce' && channel?.channelType === 'telegram'
    && channel.configuration?.telegramShopping?.shopEnabled === true;
isOrderingEnabled(tenantTemplate, channel): boolean =
  isCommerceEnabled(tenantTemplate, channel)
    && channel.configuration?.telegramShopping?.orderingEnabled === true;
```

- Compute once per update at the commerce entry (`handle():146`), pass down / re-query in `createBotOrder`/`replaceBotOrder`, `recordTelegramShoppingActivity`, projector `project()`. Replace the scattered `shopEnabled!==true` / `orderingEnabled!==true` reads with these two helpers so the tenant flag cannot be forgotten at one call site.
- Hot-path loading: `handle()` already loads the channel (`this.channel(event.channelId)`); add one tenant-settings load beside it (keyed by `channel.tenantId`). Cache short-TTL (e.g. 30–60 s in-process or Redis) with invalidation on settings update; correctness first — a stale-true window briefly allows new commerce, a stale-false window only suppresses new commerce (open-order settlement paths stay open regardless, see §D). Do not join tenant settings into every channel query; keep the helper signature `(tenantTemplate, channel)` so unit tests can inject either side.

---

## D. Behavior when the template is turned off mid-flight

State machine (implemented): `order.entity.ts:38-55` — `status pending|confirmed|rejected|cancelled` (default `pending`), `payment_status unpaid|paid`, `delivery_status packed|…`, `expires_at nullable` (bot orders set, agent orders `null`), `paymentSubmittedAt` = awaiting-review marker (no separate `payment_submitted` status). Transitions `order-transition.service.ts:44-56`: `pending→confirmed|rejected|cancelled`; `rejected→pending` (customer-only, retry-capped) `|cancelled`; `confirmed→cancelled` (blocked if out for delivery/delivered). Payment changes only on `pending|confirmed` (`:198`). Reservations: `order-item-reservation.entity.ts` + `order-reservation.service.ts` — `active|converted|released`, exactly-once `release(reason)` / `convert()` (stock decrement + `stock_movements` row) / `restoreConverted()` on `confirmed→cancelled`. Sessions: Redis-only `telegram:session:{tenantId}:{channelId}:{telegramUserId}`, 30 min TTL, draft-only (server re-reads price/stock at confirm); loss → `missing_session/version_mismatch` → `This menu expired.` + fresh menu (`telegram-commerce.service.ts:840-941`, `telegram-bot.router.ts:30-104`; spec `:188-213`). Payment proof: `telegram-commerce.service.ts:170-174,1350-1451` (largest photo/doc → `canAcceptTelegramProof:1365-1403` → `mirrorTelegramProof:1453-1483` via `mediaLibrary.createUpload(purpose:'message-media')` → `submitTelegramProof:1418-1435` to `orders.attachments[]` + `paymentSubmittedAt`; no eligible order → silent fall-through to inbox). Workspace review: `order.controller.ts:115-169` (`PUT :id/status`, `:id/payment-status`, `:id/attachments`) — no shop gate. Expiry: `order-expiry.worker.ts:32-101` every 60 s, `expires_at<=now AND status IN (pending,rejected)` → `cancelled/reason:expired` (releases reservation); `submitPaymentProof` never clears `expiresAt`, so **awaiting-review orders still expire** (contradicts `step3_design.md:57,149`); `notify()` dead code, real DM via projector. Projector: `order-activity.projector.ts:73-118` polls `domain_events` 1 s, gate `:134-137` skips everything when `shopEnabled!==true`, DMs only on `rejected` and `cancelled+expired` (`:216-235`).

| Situation | Today | With template off (recommended) |
|---|---|---|
| Mid-browse (list/detail/quantity, no stock held) | Callbacks route; session in Redis | Next callback: entry gate fails → `Shop unavailable.` toast + fall-through to inbox; session kept but inert. Re-enable: old buttons version-mismatch → `This menu expired.` + fresh menu |
| Mid-checkout draft (name/phone/address, no order yet) | Text consumed into session (`:256-352`) | Next text: template gate fails before checkout branch → falls to inbox as a normal message; draft stays stale until TTL; no order created. Acceptable (nothing reserved) |
| Confirm racing disable | `createBotOrder` txn (advisory lock + idempotency + stock check) | Must fail closed: tenant-flag check inside `createBotOrder`/`replaceBotOrder` txn → `409` + `We could not place that order…`; no partial order. Fix `replaceBotOrder` gap first |
| Open `pending/unpaid` with `expiresAt` (stock reserved `active`) | Expiry worker cancels+releases at deadline; projector DMs on expiry | **Keep expiry worker + projector running.** Do not gate them on the tenant flag. They are the only exactly-once release path; stopping them strands `active` reservations against stock |
| `pending/unpaid + paymentSubmittedAt` (awaiting agent review) | Still expirable (code); queue = `paymentSubmittedAt IS NOT NULL`; agents review via status/payment endpoints | Keep review endpoints open; agents confirm/reject/mark-paid normally. Decide expiry-carve-out vs agent SLA (open: current code expires awaiting-review orders — see risk §G) |
| `rejected/unpaid` in retry window (reservation kept `active`, 12 h default) | Customer re-upload auto-flips `rejected→pending` (retry-capped) then attaches | With template off, proof intake is commerce-gated → re-upload falls to inbox. Agent can still link proof via `PUT :id/attachments` and flip status manually — document this as the drain path |
| Payment screenshot/text while awaiting proof | Photo eligible → attach + `payment_proof_submitted` event (unless duplicate `fileId`); text → inbox, mode stays | Photo → inbox as normal message (never orphan: same as today's no-eligible-order path `step4:97-105`); text → inbox. Agent links the image from the thread via attachments endpoint |
| Buttons/menus already sent | Strict version guard → `This menu expired.` + re-menu on mismatch | Same, preceded by `Shop unavailable.` while off; no state change; safe |
| Re-enabling | Redis drafts gone (TTL); one `expired` + menu per stale client; QR cache auto-invalidates on token change; unprocessed `domain_events` replay | No re-registration needed (webhook untouched). Checklist: projector/worker lag, `hasEnabledMethod` (else `payment_unavailable`), expect one `expired` per stale client |

**Recommended default disable semantic:** stop **new** commerce interactions at the entry + ordering gates (single helpers from §C); keep **all** settlement paths running — expiry worker, activity projector, agent status/payment/attachments review, agent-created orders, inbox/outbound/webhooks. Never set channel `shopEnabled=false` as the implementation (that would also silence projector DMs for open orders); the tenant flag alone suppresses new commerce while open orders drain. Snapshot open `orderNumbers/paymentSubmittedAt/expiresAt/activeQty` before flipping so agents can proactively message affected customers.

---

## E. Existing tenants and defaults

### E1. What marks "already using commerce"

- Primary: `tenant_channels.configuration.telegramShopping.shopEnabled === true` (strict). Entity `tenant-channel.entity.ts:80-82`; type `telegram-commerce.service.ts:76-84`; helper `:1841-1843`. Absent/unset = disabled.
- Corroborating: `orderingEnabled === true` (`order-creation.service.ts:69-74`); orders with bot origin (`createBotOrder` default `source:'telegram'` — `order-creation.service.ts:25,67,131,296,340,342,362,426,455-461,488,528-530`; proof `source:'telegram'` — `order-transition.service.ts:170,256-257`); `customers.provider='telegram'` + `channel_id`; `status_history @> {source:telegram}`.
- Rollout note: `docs/telegram_bot/plan_task.md:112 R5 (done)` — per-channel `shopEnabled` default false, no migration enablement; `jjk_bot` enabled explicitly after deploy via CLI. `P6-T10:215` still defers any UI toggle.

### E2. Read-only SQL (do NOT run — operator only)

```sql
-- Read-only: tenants/channels currently using commerce (SELECT only, no writes).
SELECT t.id AS tenant_id, t.tenant_code, t.company_name, t.status AS tenant_status,
       c.id AS channel_id, c.channel_type, c.channel_name, c.display_name,
       c.status AS channel_status, c.connection_status,
       c.configuration->'telegramShopping'->>'shopEnabled'     AS shop_enabled,
       c.configuration->'telegramShopping'->>'orderingEnabled' AS ordering_enabled,
       c.configuration->'telegramShopping'->>'currency'        AS shop_currency,
       (SELECT count(*) FROM orders o JOIN customers cu ON cu.id = o.customer_id
         WHERE cu.channel_id = c.id AND (o.status_history::text ILIKE '%telegram%')) AS telegram_linked_orders
FROM tenants t JOIN tenant_channels c ON c.tenant_id = t.id
WHERE c.channel_type = 'telegram'
  AND ((c.configuration->'telegramShopping'->>'shopEnabled') = 'true'
    OR (c.configuration->'telegramShopping'->>'orderingEnabled') = 'true')
ORDER BY t.tenant_code, c.created_at;
```

### E3. Default + backfill recommendation

- New column default: **NULL = no template (off)**. Commerce is pilot-only; no tenant gets commerce bymerely existing.
- Backfill: set `telegram_bot_template='commerce'` only for tenants returned by the query above (expect: the `jjk_bot` pilot tenant + any fixture tenants). Everyone else stays NULL. This preserves `jjk_bot` exactly (effective rule still requires channel `shopEnabled`, which stays `true` there) and changes nothing for all other tenants (their channel flags are already false/absent).
- Effect on `jjk_bot`: keeps working with zero action, provided the backfill runs in the same deploy as the enforcement code (or enforcement treats "no settings row yet" as allow during the migration window — safer to backfill first, then enforce). `jjk_bot` is the BotFather-username pilot channel (`docs/telegram_bot/plan_task.md:44,112,131,141` procedure: deploy → `telegram:shop:set --channel=<uuid> --enabled=true` → smoke `/start`/callbacks/checkout/Orders); it is not a tenant code, seed, or migration — the only repo hit is that plan line.

---

## F. Settings storage fit

Against §A findings and `docs/tenant_settings/plan_task.md` Phase 1 schema (`tenant_channel_settings` table + `meta_apps` table, both proposed/not-yet-built):

- **Recommend option (2): nullable `telegram_bot_template varchar` with `CHECK (telegram_bot_template IN ('commerce'))` on `tenant_channel_settings`.**
  - Why not (1) boolean: a boolean burns the "which template" question; the task already foresees more templates (e.g. booking). A varchar with a CHECK constraint adds the next template with a one-line migration instead of a new column per template, while today's only valid value documents intent.
  - Why not (3) template-entity reference: `ChannelTemplate` is a shared connection-defaults table with no tenant/channel linkage and no commerce content (§A2); referencing it would couple per-tenant commerce enablement to global rows operators edit for webhook purposes. The future versioned tenant payment config (`step4:30-55`) is also not built and is payment-methods, not a template assignment — revisit only if Phase 6 builds a real tenant-template table, at which point this varchar becomes its FK.
  - Semantics: `'commerce'` = tenant may use the commerce template (still ANDed with channel `shopEnabled`/`orderingEnabled`); NULL = off. Column default NULL; backfill per §E3.
- Hot-path reads: commerce entry `handle()` runs on **every** Telegram update and already loads the channel; add one tenant-settings fetch by `channel.tenantId` beside it (§C). Short-TTL cache (30–60 s) with invalidation on settings write is sufficient; stale-true only admits new commerce briefly, stale-false only suppresses new commerce — settlement paths (§D) never consult the flag.
- Ownership/UI: platform-console `/platform-console/merchants/[merchantId]` channel-settings tab, platform-admin only (`super_admin|ops_admin`, same `canManage` pattern as the merchants detail page), confirm dialog, audit-logged. Workspace: when the tenant template is off, hide commerce settings/shop UI affordances (payment-method commerce hints, Orders-from-bot entry points) but keep normal chat, channel connect, inbox, and agent order review fully visible. Effective-settings endpoint (plan task 1.5) exposes `{telegram:{template, commerceEnabled}}` for gating.

---

## G. Risks

1. **Gating too early / in a shared path breaks plain messaging.** The flag must be checked only at §B2 commerce-only points, never in `ingestProviderMessage` (`conversation.service.ts:653-690`), `channel-adapter.service.ts:57-129 sendMessage`, onboarding, `reregister-telegram-webhooks.ts`, or inbox rendering. A check placed before the `handled:false` fall-through (`telegram-commerce.service.ts:153-161,191`) or inside the ingestion controller's else-branch (`internal-ingestion.controller.ts:56-61`) would silently drop normal chat. Mitigation: helpers take `(tenantTemplate, channel)` and are called only from commerce code + `createBotOrder`/`replaceBotOrder` + `recordTelegramShoppingActivity` + projector; negative test (template off + plain text → ingested) mandatory.
2. **Awaiting-review expiry.** `submitPaymentProof` never clears `expiresAt`, so the expiry worker can cancel an order the customer already paid-proofed while the agent queue still shows it. With the template off this is more likely to strand a paid customer (proof falls to inbox, no auto-attach). Fix or SLA before relying on disable: either clear `expiresAt` on proof submit, exclude `paymentSubmittedAt IS NOT NULL` from the worker, or define an agent review SLA shorter than the expiry window.
3. **Projector silence.** The projector early-returns the whole projection (including inbox alert + websocket) when commerce-gated (`:134-137`). If the tenant flag is added to that condition, open-order events during template-off go fully silent. Recommended: keep projector running for settlement event types during template-off (or gate only `placed`/browse-summary types), so agents still see confirm/reject/expire activity.
4. **Stale-callback confusion.** Post-disable callbacks answer `Shop unavailable.` while stale-session callbacks answer `This menu expired.` — two toasts for overlapping causes. Keep both (correct layer each), but the console confirm dialog must say callbacks stop working, not just menus.
5. **Specs/tests encoding the old assumption.** `telegram-commerce.service.spec.ts:131-169`, `telegram-checkout.spec.ts:54-56,152-162,223`, `order-activity.projector.spec.ts:29` construct channel-only fixtures; earlier plan items 2.1/4.4/Q4 assumed messaging-level disable. All need tenant-template fixtures + the new negative test. Grep `TELEGRAM_DISABLED_FOR_TENANT|telegram_enabled|acknowledge_without_ingestion` for plan-2.1 leftovers that must be re-scoped to commerce-only.
6. **Security/audit.** Toggle is platform-admin only, `@AuditLog({action:'tenant_telegram_template_updated'})` on write (pattern: `logging/decorators/audit-log.decorator.ts:3-11`, interceptor `logging/interceptors/logging.interceptor.ts:115-165`, `redactSensitiveData` — no secrets involved, only the enum value). Reads unaudited. State visible to platform admins (full) and to the tenant via effective-settings (their own template value only, no cross-tenant leak). No PII in the flag.

---

## PHASE 2 — Enforcement checklist

| Enforcement point | File:line | Current gate | Change needed | Risk to plain messaging |
|---|---|---|---|---|
| Commerce entry | `telegram-bot/telegram-commerce.service.ts:153-161` | `shopEnabled===true` else `handled:false` (+toast) | `isCommerceEnabled(tenantTemplate, channel)` else same fall-through | **high** — wrong placement breaks all bot chat; keep fall-through exact |
| Checkout input + start | `telegram-commerce.service.ts:175-183,194-210,262-272` | `orderingEnabled===true` | `isOrderingEnabled(tenantTemplate, channel)` | low — inside commerce-only branch |
| Callbacks (browse/detail/qty/orders) | `telegram-commerce.service.ts:840-941,986-993,1133-1149,1244-1268,1514-1610,1718,1737` | entry + ordering sub-gates | pass tenant template into handlers; same toasts | low — unreachable when entry fails |
| Confirm/replace checkout | `telegram-commerce.service.ts:392-447,624-670` | delegates to creation service | inherit via creation-service checks | low |
| Payment proof intake | `telegram-commerce.service.ts:168-174,1365-1451` | session/order eligibility | add tenant-template to `canAcceptTelegramProof`; ineligible → fall-through to inbox (never swallow) | **med** — swallowing loses proofs; must fall through |
| `createBotOrder` | `order/order-creation.service.ts:65-78` | `orderingEnabled!==true → 409` | also reject when `tenantTemplate!=='commerce'` (inside txn, before stock checks) | low — creation path only |
| `replaceBotOrder` | `order/order-creation.service.ts:385-440` | none (gap) | add same tenant+ordering check | low — creation path only |
| Shopping activity recorder | `conversation/conversation.service.ts:319-345` | `shopEnabled!==true → shop_disabled` | `!isCommerceEnabled(...) → shop_disabled` (keep reason string) | **med** — over-gating kills browse analytics only, not chat; keep message ingestion untouched |
| Activity projector | `order/order-activity.projector.ts:120-137` | `shopEnabled!==true → return` | see §G3: keep settlement projecting during template-off; gate only new-commerce event types, or keep full gate + document agent-blindness | **med** — full gate silences open-order alerts |
| Expiry worker | `order/order-expiry.worker.ts:42-75` | ungated | **no change** (keep running) | **high** if gated — strands reservations |
| Expiry notify (dead) | `order/order-expiry.worker.ts:107-137` | dead code | no change (do not revive as part of this) | low |
| Browse-summary scheduler | `conversation/telegram-shopping-activity.scheduler.ts:12-16` | inherited | no change | low |
| Agent review endpoints | `order/order.controller.ts:95-187`, `order-transition.service.ts:148-190` | role + feature gates, no shop gate | **no change** (drain path) | **high** if gated — strands open orders |
| Agent chat orders | `order/order-creation.service.ts:168-382` | not commerce-gated | **no change** | high if gated |
| Ingestion (normal inbox) | `conversation/conversation.service.ts:653-690`, `internal-ingestion.controller.ts:56-61` | channel-disabled + plan only | **no change** — negative test pins this | **high** |
| Outbound sender | `channel-adapter/channel-adapter.service.ts:57-129` | channel-disabled + botBlockedAt | **no change** | **high** |
| Onboarding / reregister / inbox UI | `tenant/telegram-managed-bot.service.ts`, `scripts/reregister-telegram-webhooks.ts:20-54`, `workspace/app/workspace/inbox/page.tsx` | no shop gate | **no change** | high |
| Workspace commerce affordances | `workspace/app/workspace/orders/page.tsx`, `orders-settings/page.tsx:214-226`, inbox order tabs | none | hide/disable new-commerce entry points when template off; keep review | low |
