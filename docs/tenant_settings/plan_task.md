# Tenant channel settings — plan (Phase 2)

Based on `docs/tenant_settings/current_stage.md`. Phased checklist; each item is one-PR sized with files to touch and acceptance criteria. Design follows the task brief because the code confirms it is the best fit (shared platform app today, per-channel encrypted creds, shared webhook path, scope-based OAuth with no `config_id`).

Conventions: defaults keep current behavior unchanged (`facebook.mode=platform_one_click`, `telegram_bot_template=NULL` means the commerce template is off). No plaintext secrets in responses/logs. Every UI gate has a backend check.

---

## 0. Decisions locked by Phase 1 (why this design)

- Settings storage: new typed store (not unvalidated `tenants.feature_flags`). The shipped `tenant_channel_settings` table stores `facebook_mode` and nullable `telegram_bot_template`; the old `telegram.enabled` description is superseded.
- BYO Meta storage: new `meta_apps` table (no such table exists) with encrypted `app_secret`, per-tenant `verify_token`, optional `login_config_id` (nullable, Phase 1 proves scope-based login needs no config ID — see `current_stage.md §C4`).
- Resolver: new `MetaAppResolver.getMetaApp(tenantId)` — required because `META_APP_ID/SECRET`, `providerAppConfigId:'default-meta-app'` (`tenant.service.ts:3998`), and shared routing (`provider-webhook-url.util.ts:39-41`) hard-code one app.
- Webhook: **option (a) per-tenant path** (e.g. `/webhooks/messenger/:tenantKey` alongside shared `/webhooks/messenger/<platform-routingId>`). Justification in `current_stage.md §C6`: preserves signature-before-parse, unambiguous `(routingId,pageId)` resolution, keeps scoped idempotency keys; option (b) needs unverified-body secret lookup + globally unique verify tokens.
- OAuth: BYO uses **scope-based login** (same scopes as `dashboards/workspace/app/workspace/channels/page.tsx:455-456`); no Login config creation required. `login_config_id` stays optional for a future LFB migration.
- Telegram setting: **commerce-template toggle**, not a messaging kill-switch. Template-off plain messages continue through ingestion; stale commerce callbacks are acknowledged without ingestion. Webhooks, outbound chat, history, settlement and agent review remain outside this gate.

---

## Phase 1 — Schema + defaults + resolver (platform app only, no behavior change)

- [x] **1.1 Create `tenant_channel_settings` store + migration**
  - Evidence: `tenant-channel-settings.entity.ts` and migration `1791600000000` create the tenant-scoped table with `facebook_mode`, nullable `telegram_bot_template`, audit fields and timestamps; migration `1791900000000` adds Facebook mode. Missing rows resolve to platform mode and template off.
- [x] **1.2 Create `meta_apps` table + migration (platform row only)**
  - Touch: new `backend-core-service/src/channel/entities/meta-app.entity.ts` (`@Entity('meta_apps')`: `id uuid`, `tenant_id nullable` (NULL = platform app), `kind: 'platform'|'byo'`, `app_id varchar`, `app_secret_encrypted` (envelope, reuse `provider-credentials.util.ts:153-175`), `login_config_id nullable`, `verify_token_encrypted` or hashed lookup + `webhook_path_segment unique`, `status: 'pending'|'valid'|'invalid'|'needs_reconnect'`, `last_validated_at nullable`), migration; seed platform row from env (`META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_PROVIDER_APP_ROUTING_ID`) without logging values.
  - Acceptance: one platform row (`kind=platform, tenant_id IS NULL`); secrets encrypted at rest; GET never returns plaintext (masked `********` like `redactProviderCredentials:230-260`).
- [x] **1.3 Link channels to apps (nullable, back-compat)**
  - Touch: `backend-core-service/src/channel/entities/tenant-channel.entity.ts` add `meta_app_id nullable` FK → `meta_apps.id`; migration backfills existing messenger rows to platform app id (or leaves NULL = platform via resolver); keep `configuration.providerAppRoutingId` untouched.
  - Acceptance: existing channels resolve to platform app whether `meta_app_id` is NULL or set; no webhook URL change (stale-URL migrator `tenant.service.ts:4705-4737` untouched).
