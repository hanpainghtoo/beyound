# Facebook Messenger BYO rollout

This rollout adds an operator-managed Facebook connection mode. Existing tenants remain on `platform_one_click`; that path keeps its shared routing segment and existing OAuth behavior.

## Migration and configuration order

Apply in filename order (each migration is reversible; none backfills):

1. `1791600000000-AddTenantChannelSettings` — creates `tenant_channel_settings` and backfills `telegram_bot_template='commerce'` for tenants already running Telegram commerce. A missing settings row resolves to `platform_one_click` + template-off.
2. `1791700000000-AddFacebookByoMetaApps` — creates `meta_apps`. On core startup, the platform Meta app is lazily seeded from `META_APP_ID`, `META_APP_SECRET` (or `MESSENGER_APP_SECRET`), `META_WEBHOOK_VERIFY_TOKEN` (or `MESSENGER_VERIFY_TOKEN`), and `META_PROVIDER_APP_ROUTING_ID` (or `MESSENGER_PROVIDER_APP_ROUTING_ID`). Secrets are stored in the existing AES-256-GCM credential envelope.
3. `1791800000000-AddTenantChannelMetaApp` — adds nullable `tenant_channels.meta_app_id` FK → `meta_apps(id)` ON DELETE SET NULL. Existing NULL rows continue to mean the platform app; the 3.3 core exchange stamps the FK on every BYO channel it creates.
4. `1791900000000-AddFacebookModeToTenantChannelSettings` — adds `facebook_mode` (default `platform_one_click`) and `facebook_business_verified`.
5. `1792000000000-AddMetaAppLiveConfirmation` — adds `meta_apps.live_confirmed_at/by` (no backfill; existing rows stay unconfirmed until the console checkbox is set).

`1791700000000-AddFacebookByoMetaApps` and `1791700000000-CreateTenantBotTemplates` share a timestamp but are independent migrations; this was verified from migration order. Apply the migrations in filename/order sequence and verify each result.

Core and webhook-handler must share `CORE_API_URL` and the existing internal service-auth configuration. The same provider credential encryption key source must be configured (`PROVIDER_CREDENTIAL_ENCRYPTION_KEY`, `TELEGRAM_TOKEN_ENCRYPTION_KEY`, or the existing JWT fallback) — do NOT introduce a new key variable in production: rows encrypted under different keys in different services cannot be decrypted across the service boundary, and the legacy `JWT_SECRET` fallback only exists to read old rows. Restart both PM2 processes with `--update-env` after changing environment variables. Do not run migrations or deploy this document as part of a production rollout without the normal release approval.

Set `WORKSPACE_ORIGIN` to the public workspace origin in every environment and in the shell/env file used by `pm2 start ... --update-env` (the ecosystem configs pass it through to the core API). It is the canonical base of the OAuth callback URL `<origin>/workspace/channels/meta/callback` shown in platform-console Channel settings; `FRONTEND_URL` is a deprecated fallback. The exchange endpoint rejects any redirect URI that is not exactly this value. `META_APP_STATUS` documents the platform-app status reported in internal webhook config (default `development_only`).

## Pre-deploy checklist

- Set and verify `WORKSPACE_ORIGIN` for the deployed workspace origin.
- Use the same credential-key variables and value across core and webhook-handler (`PROVIDER_CREDENTIAL_ENCRYPTION_KEY` preferred; keep the configured fallback consistent).
- Take the normal database backup before migration.
- Run migrations in order, including both timestamp-sharing migrations independently.
- Restart affected PM2 processes with `--update-env` after environment changes.

## BYO manual test

1. In platform-console, open a test merchant's Channel settings, choose Customer-owned app, enter App ID and App Secret, check "Live mode confirmed" (only when the Meta app is actually Live — validation stays `pending` without it), and save. The full verify token is displayed exactly once after saving: copy it immediately, since later reads are masked. If "Concurrent modification detected. Please retry." appears on save/confirm, re-submit. Unchecking Live mode confirmed returns the app to `pending`; check it again and re-run Validate.
2. Validate the app (reaches `valid` only with good credentials + live confirmation). **If "App state changed during validation" appears, re-validate.** Copy the displayed webhook URL, verify token, and OAuth redirect URI into the Meta app. Subscribe the Page webhook to `messages`, `messaging_postbacks`, `message_deliveries`, and `message_reads`, and ensure the app-level Page subscription and Page `subscribed_apps` subscription are present.
3. [Implemented — live verification pending, requires deploy] A role-holder account opens the workspace, starts Facebook connect, selects the test Page, and confirms that the channel is connected. The workspace builds the login dialog with the tenant App ID and a server-issued single-use state; the code exchange runs in core against the tenant app and stamps `tenant_channels.meta_app_id`.
4. Send a message to the Page; confirm it appears once in the inbox. Reply from the inbox and confirm delivery.
5. Negative checks: a platform secret on a BYO path is rejected; a BYO secret on the platform path is rejected; an unknown tenant key is 404; a duplicate `mid` delivered through two paths ingests once; the platform tenant’s existing connect path remains unchanged.

Graph subscription auto-configuration is intentionally not built in this slice. The validation action checks app credentials and reports the manual webhook setup requirement; the Meta Graph subscription contract should be verified against the current Meta developer documentation before adding an automatic POST action.

## Access and operational limits

With Standard Access, Meta only delivers test traffic from people who have a role on the app or Page. This is a Meta access limitation, not a ZayOS routing failure; the same limitation applies to the platform app until Advanced Access is granted. If a webhook endpoint returns errors for a sustained period, Meta may pause delivery. Health monitoring and automatic recovery are future work.

## Rollback

The migrations are reversible. Reverting code removes the BYO routes; BYO tenants cannot connect and never fall back to the platform app. Existing platform tenants continue to use the shared route. A code revert restores the prior platform behavior; stop the affected PM2 processes and use `--update-env` when switching runtime configuration.

## Dedupe transition

Messenger dedupe is now keyed by `messenger`, channel ID, and provider event ID (`mid` where present), so the same message delivered through two apps is processed once. During the deploy transition the webhook handler also claims/checks the old app-scoped key. This catches in-flight Meta retries accepted by an older process; the compatibility claim is temporary. Removal rule: delete the legacy claim only after 7 days of production traffic on the rekeyed key (rekey commit `fabb3570`, 2026-10-14) — i.e. not before 2026-10-21, and only after confirming the first production deploy date of the rekey. The code carries a dated `TODO(dedupe-compat, not before 2026-10-21)` at the claim site in `services/webhook-handler-service/src/app.service.ts`.
