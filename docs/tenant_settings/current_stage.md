# Tenant channel settings — current state (post-implementation rescan)

> HEAD: `22dbf9933aa15bdabacf9ddf4b609810d08ce8a0` on `feat/tenant_config`.
> Verification supplied for this stage: backend, webhook-handler, workspace, and
> platform-console `tsc --noEmit` all pass; focused unit specs are reported as
> 26/27 suites and 340/342 tests passing, with only two failures in `tenant-billing.spec.ts`.
> Those two failures are pre-existing, identical at merge-base `4b67a8a0` and
> `ef5ce1de`, and unrelated to Facebook. Webhook-handler Jest is 48/48; the
> activation-race spec is 5/5; the full integration result is 31 passed / 32 total tests, with
> only the payment-stage1 QR test failing, pre-existing at `4b67a8a0`. Migrations
> `1791600000000..1792000000000` all pass up/down/up on the disposable DB.
> `tenant-limits.spec` is 27/27 when `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` is set.
> Re-baseline limitations: the requested `zayos-graph`/`query_graph` tool was unavailable in
> this session, so claims were confirmed directly against HEAD source. The line-reference scan
> found 148 explicit `path:line` references across the three tenant-settings docs; references
> whose files were added after merge-base have no baseline counterpart. Integration results are
> measured at `22dbf993` as listed above; the activation-race spec and full integration suite were rerun there.

---

## Delta since Phase 1 (old claim → current reality)

