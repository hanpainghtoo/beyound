# Commerce OS Backup And Restore

Commerce OS uses PostgreSQL as the source of truth for tenants, users, channels, customers, conversations, orders, products, audit logs, and operational settings.

## Backup

Run from the repository root:

```bash
DB_HOST=localhost \
DB_PORT=5432 \
DB_USERNAME=postgres \
DB_PASSWORD=password \
DB_NAME=zayos \
npm run db:backup
```

By default, backups are written to `backups/<database>-<timestamp>.dump`.

To choose a specific output path:

```bash
npm run db:backup -- backups/pre-release.dump
```

## Restore

Restore is intentionally guarded because it can replace live data.

```bash
ALLOW_DB_RESTORE=true \
DB_HOST=localhost \
DB_PORT=5432 \
DB_USERNAME=postgres \
DB_PASSWORD=password \
DB_NAME=zayos \
npm run db:restore -- backups/pre-release.dump
```

The restore command uses `pg_restore --clean --if-exists --no-owner`.

## Production Release Use

Before every production deployment:

1. Create a fresh backup.
2. Store it outside the application host.
3. Record the backup filename in the release notes.
4. Run migrations.
5. Deploy the application.
6. Run smoke tests.

## Restore Drill

At least before public launch, test restore into a disposable database:

```bash
createdb commerce_os_restore_test
ALLOW_DB_RESTORE=true DB_NAME=commerce_os_restore_test npm run db:restore -- backups/pre-release.dump
```

Then point the backend to `commerce_os_restore_test`, run `npm --prefix backend-core-service run build`, start the API, and run smoke tests.
