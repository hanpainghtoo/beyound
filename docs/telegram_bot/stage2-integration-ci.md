# Stage 2 integration CI contract

This repository does not contain a checked-in CI workflow definition. The CI runner should provision the same service container used locally before invoking `npm run ci:integration`:

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: zayos_test
      POSTGRES_PASSWORD: zayos_test
      POSTGRES_DB: postgres
    options: >-
      --health-cmd="pg_isready -U zayos_test -d postgres"
      --health-interval=1s --health-timeout=5s --health-retries=30
env:
  TEST_DATABASE_URL: postgresql://zayos_test:zayos_test@postgres:5432/zayos_test
```

The job must run `npm run ci:integration`. The command creates the empty `zayos_test` database, runs the complete migration chain with `DB_SYNCHRONIZE=false`, reverts and reapplies the last four migrations, runs the real-PostgreSQL integration suite, and exits non-zero on failure. `docker-compose.test.yml` is the local equivalent with tmpfs storage and port `55432`.
