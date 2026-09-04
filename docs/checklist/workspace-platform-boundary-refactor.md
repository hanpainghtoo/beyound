# Workspace and Platform Console Boundary Refactor Checklist

Last audited: 2026-07-10

This checklist tracks the refactor that separates the Commerce Workspace app from the Platform Console app while migrating any useful embedded platform features out of the workspace app before legacy cleanup.

## Latest Execution

- 2026-07-10: Completed the full seeded boundary and workflow gates.
  - Started the eight-process PM2 development stack and reseeded the local PostgreSQL database.
  - Workspace browser acceptance passes: 18/18 tests, including login/session boundaries, mobile inbox, media send, saved-reply CRUD, chat-to-order, COD/payment, delivery, lifecycle, and command-center captures.
  - Platform Console browser acceptance passes: 6/6 tests, including live platform login, tenant rejection, route navigation, and API-backed merchant detail.
  - Restored media attachment selection in the redesigned inbox composer after the full workflow gate exposed the regression.
  - Replaced Platform Console's removed `next lint` command with a local flat ESLint setup; Platform Console lint and TypeScript now pass.
  - Standardized E2E execution to one worker because the suites mutate shared seeded records.

- 2026-07-10: Completed login/session acceptance and conversation-to-commerce surface verification.
  - Added backend-independent Playwright coverage for workspace and platform login landing routes, session expiry routing, loaded brand assets, and mobile credential visibility.
  - Verified `npm --prefix dashboards/workspace run build` and `npm --prefix dashboards/platform-console run build`.
  - Verified `npx tsc --noEmit` in both dashboard packages.
  - Verified focused boundary suites: 4 workspace tests and 3 platform-console tests pass.
  - Workspace lint now has no errors; five pre-existing hook dependency warnings remain. Platform Console still has no local ESLint command compatible with its current package setup.

- 2026-07-10: Completed the first boundary slice.
  - Workspace login no longer sends `platform_admin` users to workspace `/dashboard`.
  - Workspace `/dashboard/*` now hands off to the dedicated Platform Console app at `PLATFORM_CONSOLE_URL` or `http://localhost:6101`.
  - Added workspace boundary tests for platform-session handoff and legacy dashboard handoff.
  - Added platform-console boundary test for tenant-user rejection.
  - Normalized Playwright and capture-script defaults from old ports to workspace `6100` and platform console `6101`.
  - Verified `npm --prefix dashboards/workspace run build`.
  - Verified `npm --prefix dashboards/platform-console run build`.
  - Verified focused workspace boundary tests from `dashboards/workspace`: `npm exec -- playwright test tests/e2e/commerce-workspace-surfaces.spec.ts --grep "Platform Console|legacy workspace dashboard"`.
  - Verified focused platform boundary test from `dashboards/platform-console`: `npm exec -- playwright test tests/e2e/login.spec.ts --grep "tenant users cannot"`.
  - Full live E2E remains pending because the seeded API and full dashboard stack were not running.
- 2026-07-10: Completed embedded workspace console cleanup after route comparison.
  - Verified the workspace-only embedded pages were already covered by stronger platform-console API-backed pages or matching canonical platform-console routes.
  - Replaced the workspace `/dashboard/*` file tree with one legacy catch-all handoff page.
  - Removed workspace duplicate platform console shell, sidebar, and static data files.
  - Removed `platform_admin` as a workspace media-library UI role.
  - Updated workspace README route documentation from old `/dashboard/*` routes to canonical `/workspace/*` routes.
  - Verified `npm run build:dashboards`.
  - Verified focused workspace boundary and legacy mapping tests from `dashboards/workspace`: `npx playwright test tests/e2e/commerce-workspace-surfaces.spec.ts --grep "Platform Console|legacy workspace dashboard"`.
  - Verified focused platform tenant rejection test from `dashboards/platform-console`: `npx playwright test tests/e2e/login.spec.ts --grep "tenant users cannot"`.
  - Attempted `dashboards/platform-console/tests/e2e/platform-workflows.spec.ts`; it is blocked until the Core API is running on `http://localhost:6001` because merchant detail routes load API-backed tenant records.
  - Attempted dashboard lint checks.
    - Workspace lint is blocked by existing `CounterCard` unused error in `dashboards/workspace/app/workspace/inbox/page.tsx` plus existing hook dependency warnings.
    - Platform Console lint is blocked because the package `next lint` command cannot find a local ESLint install.

