# ZayOS Production Deployment Guideline

This guide describes the production deployment baseline for ZayOS.

## Production Principles

- Deploy only from a reviewed commit with passing CI.
- Keep production secrets outside source control.
- Keep `DB_SYNCHRONIZE` unset or `false`.
- Use migrations for database changes.
- Back up the database before every production migration.
- Build dashboards with the real browser-facing API URL.
- Use private service URLs for internal service-to-service traffic when possible.

## Required Infrastructure

- PostgreSQL, reachable by the core API.
- Redis, reachable by the core API and queue-backed services.
- PM2 as the process manager.
- TLS termination through a reverse proxy, load balancer, or platform ingress.
- Durable object storage for production file uploads.
- Log collection and operational monitoring.
- **Phase 7 storage boundary:** file-storage capacity enforcement uses a
  tenant-scoped Redis reservation around the authoritative usage check and
  metadata registration. Configure the existing shared Redis contract
  (`REDIS_URL`, or `REDIS_HOST`/`REDIS_PORT`) for every file-storage process
  before enabling storage-quota enforcement; readiness performs a bounded Redis ping and upload reservations renew their lease during long registrations. The tenant
  `storage_capacity_state` field is reporting-only; live file metadata remains
  authoritative for allowing writes.

## Required Secrets And Variables

These variables are required for the production PM2 stack to start. Secret
values are marked with `(secret)`.

The production ecosystem validates the full deployed stack before PM2 exports
or starts any process. Variables are grouped by the process scope that consumes
them:

- Every process: `CORE_API_URL`, `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`
- Backend only: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `REDIS_HOST`, `REDIS_PORT`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URLS`, `CHAT_INGESTION_URL`, `WEBHOOK_HANDLER_URL`, `INTEGRATION_SERVICE_URL`, `FILE_STORAGE_URL`, `MEDIA_PROCESSING_URL`, `WORKSPACE_PUBLIC_APP_URL`, `PLATFORM_CONSOLE_PUBLIC_APP_URL`, `WEBHOOK_PUBLIC_BASE_URL`, `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`
- Workspace only: `NEXT_PUBLIC_SITE_URL`, `PLATFORM_CONSOLE_URL`, `WS_BASE_URL`, `META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`
- Platform Console only: no additional required variables beyond the shared dashboard variables
- File storage only: `FILE_STORAGE_PUBLIC_URL`, `LOCAL_STORAGE_SIGNING_SECRET`, and the shared Redis reservation variables (`REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`)

```bash
NODE_ENV=production
DB_HOST=...
DB_PORT=5432
DB_USERNAME=...
DB_PASSWORD=...                               # (secret)
DB_NAME=...
DB_SYNCHRONIZE=false
REDIS_HOST=...
REDIS_PORT=6379
JWT_SECRET=...                               # (secret, minimum 32 chars)
JWT_REFRESH_SECRET=...                       # (secret, recommended distinct, minimum 32 chars)
INTERNAL_SERVICE_TOKEN_SIGNING_KEY=...                         # (secret, minimum 32 chars)
PROVIDER_CREDENTIAL_ENCRYPTION_KEY=...       # (secret, minimum 32 chars)
LOCAL_STORAGE_SIGNING_SECRET=...             # (secret, minimum 32 chars)
FRONTEND_URLS=https://zayos.com.mm,https://admin.zayos.com.mm
CORE_API_URL=https://api.zayos.com.mm/api/v1
CHAT_INGESTION_URL=https://chat-ingestion.internal
WEBHOOK_HANDLER_URL=https://webhook-handler.internal
INTEGRATION_SERVICE_URL=https://integration.internal
FILE_STORAGE_URL=https://file-storage.internal
FILE_STORAGE_PUBLIC_URL=https://files.zayos.com.mm
MEDIA_PROCESSING_URL=https://media-processing.internal
WEBHOOK_PUBLIC_BASE_URL=https://api.zayos.com.mm
WORKSPACE_PUBLIC_APP_URL=https://zayos.com.mm
PLATFORM_CONSOLE_PUBLIC_APP_URL=https://admin.zayos.com.mm
CORE_API_URL=https://api.zayos.com.mm/api/v1
NEXT_PUBLIC_SITE_URL=https://zayos.com.mm
PLATFORM_CONSOLE_URL=https://admin.zayos.com.mm
WS_BASE_URL=https://api.zayos.com.mm
```

Use strong, unique values for `JWT_SECRET` and `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`. Rotate them
through the deployment secret manager, not through committed files.

Generate secrets with a command such as:

```bash
openssl rand -base64 48
```

Production file storage should use the S3-compatible driver:

```bash
STORAGE_DRIVER=s3-compatible
S3_ENDPOINT=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

