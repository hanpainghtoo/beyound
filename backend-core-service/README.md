# KME Core API

`backend-core-service` is the main NestJS API for KME ZayOS. It owns the current domain model, authentication, tenant/platform administration APIs, CSR workflows, order/product data, logging, and realtime gateway foundations.

## Tech Stack

- NestJS with TypeScript.
- PostgreSQL through TypeORM.
- Redis/cache configuration.
- JWT authentication with Passport.
- Swagger/OpenAPI at `/api/docs`.
- Socket.IO gateways for realtime conversation and CSR events.
- Jest for tests and ESLint/Prettier for code quality.

## API Surface

The API global prefix is `/api/v1`.

| Area | Base path | Main responsibilities |
| --- | --- | --- |
| Authentication | `/api/v1/auth` | Login, tenant-user registration, profile, token refresh, logout. |
| Platform admin | `/api/v1/platform-admin` | Dashboard stats, tenant lifecycle, subscription plans, platform admins. |
| Channel templates | `/api/v1/platform-admin/channel-templates` | Platform-managed channel template CRUD. |
| Tenant admin | `/api/v1/tenant` | Tenant dashboard stats, people, channels, canned responses, products. |
| Tenant products | `/api/v1/tenant/products` | Product and product category management. |
| CSR | `/api/v1/csr` | Commerce Workspace stats, conversations, messages, assignment, order creation, customer updates, search. |
| Conversations | `/api/v1/conversations` | Conversation creation, customer history, read state. |
| Orders | `/api/v1/orders` | Order listing, details, items, status updates. |

Swagger is available at:

```text
http://localhost:3001/api/docs
```

## Main Modules

- `auth`: platform admin and tenant user authentication.
- `platform-admin`: platform tenant, subscription, admin, and channel-template management.
- `tenant`: tenant-scoped settings, people, channels, canned responses, and product access.
- `csr`: CSR-facing conversation, customer, and order workflows.
- `conversation`: shared conversation and message persistence.
- `order` and `product`: order/product entities and APIs.
- `analytics`: analytics entities for platform and tenant metrics.
- `logging`: request logging, audit logs, and logging services.
- `websocket`: Socket.IO gateways and websocket auth/events.
- `database`: TypeORM configuration, datasource, and seed script.

## Subscription, Usage, And Billing Canonical Model

Launch-facing subscription, usage, and billing architecture is documented in:

```text
docs/checklist/subscription-usage-billing-architecture.md
```

That document defines the canonical sources for:

- subscription plan identity and public rollout metadata
- tenant subscription assignment and custom limit overrides
- tenant billing records and payment confirmation
- usage-event backed provider-message and API consumption
- active seat and connected-channel usage counts

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start PostgreSQL on `localhost:5432` and Redis on `localhost:6379`.

Run the API in development mode:

```bash
cd backend-core-service
npm run start:dev
```

The API listens on `PORT`, defaulting to `3001`.

## Environment Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | No | `development` for local work. |
| `PORT` | No | Defaults to `3001`. |
| `DB_HOST` | Yes | PostgreSQL host. Use `localhost` locally. |
| `DB_PORT` | Yes | PostgreSQL port. Defaults to `5432` locally. |
| `DB_USERNAME` | Yes | PostgreSQL username. |
| `DB_PASSWORD` | Yes | PostgreSQL password. |
| `DB_NAME` | Yes | PostgreSQL database name. |
| `REDIS_HOST` | Yes | Redis host. |
| `REDIS_PORT` | Yes | Redis port. Defaults to `6379` locally. |
| `JWT_SECRET` | Yes | Use a strong secret outside local development. |
| `JWT_EXPIRES_IN` | No | Default token lifetime, for example `24h`. |
| `BCRYPT_ROUNDS` | No | Password hash cost. |
| `FRONTEND_URLS` | No | Comma-separated CORS origins for dashboards. |
| `WORKSPACE_PUBLIC_APP_URL` | Yes in production | Public workspace origin used for tenant password-reset and invitation links. |
| `PLATFORM_CONSOLE_PUBLIC_APP_URL` | Yes in production | Public platform-console origin used for platform-admin password-reset links. |
| `WEBHOOK_PUBLIC_BASE_URL` | Yes in production | Public base origin used to generate tenant channel callback URLs, for example `https://api.zayos.com.mm`. Legacy aliases remain supported only when explicitly configured. |
| `CACHE_TTL`, `THROTTLE_TTL`, `THROTTLE_LIMIT` | No | Cache and rate-limit tuning. |
| `MAX_FILE_SIZE`, `UPLOAD_PATH` | No | Upload constraints used by file-capable workflows. |
| `SMTP_*` | No | Reserved for notification/email flows. |

## Database And Seed Data

For Phase 1 Launch, TypeORM entities under `src/**/*.entity.ts` are the canonical database schema. Development uses TypeORM synchronization to create or update local tables.

SQL files under `../shared/database-schemas` and `scripts` are reference material only. Do not treat them as active migrations.

Before staging or production, add TypeORM migrations and keep schema synchronization disabled outside development.

The seed script is:

```bash
npm run seed
```

From the repository root, the full v2 demo seed is:

```bash
npm run seed:demo
```

`seed:demo` runs the Core database seed against the local database, then seeds Media Library files, product-image associations, and one media-backed reply through the live Core API and file-storage service. It is additive/idempotent for named demo records and does not reset unrelated browser-test data.

For a compiled production build:

```bash
npm run build
npm run seed:prod
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Start the API with `ts-node`. |
| `npm run build` | Compile TypeScript into `dist/`. |
| `npm run start:prod` | Run the compiled API. |
| `npm run seed` | Run the TypeScript database seed. |
| `npm run smoke:api` | Run authenticated API smoke verification against a running API. |
| `npm run lint` | Run ESLint with auto-fix. |
| `npm run format` | Format source and test files. |
| `npm run test` | Run Jest unit tests. |
| `npm run test:e2e` | Run e2e tests through `test/jest-e2e.json`. |
| `npm run test:cov` | Run test coverage. |

## PM2

From the repository root, run the full local PM2 stack:

```bash
npm run pm2:dev:start
```

The development PM2 ecosystem maps the Core API to `localhost:6001`.

## API Smoke Verification

After the API is running and seeded, run:

```bash
npm run smoke:api
```

By default this targets the API URL configured in the smoke script. To target the default PM2 development API port:

```bash
API_BASE_URL=http://localhost:6001/api/v1 npm run smoke:api
```
