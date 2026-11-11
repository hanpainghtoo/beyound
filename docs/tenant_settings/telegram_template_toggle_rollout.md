# Telegram bot template toggle — rollout

Scope: per-tenant `telegram_bot_template` (`'commerce'` / NULL) on the new
`tenant_channel_settings` table, gated only in
`backend-core-service/src/conversation/internal-ingestion.controller.ts`.
Commerce, order, messaging, webhook, and review paths are untouched.

## What ships

- Migration `1791600000000-AddTenantChannelSettings`: creates
  `tenant_channel_settings` (`tenant_id` PK + FK `tenants(id)` ON DELETE
  CASCADE, `telegram_bot_template` varchar NULL with
  `CHECK (telegram_bot_template IN ('commerce'))`, `updated_by` NULL,
  timestamps) and backfills `'commerce'` for tenants with a Telegram channel
  whose `configuration.telegramShopping` has `shopEnabled='true'` OR
  `orderingEnabled='true'`.
- Enforcement: template-off skips `recordTelegramShoppingActivity` and
  `telegramCommerceService.handle` and ingests directly; stale shop
  `callback_query` updates are answered (`Shop unavailable.`) and not
  ingested as chat.
- Platform-admin `GET/PUT platform-admin/tenants/:id/channel-settings`
  (`super_admin`/`ops_admin`, audited as `tenant_telegram_template_updated`).
- Platform-console Channel settings tab on the merchant detail page.
- Shop CLI warns when enabling shop for a template-off tenant.

## Deploy steps

1. Back up the production database.
2. Run the read-only commerce-usage query from
   `docs/tenant_settings/telegram_template_stage.md` §E2 and save the output
   (tenant list A).
3. Deploy backend code (migration runs with the release).
4. Verify backfill: `SELECT tenant_id, telegram_bot_template FROM
   tenant_channel_settings;` — the `'commerce'` tenant set must equal list A.
   The `jjk_bot` pilot tenant must be included; any tenant in A missing from
   the backfill gets `'commerce'` set via the platform-console toggle (or a
   targeted `UPDATE`, recorded in the deploy log).
5. Verify CHECK: an invalid value must be rejected
   (e.g. test on a non-prod copy first).
6. Restart processes with PM2 `--update-env` so every instance picks up the
   new code at once (`npm run pm2:start`; never mix dev/prod process names —
   see `AGENTS.md`). No new env vars are required for this change.
7. Smoke: `jjk_bot` `/start` renders the shop menu (template on); a staging
   tenant with the template off sends plain text and it lands in the inbox,
   and a stale shop button answers `Shop unavailable.` without spinning.

## Cache note

`TenantChannelSettingsService` caches per tenant for 20 s in-process
(`CHANNEL_SETTINGS_CACHE_TTL_MS`) and invalidates on update. After toggling,
allow up to ~20 s per PM2 instance to converge; no restart is needed for a
toggle to take effect.

## Rollback

1. Revert the backend code first. Without the controller gate, the
   `telegramShopping` channel flags alone restore exactly today's behavior;
   leftover `tenant_channel_settings` rows are inert.
2. Do NOT drop the table as a first step — a missing table breaks the
   reverted code less than it breaks the new code, but keeping the rows
   preserves the backfill evidence. If the table must go, run the migration
   `down` (reversible `DROP TABLE`) only after the code revert is live.
3. Console toggle and CLI warning are inert without the backend endpoints and
   need no separate rollback.