- [x] **1.4 Add `MetaAppResolver` service (platform/BYO branches, no fallback)**
  - Touch: new `backend-core-service/src/channel/meta-app-resolver.service.ts` `getMetaApp(tenantId): platform app`; wire into `tenant.service.ts:3959-4007 getInternalProviderAppWebhookConfig` and `:4009-4083 resolveInternalProviderAppPageChannel` behind the existing env behavior (no routing change yet).
  - Acceptance: unit tests: NULL settings → platform app; all existing webhook/verify/signature tests pass unchanged.
- [x] **1.5 Effective-settings read endpoint (platform admin + tenant self-read)**
  - Touch: `backend-core-service/src/platform-admin/platform-admin.controller.ts` add `GET tenants/:id/channel-settings` (`@Roles('super_admin','ops_admin',…)` + `@AuditLog` read? skip audit on read); `backend-core-service/src/tenant/tenant.controller.ts` add `GET /tenant/channel-settings/effective` (JWT+TenantGuard) returning `{facebook:{mode, businessVerified}, telegram:{enabled}, metaApp:{appId masked, status}}` for workspace gating.
  - Acceptance: workspace can `GET effective` with tenant token; platform admin can `GET` any tenant; no secrets in payload.

## Phase 2 — Enforcement + per-tenant webhook route (still platform-only traffic)

- [~] **2.1 Backend enforcement: `telegram.enabled`** — SUPERSEDED by the 2026-10-12 addendum. Do not build or use the old messaging-kill-switch acceptance criteria; the shipped replacement is the commerce-template gate tracked by T1–T10.
- [x] **2.2 Backend enforcement: `facebook.mode` (platform branch = no-op)**
  - Touch: same resolver call sites as 1.4 + `channels/page.tsx` OAuth entry + `route.ts:116-160` exchange (assert mode allows platform flow); `testChannelConnection:3721-3850` records `meta_app_id` used.
  - Acceptance: `mode=platform_one_click` behaves exactly as today; `mode=byo_app` without a valid BYO app → clear `BYO_APP_NOT_CONFIGURED` error (no silent fallback to platform app for sends).
- [x] **2.3 Per-tenant messenger webhook route (platform route untouched)**
  - Touch: `channel/provider-webhook-url.util.ts:39-41` add `buildByoMessengerWebhookUrl(baseUrl, tenantKey)`; `services/webhook-handler-service/src/app.controller.ts:169-217` accept `:channelId` = platform routingId **or** tenantKey; `app.service.ts:154-183,381-409,1374-1420,1422-1462,1464-1499` resolve app config by path (platform env branch vs `meta_apps.webhook_path_segment` branch), HMAC with resolved `appSecret` over `rawBody`, scope idempotency key by resolved `providerAppConfigId`; `tenant.service.ts:3959-4083` DB branch for BYO path.
  - Acceptance: existing shared URL + verify + signature + `(routingId,pageId)` resolution unchanged; new path returns 404 for unknown tenantKey; raw-body HMAC verified per-path; e2e covers GET challenge + POST signature + dedupe on `mid`.
- [ ] **2.4 Workspace effective-settings gating (UI only, paired with 2.1/2.2)**
  - Touch: `dashboards/workspace/app/workspace/channels/page.tsx:448-460,782-841,883-918`, `lib/channel-connection.ts:13-25`, `lib/api.ts` add `getEffectiveChannelSettings()`; hide/disable Telegram connect + Messenger BYO entry when disabled; surface `needs_reconnect` state.
  - Acceptance: UI hides options per effective settings, but direct API calls still enforced by backend (negative test: bypass UI → 409).

## Phase 3 — BYO UI / wizard + validation / health checks

