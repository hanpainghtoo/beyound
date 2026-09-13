# Telegram Managed-Bot Provider Allow-List Hotfix Runbook

Copy-paste deploy procedure for the fix that restores Telegram managed-bot
creation (409 `PROVIDER_NOT_ALLOWED_IN_PLAN` regression).

## Why this runbook exists

Commit `2dcc03f` ("feat: add per-plan provider allow-list and inbound/outbound
message limits") added `subscription_plans.allowed_providers` with
`DEFAULT '{messenger}'` via migration
`AddInboundOutboundMessageLimitsAndAllowedProviders1782443200000`. Existing
plan rows were never backfilled, so Business Launch / Business Growth /
Enterprise plans were silently locked to Messenger-only. Any tenant on those
plans then received `409 PROVIDER_NOT_ALLOWED_IN_PLAN` ("Telegram is not
allowed by the current subscription plan") when creating a Telegram managed
bot (and when connecting Telegram directly).

The fix is a data backfill migration plus code changes that clarify the error
and record an accurate failure code:

- `1782443900000-BackfillPlanAllowedProviders.ts` — backfills
  `allowed_providers` for the canonical plans. It keys on plan name, only
  touches rows still stuck at the `'{messenger}'` default, and never clobbers
  deliberately-customized or operator-created plans.
- `telegram-managed-bot.service.ts` / `tenant.service.ts` — richer 409 message
  (plan name + allowed list), `planId`/`planName` in the error payload, and
  `provider_not_allowed_in_plan` as the failure code instead of the misleading
  `telegram_bot_already_connected`.

This is a backend-only release: no dashboard rebuild is required.

## Expected plan catalog after the fix

| Plan | `allowed_providers` |
| --- | --- |
| Guided Pilot | `{messenger}` |
| Business Launch | `{messenger,telegram}` |
| Business Growth | `{messenger,telegram,viber}` |
| Enterprise | `{messenger,telegram,viber,tiktok}` |

## Deploy procedure

### 1. Commit and push locally

```bash
git add -A
git commit -m "fix: backfill plan allowed_providers; restore Telegram managed-bot creation"
git push
```

### 2. Pull on the production server

```bash
cd /path/to/zayos
git pull
```

### 3. Back up the database (required before any migration)

```bash
bash scripts/db-backup.sh
```

### 4. Confirm only the backfill migration is pending

```bash
npm run db:migration:show
```

Expected: `BackfillPlanAllowedProviders1782443900000` is pending. If the
preflight query from `backend-core-service/scripts/preflight-plan-allowed-providers.sql`
exists, run it here to flag any plan whose allow-list does not match its tier.

### 5. Run the migration — this is the actual fix

```bash
npm run db:migration:update
```

The migration runs via ts-node and does not require a build first.

### 6. Verify the plan data (read-only)

```bash
cd backend-core-service
set -a && source ../.env && set +a
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c \
  "SELECT name, allowed_providers FROM subscription_plans ORDER BY name;"
```

Expected: see the table in the section above. If the affected tenant's plan
shows Telegram, the 409 is resolved at the data layer.

### 7. Rebuild the backend and restart PM2

```bash
npm run build:backend
npm run pm2:restart    # = pm2 restart ecosystem.config.js --update-env
pm2 save
```

### 8. Verify

```bash
API_BASE_URL=https://api.zayos.com.mm/api/v1 npm run smoke:api
pm2 logs zayos-core-api
```

Retry Telegram managed-bot creation for the affected workspace. The 409 should
be gone; if any plan still blocks a tenant, the error message now names the
plan and its allowed providers.

## Key notes

- **The migration is the fix, not the restart.** Deploying code without running
  `migration:run` leaves the 409 in place, because the check reads
  `allowed_providers` from the database.
- **No `seed:prod` is required.** The backfill migration is self-contained;
  `ALLOW_PRODUCTION_SEED=true` is not needed.
- **Order matters:** backup → migrate → verify → build → restart.

## Rollback

Prefer application rollback first (the migration is backward compatible):

```bash
npm run pm2:restart
```

If the database migration must be reverted:

```bash
npm run db:migration:revert
```

If data cannot be safely reverted, restore the pre-deployment backup from
`scripts/db-backup.sh`.

## Related runbooks

- `docs/deployment/production-deployment-guideline.md`
- `docs/deployment/migration-and-deployment-runbook.md`
- `docs/deployment/backup-and-restore.md`
- `docs/deployment/environment-profiles.md`