| Area | Old claim (Phase 1 doc) | Current reality | Evidence |
|---|---|---|---|
| Settings store | No `tenant_channel_settings` table; only unvalidated `feature_flags` | `tenant_channel_settings` EXISTS: `tenant_id` PK/FK CASCADE, `telegram_bot_template varchar NULL CHECK IN ('commerce')`, `facebook_mode varchar DEFAULT 'platform_one_click' CHECK IN ('platform_one_click','byo_app')`, `facebook_business_verified boolean NULL`, `updated_by`, timestamps. No `telegram_enabled` column anywhere | `backend-core-service/src/tenant/entities/tenant-channel-settings.entity.ts:19-41`; migrations `1791600000000-AddTenantChannelSettings.ts:18-30`, `1791900000000-AddFacebookModeToTenantChannelSettings.ts:12-29` |
| Composite channel-settings PUT — **RESOLVED** | Separate writes could leave a partial update and response could omit current Facebook state | Inputs are validated up front; Telegram and optional Facebook-mode writes then run; response is a fresh `getTenantChannelSettings(id)`. Residual: operation remains non-transactional | `backend-core-service/src/platform-admin/platform-admin.controller.ts:362-401` |
| Console channel-settings state — **RESOLVED** | Mode switch or Telegram-only save could replace the settings object and hide BYO state | `applyChannelSettings` preserves `facebookMode` and `facebookApp` when the response omits them, keeping the BYO block visible and the selected mode correct | `dashboards/platform-console/app/platform-console/merchants/[merchantId]/page.tsx:515-545` |
| Settings service writes — **RESOLVED** | Whole-row persistence risked overwriting the other channel's columns | `patchSettings` performs targeted update, inserts when absent, and retries after unique violation. Telegram owns only template/updatedBy; Facebook owns only Facebook fields/updatedBy. The service spec now has 22 tests | `backend-core-service/src/tenant/tenant-channel-settings.service.ts:82-93,121-152,162-211`; `tenant-channel-settings.service.spec.ts` |
| Activation-race constructor — **RESOLVED** | Integration spec could not construct `TenantChannelSettingsService` after its dependency changes | Constructor call supplies the four required arguments; race spec passes 5/5 | `backend-core-service/src/platform-admin/platform-admin-activation-race.integration-spec.ts:64-69` |
| Missing-row default | N/A | Missing row → telegram `null` (off), `{facebookMode:'platform_one_click', facebookBusinessVerified:null}` | `backend-core-service/src/tenant/tenant-channel-settings.service.ts:36-59` |
| `meta_apps` | `not found` | EXISTS: `id`, `tenant_id NULL`, `kind platform\|byo`, `app_id`, `app_secret_encrypted`/`verify_token_encrypted` jsonb (AES-256-GCM envelope), `webhook_path_segment` unique, `login_config_id NULL` (settable via `PUT facebook-app`, consumed by the BYO dialog), `status pending\|valid\|invalid\|needs_reconnect\|retired DEFAULT pending`, `last_validated_at`, `live_confirmed_at NULL`, `live_confirmed_by NULL` (console Live-mode checkbox; `validate` sets `valid` only when confirmed); partial uniques (one `platform` row; one active BYO per tenant) | `backend-core-service/src/channel/entities/meta-app.entity.ts`; migrations `1791700000000-AddFacebookByoMetaApps.ts`, `1792000000000-AddMetaAppLiveConfirmation.ts` (up/down/up verified on the disposable DB) |
| Live confirmation | N/A (new, Decision §2) | `meta_apps.live_confirmed_at timestamptz NULL` + `live_confirmed_by uuid NULL` (entity + migration `1792000000000-AddMetaAppLiveConfirmation`, reversible, no backfill). Console checkbox writes/clears both (audited); `PUT facebook-app` re-save clears both and returns status to `pending`; **unchecking Live confirmation now sets `status='pending'` in the same guarded UPDATE** (`platform-admin.service.ts:2851-2865`); `validate` promotes to `valid` only when confirmed. `getMetaApp` now requires both `status='valid'` and `live_confirmed_at IS NOT NULL` for BYO (`meta-app-resolver.service.ts:93-105`). | `meta-app.entity.ts`; `platform-admin.service.ts:updateTenantFacebookLiveConfirmation/validateTenantFacebookApp/updateTenantFacebookApp`; console `page.tsx:1204-1212` |
| Platform seed | Env singletons only | Lazy seed on core startup: `MetaAppResolver.onApplicationBootstrap → ensurePlatformApp()`; reads `META_APP_ID`, `META_APP_SECRET\|MESSENGER_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN\|MESSENGER_VERIFY_TOKEN`, `META_PROVIDER_APP_ROUTING_ID\|MESSENGER_PROVIDER_APP_ROUTING_ID`; missing any → `logger.warn` naming the missing var(s), then skip (`return null`, no behavior change); upserts platform row `status:'valid'` | `backend-core-service/src/channel/meta-app-resolver.service.ts:14-22,49-62` |
| Encryption/key | Per-channel creds only | Same AES-256-GCM envelope reused for `meta_apps` secrets; key `PROVIDER_CREDENTIAL_ENCRYPTION_KEY \|\| TELEGRAM_TOKEN_ENCRYPTION_KEY \|\| JWT_SECRET` else throw | `meta-app-resolver.service.ts:13`; `provider-credentials.util.ts:153-175`; `platform-admin.service.ts:2694` |
| `tenant_channels.meta_app_id` | `not found` | Column EXISTS (`uuid NULL`, FK → `meta_apps(id) ON DELETE SET NULL`); NULL = platform in page-resolution predicate; strict equality on BYO path. WRITTEN by the 3.3 core exchange (`channelRepository.update(channel.id, {metaAppId})` with fail-closed cleanup); platform-route channels and pre-3.3 rows stay NULL (= platform) | `1791800000000-AddTenantChannelMetaApp.ts`; `tenant-channel.entity.ts:232-233`; `tenant.service.ts:4021-4025`; `meta-oauth.service.ts` stamp + cleanup |
| Resolver | `not found` | `MetaAppResolver`: `getMetaApp(tenantId)` (mode `byo_app` → BYO row must have `status='valid'` **and** `live_confirmed_at IS NOT NULL`, else `BYO_APP_NOT_CONFIGURED`; else platform row else `Platform Meta app is not configured`), `resolveByPathSegment` (unknown/retired → `Webhook route not found`), `decrypt`, `newVerifyToken`, `newWebhookPathSegment` (`t_<base64url>`). No BYO→platform fallback. | `meta-app-resolver.service.ts:93-105` (`getMetaApp`); `resolveByPathSegment` |
| Silent fallback | Risk (§F) | NO silent fallback: BYO branch throws instead of falling back; send path (`channel-adapter.service.ts:57-129`) never calls the resolver (per-channel creds only) | `meta-app-resolver.service.ts:23`; `not found (searched: getMetaApp\|MetaAppResolver\|BYO in src/channel-adapter)` |
| Webhook path | Shared `/webhooks/messenger/<routingId>` only | Per-tenant path BUILT: `buildByoMessengerWebhookUrl(base, tenantKey)` (segment validated `/^[A-Za-z0-9_-]{8,160}$/`); handler routes stay generic `@Get/@Post('webhooks/:provider/:channelId')`; per-path app-config lookup, per-path HMAC over `rawBody`, per-`(app,page)` channel resolution; shared platform route unchanged | `provider-webhook-url.util.ts:21-26,40-52`; `services/webhook-handler-service/src/app.controller.ts:169,193`; `app.service.ts:154-183,1390-1436`; `tenant.service.ts:3961-4027` |
| Signature isolation | Global app secret | Resolved per-path secret; platform-secret-on-BYO-path and cross-tenant cases covered by handler specs | `app.service.ts:1390-1436`; `app.controller.spec.ts:310,411,546-691` |
| Unknown tenant key | N/A | 404 via `resolveByPathSegment` → `NotFoundException('Webhook route not found')` | `meta-app-resolver.service.ts:24`; `tenant.service.ts:3981`; handler `app.service.ts:1458-1460` |
| Dedupe key | `messenger:{providerAppConfigId}:{channelId}:{providerEventId}` | NOW `messenger:{channelId}:{providerEventId}` + temporary legacy compat claim on the old app-scoped key first (either hit → duplicate). Delivery `messenger-delivery-<sender>-<watermark>-<mids>`, read `messenger-read-<sender>-<watermark>`, `message.mid` raw. Removal rule now encoded: `TODO(dedupe-compat, not before 2026-10-21)` at the claim site — delete only after 7 days of production traffic on the rekey (rekey commit `fabb3570`, 2026-10-14); confirm first prod deploy date before removing | `services/webhook-handler-service/src/app.service.ts:432-455,1160-1175` |
| `config_id` / LFB | `not found`, scope-based OK | WIRED: `login_config_id` set via `PUT facebook-app` (optional, blank clears; console Advanced field, prefilled), returned in tenant effective settings + admin GET (non-secret), consumed by the workspace dialog builder (`config_id` replaces `scope` when set) | `platform-admin.service.ts:updateTenantFacebookApp`; `tenant.controller.ts:85-102` (effective `loginConfigId`); `meta-oauth.service.ts:buildMetaOAuthDialogUrl`; `channels/page.tsx` BYO branch; console `page.tsx:1199` |
| OAuth per-tenant | Singleton App ID/secret | WIRED: core exchange resolves the tenant app via `MetaAppResolver` (secret server-side only); workspace builds the dialog with the tenant App ID + server state (`channels/page.tsx` BYO branch; `meta/callback/page.tsx` posts to core). Platform Next.js route unchanged (env singletons) | `meta-oauth.service.ts`; `tenant.controller.ts:channels/meta/*` |
| "Being prepared" copy | N/A (plan decision text) | BUILT: byo_app + status≠valid renders "Facebook setup is being prepared by our team" with no connect button (`OAuthConnectPanel` pending branch); core rejects with 409 `BYO_APP_NOT_CONFIGURED`. No dedicated Reconnect banner yet (only generic `Reconnect`/`Verify` labels) | `channels/page.tsx`; `meta-oauth.service.ts:resolveAppOrThrow` |
| Validate app | Presence-only `test-connection` | `POST …/facebook-app/validate` (audited as `tenant_facebook_app_validated`) does Graph `GET /<app-id>?fields=id,name` with `appId\|secret` → bad creds set `invalid`; good creds set `valid` + `lastValidatedAt` ONLY when `live_confirmed_at` is set, else hold at `pending` with a confirm-Live message; re-saving App ID/Secret clears the confirmation and returns to `pending`. **Conditional atomic UPDATE** (`platform-admin.service.ts:2795-2976`) uses millisecond-safe `updated_at` guards plus ownership/state predicates; zero affected rows → "state changed during validation" message, row re-read for response; stale failure write also guarded. Returns `webhookConfigured:false` always. `testChannelConnection` messenger branch STILL presence-only | `platform-admin.service.ts:updateTenantFacebookApp/updateTenantFacebookLiveConfirmation/validateTenantFacebookApp` |
| Health monitor/cron | None | STILL NONE: no cron, no `debug_token`/`subscribed_apps` read, no `configuration.health`, no writer of `needs_reconnect` (value exists in CHECK only) | `not found (searched: Cron(\|Schedule(\|messenger-health\|debug_token\|subscribed_apps read in backend-core-service/src)` |
| Mode switch | N/A | NO transactional endpoint: `PUT facebook-app` rotates verify token + sets mode `byo_app` + status `pending` (no unsubscribe/subscribe, no `meta_app_id` rewrite); mode-only PUT is a plain settings update; no revert-to-platform flow; no 30-day purge (only FK `ON DELETE SET NULL`) | `platform-admin.service.ts:2656-2673`; `not found (searched: mode-switch\|modeSwitch\|unsubscribe.*subscribed_apps\|revert-to-platform\|purge in backend-core-service/src)` |
| Per-tenant usage | Surfaces `x-app-usage` only | STILL TRUE: header captured into send-result metadata only; no aggregation, no usage-share UI. (`tenant_usage_events` table exists from earlier work; no messenger-usage writes found) | `messenger.client.ts:160`; `integration app.service.ts:88`; `not found (searched: x-app-usage\|tenant_usage_events writes in src/, services/)` |
| Console tab | `not found` | Channel-settings tab EXISTS on merchant detail: Telegram template switch + confirm dialog; Facebook mode buttons, App ID/Secret (write-only), Advanced optional Login config ID (prefilled, blank clears), Live-mode checkbox (gates `valid`; uncheck clears attestation), Save/Validate, status badge, webhook URL + verify token (masked `****`+last 4 except once in the save response) + redirect URI + last-validated display, setup-instructions copy. Role-gated `super_admin\|ops_admin`. NO copy buttons, NO confirm on mode switch | `merchants/[merchantId]/page.tsx:858,1121-1212,2597-2641`; `lib/api.ts` (`updateTenantFacebookApp` + `loginConfigId`, `updateTenantFacebookLiveConfirmation`) |
| Audit | Pattern documented | Telegram PUT (`tenant_telegram_template_updated`); Facebook app PUT (`tenant_facebook_app_updated`); live-confirmation PUT (`tenant_facebook_live_confirmation_updated`); validate POST (`tenant_facebook_app_validated`); spec asserts all three facebook actions + telegram, GET read unaudited | `platform-admin.controller.ts:352,~371,~390,~407`; `security-metadata.spec.ts` channel-settings block |
| Effective endpoints | `not found` | Tenant `GET /tenant/channel-settings/effective` → `{facebook:{mode,appId,status,loginConfigId}, telegram:{template}}`; admin `GET tenants/:id/channel-settings` → plus `webhookPathSegment, webhookUrl, verifyToken` (**masked** `****`+last 4 via `maskVerifyToken`; full value only in the `PUT facebook-app` rotate response), `oauthRedirectUri, lastValidatedAt, loginConfigId, liveConfirmedAt, liveConfirmedBy`. No app secret anywhere | `tenant.controller.ts:82-113`; `platform-admin.service.ts:getTenantChannelSettings` |
| Telegram model | `telegram.enabled` kill-switch analysis (§D5/D6) | SUPERSEDED: shipped model is commerce-template toggle `telegram_bot_template ('commerce'\|NULL)`, enforced ONLY in `internal-ingestion.controller.ts` (template-off → direct ingest; stale callbacks answered `Shop unavailable.` + not ingested). Commerce/order/outbound/webhook/onboarding/reregister untouched. NO `telegram-template-policy.ts`, NO `isCommerceEnabled` helper (design-only) | `internal-ingestion.controller.ts:76-86,127-170`; `not found (searched: isCommerceEnabled\|telegram-template-policy in backend-core-service/src)` |
| Telegram backfill | N/A | Migration backfills `'commerce'` for tenants with telegram channel `shopEnabled='true' OR orderingEnabled='true'` (flag-based, not name-based; `jjk_bot` covered by expectation, not by name) | `1791600000000-AddTenantChannelSettings.ts:32-37` |
| Telegram cache | N/A | 20 s in-process TTL (`CHANNEL_SETTINGS_CACHE_TTL_MS`), invalidated on update | `tenant-channel-settings.service.ts:15,123`; rollout doc `telegram_template_toggle_rollout.md:49-52` |
| Env drift | RESOLVED in PM2 config; deployment prerequisite remains | `MetaOAuthService` reads `WORKSPACE_ORIGIN`, then deprecated `FRONTEND_URL`; it ignores `FRONTEND_URLS` ordering. `WORKSPACE_ORIGIN` is now explicitly passed in both core API env maps (`ecosystem.config.js:223`, `ecosystem.dev.config.js:129`). It must still be present in the shell or env file before `pm2 start` and refreshed with `pm2 start ... --update-env`. | `meta-oauth.service.ts:64-82,196-206`; `.env.example`; ecosystem files |
| Docs drift | Runbook said shared app | FIXED: `docs/channel-setup/facebook-messenger-setup.md` table/step 9/verification bullet now split `platform_one_click` (shared ZayOS URL) vs `byo_app` (per-tenant URL); workspace channels page renders `messengerCallbackCopy(effective)` per mode (`channels/page.tsx:450-459` helper, both call sites) | `2e0db9b7` |
| Migrations `down` | N/A | All five tenant-settings/BYO migrations implement `down()`: `1791600000000`, `1791700000000`, `1791800000000`, `1791900000000`, `1792000000000`. `1791800000000` executed up AND down against docker postgres-test (verified live). `17916`, `17917`, `17919` down methods read-verified (reversible column/table drops). `1792000000000` down read-verified only (migration created, not run). | `17916/17917/17918/17919/1792000000000` |
| TODO/FIXME | N/A | One dated TODO in touched areas: `TODO(dedupe-compat, not before 2026-10-21)` at the legacy dedupe claim (`webhook-handler app.service.ts`); repo-wide `TODO\|FIXME` otherwise 0 hits | `not found (searched: TODO\|FIXME excluding the dedupe rule)` |