## Current Decision Record

| Decision | Status | Notes |
| --- | --- | --- |
| Workspace app owns tenant-facing Commerce Workspace surfaces | Agreed | Canonical route family: `/workspace/*`. |
| Platform Console app owns platform/operator surfaces | Agreed | Canonical route family: `/platform-console/*`. |
| Workspace login must not expose platform console features | Implemented | Platform users are handed off to the configured Platform Console login. |
| Platform Console login must not expose workspace features | Implemented | Tenant users are cleared and rejected with a clear message. |
| Embedded workspace platform features should be migrated first | Agreed | Do not simply delete useful workspace `/dashboard/*` functionality. |
| `/dashboard/*` should not remain a canonical product route | Agreed | Treat as legacy after migration. |
| Playwright/runtime ports should be normalized | Agreed | PM2 and README use workspace `6100`, platform console `6101`. |

## Phase 0: Baseline and Inventory

- [x] Confirm local runtime ports.
  - Workspace: `http://localhost:6100`
  - Platform Console: `http://localhost:6101`
  - Core API: `http://localhost:6001/api/v1`
- [x] Confirm seeded accounts.
  - Platform: `platform@kme.local`
  - Workspace supervisor: `supervisor@demo.local`
  - Workspace finance: `finance@demo.local`
  - Workspace delivery: `delivery@demo.local`
  - Confirmed in `backend-core-service/src/database/seed.ts`; live login verification still requires the seeded Core API to be running.
- [x] Run current baseline checks before refactor.
  - [x] `npm run build:dashboards`
  - [x] `npm run test:e2e:workspace`
  - [x] `npm run test:e2e:platform-console`
- [x] Capture route inventory.
  - [x] `dashboards/workspace/app/workspace/*`
  - [x] `dashboards/workspace/app/dashboard/*`
  - [x] `dashboards/platform-console/app/platform-console/*`
- [x] Capture current embedded platform imports in workspace.
  - [x] `dashboards/workspace/components/platform-console-shell.tsx`
  - [x] `dashboards/workspace/components/platform-console-sidebar.tsx`
  - [x] `dashboards/workspace/lib/platform-console-data.ts`
- [x] Capture current platform-console API-backed pages and mock/static pages.

## Phase 1: Product Boundary

- [x] Document final app ownership.
  - [x] Workspace app: tenant users only.
  - [x] Platform Console app: platform admins/operators only.
- [x] Confirm auth meaning.
  - [x] Use `session.user.type` for app boundary: `tenant_user` vs `platform_admin`.
  - [x] Use `session.user.role` only for permissions inside the correct app.
- [x] Confirm platform role names.
  - [x] `super_admin`
  - [x] `ops_admin`
  - [x] `it_admin`
  - [x] `finance_viewer`
  - [x] `support_viewer`
  - [x] `read_only`
- [x] Confirm workspace role names.
  - [x] `owner`
  - [x] `admin`
  - [x] `supervisor`
  - [x] `csr`
  - [x] `finance`
  - [x] `delivery`
- [x] Define cross-app handoff behavior for platform users who hit workspace login.
  - [x] Local/dev handoff target: `http://localhost:6101/login`
  - [x] Production handoff target: configurable Platform Console URL
  - [x] Preserve safe `next` paths only for the target app.
- [x] Define cross-app rejection behavior for tenant users who hit platform login.
  - [x] Clear message: use Commerce Workspace account on the workspace app.
  - [x] Do not store an invalid platform session.