- [ ] **3.1 Platform-admin settings form at `/merchants/:id`**
  - Touch/status: `dashboards/platform-console/app/platform-console/merchants/[merchantId]/page.tsx` has the `Channel settings` tab with mode buttons, write-only App Secret, optional Login config ID, Save/Validate, Live confirmation, status and URLs; no copy buttons, no Facebook mode-switch confirmation, and no Test webhook or health badge. Telegram disable has a confirmation dialog. `lib/api.ts` exposes the three Facebook operations.
  - Acceptance status: `super_admin|ops_admin` can edit and other roles are read-only; secrets are write-only; backend 409 messages pass through `apiRequest` and render via `messageFor` into `facebookMessage` (page `:108-111,537-556`). Copy buttons, Facebook mode-switch confirmation, Test webhook, and health badge remain unbuilt.
- [ ] **3.2 BYO Meta app CRUD + validation endpoints**
  - Touch: `platform-admin.controller.ts` add `GET|PUT tenants/:id/channel-settings`, `POST tenants/:id/meta-apps/validate`, `POST tenants/:id/meta-apps/test-webhook` with `@Roles('super_admin','ops_admin')` + `@AuditLog({action:'tenant_channel_settings_updated'|'meta_app_validated'|…})`; service encrypts via `encryptProviderCredentials`, generates `verify_token` (`randomBytes`, cf. `route.ts:203-206`) + unique `webhook_path_segment` (e.g. `t_<tenantKey>`); validation does Graph `GET /<app-id>?access_token=<app-id>|<app-secret>` and/or `debug_token` + page `subscribed_apps` read (new — current `test-connection` is presence-only per `integration app.service.ts:233-244`).
  - Acceptance status: valid credentials become `valid` only through the live-confirmed validation path; audit metadata is covered by `security-metadata.spec.ts`. The composite PUT validates both inputs before either write and returns fresh settings (`platform-admin.controller.ts:362-401`). `debug_token` and `subscribed_apps` health checks remain unbuilt.
- [x] **3.2a TOCTOU/concurrency hardening evidence**
  - The three writers are hardened in `backend-core-service/src/platform-admin/platform-admin.service.ts`: `updateTenantFacebookApp` (`:2720-2817`), `updateTenantFacebookLiveConfirmation` (`:2834-2874`), and `validateTenantFacebookApp` (`:2876-2989`). Each uses a targeted conditional UPDATE rather than saving a loaded entity across an await; rotate clears live confirmation and sets `pending` in the same UPDATE, and unchecking Live confirmation also sets `status='pending'` in that same guarded UPDATE (`:2851-2865`).
  - `MetaAppResolver.getMetaApp` now requires both `status='valid'` and `live_confirmed_at IS NOT NULL` for BYO rows; otherwise it returns the existing `BYO_APP_NOT_CONFIGURED` error (`meta-app-resolver.service.ts:93-105`).
  - The `updated_at` discriminator is precision-safe for PostgreSQL `timestamptz` via `date_trunc('milliseconds', ...)`; zero affected rows are conflicts for the two writers, and validation re-reads the row after a state-change miss.
  - Evidence: targeted settings writes are covered by 22 `tenant-channel-settings.service.spec.ts` tests; focused unit failures are limited to two pre-existing `tenant-billing.spec.ts` tests. The activation-race constructor was updated at `platform-admin-activation-race.integration-spec.ts:64-69`, and the race spec is 5/5. The console preserves BYO state on Telegram-only and mode saves (`page.tsx:515-545`).
