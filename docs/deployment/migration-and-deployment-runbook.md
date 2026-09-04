# Commerce OS Migration And Deployment Runbook

This runbook covers the engineering-owned release path for Commerce OS environments.

## Environment Modes

| Environment | Schema sync | Seed behavior | Expected use |
| --- | --- | --- | --- |
| Local development | `DB_SYNCHRONIZE=true` allowed | `npm run seed` allowed | Fast PM2 iteration and demos. |
| Test/CI | `DB_SYNCHRONIZE=true` allowed when explicitly set | Seed only in disposable databases | Build and test verification. |
| Staging | Disabled | Seed only with explicit approval | Production-like release verification. |
| Production | Disabled and blocked | Blocked unless `ALLOW_PRODUCTION_SEED=true` | Live tenant data. |

Production must use migrations. Do not enable TypeORM schema synchronization outside local/test.

## Required Production Variables

The backend fails fast in production unless these are present:

- `DB_HOST`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `FRONTEND_URLS`
- `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`

Use a strong `JWT_SECRET` and `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`. Do not reuse local development values.

## Migration Commands

Run these from `backend-core-service`.

Show pending/executed migrations:

```bash
npm run migration:show
```

Run migrations:

```bash
npm run migration:run
```

Rollback the most recent migration:

```bash
npm run migration:revert
```

Generate a migration after entity changes:

```bash
npm run migration:generate -- src/database/migrations/DescriptiveMigrationName
```

Review generated SQL before merging. A generated migration is not automatically safe.

## Local Empty Database Migration Test

1. Start PostgreSQL.
2. Create an empty database.
3. Set backend DB variables to the empty database.
4. Run:

```bash
cd backend-core-service
npm run migration:run
npm run build
```

5. Start the API and verify `/api/docs` loads.

## Seeded Data Migration Test

1. Start from a database with existing seed data.
2. Run:

```bash
cd backend-core-service
npm run migration:run
npm run seed
npm run smoke:api
```

3. Confirm tenant, channel, customer, conversation, order, and audit-log smoke checks still pass.

## Deployment Procedure

1. Confirm CI is green on the target commit.
2. Build production images for backend, dashboards, and services.
3. Back up the target database. See `docs/deployment/backup-and-restore.md`.
4. Run migrations against the target database.
5. Deploy backend and sidecar services.
6. Deploy dashboards with the correct `CORE_API_URL`.
7. Run API smoke tests:

```bash
API_BASE_URL=https://api.zayos.com.mm/api/v1 npm --prefix backend-core-service run smoke:api
```

8. Verify provider webhooks, login, dashboard loading, and order workflows.

## Rollback Procedure

Prefer application rollback first when the migration is backward compatible.

1. Stop or drain new deployments.
2. Redeploy the previously known-good images.
3. If the migration must be reverted, run:

```bash
cd backend-core-service
npm run migration:revert
```

4. If rollback cannot safely revert data, restore from the pre-deploy database backup.
5. Run smoke tests against the restored or rolled-back environment.
6. Record the incident, failed version, rollback version, and database state.

## PM2 Notes

Use `ecosystem.dev.config.js` for local hot-reload development and
`ecosystem.config.js` for production. The development ecosystem sets
`DB_SYNCHRONIZE=true`; production must leave it unset or set it to `false`.
