# ZayOS

ZayOS is a multi-tenant sales and operations workspace for local commerce teams. The current repository contains a working NestJS core API, two primary Next.js dashboard applications, and production-included NestJS edge services for webhook handling, chat ingestion, outbound integrations, file storage, and media processing contracts.

The product was previously tracked as KME ZayOS. The ZayOS design direction is documented in `docs/commerce-os-brand-and-ui-direction.md`.
The production target for distributed order management, unified inventory, BOPIS, BORIS, and platform scale is documented in `docs/commerce-os-production-architecture.md`.
All implementation, public-launch, and verification tracking lives in the single canonical checklist at `docs/checklist/public-launch-engineering-checklist.md`.

The root documentation describes the repository as it exists today. The core API remains the source of truth for domain models, while the edge services run as PM2-managed service boundaries in development and production.

## Repository Layout

```text
zayos/
├── backend-core-service/          # Main NestJS API, database entities, auth, tenant/admin/agent APIs
├── dashboards/
│   ├── workspace/                # Next.js customer-facing workspace
│   └── platform-console/         # Next.js internal SaaS console
├── services/
│   ├── chat-ingestion-service/    # Inbound chat normalization boundary
│   ├── file-storage-service/      # Attachment/object metadata boundary
│   ├── integration-service/       # Outbound third-party provider boundary
│   ├── media-processing-service/  # Media job boundary
│   └── webhook-handler-service/   # Inbound third-party webhook boundary
├── ecosystem.dev.config.js        # PM2 development runtime with hot reload
├── ecosystem.config.js            # PM2 production runtime
├── .env.example                   # Shared local environment reference
└── .env.dev.example               # Dev-build runtime env template (ZAYOS_ENV=dev)
```

## Current Architecture

| Area | Status | Notes |
| --- | --- | --- |
| Core API | Implemented | NestJS API with PostgreSQL, Redis configuration, JWT auth, validation, Swagger, logging, and role/tenant guards. |
| Platform Console | Implemented/in progress | Internal SaaS console for tenants, subscription plans, billing, feature toggles, users, logs, monitoring, and platform settings. |
| ZayOS Workspace | Implemented/in progress | Customer-facing workspace routes for home, inbox, customers, orders, deliveries, products, saved replies, media, reports, team, channels, and settings. |
| Edge services | Phase 1 contracts implemented | NestJS services included in the PM2 runtime with health/readiness plus webhook, ingestion, integration, file metadata, and media job contracts. |

## Core API Capabilities

The core API is mounted under `/api/v1` and exposes Swagger at `/api/docs`.

Implemented API areas include:

- Authentication: login, tenant-user registration, profile, refresh, logout.
- Platform administration: dashboard stats, tenants, subscription plans, platform admins, channel templates.
- Tenant administration: tenant dashboard stats, people, channels, canned responses, products.
- ZayOS Workspace workflows: dashboard stats, conversations, messages, assignments, customer profile updates, order creation, search.
- Conversations and orders: shared endpoints for conversation creation/history/read state and order listing/status.
- Realtime foundations: Socket.IO gateways for ZayOS Workspace and conversation events.

## Next Product Pillars

After Phase 1 Launch runtime verification, the next implementation wave is expected to focus on local-market operating needs:

- Order Lifecycle System: Myanmar-friendly order statuses, delivery assignment, COD tracking ledger, partial payments, and order status history.
- Commerce Productivity Layer: smart assignment rules, unread/hot-lead/SLA queues, response timers, and team performance scoreboards.
- Customer 360 Timeline: a unified customer event layer for chats, orders, payments, calls, notes, and complaints.

## Local Development

Requirements:

- Node.js 20+ recommended.
- npm, matching the committed `package-lock.json` files.
- PM2 for running the full local stack.
- PostgreSQL and Redis running on the host machine.

Copy the sample environment file when running services directly:

```bash
cp .env.example .env
```

Install dependencies for each project, then run the default PM2 development topology:

```bash
npm install
npm --prefix backend-core-service install
npm --prefix services/chat-ingestion-service install
npm --prefix services/webhook-handler-service install
npm --prefix services/integration-service install
npm --prefix services/file-storage-service install
npm --prefix services/media-processing-service install
npm --prefix dashboards/workspace install
npm --prefix dashboards/platform-console install

npm run pm2:dev:start
```

Default local URLs:

| Component | URL |
| --- | --- |
| Core API | `http://localhost:6001/api/v1` |
| Swagger | `http://localhost:6001/api/docs` |
| Chat ingestion service | `http://localhost:6002` |
| Webhook handler service | `http://localhost:6003` |
| Integration service | `http://localhost:6004` |
| File storage service | `http://localhost:6005` |
| Media processing service | `http://localhost:6006` |
| ZayOS Workspace | `http://localhost:6100` |
| ZayOS Platform Console | `http://localhost:6101` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

## Running Projects Individually

Core API:

```bash
cd backend-core-service
npm install
npm run start:dev
```

Platform Console:

```bash
cd dashboards/platform-console
npm install
npm run dev
```

ZayOS Workspace:

```bash
cd dashboards/workspace
npm install
npm run dev
```

Supporting services follow the same NestJS workflow:

```bash
cd services/chat-ingestion-service
npm install
npm run start:dev
```

Set `PORT` when running multiple apps directly on the host.

## PM2 Production Runtime