## Service URLs

Use internal private network URLs for service calls:

| Variable                  | Purpose                                          |
| ------------------------- | ------------------------------------------------ |
| `CORE_API_URL`            | Supporting services call the core API.           |
| `CHAT_INGESTION_URL`      | Webhook handler forwards inbound events.         |
| `WEBHOOK_HANDLER_URL`     | Core API references webhook boundary.            |
| `INTEGRATION_SERVICE_URL` | Core API references outbound provider boundary.  |
| `FILE_STORAGE_URL`        | Core API and media processing call file storage. |
| `MEDIA_PROCESSING_URL`    | Core API references media processing boundary.   |

Expose only the public API and dashboards externally unless a provider webhook
requires a public edge endpoint.

## Build Procedure

Install dependencies and build from the release commit:

```bash
npm install
npm --prefix backend-core-service ci
npm --prefix services/chat-ingestion-service ci
npm --prefix services/webhook-handler-service ci
npm --prefix services/integration-service ci
npm --prefix services/file-storage-service ci
npm --prefix services/media-processing-service ci
npm --prefix dashboards/workspace ci
npm --prefix dashboards/platform-console ci

npm run build:backend
npm run build:services
CORE_API_URL=https://api.zayos.com.mm/api/v1 NEXT_PUBLIC_SITE_URL=https://zayos.com.mm npm run build:dashboards
```

`CORE_API_URL` must be correct at runtime because dashboard API calls go through
server-side proxy routes. `NEXT_PUBLIC_SITE_URL` must be correct at build time because Next.js embeds
public variables into the browser bundle.

## Database Migration Procedure

Before deployment:

```bash
cd backend-core-service
npm run migration:show
```

Back up the target database:

```bash
bash ../scripts/db-backup.sh
```

Run reviewed migrations:

```bash
npm run migration:run
```

Production bootstrap is a separate minimal command and requires:

```bash
NODE_ENV=production
ALLOW_PRODUCTION_SEED=true
PRODUCTION_PLATFORM_ADMIN_FULL_NAME="Launch Admin"
PRODUCTION_PLATFORM_ADMIN_EMAIL="admin@zayos.com.mm"
PRODUCTION_PLATFORM_ADMIN_PASSWORD="Change-this-prod-admin-password-123!"
```

Run production bootstrap only when intentionally provisioning production data:

```bash
npm --prefix backend-core-service run seed:prod
```

Demo seed is intentionally separated and blocked in production unless both
override flags are set:

```bash
npm --prefix backend-core-service run seed:demo
```

## PM2 Deployment

The production ecosystem file runs compiled assets:

- Backend and services from `dist/main.js`.
- Dashboards through `next start`.

Start or restart production from a shell that has the required environment:

```bash
pm2 start ecosystem.config.js
pm2 save
```

If required variables are missing or a secret still uses a placeholder, PM2
startup fails fast with a non-zero exit and lists the missing variable names.

For an existing deployment:

```bash
pm2 restart ecosystem.config.js --update-env
pm2 logs
```

The default production ports are:

| Component                | Port   |
| ------------------------ | ------ |
| Core API                 | `6001` |
| Chat ingestion service   | `6002` |
| Webhook handler service  | `6003` |
| Integration service      | `6004` |
| File storage service     | `6005` |
| Media processing service | `6006` |
| ZayOS Workspace          | `6100` |
| ZayOS Platform Console   | `6101` |

Use a reverse proxy or ingress to map public hostnames to these internal ports.

## Post-Deployment Verification

Run the API smoke test:

```bash
API_BASE_URL=https://api.zayos.com.mm/api/v1 npm --prefix backend-core-service run smoke:api
```

Then verify:

- Login works for platform and tenant users.
- Workspace and platform console load with the production API URL.
- Provider webhook endpoint is reachable.
- Conversation ingestion and order workflows still work.
- File upload and media job flows work against production storage.
- PM2 processes are stable and logs are clean.

## Rollback

Prefer application rollback first when migrations are backward compatible:

```bash
pm2 stop ecosystem.config.js
pm2 start ecosystem.config.js
```

If the database migration must be reverted:

```bash
cd backend-core-service
npm run migration:revert
```

If data cannot be safely reverted, restore the pre-deployment backup. Record the
failed version, rollback version, database state, and follow-up fix.

## Related Runbooks

- `docs/deployment/migration-and-deployment-runbook.md`
- `docs/deployment/telegram-provider-allowlist-hotfix-runbook.md`
- `docs/deployment/environment-profiles.md`
- `docs/deployment/backup-and-restore.md`
- `docs/operations/failed-provider-webhooks.md`
- `docs/operations/stuck-media-jobs.md`