---

## Plan progress (counts from `node scripts/plan-progress.mjs`: `10/28 done (35.7%), 2 superseded (excluded)` —
> Phase 1: 4/5, Phase 2: 1/3, Phase 3: 1/5, Phase 4: 0/5, Revised: 3/9)

| Task | Status | Evidence | Notes |
|---|---|---|---|
| 1.1 settings store + migration | DONE | entity `:19-41`; `1791600000000`, `1791900000000` (both `down` OK) | Built as one table for both features; telegram part shipped in `17916`, facebook cols added later in `17919` |
| 1.2 `meta_apps` + platform seed | DONE | entity `meta-app.entity.ts:4-20`; `1791700000000`; `ensurePlatformApp()` `meta-app-resolver.service.ts:14-22,49-62` (warns with missing env names on skip) | Was: admin GET returned verify token plaintext — FIXED by masking (`maskVerifyToken`, full value only in rotate response) |
| 1.3 link channels (`meta_app_id`) | PARTIAL (migration DONE + verified live) | `1791800000000` (nullable FK, no backfill, reversible); NULL=platform predicate `tenant.service.ts:4021-4025`. Migration executed up AND down against docker postgres-test 2026-10-15: up → column+FK present, 0 pending; revert ×2 → column gone; re-run → present again | Column written only by the 3.3 exchange; platform-route rows stay NULL |
| 1.4 `MetaAppResolver` platform branch | DONE | `meta-app-resolver.service.ts:23-27`; wired into `tenant.service.ts:3981,4003`, `tenant.controller.ts:78`, module `tenant-channel-settings.module.ts:7,11-12` | No silent fallback, verified |
| 1.5 effective-settings reads | DONE | `tenant.controller.ts:74-80`; `platform-admin.controller.ts:340-343` | Admin verify token masked; `platform-admin-channel-settings.spec.ts` (7 tests) covers mask/reveal/validate |
| 2.1 `telegram.enabled` enforcement | SUPERSEDED (`[~]`, excluded from counts) | Addendum `plan_task.md:190-194`; shipped T-model instead | Do not build; see T1–T10 |
| 2.2 `facebook.mode` enforcement (platform branch) | PARTIAL | Resolver branch + `BYO_APP_NOT_CONFIGURED` → 409 in the 3.3 exchange (`meta-oauth.service.ts:resolveAppOrThrow`); workspace `oauthUrl` null-gate (`channels/page.tsx`); `test-connection` still presence-only | Mode stored + enforced at connect; `meta_app_id` stamped by the exchange (platform rows stay NULL) |
| 2.3 per-tenant webhook route | DONE | `buildByoMessengerWebhookUrl` (`provider-webhook-url.util.ts:21-26`); generic route + per-path resolve/HMAC (`app.controller.ts:169,193`; `app.service.ts:154-183,1390-1436`); dedupe `app.service.ts:432-447`; unknown-key 404 | Negative checks covered in handler specs; BYO URL-builder has no unit spec (gap) |
| 2.4 workspace effective gating | PARTIAL | `getEffectiveChannelSettings` fetch; `oauthUrl` BYO branch; "being prepared" panel built (no button when BYO invalid); BYO-valid dialog built from effective App ID + server state (`handleConnect` BYO branch) | Reconnect banner not built; telegram template not consumed in workspace |
| 3.1 console settings form | PARTIAL | Tab + fields + role gating + telegram confirm; Facebook: mode buttons, App ID/Secret, Advanced `login_config_id` (prefilled), Live-mode checkbox, Save/Validate, masked token display; helpers incl. `updateTenantFacebookLiveConfirmation` | Missing: copy buttons, mode-switch confirm |
| 3.2 BYO CRUD + validation endpoints | PARTIAL | `PUT channel-settings` + `PUT facebook-app` (accepts `loginConfigId`, clears live confirmation on re-save) + `PUT facebook-app/live-confirmation` (audited) + `POST validate` (audited as `tenant_facebook_app_validated`; `valid` only when live-confirmed) | Validation ≠ plan (no `debug_token`/`subscribed_apps`) |
| 3.3 tenant-aware OAuth (scope-based) | DONE (unverified live) | Core `POST tenant/channels/meta/state` + `POST tenant/channels/meta/exchange` (owner/admin, tenant JWT); secret never leaves core; single-use tenant+user state (Redis 10-min, atomic Lua consume); exact console redirect URI (`resolveWorkspaceBaseUrl`, shared by display + check); App ID from effective settings, `config_id` when set else scopes; channel created + `meta_app_id` stamped + page subscribed to that app + test-connection; per-tenant+user rate limits (state 30/min, exchange 10/min → 429); distinct wrong-secret/redirect-unregistered/non-live errors, generic `META_UPSTREAM_ERROR` otherwise (code/subcode logged, never secrets); `BYO_APP_NOT_CONFIGURED` → 409, no fallback; specs: `meta-oauth.service.spec.ts` (16, mocked Graph), `meta-app-resolver.spec.ts` (9) | Platform Next.js route untouched; live Meta verification pending (needs deploy) |
| 3.4 BYO checklist text + docs | PARTIAL | Console setup copy (`page.tsx:1186`); rollout doc exists; per-mode webhook copy DONE (setup doc table/step 9/verification + `messengerCallbackCopy` in workspace) | No evidence of real-dashboard review |
| 3.5 real health check | NOT STARTED | Presence-only branches unchanged | — |
| 4.1 monitor + Reconnect state | NOT STARTED | `not found (searched: Cron(\|messenger-health\|needs_reconnect writer)` | `needs_reconnect` exists only as a CHECK value |
| 4.2 per-tenant usage + off-ramp | NOT STARTED | Header captured only (`messenger.client.ts:160`) | — |
| 4.3 transactional mode-switch | NOT STARTED | `not found (searched: mode-switch\|unsubscribe.*subscribed)`; global-`mid` guard replaced by new-key dedupe + legacy compat claim | Plan's "mandatory global mid guard" satisfied differently (key no longer app-scoped) |
| 4.4 telegram lifecycle | SUPERSEDED (`[~]`, excluded from counts) | Addendum | Do not build |
| 4.5 tests | PARTIAL | Backend tsc plus webhook-handler, workspace, and platform-console tsc pass; focused unit specs are 26/27 suites and 340/342 tests, with only two pre-existing `tenant-billing.spec.ts` failures; webhook-handler Jest is 48/48; activation-race is 5/5; full integration is 3/4 suites and 31/32 tests, with only the pre-existing payment-stage1 QR failure. Migrations `1791600000000..1792000000000` pass up/down/up on the disposable DB (separate audit). | Missing: dashboard/e2e and a clean full backend suite. |
| 4.6 deploy checklist + rollback | PARTIAL | Reversible migrations (5, incl. pending live-confirmation); telegram rollback inert-rows claim holds (gate is additive) | BYO rollback live-unverified; rollout order now settings → meta_apps → `meta_app_id` → facebook cols → live-confirmation (`17916 < 17917 < 17918 < 17919 < 1792000000000`) |
| T1 settings column | DONE | entity `:20,28-29`; `1791600000000:18-26` | — |
| T2 pilot backfill | OPEN (code ready, not deployed) | `1791600000000:32-37` flag-based backfill | Unticked in plan: migration not confirmed run in production; `jjk_bot` inclusion is an expectation (`telegram_template_toggle_rollout.md:35-37`) — verify at deploy per list-A check |
| T3+T4 commerce enforcement (merged) | OPEN | Single gate shipped (`internal-ingestion.controller.ts:76-170`); helper consolidation (`telegram-template-policy.ts`, per-site replacement) never built — merged into one open plan task | Plan now carries one `T3+T4` checkbox (open); old separate T3-PARTIAL/T4-DONE rows retired |
| T5 settlement stays open | DONE (by construction) | Expiry/projector/agent endpoints untouched | — |
| T6 console toggle UI | DONE | `page.tsx:1137-1166,2597-2641`; `lib/api.ts:1721-1739`; audit `platform-admin.controller.ts:352` | Dialog copy matches plan's stop/keep semantics |
| T7 workspace behavior | NOT STARTED | `effective.telegram` fetched but unconsumed (`channels/page.tsx:710` vs `oauthUrl:450-463` facebook-only); `not found (searched: telegramBotTemplate\|commerceEnabled in dashboards/workspace/app)` | Commerce affordances still visible to template-off tenants |
| T8 tests | PARTIAL | `internal-ingestion.controller.spec.ts:6-201` (off→ingested, stale-callback toast, unknown-channel chain); `tenant-channel-settings.service.spec.ts` (null default, invalid `'booking'` rejected, TTL) | Commerce/checkout/projector specs not extended (acceptable — they don't touch the flag) |
| T9 deploy/backfill/rollback | OPEN (code ready, not deployed) | `telegram_template_toggle_rollout.md:26-63` | Unticked in plan: deploy + smoke steps not verified in production. Code matches: additive gate, reversible `down`, 20 s converge note |
| T10 docs sweep | PARTIAL | `[~]` superseded markers applied to 2.1/4.4 in plan; shared-app copy fixed; addendum normative | Checkbox left unticked for owner sign-off |

---

## A. Merchant / tenant model

### A1. Tenant entity and table — CHANGED
- `Tenant` unchanged (`backend-core-service/src/tenant/entities/tenant.entity.ts:16`; `feature_flags` still unvalidated `:104-105`).
- NEW: `TenantChannelSettings` (`tenant-channel-settings.entity.ts:19-41`) — see Delta. Missing row = template off + `platform_one_click`.

### A2. Adjacent settings tables — UNCHANGED
- `tenant_feature_configs`, `platform_settings` as before (Phase 1 §A2 still accurate; no facebook/telegram wiring added to either — `not found`).

### A3. Per-tenant / per-channel flags — CHANGED
- `telegram_bot_template` ('commerce'/NULL, tenant-level) ANDs nothing in commerce code — it gates at ingestion entry only; channel `telegramShopping.shopEnabled/orderingEnabled` semantics unchanged.
- NEW: `facebook_mode` (`platform_one_click` default), `facebook_business_verified` (informational NULL), BYO `meta_apps` row (`status`, `last_validated_at`, `live_confirmed_at/by`, `login_config_id`).
- `tenant_channels.meta_app_id` is stamped by the 3.3 core exchange (fail-closed cleanup on stamp failure); platform-route channels and pre-3.3 rows stay NULL (= platform).

### A4. Platform scope handling — STILL TRUE
- No contrary evidence found; unchanged by this slice (guards/roles as in Phase 1 §A4–A5).

### A5. Platform-admin merchant endpoints — CHANGED (additive)
- `GET tenants/:id/channel-settings` (no audit), `PUT tenants/:id/channel-settings` (`@AuditLog tenant_telegram_template_updated`), `PUT tenants/:id/channel-settings/facebook-app` (`@AuditLog tenant_facebook_app_updated`; accepts `loginConfigId`; re-save clears live confirmation → `pending`), `PUT …/facebook-app/live-confirmation` (`@AuditLog tenant_facebook_live_confirmation_updated`), `POST …/facebook-app/validate` (`@AuditLog tenant_facebook_app_validated`; `valid` only when live-confirmed). All `super_admin|ops_admin`.

---

## B. Platform-console `/merchants/:id`

### B1–B2. Route, tabs, fetching, permissions — CHANGED (additive)
- Facebook block: mode buttons, App ID, write-only App Secret, Advanced optional Login config ID (prefilled, blank clears), Live-mode checkbox (required to activate; uncheck clears attestation), Save/Validate, status badge, webhook URL + masked verify token + redirect URI + last-validated, setup copy. Read-only banner for non-managers.
- Helpers: `TenantChannelSettingsDto` (+`loginConfigId`, `liveConfirmedAt/By`), `getTenantChannelSettings`, `updateTenantChannelSettings`, `updateTenantFacebookApp` (+`loginConfigId`), `updateTenantFacebookLiveConfirmation`, `validateTenantFacebookApp`.

### B3–B4. Reference pattern / placement — DONE
- Tab placed on the merchant detail page as predicted; verify token now masked on read (`****`+last 4; full value once in the save response); copy buttons NOT built (`not found, searched: copy|clipboard|navigator.clipboard on [merchantId]/page.tsx`); mode-switch confirm NOT built.

---

## C. Facebook / Messenger integration

### C1. Credential sources — CHANGED
- Env-global platform app persists, seeded into `meta_apps` on startup.
- Platform connect: unchanged Next.js route (`callback/route.ts`, env App ID/secret, per-channel copies at `route.ts:198,215-231`).
- BYO connect: core `MetaOAuthService` resolves the tenant app via `MetaAppResolver` and decrypts server-side; the secret never reaches the Next.js route or browser. Channel creds carry resolved copies (`appSecret`, app verify token) for the existing presence validation; webhook HMAC stays authoritative at `meta_apps` level.

### C2. Storage / encryption — CHANGED
- `meta_apps` table as in Delta; same AES-256-GCM envelope; app secret write-only in practice (never returned); admin GET returns verify token masked (`maskVerifyToken`, `platform-admin.service.ts`), full value only in the rotate response. Internal service-auth endpoint (`internal/provider-app-configs`, `@RequireServiceAuth` webhook-handler/platform-operations only) still returns full secrets — required for HMAC, correctly untouched.

### C3. Connection creation — TWO PATHS (from code)
- Platform (`platform_one_click`): Next.js `POST /api/channels/meta/callback` exactly as Phase 1 §C3 (static `state=zayos-messenger-connect`, in-memory 5-min `pendingSelections`, channel via core `POST /tenant/channels`, subscribe, test-connection). File untouched since `ddd5ba53` (pre-branch).
- BYO (`byo_app` + valid): workspace `handleConnect` fetches `POST tenant/channels/meta/state` (owner/admin, tenant JWT) → opens Meta dialog with tenant App ID + server state + exact redirect URI (`config_id` when set, else scopes) → Meta redirects to `meta/callback/page.tsx` → `POST tenant/channels/meta/exchange`. Core: atomic-consume state (Redis Lua GETDEL, 10-min TTL, tenant+user bound) → exact-redirect check → `getMetaApp` (missing → 409, no fallback) → code→user→page-token Graph exchange (mapped errors) → single page or `pageId` or encrypted 5-min selection token → `createChannel` → stamp `meta_app_id` (fail-closed cleanup) → subscribe page to that app → `testChannelConnection`. Per-tenant+user rate limits: state 30/min, exchange 10/min → 429 (`META_OAUTH_RATE_LIMITED`); global IP guard underneath.

### C4. `config_id` vs scope — WIRED (was: scope-only)
- `login_config_id` settable via `PUT facebook-app` (Advanced console field, blank clears), surfaced in both effective payloads, consumed by `buildMetaOAuthDialogUrl` (`config_id` replaces `scope` when set). Scope-based remains the default.

### C5. Webhook controller — CHANGED
- Per-tenant path live alongside shared route; per-path verify/HMAC; `(meta_app_id, pageId)` resolution; 404 unknown key; dual-key dedupe with legacy compat claim (see Delta). Generic controller lines unchanged (`app.controller.ts:169,193`).

### C6. BYO webhook options — RESOLVED
- Option (a) implemented as recommended. Old comparison text is now historical.

### C7. Outbound send — UNCHANGED
- Still page-token send via integration service; resolver not involved; no per-app send branch.

### C8. Subscription / health / refresh / reconnect — PARTIALLY CHANGED
- Still no cron, no `debug_token`/`subscribed_apps` read, no `configuration.health`, `needs_reconnect` unwritten.
- `validateTenantFacebookApp` is now a real gate: bad creds → `invalid`; good creds + unconfirmed → hold at `pending` with confirm-Live message; good creds + confirmed → `valid` + `lastValidatedAt`. `getMetaApp` requires both `status='valid'` and `live_confirmed_at IS NOT NULL` for BYO; no `debug_token`/`subscribed_apps` probe is performed. Decision §2 is enforced by validation and resolver read gating, not by probing Meta.

### C9. Single-global-app hard-codings — PARTIALLY RESOLVED
- Resolved: `providerAppConfigId` literal `'default-meta-app'` GONE (now `app.id`); routing predicate gained `meta_app_id` discriminator; dedupe no longer app-scoped; OAuth secret resolution per-tenant in core.
- Still env-bound: dashboard `callback/route.ts` platform exchange (by design — platform path); pinned `v25.0` defaults.

---

## D. Telegram integration

### D1–D2. Entity / webhooks — UNCHANGED
- No template gating in onboarding, webhook registration, or reregistration script (verified `not found`).

### D3. Shop flags — UNCHANGED
- Channel-level `telegramShopping` semantics intact; CLI now warns (non-blocking) when the tenant template is off (`scripts/set-telegram-shop-enabled.ts:47-59,76-77`).

### D4. Workspace UI — UNCHANGED + one gap
- No `shopEnabled` gate (as before); template-off hiding (T7) NOT built.

### D5. Enforcement points for `telegram.enabled` — SUPERSEDED (historical)
- The kill-switch was never built. Effective enforcement is the single ingestion-controller gate (§D6-new). Keep §D5 of the old doc as analysis only.

### D6. Disable semantics — SUPERSEDED, replaced by:
- Template-off: plain updates → normal ingestion; stale `callback_query` → `Shop unavailable.` toast + not ingested (`internal-ingestion.controller.ts:127-156`); unknown channel → chain preserved (`:159-170`); settlement (expiry, projector, agent review) untouched by construction.

---

## E. Cross-cutting

### E1. UI gating vs backend enforcement — MIXED (Facebook closed the gap)
- Facebook: workspace `oauthUrl` null-gate + "being prepared" panel pair with backend 409 `BYO_APP_NOT_CONFIGURED` in state issuance and exchange (no fallback either side); BYO dialog parameters (App ID effective-only, server state, exact redirect) are server-issued.
- Telegram: backend gate is authoritative (ingestion controller); workspace hiding not built (UI lags backend — acceptable direction).

### E2. Audit — CHANGED
- Actions: `tenant_telegram_template_updated` (PUT settings), `tenant_facebook_app_updated` (PUT facebook-app), `tenant_facebook_live_confirmation_updated` (PUT live-confirmation), `tenant_facebook_app_validated` (POST validate); reads unaudited. Spec asserts roles + audit for all four writes.

### E3. Secrets reuse — DONE
- Envelope reused; app secret write-only; verify token masked on admin read, revealed once on rotate. Audit interceptor stores only redacted-body keys + response id/status (never response bodies), so the one-time full token is not persisted; `redaction.util.ts` already lists `verifyToken` + `appSecret`; no logger writes token values (seed-skip warning logs env var NAMES only). Internal service-auth webhook-config endpoint correctly still returns full secrets.

### E4. Tests — VERIFIED at HEAD `22dbf993`
- Focused unit specs: 26/27 suites and 340/342 tests passing; only failures are two `tenant-billing.spec.ts` tests, pre-existing and identical at `4b67a8a0` and `ef5ce1de`, unrelated to Facebook.
- Webhook-handler Jest: 48/48. Activation-race integration: 5/5. Full integration: 3/4 suites passed and 31/32 tests passed; only the payment-stage1 QR test fails and it is pre-existing at `4b67a8a0`.
- Backend, webhook-handler, workspace, and platform-console typechecks pass. Migrations `1791600000000..1792000000000` pass up/down/up on the disposable DB. `tenant-limits.spec` is 27/27 with `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` set.
- Not added: dashboard/e2e.

---

## F. Gaps and risks (updated)

1. ~~Single callback URL / global routing~~ **RESOLVED** — per-tenant path + per-path secrets + `meta_app_id` discriminator (`provider-webhook-url.util.ts:21-26`; `tenant.service.ts:3961-4027`).
2. ~~Global verify token~~ **RESOLVED** — per-`meta_apps` encrypted token, looked up by path segment.
3. ~~Global app secret in signature check~~ **RESOLVED** — per-path HMAC over `rawBody`.
4. OAuth singleton — PARTIALLY CLOSED (was §F4): tenant-aware core exchange + workspace wiring built; `callback/route.ts` platform path untouched. **OPEN:** live Meta verification (needs deploy + real app).
5. Duplicate delivery on mode switch — PARTIALLY MITIGATED, but duplicate-channel guard remains **OPEN**: dedupe key is now `messenger:{channelId}:{providerEventId}` so two-app delivery ingests once; legacy app-scoped key also claimed during transition. No unsubscribe-before-subscribe or transactional switch (4.3 open).
6. Migration/back-compat — RESOLVED for reads (missing row → platform; NULL `meta_app_id` → platform). `meta_app_id` write-never means future writers must define backfill semantics then.
7. Secret exposure — RESOLVED: verify token masked on admin GET (`maskVerifyToken`), revealed once in the rotate response; audit payload never carries response values and `redaction.util.ts` already covers `verifyToken`/`appSecret`; no logger writes token values. Internal service-auth endpoint intentionally still returns full secrets (HMAC requirement, restricted callers).
8. Health-check blindness — **OPEN**: validate and `getMetaApp` now require credentials plus live confirmation, but there is still no `debug_token`/`subscribed_apps` read, no cron, and `needs_reconnect` is unwritten. `testChannelConnection` messenger branch remains presence-only.
9. Rate-limit sharing / usage — **OPEN**: no aggregation, no off-ramp trigger.
10. `redirectUri` single-origin — STILL OPEN (validation `route.ts:73-80` unchanged; BYO tenants must register each origin).
11. Telegram blast radius (§F11) — SUPERSEDED/MOOT: no webhook/outbox gating exists; template-off cannot strand reservations (settlement untouched).
12. ~~`meta_app_id` never written~~ **NARROWED** — the 3.3 exchange stamps the FK on every channel it creates; platform-route channels and pre-3.3 rows stay NULL (= platform, fail-closed). A future mode-switch writer must still reconcile `configuration.metaAppId` (string) vs `meta_app_id` (UUID).
13. **NEW — verify-token uniqueness is DB-unique (`UQ_meta_apps_webhook_path_segment`) but token *values* have no uniqueness constraint** — two apps could share a token; harmless today (lookup is by path, not token) but fragile if anyone builds token-reverse-lookup later (old option-b idea). Evidence: `meta-app.entity.ts:5-7`; migration `1791700000000:9-10`.
14. ~~Legacy dedupe compat claim has no removal condition~~ **RESOLVED** — rule encoded as `TODO(dedupe-compat, not before 2026-10-21)` + rollout-doc paragraph (7 days of prod traffic post-rekey `fabb3570`; confirm first prod deploy date before removing).
15. ~~Lazy-seed silent skip~~ **RESOLVED** — `ensurePlatformApp()` logs a warning naming the missing `META_*` var(s), still returns null (no behavior change).
16. Mode/app mismatch — NARROWED: `byo_app` + unconfirmed/missing app now fails closed at validation and connect; **RESOLVED for resolver reads** because `getMetaApp` also rejects `valid` rows without `live_confirmed_at` (`meta-app-resolver.service.ts:93-105`). Evidence: `platform-admin-channel-settings.spec.ts` 18/18, `meta-app-resolver.spec.ts` 10/10, `security-metadata.spec.ts` 9/9. The real-DB uncheck case is part of the activation-race spec, which passes 5/5. Residual: `platform_one_click` + stale valid BYO row silently keeps the platform app (ops confusion only; `updateTenantFacebookMode` still has no cross-check).
17. **OPEN — no 30-day BYO retention purge** (Decision §8 proposed; nothing implements expiry of `retired` rows or secret purging). Evidence: `not found (searched: retired.*cron\|purge\|retention in backend-core-service/src)`.
18. Lint debt — `platform-admin.service.ts` has 233 errors / 8 warnings at HEAD versus 236/8 at merge-base `4b67a8a0`; the aggregate current count over the available touched backend BYO files is 294/15. The dashboard BYO files are 0/0 in both current and merge-base checks; webhook `app.service.ts` is 4/0 current versus 0/0 at merge-base. Added-after-merge-base files cannot be compared to a nonexistent baseline file. These are lint counts, not a claim that all errors are caused by this work.

---

### Independent review (2026-10-15)

An independent security/architecture review was conducted on the BYO Meta app activation flow and related OAuth/webhook paths. The review covered:

**Areas reviewed:**
- Secret/token leakage (none found; admin GET masks verify token; audit interceptor redacts response values; `redaction.util.ts` covers `verifyToken`/`appSecret`)
- HMAC-before-parse + timing-safe compare (verified in `app.service.ts:1390-1436`)
- State single-use/replay/cross-tenant (verified: Redis Lua `GETDEL`, 10-min TTL, tenant+user bound in `meta-oauth.service.ts`)
- Redirect-URI check (exact match against `resolveWorkspaceBaseUrl()`; enforced in exchange)
- BYO→platform fallback (none; BYO branch throws `BYO_APP_NOT_CONFIGURED` with no fallback)
- Endpoint authorization (platform-admin endpoints role-gated `super_admin|ops_admin`; tenant endpoints JWT+TenantGuard)
- Dedupe-key collisions (new key `messenger:{channelId}:{providerEventId}`; legacy compat claim temporary with dated TODO)

**Finding 1 — TOCTOU in BYO activation gate (RESOLVED)**
- Locations: `backend-core-service/src/platform-admin/platform-admin.service.ts:2720-2817` (`updateTenantFacebookApp`), `:2834-2874` (`updateTenantFacebookLiveConfirmation`), and `:2876-2989` (`validateTenantFacebookApp`)
- Issue: The method loaded the MetaApp row, awaited a Graph API call, then saved the **entire stale entity** via `repository.save()`. A concurrent credential rotate (`updateTenantFacebookApp`, which nulls `live_confirmed_at/by` and sets status=`pending`) or live-confirmation uncheck (`updateTenantFacebookLiveConfirmation`) could land during the Graph round-trip; the stale save then wrote status=`valid` with the old confirmation intact, bypassing the Live attestation gate.
- Fix: All three writers now use targeted conditional UPDATEs and never save a loaded entity across an await. `updateTenantFacebookApp` owns credential/verify-token fields and atomically clears `live_confirmed_at/by` and sets `status='pending'`; live confirmation owns only its confirmation fields; validation owns only `status` and `last_validated_at`. Every guard uses millisecond-safe `date_trunc('milliseconds', updated_at)` comparison; zero affected rows produce `Concurrent modification detected. Please retry.` for the two writers, while validation re-reads and reports the state-change message.
- Evidence: `platform-admin-channel-settings.spec.ts` (18/18, including both zero-affected branches) + real-DB `platform-admin-activation-race.integration-spec.ts` (5/5 at `22dbf993`).

**Finding 2 — Duplicate channel creation on concurrent exchange (OPEN/ACCEPTED, low)**
- Location: `backend-core-service/src/tenant/meta-oauth.service.ts:~733-764` (`createChannel` → stamp `meta_app_id`)
- Issue: Two concurrent `meta/exchange` calls for the same Page can each pass the pre-check and create two `tenant_channels` rows before either stamps `meta_app_id`. Parity with the platform route; fails closed (the second stamp throws, triggers cleanup of the half-created channel).
- Mitigation options (not applied): pre-check for existing active channel on `(tenantId, pageId, metaAppId)`; idempotency key on state.
- Status: Accepted as low risk; document only, no code change.

---

## Rollout doc vs code (`facebook_byo_rollout.md`)

| Claim | Verdict | Evidence / missing step |
|---|---|---|
| 1. Settings migration; missing row → `platform_one_click` | VERIFIED | `1791900000000`; `tenant-channel-settings.service.ts:53-59` |
| 2. `meta_apps` migration; lazy seed from `META_APP_ID`, `META_APP_SECRET` (or `MESSENGER_APP_SECRET`), `META_WEBHOOK_VERIFY_TOKEN` (or `MESSENGER_VERIFY_TOKEN`), `META_PROVIDER_APP_ROUTING_ID` (or `MESSENGER_PROVIDER_APP_ROUTING_ID`); AES-256-GCM envelope | VERIFIED | `1791700000000`; `meta-app-resolver.service.ts:15,18` |
| 3. `tenant_channels.meta_app_id`; NULL = platform; BYO stores resolved app ID | VERIFIED (stamping now true) | Migration + NULL semantics (`1791800000000`) + live up/down run; 3.3 exchange stamps the FK with fail-closed cleanup (platform rows stay NULL) |
| 4. Shared `CORE_API_URL` + service-auth + same encryption key source; `--update-env` restart | VERIFIED (config) | `ecosystem.config.js:196,218,234-251`; key fallback `meta-app-resolver.service.ts:13` / `platform-admin.service.ts:2694`. Runtime restart not performed in this task |
| 5. BYO manual test steps 1–4 (console save → validate → workspace connect → send/receive once) | PARTIALLY | Steps 1–2 shippable (validate now live-gated + audited); step 3 implemented, live verification pending |
| 6. Negative checks (platform secret on BYO path rejected; BYO secret on platform path rejected; unknown key 404; duplicate `mid` once; platform path unchanged) | PARTIALLY | Per-path HMAC + 404 + new-key dedupe verified in code; handler specs cover tampered-signature reject, cross-tenant isolation, delivery idempotency (`app.controller.spec.ts:310-748`). Explicit "BYO-secret-on-platform-path" spec case not isolated; no e2e |
| 7. Graph subscription auto-config NOT built; validation = credential check + manual-setup message | VERIFIED | `platform-admin.service.ts:2913-2981` returns `webhookConfigured:false`; no `subscribed_apps` POST found |
| 8. Standard-Access / pause-delivery limits; health monitoring future work | VERIFIED (as docs) | Console copy `page.tsx:1186`; no monitor in code |
| 9. Migrations reversible; revert → `BYO_APP_NOT_CONFIGURED`, never silent fallback | PARTIALLY / UNVERIFIED live | Five `up()`/`down()` pairs exist, including `1792000000000-AddMetaAppLiveConfirmation`; only `1791800000000` was historically executed up/down on the disposable DB. No migration execution occurred in this audit. Resolver throws `BYO_APP_NOT_CONFIGURED` for non-valid BYO rows and has no platform fallback. |
| 10. Dedupe keyed `messenger` + channel + event ID; temporary old app-scoped compat claim, removable after retry window | VERIFIED (rule now concrete) | Key shape + compat claim verified (`app.service.ts:432-455`); removal rule in code TODO + rollout doc (not before 2026-10-21, 7 days post-rekey) |
| 11. Migration/config order (settings → meta_apps → `meta_app_id`) | VERIFIED from filenames; execution UNVERIFIED | Order is settings → meta_apps → `meta_app_id` → facebook mode → live confirmation (`17916 < 17917 < 17918 < 17919 < 17920`). No migration was run in this audit. |

---

## Not built yet / next actions (ordered, mapped to plan IDs)

1. ~~3.3 Tenant-aware OAuth~~ DONE (unverified live) — live Meta test with a real BYO app + deploy is the remaining step before first production use.
2. **3.2-full Real validation (remainder)** — `debug_token` on the page token + `GET /{pageId}/subscribed_apps` contains-app check; surface `webhookConfigured:true/false` honestly. DONE: `login_config_id` Advanced field + wiring, `@AuditLog` on validate, live-confirmation gate.
3. **3.5 + 4.1 Health monitoring** — extend messenger `test-connection` with Graph checks, store `configuration.health`, add `messenger-health.monitor` cron (~6 h), write/surface `needs_reconnect`, add workspace Reconnect banner + "being prepared" copy (2.4 remainder).
4. **4.3 Transactional mode-switch** — `POST …/channel-settings/mode-switch`: validate target → unsubscribe-old-before-subscribe-new → rewrite `tenant_channels.meta_app_id` → reset reconnect state → audit; support revert-to-platform. Keep dual-key dedupe as safety net.
5. **T7 Workspace template gating** — consume `effective.telegram.template` in `orders`, `orders-settings`, inbox order tabs (hide new-commerce affordances; keep review/chat).
6. **Docs + console polish (remainder)** — DONE: per-mode copy, verify-token masking, `tenant_facebook_app_updated` + live/validated audit assertions, `buildByoMessengerWebhookUrl` + facebook-mode specs. Still open: copy buttons + mode-switch confirm (3.1 remainder).
7. **Ops hardening (remainder)** — DONE: seed-skip warning, dedupe-compat removal, prettier pass, `META_APP_STATUS` in `.env.example`, `ci:integration` DB fix, payment-test alignment. Still open: `retired`-row purge (risk 17).
8. **4.2 Usage aggregation** — only after real BYO traffic exists; no threshold policy yet per Decision §5.

---

## Open questions (only what the code cannot answer)

1. T2: does the flag-based backfill's tenant set equal the intended pilot set (is `jjk_bot`'s channel flag on in prod)? Requires the deploy-time list-A check (`telegram_template_toggle_rollout.md:30-37`) — code cannot confirm prod data.
2. 3.4: has anyone walked the console wizard against a real Meta dashboard (Login-box type, redirect-URI registration, Live-mode gate)?
3. ~~Mode switch dual-subscription window~~ — RESOLVED as platform-admin only (Decision §1): tenants never initiate switches, so no tenant-driven dual-subscription exists; the admin-driven transition window is covered by dual-key dedupe until 4.3 builds unsubscribe-before-subscribe.
4. ~~Verify-token plaintext on admin GET~~ — ANSWERED in code: masked on read, revealed once on rotate (audit-safe, redaction-covered).
5. ~~Legacy dedupe compat claim removal date~~ — ANSWERED: not before 2026-10-21, pending first-prod-deploy confirmation.
6. `retired` BYO rows: is the proposed 30-day purge still the policy, and does purge mean row delete or secret-nulling?
7. ~~Plan Q3 (`login_config_id`)~~ — ANSWERED in code: column kept and WIRED (PUT field, effective payloads, dialog `config_id` branch, console Advanced field); scope-based remains the default.