## Phase 2: Login and Session Refactor

- [x] Update workspace login route decision.
  - [x] Tenant users route to `/workspace` or role-specific workspace route.
  - [x] Platform users do not route to workspace `/dashboard`.
  - [x] Invalid `next` values are ignored.
- [x] Update workspace session guard behavior.
  - [x] `/workspace/*` requires `tenant_user`.
  - [x] Platform sessions cannot render workspace pages.
- [x] Confirm platform login behavior.
  - [x] Platform admins route to `/platform-console`.
  - [x] Tenant users are cleared and rejected.
- [x] Add or update login/session tests.
  - [x] `platform@kme.local` cannot land in workspace app.
  - [x] `supervisor@demo.local` cannot land in platform console app.
  - [x] Workspace login lands on `/workspace`.
  - [x] Platform login lands on `/platform-console`.
  - [x] Session expiry returns users to the correct app login.

## Phase 3: Embedded Platform Feature Migration

- [x] Compare each embedded workspace `/dashboard/*` page against the canonical platform-console app.

| Workspace Embedded Route | Platform Console Target | Migration Decision | Status |
| --- | --- | --- | --- |
| `/dashboard` | `/platform-console` | Canonical overview is richer business-operations surface; no workspace copy needed. | Complete |
| `/dashboard/tenants` | `/platform-console/merchants` | Canonical business-operations registry now lives on the merchant route; legacy tenant list redirects there. | Complete |
| `/dashboard/tenants/[tenantId]` | `/platform-console/merchants/[merchantId]` | Canonical operator detail route is the merchant detail page; legacy tenant detail now redirects there. | Complete |
| `/dashboard/tenant-onboarding` | `/platform-console/tenant-onboarding` | Canonical route matches embedded page. | Complete |
| `/dashboard/billing` | `/platform-console/billing` | Canonical page is API-backed and stronger. | Complete |
| `/dashboard/usage-limits` | `/platform-console/usage-limits` | Canonical page is API-backed and stronger. | Complete |
| `/dashboard/channels` | `/platform-console/channels` and `/platform-console/channel-templates` | Canonical channel operations page is richer; templates remain a separate platform route. | Complete |
| `/dashboard/support-access` | `/platform-console/support-access` | Canonical route has the same queue plus extra summary/actions. | Complete |
| `/dashboard/system-health` | `/platform-console/system-health` and `/platform-console/operations` | Canonical route aliases operations incident view, which is richer. | Complete |
| `/dashboard/audit-logs` | `/platform-console/audit-logs` | Canonical page is API-backed and stronger. | Complete |
| `/dashboard/settings` | `/platform-console/settings` | Canonical page is API-backed and stronger. | Complete |
| `/dashboard/feature-flags` | `/platform-console/feature-toggles` | Canonical page is API-backed and stronger. | Complete |
| `/dashboard/plans-entitlements` | `/platform-console/subscription-plans` | Canonical page is API-backed and stronger. | Complete |
| `/dashboard/platform-users` | `/platform-console/users` | Canonical page is API-backed and stronger. | Complete |

- [x] For each route above, choose one outcome.
  - [x] Already covered by platform-console: no migration needed.
  - [x] Platform-console exists but lacks useful UI/data: migrate missing pieces.
  - [x] Platform-console lacks route: create route or map to existing canonical route.
  - [x] Feature is obsolete: mark for legacy redirect only.
- [x] Replace static workspace platform data with platform-console API-backed data where possible.
- [x] Confirm migrated features respect platform roles, not `platform_admin` as a UI role.
- [x] Confirm platform routes use `/platform-console/*` links only.

## Phase 4: Route Normalization

- [x] Make `/platform-console/*` the canonical route family for platform features.
- [x] Make `/workspace/*` the canonical route family for workspace features.
- [x] Decide final handling for workspace `/dashboard/*`.
  - [x] Automatic handoff to Platform Console equivalent.
  - [x] Visible handoff card/link while the redirect runs.