- [x] **3.3 Tenant-aware OAuth for BYO (scope-based, no config ID)**
  As built (Decisions §1/§3 override the Touch text below): tenant connects via new core
  `POST tenant/channels/meta/state` + `POST tenant/channels/meta/exchange` (tenant JWT,
  owner/admin); app secret never leaves core; state single-use tenant+user-bound (Redis,
  10-min TTL); redirect URI must match the console display exactly; per-tenant App ID from
  effective settings, `config_id` when set (Advanced console field), else scopes; channel
  created with `tenant_channels.meta_app_id` stamped, page subscribed to that app,
  test-connection run. Distinct errors for wrong secret / unregistered redirect / non-live
  app; `BYO_APP_NOT_CONFIGURED` → 409 with no platform fallback. Live Meta verification
  still pending (requires deploy + real app).
  - Touch: `dashboards/workspace/app/workspace/channels/page.tsx:448-457` + `app/api/channels/meta/callback/route.ts:116-160,197-235` accept per-tenant App ID/secret via resolver (platform admins initiate BYO connect; tenant token still authorizes core `POST /tenant/channels`); `isValidRedirectUri:73-80` docs updated for each origin to register.
  - Acceptance: BYO connect with tenant's App ID completes `code→long-lived page token→channel→subscribed_apps→test-connection`; platform connect unchanged; wrong-secret error is explicit.
- [ ] **3.4 BYO setup checklist text (in-console + docs)**
  - Touch: console wizard copy + `docs/channel-setup/facebook-messenger-setup.md` BYO section: (1) create Meta app + enable Messenger product, (2) paste ZayOS webhook URL + verify token → Verify & Save, (3) subscribe fields `messages,messaging_postbacks,message_deliveries,message_reads`, (4) add OAuth redirect URI `<origin>/workspace/channels/meta/callback`, (5) set app Live; note: no Login config creation needed (scope-based), business verification informational only.
  - Acceptance: admin can complete BYO with only the three displayed values + App ID/secret; checklist reviewed against a real Meta dashboard.
- [ ] **3.5 Real health check (both modes)**
  - Touch: extend `tenant.service.ts:3721-3850 testChannelConnection` + `integration app.service.ts:233-244` messenger branch with Graph checks (`debug_token` on page token, `GET /{pageId}/subscribed_apps` contains platform/BYO app id, permission subset); store result in `configuration.health {status, checkedAt, details}` + `meta_apps.status/last_validated_at`.
  - Acceptance: revoked token / removed permission / unsubscribed page → `needs_reconnect` in UI; existing presence-only tests updated.

## Phase 4 — Monitoring + mode-switch flow + rollout hardening

- [ ] **4.1 Scheduled token/health monitor + Reconnect state**
  - Touch: new `backend-core-service/src/channel/messenger-health.monitor.ts` (cron, e.g. every 6 h, jittered; per-app concurrency cap) → sets `meta_apps.status`, channel `connectionStatus=error/needs_reconnect` (additive, do not clobber `disabled`), emits admin-visible warning; console surfaces `Reconnect` CTA in channel settings + channels tab (`[merchantId]/page.tsx:919` table).
  - Acceptance: revoked fixture detected within one interval; no mass-flap (per-channel backoff); monitor skips tenants with `facebook.mode` mismatched app.
- [ ] **4.2 Per-tenant usage on platform app + BYO off-ramp**
  - Touch: aggregate `x-app-usage/x-page-usage` from `messenger.client.ts:154-163` into `tenant_usage_events` or `rateLimitMetadata` (`tenant-channel.entity.ts:137-138`); platform-admin usage tab (`[merchantId]/page.tsx:835`) shows Messenger app-usage share; warn + suggest BYO above threshold.
  - Acceptance: heavy tenant identifiable; BYO migration link pre-fills wizard.
- [ ] **4.3 Transactional mode-switch operation**
  - Touch: `POST platform-admin/tenants/:id/channel-settings/mode-switch` (transaction: validate target app → `unsubscribe` old app (`DELETE /{pageId}/subscribed_apps` or `subscribed_apps` delete) **before** `subscribe` new → update `tenant_channels.meta_app_id` + `configuration` → reset reconnect state → `@AuditLog`); `mid` dedupe stays as safety net (`webhook-handler app.service.ts:432-458`); support revert-to-platform in same endpoint.
  - Acceptance: switch completes or rolls back; no window where both apps subscribed (assert via Graph read in test); duplicate `mid` delivered to both apps during switch ingests once (add global-`mid` guard or document residual double-key risk from `current_stage.md §F5`); audit entry present.