The root `ecosystem.config.js` runs the core API, all five supporting
services, and the two dashboards using the documented ports. PostgreSQL and
Redis must already be available.

Install dependencies and build every application before starting PM2:

```bash
export CORE_API_URL='https://api.zayos.com.mm/api/v1'
export JWT_SECRET='replace-with-a-strong-secret'
export INTERNAL_SERVICE_TOKEN_SIGNING_KEY='replace-with-a-strong-internal-service-token'
export DB_PASSWORD='replace-with-the-database-password'

npm run build:backend
npm run build:services
npm run build:dashboards

npm run pm2:start
pm2 save
```

Useful lifecycle commands:

```bash
npm run pm2:restart
npm run pm2:logs
npm run pm2:stop
```

PM2 inherits deployment secrets and optional overrides from its shell
environment. At minimum, set `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`, and
`DB_PASSWORD`; do not commit production secrets to the ecosystem file.
`CORE_API_URL` must be present when the dashboards are built and started
because Next.js embeds public variables into the browser bundle.

## PM2 Dev-Build Runtime

`ecosystem.config.js` also supports running the same compiled build artifacts
with a development environment, so you can smoke-test the production build
locally without production secrets or strict validation.

Setup the dev env file once:

```bash
cp .env.dev.example .env.dev
# fill in your real local values (DB password, Telegram bot, ngrok URL, SMTP)
```

Start the build files with the dev environment:

```bash
ZAYOS_ENV=dev npm run pm2:start
```

| Action | Production | Dev-build |
| --- | --- | --- |
| Start | `npm run pm2:start` | `ZAYOS_ENV=dev npm run pm2:start` |
| Restart | `npm run pm2:restart` | `ZAYOS_ENV=dev npm run pm2:restart` |
| Stop | `npm run pm2:stop` | `npm run pm2:stop` |
| Logs | `npm run pm2:logs` | `npm run pm2:logs` |

`ZAYOS_ENV=dev` makes `ecosystem.config.js` load `.env.dev`, run with
`NODE_ENV=development`, and apply a light presence-only env validation. Without
the variable, the default production behavior is unchanged.

Both modes share the same PM2 process names, so stop the stack before switching
between them. `pm2:restart` uses `--update-env`, so the `ZAYOS_ENV=dev` prefix
must be set on the restart command too. `.env.dev` keeps `DB_SYNCHRONIZE=false`
so the compiled API boots against an already-migrated database instead of
attempting schema synchronization.

This differs from `npm run pm2:dev:start`, which runs the source code
(`start:dev` / `next dev`) with hot reload. The dev-build runtime runs the
compiled `dist` output.

## Environment Variables

Common local variables:

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection for the core API. |
| `REDIS_HOST`, `REDIS_PORT` | Redis connection for cache/realtime support. |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS` | Authentication and password hashing settings. |
| `FRONTEND_URLS` | Comma-separated CORS allowlist for dashboards. |
| `CORE_API_URL` | Server-side API base URL used by dashboard proxy routes and supporting services. |

See `.env.example` and `backend-core-service/.env.example` for full local values.
See `.env.dev.example` for the dev-build runtime (`ZAYOS_ENV=dev`) values.

## Database Schema Source

For Phase 1 Launch, TypeORM entities under `backend-core-service/src/**/*.entity.ts` are the canonical database schema. Development may use TypeORM synchronization to create or update local tables.

SQL files under `shared/database-schemas` and `backend-core-service/scripts` are reference material only and should not be treated as active migrations.

Before staging or production, add TypeORM migrations and keep schema synchronization disabled outside development.

Migration, deployment, environment, and rollback procedures live in:

- `docs/deployment/development-guideline.md`
- `docs/deployment/production-deployment-guideline.md`
- `docs/deployment/migration-and-deployment-runbook.md`
- `docs/deployment/environment-profiles.md`
- `docs/deployment/backup-and-restore.md`
- `docs/operations/failed-provider-webhooks.md`
- `docs/operations/stuck-media-jobs.md`

## Testing And Quality

Each Node project is installed and tested independently. Common commands:

```bash
npm run build
npm run lint
npm run test
```

The dashboards currently use `next lint`; the backend and supporting services use Jest and ESLint.

From the repository root, run the core Phase 1 build/test gate:

```bash
npm run ci:phase1
```

The gate includes live Playwright acceptance for all three dashboards. Locally,
start the seeded API and dashboards on the PM2 ports first. To run only the
browser suite:

```bash
npm run test:e2e
```

GitHub Actions provisions, migrates, seeds, and starts the browser stack
automatically in the `browser-acceptance` job.

Backend API smoke verification is available after the API is running and seeded:

```bash
cd backend-core-service
npm run smoke:api
```

Set `API_BASE_URL=http://localhost:6001/api/v1` when verifying the default PM2 development API port.

## Target Service Direction

The long-term architecture separates domain ownership into dedicated services:

- IAM and authorization.
- Platform and tenant management.
- Conversation and communication workflows.
- Channel management and webhook handling.
- Orders, products, and billing.
- Customer timeline and CRM event history.
- Agent productivity and routing.
- Analytics, audit, backup, file storage, and media processing.

The core API is still the source of truth for tenant, conversation, order, customer, and settings data. Edge services are included in the PM2 runtime and provide production-facing contracts; provider-certified clients, durable queues, object storage, and media workers are the next hardening layer.