- [x] Add route mapping for legacy workspace dashboard routes.
- [x] Remove new links to `/dashboard/*`.
- [x] Confirm workspace navigation has no platform feature links.
- [x] Confirm platform navigation has no workspace feature links.

## Phase 5: Config, Docs, and Tests

- [x] Normalize Playwright default base URLs.
  - [x] Workspace default: `http://localhost:6100`
  - [x] Platform Console default: `http://localhost:6101`
- [x] Update hard-coded test URLs.
  - [x] Replace workspace `3100` references.
  - [x] Replace platform `6102` references.
- [x] Update docs that still describe old `/dashboard/*` routes as canonical.
- [x] Update README or development docs if login boundary behavior changes.
- [x] Add route-boundary tests.
  - [x] Workspace rejects platform sessions.
  - [x] Platform Console rejects tenant sessions.
  - [x] Legacy `/dashboard/*` routes redirect or hand off correctly.
- [x] Add migration regression tests for moved platform features.
- [x] Run verification.
  - [x] `npm run build:dashboards`
  - [x] Focused workspace boundary and legacy route mapping tests.
  - [x] Focused platform tenant rejection boundary test.
  - [x] Dashboard lint checks pass; Workspace reports five non-blocking hook dependency warnings.
  - [x] `npm run test:e2e:workspace`
  - [x] `npm run test:e2e:platform-console`
  - [x] Platform API-backed workflow E2E with Core API running on `http://localhost:6001`.

## Phase 6: Cleanup After Migration

- [x] Remove workspace embedded platform routes after canonical replacements are verified.
- [x] Remove workspace platform shell/sidebar after no workspace imports remain.
- [x] Remove workspace `platform-console-data.ts` after no imports remain.
- [x] Remove platform role assumptions from workspace-only pages.
- [x] Search and resolve stale references.
  - [x] `/dashboard`
  - [x] `platform-console-data`
  - [x] `platform_admin` used as a UI role
  - [x] `3100`
  - [x] `6102`
- [x] Re-run full dashboard build and E2E gates.
  - [x] Full dashboard build gate passed.
  - [x] Full workspace E2E passes against seeded Core API: 18/18.
  - [x] Full platform-console E2E passes against seeded Core API: 6/6.

## Suggested Work Slices

### Slice 1: Boundary First

- [x] Workspace login no longer sends platform users to `/dashboard`.
- [x] Workspace and platform session guards enforce app ownership.
- [x] Boundary tests added.
- [x] No embedded platform feature migration yet.

### Slice 2: Platform Feature Migration

- [x] Route-by-route comparison completed.
- [x] Useful workspace embedded platform features migrated into `dashboards/platform-console`.
- [x] Platform app uses canonical routes and platform roles.
- [x] Migration regression tests added.

### Slice 3: Legacy Route and Config Cleanup

- [x] Workspace `/dashboard/*` becomes redirect or handoff.
- [x] Playwright ports normalized.
- [x] Stale docs/routes/imports removed.
- [x] Full dashboard verification passes.

## Open Questions

- [x] What should the production Platform Console URL env var be named? Answer: `PLATFORM_CONSOLE_URL`.
- [x] Should legacy workspace `/dashboard/*` redirect cross-origin automatically, or show a handoff page first? Answer: automatically redirect, with a visible handoff card/link while the redirect is in progress.
- [x] Should platform terminology standardize on `tenants`, `merchants`, or keep both with clear meaning? Answer: keep both with explicit meaning—`tenant` is the technical/account boundary; `merchant` is the business-operations lens in Platform Console.
- [x] Should old `/platform-admin/*` frontend aliases remain indefinitely, or be removed after platform-console links are stable? Answer: remove frontend aliases; `/platform-console/*` is canonical. The guarded backend `/platform-admin/*` API namespace is unaffected.