- [~] **4.4 Telegram disable/enable lifecycle** — SUPERSEDED by the 2026-10-12 addendum (settlement stays open, T5). Do not build.
  - Touch: `enable`: re-register webhooks for preserved channels (`scripts/reregister-telegram-webhooks.ts` logic as service, honoring `disabledPreviousStatus`), reactivate (`reactivateChannel:3604-3611` pattern); `disable` (soft default): set flag → edge ack + block outbound + block new, keep `webhookUrl` + history; explicit `deleteWebhook` button with confirm + `dropPendingUpdates` warning.
  - Acceptance: disable → in-flight outbox drains or fails with `CHANNEL_DISABLED` (defined), no worker crash-loop; re-enable restores without data loss; edge cases documented (existing channels, webhooks, in-flight orders, re-enable).
- [ ] **4.5 Tests**
  - Touch: extend `provider-credentials.util.spec.ts`, `provider-webhook-url.util.spec.ts`, `tenant-limits.spec.ts`, `tenant-disconnect.spec.ts`, `security-metadata.spec.ts` (new routes' roles+audit), new `meta-app-resolver.spec.ts`, `channel-settings.spec.ts`, `mode-switch.spec.ts`; webhook-handler `app.controller.spec.ts` + `test/app.e2e-spec.ts` (per-tenant path, signature isolation, `mid` dedupe); workspace `channel-connection.test.ts`; platform-console form tests if harness exists.
  - Acceptance: `npm --prefix backend-core-service test -- --runInBand` green (needs Postgres+Redis per AGENTS.md); dashboard `tsc --noEmit` + ESLint `--max-warnings=0` green.
- [ ] **4.6 Prod deploy / migration checklist + rollback**
  - Touch: runbook (this file + `docs/checklist/public-launch-engineering-checklist.md` if canonical): migration order (settings → meta_apps → `meta_app_id`), PM2 `--update-env` restart (`npm run pm2:start` vs `pm2:dev:start` per AGENTS.md; never mix process names), `CORE_API_URL` baked at dashboard build time, env additions (`PROVIDER_CREDENTIAL_ENCRYPTION_KEY` length≥32), smoke (`scripts/provider-credential-smoke.mjs`, `npm run smoke:api`), DEPLOY-GATE style gate if repo uses it.
  - Rollback: migrations reversible; resolver falls back to env platform app when tables/rows missing; new webhook path 404s closed; UI tab hidden behind no-op if API 404; mode-switch revert-to-platform runbook; no destructive backfill (NULL = platform).

---

## Rollout order (keep current behavior unchanged first)

1. Schema + defaults + resolver with only the platform app (Phase 1 above).
2. Enforcement + per-tenant webhook route, no BYO rows yet (Phase 2).
3. BYO UI/wizard + validation/health checks (Phase 3).
4. Monitoring + mode-switch flow (Phase 4).

## Known waivers

- The payment-stage1 QR test is the only full-integration failure; it is pre-existing at merge-base `4b67a8a0`.
- Two `tenant-billing.spec.ts` tests fail in the focused unit run; both are pre-existing and identical at merge-base `4b67a8a0` (also confirmed at `ef5ce1de`), and are unrelated to Facebook.

---

## Open questions for the product owner

(Only decisions the code cannot answer.)

1. Should tenants ever self-serve the mode switch later, or is it platform-admin only? (Changes permission model: workspace `owner|admin` roles + tenant audit log vs platform audit log design.)
2. Who pays for / owns the BYO Meta app review and business verification? Code stores verification as informational — is that acceptable to support, or must `Live mode` be enforced before `mode=byo_app` activates?
3. Should `login_config_id` ever become mandatory (LFB migration)? If yes, when, and who creates the Login configuration — ZayOS docs or tenant?
4. Telegram disable: is soft-disable (keep webhook + history, block traffic) the right default, or do you require `deleteWebhook` on disable for compliance? What is the SLA for in-flight orders at disable time (drain vs immediate fail)?
5. Rate-limit policy: at what per-tenant share of platform-app usage do we proactively offer/require BYO, and who contacts the tenant?
6. Health-check failure SLA: how quickly must `needs_reconnect` page admins (and does workspace show it to tenants, or platform-console only)?
7. Webhook path shape: is `/webhooks/messenger/:tenantKey` acceptable, or must it be `/webhooks/meta/:tenantKey` (requires keeping `facebook→messenger` normalization in both edge services)?
8. Data retention: when a tenant moves to BYO or disables Telegram, how long do we keep old app secrets / webhook deliveries / dead-letters?


## Decisions (answers to Open questions, 2026-10-12)

1. Mode switch — DECIDED: platform-admin only. No tenant self-serve.
   - The platform admin sets each tenant's facebook.mode in platform-console /merchants/:id.
   - platform_one_click tenant: workspace shows the normal one-click "Connect with Facebook" (ZayOS app).
   - byo_app tenant: ZayOS collects the Meta app values from the customer; the platform admin enters
     them in the console; after the app is validated the tenant connects Facebook through their own app.
   - Until a BYO app is configured and validated, workspace shows "Facebook setup is being prepared by
     our team" and hides the connect button (no silent fallback to the platform app).
   - Audit: platform audit log only. No workspace owner/admin permission changes needed.

2. BYO app ownership / verification — DECIDED:
   - Business verification is informational only (stored flag + health-check result), never a hard gate.
   - The Meta app must be in Live mode before mode=byo_app can be activated.
   - Proposed: the customer owns their Meta app, its App Review and business verification;
     ZayOS provides the setup checklist and support but does not own or pay for them.

3. login_config_id — PROPOSED:
   - Optional, never mandatory for now. Support both paths: if config_id is set, use it;
     otherwise scope-based login (same scopes as today).
   - Show the field under "Advanced" in the console.
   - Make it required only if testing with a throwaway customer-type Meta app shows that new apps
     force Facebook Login for Business. In that case the customer creates the Login configuration
     following a ZayOS guide, and the platform admin enters the config ID.

4. Telegram disable — DECIDED default: soft-disable
   (block new channels, stop inbound ingestion and outbound sends, keep webhook and history readable;
   deleteWebhook only as an explicit opt-in with a confirm dialog).
   In-flight orders — PROPOSED:
   - Block new bot orders immediately.
   - Existing orders stay in the database and agents can still confirm/cancel them from the workspace.
   - Expiry timers keep running so reserved stock is released normally.
   - No Telegram messages are sent while disabled; re-enable restores normal behavior.

5. Rate-limit policy — PROPOSED:
   - Track per-tenant usage on the platform app now (task 4.2), but set no automatic threshold yet.
   - After 2-4 weeks of real usage data, set the share at which we offer BYO.
   - Until then the platform admin contacts the tenant manually.

6. Health-check failure — PROPOSED:
   - Monitor runs every ~6 hours (per task 4.1).
   - needs_reconnect shows in platform-console immediately.
   - Workspace shows tenants a "Reconnect Facebook" banner, because they are the ones who re-authorize.
   - Email/chat alerts are a later addition.

7. Webhook path — DECIDED: /webhooks/messenger/:tenantKey for BYO tenants.
   The existing shared platform URL /webhooks/messenger/<routingId> stays unchanged.

8. Data retention — PROPOSED:
   - When a tenant moves BYO -> platform, keep the BYO app record inactive for 30 days (for rollback),
     then purge its secrets.
   - When Telegram is disabled, keep credentials and history; they are not deleted.
   - Webhook deliveries and dead-letters follow the existing retention rules; no new policy.

## Plan changes from review
- Task 4.3: the global mid guard is mandatory. Dedupe on channelId + mid, not providerAppConfigId.
- Before building 4.3, test with a test page and two Meta apps to confirm sending works after a switch
  and how Meta handles two subscribed apps on one page.
- Before finalizing the BYO form, test scope-based login with a throwaway Meta app of the type
  customers would create.
- Split delivery into Track A (settings table, telegram.enabled enforcement, console settings tab with
  Telegram toggle and read-only Facebook mode) and Track B (meta_apps, resolver, per-tenant webhook,
  BYO wizard, health checks, mode switch).
- **Track B open: duplicate-channel guard on concurrent exchange** (low priority). Two concurrent `meta/exchange` calls for the same Page can create two channels before either stamps `meta_app_id` (`meta-oauth.service.ts:~733-764`). Parity with platform route; fails closed. Mitigation: pre-check for existing active channel on `(tenantId, pageId, metaAppId)` or idempotency key on state. **OPEN** (accepted, no code change yet).

## Addendum 2026-10-12: Telegram setting redefined as bot-template toggle

CORRECTION: the per-tenant Telegram setting is NOT a messaging kill-switch. It toggles ONLY the
commerce template (welcome, product browse, checkout, orders, payment proof flow). Normal Telegram
bot messaging keeps working with the template off: customers message the bot, agents reply from the
inbox, webhooks stay registered, outbound sends and workers keep running. Full analysis in
`docs/tenant_settings/telegram_template_stage.md` (there is no `telegram_bot_template` entity today;
"the template" is the `TelegramCommerceService` flow + per-channel `telegramShopping` flags).

Superseded: task 2.1 (`telegram.enabled` messaging enforcement), task 4.4 (Telegram disable/enable
lifecycle with soft-disable/deleteWebhook), and the Q4 answer / Decisions §4 (soft-disable, block
inbound/outbound, in-flight order SLA). Everything Facebook/BYO (tasks 1.2-1.4, 2.2-2.3, Phase 3
except console Telegram parts, 4.1-4.3, 4.5-4.6, Q1-Q3, Q5-Q8) is unchanged. Track A now delivers a
template toggle, not a messaging toggle.

### Revised checklist (one PR per item)

- [x] **T1. Settings column.** Add `telegram_bot_template varchar nullable CHECK IN ('commerce')`
  default NULL on `tenant_channel_settings` (new table from task 1.1; file:
  `backend-core-service/src/tenant/entities/tenant-channel-settings.entity.ts` + migration).
  NULL = off. Acceptance: migration reversible; invalid value rejected; no existing behavior changes.
- [ ] **T2. Backfill pilot.** Set `telegram_bot_template='commerce'` for tenants returned by the
  read-only query in `telegram_template_stage.md §E2` (expect the `jjk_bot` pilot tenant + fixtures);
  all others stay NULL. Acceptance: `jjk_bot` effective commerce unchanged; everyone else off;
  backfill recorded in audit notes.
  Status: code ready (migration `1791600000000`), NOT verified in production — re-tick after deploy verification.
- [ ] **T3+T4. Commerce-only enforcement (merged, open).** Shipped behavior: single gate in
  `internal-ingestion.controller.ts:76-170` (template-off → direct ingest; stale callbacks
  answered, not ingested); commerce/order/projector/expiry files contain zero template
  references (verified by grep). Still open from the original split: the `telegram-template-policy.ts`
  helper consolidation (`isCommerceEnabled`/`isOrderingEnabled` + unit spec + per-site replacement
  at `telegram-commerce.service.ts:153-161`, `:175-183,194-210,262-272`, `:840-941`, `:168-174,1365-1451`,
  `order-creation.service.ts:65-78` and `:385-440`, `conversation.service.ts:319-345`) was never built —
  `telegram-template-policy.ts` does not exist; caching lives in `TenantChannelSettingsService`
  (20 s TTL) instead. Explicitly NOT touched (unchanged): `conversation.service.ts:653-690`,
  `channel-adapter.service.ts:57-129`, onboarding, `reregister-telegram-webhooks.ts`, inbox UI,
  agent review endpoints, agent chat orders.
- [x] **T5. Settlement stays open (mid-flight semantics).** Keep running with template off: expiry worker
  (`order-expiry.worker.ts:42-75`), activity projector settlement events, agent
  `PUT :id/status/payment-status/attachments` (`order.controller.ts:95-187`), agent chat orders.
  Projector `:120-137`: narrow the gate so open-order events still project (or keep full gate with
  documented agent-blindness — decided in review, default: narrow). Acceptance: open unpaid,
  payment-submitted, and rejected-window orders drain normally with template off (integration test).
- [x] **T6. Platform-console toggle UI.** Channel-settings tab on
  `dashboards/platform-console/app/platform-console/merchants/[merchantId]/page.tsx`:
  template switch (`commerce` / off), `super_admin|ops_admin` only, confirm dialog stating exactly
  what turns off (menus, browse, checkout, new orders, proof intake, order DMs for new events) and
  what keeps working (normal chat both directions, webhooks, inbox, agent review, expiry, history).
  Helpers in `platform-console/lib/api.ts`; `@AuditLog({action:'tenant_telegram_template_updated'})`
  on the backend write. Acceptance: role gating mirrors merchants page; dialog copy reviewed; audit
  entry contains only the enum value; secrets N/A.
- [ ] **T7. Workspace behavior.** When tenant template is off (via effective-settings endpoint from task
  1.5): hide/disable new-commerce affordances (bot-order entry points, commerce hints in orders
  settings) in `workspace/app/workspace/orders/page.tsx`, `orders-settings/page.tsx`,
  inbox order tabs; keep channel connect, normal chat, inbox, and agent order review fully visible.
  Acceptance: tenant with template off sees no shop UI but chats and reviews orders normally.
- [ ] **T8. Tests.** Extend `telegram-commerce.service.spec.ts:131-169`,
  `telegram-checkout.spec.ts:54-56,152-162,223`, `order-activity.projector.spec.ts:29` with
  tenant-template fixtures; add explicit test: template off + plain text → `handled:false` →
  `ingestProviderMessage` called (plain messaging keeps flowing); add test: template off +
  `/start` → `handled:false`, no menu sent. Update any spec encoding plan-2.1 messaging-disable
  assumptions. Acceptance: backend suite green; new negative tests fail if the flag leaks into
  ingestion/outbound.
- [ ] **T9. Deploy/backfill/rollback.** Order: T1 migration → T2 backfill (same deploy, backfill first)
  → T3-T5 enforcement → T6-T7 UI. Smoke: `jjk_bot` `/start`, stale-callback toast, checkout,
  Orders list, proof photo, plain-text-to-inbox with template off on a staging tenant. Rollback:
  revert enforcement (channel flags alone restore old behavior); column stays nullable-ignored;
  backfill needs no undo (values inert without enforcement code).
  Status: runbook code ready, deploy NOT verified in production — re-tick after the deploy + smoke steps above are executed.
- [ ] **T10. Docs sweep.** Mark tasks 2.1/4.4/Q4-superseded notes where they appear (this addendum is
  normative); keep `current_stage.md §D5-D6` as historical messaging-disable analysis, not the plan.

### Open questions (only what the code cannot answer)

1. Awaiting-review expiry: keep current code (proof-submitted orders can still expire) with an agent
   review SLA, or exclude `paymentSubmittedAt IS NOT NULL` from the expiry worker / clear `expiresAt`
   on proof submit?
2. Projector during template-off: narrow the gate to settlement events (recommended) or keep the full
   `shopEnabled` early-return (agents blind to open-order activity until re-enable)?
3. Second photo after proof submit: keep attaching as additional proof, or route to inbox once
   `paymentSubmittedAt` is set (matches `step4_design.md:101-103`)?
4. Tenant visibility: does the workspace show tenants their template state (e.g. "Shop template off —
   contact your platform admin"), or hide commerce UI silently?
5. Future templates (e.g. booking): is the varchar+CHECK shape (add value per template) the right
   reservation, or will Phase 6's versioned template table replace this column with an FK?
