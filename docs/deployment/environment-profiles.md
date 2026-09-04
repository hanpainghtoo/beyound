# Commerce OS Environment Profiles

## Local Development

Use the PM2 development ecosystem:

```bash
npm run pm2:dev:start
```

Local development intentionally enables:

- `NODE_ENV=development`
- `DB_SYNCHRONIZE=true`
- Demo secrets for local service-to-service calls
- Service ports `6001` through `6006`
- Dashboard ports `6100` and `6101`

Do not copy local secrets to staging or production.

### Dev-Build Runtime

To smoke-test the compiled production build locally (without production
secrets or strict validation), run the build files through the production
ecosystem with a dev environment:

```bash
cp .env.dev.example .env.dev      # fill in real local values
ZAYOS_ENV=dev npm run pm2:start
```

`ZAYOS_ENV=dev` makes `ecosystem.config.js` load `.env.dev`, run with
`NODE_ENV=development`, and apply light presence-only validation. Without the
variable, the default `NODE_ENV=production` behavior is unchanged. See
`mydocs/analysis/5-2026-07-31-dev-build-environment.md` for the analysis behind this path.

## Staging

Staging should be production-like:

- `NODE_ENV=production`
- `DB_SYNCHRONIZE=false`
- Real PostgreSQL and Redis services
- Dedicated `JWT_SECRET`
- Dedicated `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`
- Public API URL configured in dashboard builds
- Provider sandbox credentials where available

Recommended release gate:

```bash
npm run ci:phase1
cd backend-core-service
npm run migration:show
npm run migration:run
```

Then run smoke tests against the staging API.

## Production

Production requires:

- CI green on the release commit.
- Database backup before migration.
- Migrations reviewed and applied intentionally.
- `FRONTEND_URLS` restricted to real dashboard origins.
- No wildcard CORS origins.
- `DB_SYNCHRONIZE` unset or `false`.
- `ALLOW_PRODUCTION_SEED` unset except for a planned one-off recovery operation.
- `STORAGE_DRIVER=s3-compatible` for file uploads, with `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` configured outside source control.
- `FILE_STORAGE_PUBLIC_URL` for local-disk environments, or `S3_PUBLIC_ENDPOINT` when presigned URLs must use a public object-storage hostname.

Production smoke test:

```bash
API_BASE_URL=https://api.zayos.com.mm/api/v1 npm --prefix backend-core-service run smoke:api
```

## Required Service URLs

| Variable | Used by | Purpose |
| --- | --- | --- |
| `CORE_API_URL` | Sidecars | Internal core API calls. |
| `CHAT_INGESTION_URL` | Webhook handler | Forward queued webhook events for normalization. |
| `WEBHOOK_HANDLER_URL` | Core API | Provider webhook boundary location. |
| `INTEGRATION_SERVICE_URL` | Core API | Outbound provider boundary. |
| `FILE_STORAGE_URL` | Core API and media service | File metadata/storage boundary. |
| `MEDIA_PROCESSING_URL` | Core API | Media processing boundary. |

Use private network URLs for service-to-service traffic where possible.

## File Storage

Local development uses `STORAGE_DRIVER=local-disk`, `FILE_METADATA_PATH`, and `FILE_OBJECT_STORAGE_PATH`. Staging and production should use `STORAGE_DRIVER=s3-compatible`; the file-storage service signs upload and download URLs with SigV4 and keeps tenant-scoped metadata behind `internal service JWT` plus `x-tenant-id`.

## Media Processing

The media sidecar uses `MEDIA_QUEUE_BACKEND=local-json` and `MEDIA_JOB_STORE_PATH` for durable Phase 1 job state. Enable `MEDIA_WORKER_ENABLED=true` where media jobs should drain automatically, keep `MEDIA_IMAGE_PROCESSING_MODE=sharp` for real thumbnail/optimization outputs, and set `MEDIA_STATUS_CALLBACK_URL` to the core internal receiver, for example `http://core-api:3001/api/v1/internal/media-jobs/status`.
