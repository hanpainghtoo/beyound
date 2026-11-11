# ZayOS Clean Release Verification Matrix

Last updated: 2026-07-11

This runbook turns the release engineering gate into a repeatable command matrix.

Use it together with:

- [Production Launch Program Plan](/home/kyaw/kme/kme-omnichannel/docs/operations/production-launch-program-plan.md)
- [Production Launch Program Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/production-launch-program-checklist.md)
- [Migration And Deployment Runbook](/home/kyaw/kme/kme-omnichannel/docs/deployment/migration-and-deployment-runbook.md)

## Rules

- Run this from a clean working tree or record any intentional diff.
- Use production-safe environment values.
- Do not seed production.
- Record result, owner, environment, date, and artifact for every step.

## Verification Matrix

| Step | Command | Expected result | Notes |
| --- | --- | --- | --- |
| Root dependencies | `npm install` | Root scripts available | Also install each workspace/service if node_modules are absent. |
| Backend dependencies | `npm --prefix backend-core-service install` | Backend dependencies resolve | Repeat for dashboards and services when needed. |
| Backend build | `npm run build:backend` | Exit code `0` | Builds NestJS API. |
| Backend tests | `npm run test:backend` | Exit code `0` | Full backend Jest gate. |
| Dashboards build | `npm run build:dashboards` | Exit code `0` | Builds Workspace and Platform Console. |
| Services build | `npm run build:services` | Exit code `0` | Builds all PM2-included services. |
| Phase 1 aggregate gate | `npm run ci:phase1` | Exit code `0` | Fast combined build and backend-test gate. |
| Browser acceptance | `npm run test:e2e` | Exit code `0` | Requires seeded runtime or CI-style prepared stack. |
| API smoke | `npm run smoke:api` | Exit code `0` | Requires running API and valid seed/runtime data. |
| Provider smoke | `PROVIDER_SMOKE_REQUIRE_ALL=true npm run smoke:providers` | Exit code `0` or documented conditional result | Requires tenant-owned credentials. |
| PM2 development boot | `npm run pm2:dev:start` | All processes online | Verify local ports and logs. |
| PM2 production boot | `npm run pm2:start` | All production processes online | Requires prior builds and production env vars. |

## Database Verification

## Migration Rehearsal

Run from `backend-core-service`:

```bash
npm run migration:show
npm run migration:run
```

Expected result:

- no migration failure
- no schema drift surprise
- app can start after migration

## Rollback Rehearsal

Run from `backend-core-service` only in a safe rehearsal environment:

```bash
npm run migration:revert
```

Expected result:

- rollback path is confirmed
- restore plan is documented if revert is not enough

See:

- [backup-and-restore.md](/home/kyaw/kme/kme-omnichannel/docs/deployment/backup-and-restore.md)
- [migration-and-deployment-runbook.md](/home/kyaw/kme/kme-omnichannel/docs/deployment/migration-and-deployment-runbook.md)

## PM2 Readiness Checks

After PM2 boot, verify:

```bash
curl -f http://localhost:6001/api/v1/health
curl -f http://localhost:6001/api/v1/ready
curl -f http://localhost:6002/health
curl -f http://localhost:6002/ready
curl -f http://localhost:6003/health
curl -f http://localhost:6003/ready
curl -f http://localhost:6004/health
curl -f http://localhost:6004/ready
curl -f http://localhost:6005/health
curl -f http://localhost:6005/ready
curl -f http://localhost:6006/health
curl -f http://localhost:6006/ready
```

Expected result:

- HTTP `200`
- no dependency failure in readiness payloads

Also verify dashboards load:

```bash
curl -f http://localhost:6100/login
curl -f http://localhost:6101/login
```

## Release Evidence Template

```text
Step:
Owner:
Environment:
Command:
Artifact or log:
Result:
Known limitations:
Date:
Commit / build:
```

## Typical Release Order

1. Install dependencies.
2. Build backend, dashboards, and services.
3. Run backend tests.
4. Run migration rehearsal.
5. Start PM2 runtime.
6. Run readiness checks.
7. Run API smoke.
8. Run browser acceptance.
9. Run provider smoke if credentials are available.
10. Record results in the launch checklist and risk register.
