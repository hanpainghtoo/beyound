# ZayOS Development Guideline

This guide describes the recommended local development paths for ZayOS.

## Prerequisites

- Node.js 20 or newer.
- npm.
- PostgreSQL 15 or newer.
- Redis 7 or newer.
- PM2 when using the host hot-reload topology.

## Development Modes

Use one of these modes per working session.

| Mode | Best for | Runtime |
| --- | --- | --- |
| PM2 hot reload | Day-to-day backend, service, and dashboard development on the host machine. | `npm run pm2:dev:start` |
| Individual app | Focused work on one app or service. | `npm run start:dev` or `npm run dev` |

## Host Services

The PM2 development config expects PostgreSQL and Redis to be reachable on the
standard local ports:

| Service | Host | Port |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1` | `5432` |
| Redis | `127.0.0.1` | `6379` |

Default local credentials:

```bash
DB_USERNAME=postgres
DB_PASSWORD=password
DB_NAME=zayos
```

Override these values from the shell when your local database differs.

## Environment Files

Start from the sample files:

```bash
cp .env.example .env
cp backend-core-service/.env.example backend-core-service/.env
```

Local development may use:

```bash
NODE_ENV=development
DB_SYNCHRONIZE=true
JWT_SECRET=local-dev-change-me
INTERNAL_SERVICE_TOKEN_ISSUER=zayos-local-internal-services
INTERNAL_SERVICE_TOKEN_SIGNING_KEY=local-dev-internal-service-token-signing-key-32-chars
```

Do not reuse local development secrets in staging or production.

## PM2 Hot Reload

Use this mode when PostgreSQL and Redis are already running on the host.

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

The dev ecosystem runs:

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

Useful PM2 commands:

```bash
npm run pm2:logs
npm run pm2:dev:restart
npm run pm2:dev:stop
```

When changing environment variables, restart with `--update-env`.

## Individual App Development

Core API:

```bash
cd backend-core-service
npm run start:dev
```

Supporting services:

```bash
cd services/chat-ingestion-service
npm run start:dev
```

Dashboards:

```bash
cd dashboards/workspace
npm run dev
```

Set `PORT` when running multiple apps directly on the host.

## Database And Schema

TypeORM entities under `backend-core-service/src/**/*.entity.ts` are the local
development schema source.

Development may use `DB_SYNCHRONIZE=true` for fast iteration. Staging and
production must use migrations and must keep schema synchronization disabled.

Generate and review migrations before promoting entity changes:

```bash
cd backend-core-service
npm run migration:generate -- src/database/migrations/DescriptiveMigrationName
```

## Verification

Run focused checks in the app you changed:

```bash
npm run build
npm run test
npm run lint
```

From the repository root, run the broader phase gate:

```bash
npm run ci:phase1
```

After the API is running and seeded, run the smoke check:

```bash
API_BASE_URL=http://localhost:6001/api/v1 npm --prefix backend-core-service run smoke:api
```

Use the app-specific `PORT` value instead when verifying an individually run API.
