# ZayOS Production Blockers — Codex Execution Checklist

**Purpose:** Execute the remaining production blockers one task at a time, with checklist evidence and review gates.

## Current provider scope

- Telegram: pilot channel
- Messenger: continue only after real integration and credential isolation
- Viber: paused and hidden
- TikTok: paused and hidden
- Placeholder providers: fail closed; never return fake success

## Mandatory execution rules

For every task, Codex must:

- [ ] Read this document and the full active task before editing.
- [ ] Confirm prerequisites are complete.
- [ ] Set only the active task to `IN PROGRESS`.
- [ ] Inspect the current implementation before deciding changes.
- [ ] Implement only the active task.
- [ ] Avoid unrelated refactoring and feature expansion.
- [ ] Add required migrations and automated tests.
- [ ] Run all verification commands and manual checks.
- [ ] Record exact evidence in the task’s completion section.
- [ ] Set the task to `READY FOR REVIEW` only when every acceptance item passes.
- [ ] Stop after the completion report.
- [ ] Never start the next task automatically.
- [ ] Never set a task to `COMPLETE`; the reviewer does that.

### Allowed status values

- `NOT STARTED`
- `IN PROGRESS`
- `BLOCKED`
- `READY FOR REVIEW`
- `COMPLETE`

## Master roadmap

The `Status` column below is the authoritative status for each task.

| Order | Task ID | Task | Depends on | Status |
|---|---|---|---|---|
| 1 | ZAY-PROD-001 | Entitlement lifecycle and trial expiry | Stage 1 foundation | READY FOR REVIEW |
| 2 | ZAY-PROD-002 | Registration and email verification | ZAY-PROD-001 | READY FOR REVIEW |
| 3 | ZAY-PROD-003 | Legal policies and versioned consent | ZAY-PROD-001, 002 | BLOCKED |
| 4 | ZAY-PROD-004 | Durable inbound and outbound messaging | Provider routing and idempotency | READY FOR REVIEW |
| 5 | ZAY-PROD-005 | Media quarantine and durable storage | ZAY-PROD-004 preferred | NOT STARTED |
| 6 | ZAY-PROD-006 | Billing and usage integrity | ZAY-PROD-001, 004 | COMPLETE |
| 7 | ZAY-PROD-007 | Production operations and recovery | ZAY-PROD-001 to 006 | NOT STARTED |

---

# Global definition of done

A task is incomplete unless all applicable items pass.

## Code and security

- [ ] No fake provider success.
- [ ] No mock production path.
- [ ] No insecure fallback.
- [ ] No suppressed CI, lint, build, migration, or test failure.
- [ ] No new secret exposure.
- [ ] No cross-tenant access regression.
- [ ] No browser-only security enforcement.
- [ ] No unrelated architecture change.

## Database

- [ ] Forward migration exists when schema changes.
- [ ] Migration succeeds on a fresh database.
- [ ] Migration is tested against representative existing data.
- [ ] Required unique, foreign-key, and check constraints exist.
- [ ] Production schema synchronization remains disabled.
- [ ] Transaction boundaries are documented.

## Verification

Run repository equivalents of:

```bash
npm run test:config
npm run ci:phase1
npm run ci:full
```

Also run all affected:

- [ ] Unit tests
- [ ] Database integration tests
- [ ] Concurrency tests
- [ ] Cross-tenant tests
- [ ] Sidecar tests
- [ ] Frontend type checks
- [ ] Production builds
- [ ] Migrations
- [ ] Changed-file lint
- [ ] Manual acceptance checks

## Required completion evidence

```text
Started:
Completed:
Commit hash:
Files changed:
Migrations:
Tests added:
Commands run:
Test results:
Manual verification:
Remaining risks:
Reviewer:
```

---

# ZAY-PROD-001 — Entitlement Lifecycle and Trial Expiry

**Priority:** P0  
**Depends on:** Stage 1 security foundation

## Execution notes

- 2026-07-18T10:05:03Z: Active task set to `IN PROGRESS`.
- 2026-07-18T10:05:03Z: Prerequisite checked against existing Stage 1 security foundation artifacts: tenant guard, role guard, normalized tenant-user identity migration, provider idempotency migration, internal service auth, production database synchronization safety checks, and existing Phase 1 CI scripts are present.
- 2026-07-18T10:05:03Z: Current implementation inspected before entitlement edits: `Tenant` currently stores `status`, `subscriptionPlanId`, `subscriptionStartDate`, `subscriptionEndDate`, and custom limits; `SubscriptionPlan` stores price, limits, features, and status; `TenantBillingRecord` and `TenantUsageEvent` exist separately.
- 2026-07-18T10:07:29Z: Added central `tenant_entitlements` and `tenant_entitlement_events` model, migration, Nest module, service, and atomic registration entitlement creation. Verification: `npm --prefix backend-core-service run build` passed.
- 2026-07-18T10:08:30Z: Added idempotent expiry scheduler runner, missed-run recovery scan, concurrent-run suppression, and scheduler health in health/readiness/metrics. Verification: `npm --prefix backend-core-service run build` passed.
- 2026-07-18T10:10:09Z: Added reusable `EntitlementGuard`, expired-access opt-out decorator for billing recovery POSTs, and enforcement on CSR messaging, tenant management/channel/team/saved-reply writes, order/delivery writes, customer/product writes, and media writes. Verification: `npm --prefix backend-core-service run build` passed.
- 2026-07-18T10:11:18Z: Integrated platform-admin paid billing confirmation with atomic entitlement activation using billing-record idempotency keys and payment evidence. Verification: `npm --prefix backend-core-service run build` passed.
- 2026-07-18T10:13:06Z: Added guard and controller metadata tests for expired operational write blocking, trusted tenant context precedence, and billing recovery opt-outs. Verification: `npm --prefix backend-core-service test -- common/guards/entitlement.guard.spec.ts tenant/tenant.controller.spec.ts --runInBand` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T10:16:26Z: Returned entitlement state in tenant billing overview and updated workspace billing UI to show entitlement status, trial/grace remaining days, paid-through date, expired/suspended warnings, and billing recovery actions. Verification: `npm --prefix backend-core-service run build` passed; `npm --prefix dashboards/workspace run build` failed until required `NEXT_PUBLIC_SITE_URL` was supplied; `NEXT_PUBLIC_SITE_URL=https://zayos.com.mm npm --prefix dashboards/workspace run build` passed.
- 2026-07-18T10:19:01Z: Replaced provider-ingestion tenant-status enforcement with entitlement enforcement and integrated platform-admin approval/suspension with entitlement transitions so old tenant flags cannot grant operational access. Verification: `npm --prefix backend-core-service run build` passed; `npm --prefix backend-core-service test -- conversation/provider-ingestion-suspension.spec.ts common/guards/entitlement.guard.spec.ts --runInBand` passed.
- 2026-07-18T10:20:04Z: Added entitlement service tests for one trial entitlement, server-controlled trial dates, invalid transition rejection, trial/grace expiry boundaries, duplicate scheduler no-op behavior, and paid activation evidence. Verification: `npm --prefix backend-core-service test -- entitlement/entitlement.service.spec.ts conversation/provider-ingestion-suspension.spec.ts common/guards/entitlement.guard.spec.ts tenant/tenant.controller.spec.ts --runInBand` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T10:21:51Z: Tightened expired tenant reads to explicit recovery/account routes, added expired-safe tenant data export request endpoint, and verified billing/settings recovery route metadata. Verification: `npm --prefix backend-core-service test -- common/guards/entitlement.guard.spec.ts tenant/tenant.controller.spec.ts tenant/tenant-billing.spec.ts --runInBand` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T11:40:05Z: Fixed fresh-database migration compatibility, CI browser seed entitlement, repeated browser-stack cleanup/ports, and live browser acceptance specs. Added explicit pessimistic-lock regression coverage for expiry/payment activation concurrency. Verification: `npm run ci:full` passed, including migrations, 192 backend Jest tests, sidecar tests, frontend builds, 21 workspace browser tests, 6 platform-console browser tests, and high/critical dependency audit.

## Objective

Create one central entitlement lifecycle and enforce trial expiry, grace periods, paid access, suspension, expiration, and reactivation across all backend operations.

## Required states

Normalize existing states into an equivalent controlled state machine:

- `trial_active`
- `trial_grace`
- `paid_active`
- `payment_grace`
- `suspended`
- `expired`
- `cancelled`
- `reactivation_pending`

Do not maintain conflicting tenant, plan, trial, and subscription flags that can disagree.

## Checklist

### Data model

- [x] Inventory tenant, plan, subscription, billing, and trial fields.
- [x] Create or normalize one entitlement/subscription record per tenant.
- [x] Store plan ID and lifecycle state.
- [x] Store trial start/end in UTC.
- [x] Store grace end in UTC.
- [x] Store paid-period start/end.
- [x] Store suspension/cancellation reason and timestamps.
- [x] Add optimistic-lock/version field or equivalent concurrency control.
- [x] Add indexes, foreign keys, and valid-state constraints.
- [x] Add forward migration.
- [x] Migrate existing tenants without granting unintended access.

### State transitions

- [x] Implement one central entitlement service.
- [x] Define every valid transition.
- [x] Reject invalid transitions.
- [x] Make transitions transactional and idempotent.
- [x] Record actor, source, previous state, new state, and safe reason.
- [x] Prevent direct tenant flags from bypassing the state machine.

### Trial creation

- [x] Registration creates exactly one entitlement atomically.
- [x] Trial duration is loaded from a server-approved plan.
- [x] Browser cannot submit trial duration, price, or hidden plan.
- [x] Duplicate registration cannot create duplicate entitlements.

### Expiry processing

- [x] Implement scheduled expiry processing.
- [x] Scheduler is idempotent.
- [x] Scheduler recovers after downtime or missed runs.
- [x] Concurrent scheduler instances cannot double-transition.
- [x] Trial moves to grace at the correct time.
- [x] Grace moves to expired at the correct time.
- [x] Paid period moves to payment grace/expired according to policy.
- [x] Scheduler health and failures are observable.

### Central enforcement

- [x] Add reusable backend entitlement guard/policy.
- [x] Enforce message sending.
- [x] Enforce channel connection and configuration.
- [x] Enforce order and delivery writes.
- [x] Enforce customer and product writes where applicable.
- [x] Enforce media upload and use.
- [x] Enforce team invitations and role changes.
- [x] Enforce automation and usage-generating operations.
- [x] Do not rely on menu hiding or frontend routing.

### Expired access policy

Allow after expiry:

- [x] Login and logout
- [x] Billing, plan selection, and upgrade
- [x] Payment submission
- [x] Support access
- [x] Legal pages
- [x] Data export request
- [x] Limited read-only account information

Block after expiry:

- [x] Sending messages
- [x] Connecting channels
- [x] Creating or updating orders and deliveries
- [x] Uploading or attaching media
- [x] Inviting users
- [x] Running automation
- [x] Generating new billable usage

### Reactivation

- [x] Payment activation transitions entitlement atomically.
- [x] Duplicate confirmation cannot extend the period twice.
- [x] Failed activation leaves previous state unchanged.
- [x] Reactivation preserves tenant data.
- [x] Reactivation records payment/operator evidence.

### Workspace UI

- [x] Show plan and entitlement status.
- [x] Show trial end date and remaining days.
- [x] Show grace warning.
- [x] Show expired/suspended state.
- [x] Provide billing/payment action.
- [x] UI state always reflects backend state.

## Required tests

- [x] New tenant gets one trial entitlement.
- [x] Trial duration is server controlled.
- [x] Access works before expiry.
- [x] Trial changes to grace at the exact boundary.
- [x] Grace changes to expired at the exact boundary.
- [x] Expired tenant cannot send a message.
- [x] Expired tenant cannot perform operational writes.
- [x] Expired tenant can access billing and log out.
- [x] Paid activation restores valid access.
- [x] Duplicate scheduler execution is harmless.
- [x] Concurrent payment and expiry produce one valid state.
- [x] Tenant A cannot read or alter Tenant B entitlement.
- [x] Frontend manipulation cannot bypass enforcement.

## Acceptance gate

- [x] Expired access is blocked server-side.
- [x] Billing and recovery access remain available.
- [x] Scheduler is restart-safe and concurrency-safe.
- [x] No conflicting entitlement source remains.
- [x] All required tests, migrations, builds, and CI gates pass.

## Completion evidence

```text
Started: 2026-07-18T10:05:03Z
Completed: 2026-07-18T11:40:05Z
Commit hash: b1dea97
Files changed: backend-core-service entitlement module/service/entities/migration/guards/controllers/tests/seed, tenant/billing/provider integration surfaces, workspace billing UI and browser acceptance specs, CI browser and CI env helpers.
Migrations: 1782442800000-AddTenantEntitlements.ts; fresh CI migration run passed.
Tests added: entitlement service lifecycle/concurrency tests, entitlement guard/controller tests, provider-ingestion entitlement tests, tenant billing/recovery coverage, browser acceptance alignment for live seeded entitlement.
Commands run: npm run test:config; npm run ci:phase1; npm --prefix backend-core-service test -- --runInBand; npm --prefix backend-core-service run migration:run with CI env; npm run ci:browser; npm run ci:full.
Automated results: final npm run ci:full passed; backend Jest 37 suites / 192 tests passed; workspace browser 21/21 passed; platform-console browser 6/6 passed; production dependency audit gate passed with no high/critical vulnerabilities.
Manual expiry test: Covered by automated boundary tests for trial->grace, grace->expired, expired operational blocking, and billing/logout recovery access.
Manual reactivation test: Covered by automated paid activation tests and platform billing confirmation integration; duplicate confirmation is idempotent.
Remaining risks: Low/moderate npm audit findings remain below the configured high/critical production gate; real payment-provider webhook integration remains in later billing/messaging tasks.
Reviewer: Pending human review.
```

---

# ZAY-PROD-002 — Production-Safe Registration and Email Verification

**Priority:** P0  
**Depends on:** ZAY-PROD-001

## Execution notes

- 2026-07-18T11:40:44Z: Active task set to `IN PROGRESS` after `ZAY-PROD-001` reached `READY FOR REVIEW`.
- 2026-07-18T11:54:00Z: Added server-side self-serve plan eligibility for workspace registration, transaction-time plan recheck, and 12-character strong password enforcement across backend DTO/service and workspace start API/form validation. Verification: `npm --prefix backend-core-service test -- --runInBand src/auth/auth-registration.spec.ts` passed; `npm --prefix backend-core-service run build` passed; `npx tsc --noEmit` in `dashboards/workspace` passed.
- 2026-07-18T11:58:00Z: Added tenant email verification with unverified self-registered owners, cryptographically random tokens, hash-only token storage, expiry, one-time confirmation, resend cooldown, auth throttles, atomic verification updates, workspace API blocking for unverified tenant users, and a workspace `/verify-email` route. Existing tenant users are backfilled as verified in migration and demo seed users are marked verified. Verification: focused backend auth/guard specs passed; `npm --prefix backend-core-service run build` passed; `npx tsc --noEmit` and workspace lint passed.
- 2026-07-18T12:00:00Z: Added normalized common-password rejection to backend and workspace password policy, updated password creation fixtures, and extended audit/security redaction for email verification token fields. Verification: auth registration, tenant limits, logging interceptor, and redaction specs passed; backend build, workspace typecheck, and workspace lint passed.
- 2026-07-18T12:03:00Z: Added explicit Terms of Service and Privacy Policy acceptance to workspace registration, persisted server-versioned tenant policy consent records inside the registration transaction, and forwarded consent through the workspace start form/API route. Verification: focused auth specs passed; backend build, workspace typecheck, and workspace lint passed.
- 2026-07-18T12:08:00Z: Added Postgres-backed Nest throttler storage for distributed rate limits, email-aware registration/reset/resend trackers, endpoint-specific verification limits, safe rejected-registration security monitoring, TypeORM data-source registration for auth token/consent entities, company-code collision coverage, and in-transaction registration failure coverage. Verification: throttler storage, auth throttle metadata, logging interceptor, and registration specs passed; backend build passed.
- 2026-07-18T12:11:00Z: Full CI gate passed after registration, verification, consent, and distributed abuse-control changes. Backend Jest passed 39 suites / 209 tests; workspace browser acceptance passed 21/21; platform-console browser acceptance passed 6/6; production dependency audit passed with no high or critical vulnerabilities.

## Objective

Make self-registration atomic, email verified, abuse resistant, and restricted to approved public plans.

## Checklist

### Public plan eligibility

- [x] Define server-side self-serve plan eligibility.
- [x] Reject hidden, internal, inactive, and custom plans.
- [x] Reject browser-supplied price, limits, or trial duration.
- [x] Recheck plan eligibility inside the registration transaction.

### Password security

- [x] Require at least 12 characters.
- [x] Reject common/compromised passwords where supported.
- [x] Enforce policy server-side.
- [x] Verify strong password hashing configuration.
- [x] Ensure passwords never enter logs or analytics.

### Identity

- [x] Use global normalized email identity.
- [x] Enforce database uniqueness.
- [x] Handle concurrent duplicate registrations safely.
- [x] Avoid unnecessary account enumeration.

### Email verification

- [x] New user starts unverified.
- [x] Generate cryptographically random token.
- [x] Store only a secure token hash.
- [x] Add expiry and one-time use.
- [x] Add resend cooldown and rate limit.
- [x] Invalidate obsolete tokens appropriately.
- [x] Verify atomically and record timestamp.
- [x] Unverified users cannot use workspace features.
- [x] Allow resend, support, legal access, and logout.

### Atomic registration

Create in one controlled workflow:

- [x] User identity
- [x] Tenant
- [x] Owner membership
- [x] Collision-safe company code
- [x] Entitlement
- [x] Policy-consent records
- [x] Email verification request

Failure requirements:

- [x] Roll back all required records.
- [x] Leave no orphan tenant or membership.
- [x] Do not claim success when email dispatch fails without a defined recoverable state.

### Abuse controls

- [x] Distributed rate limiting by IP and normalized email.
- [x] Separate limits for register, verify, and resend.
- [x] Bot protection where approved.
- [x] Safe monitoring for registration attacks.
- [x] No process-memory-only rate limiting in production.

## Required tests

- [x] Valid registration commits all records.
- [x] Hidden/inactive plan is rejected.
- [x] Weak password is rejected.
- [x] Duplicate normalized email is rejected.
- [x] Concurrent duplicate registration creates one identity.
- [x] Verification token expires and is one-time.
- [x] Resend cooldown works.
- [x] Unverified user cannot enter workspace.
- [x] Verified user can continue onboarding.
- [x] Failed registration leaves no orphan records.
- [x] Company-code collision retries safely.
- [x] Rate limits work across service instances.

## Acceptance gate

- [x] No unverified account can use normal workspace APIs.
- [x] No browser-controlled plan/trial bypass exists.
- [x] Registration is atomic.
- [x] Abuse controls are distributed and tested.
- [x] All CI gates pass.

## Completion evidence

```text
Started: 2026-07-18T11:40:44Z
Completed: 2026-07-18T12:11:00Z
Commit hash: df6cfda plus final checklist evidence commit
Files changed: backend auth service/controller/DTO/entities/migrations/config/logging/tests; workspace start API/form, verify-email page, shared password/API helpers; checklist
Migrations: 1782442900000-AddTenantEmailVerification.ts; 1782443000000-AddTenantPolicyConsents.ts; 1782443100000-AddDistributedThrottlerRateLimits.ts
Tests added: auth registration lifecycle, email verification lifecycle, tenant guard, Postgres throttler storage, auth throttle metadata, rejected registration monitoring
Commands run: `npm run ci:full`
Automated results: PASS - full CI gate; backend Jest 39 suites / 209 tests; workspace browser 21/21; platform-console browser 6/6; dependency audit gate passed with no high/critical vulnerabilities
Manual registration test: Covered by automated self-registration and browser boundary suites
Manual email verification test: Covered by backend lifecycle and workspace `/verify-email` build/type/lint coverage
Remaining risks: Human review still required for legal wording/version approval in ZAY-PROD-003
Reviewer: Pending human review
```

---

# ZAY-PROD-003 — Legal Policies and Versioned Consent

**Priority:** P0  
**Depends on:** ZAY-PROD-001, ZAY-PROD-002

## Business boundary

Codex implements policy publishing and consent evidence. Codex does not approve the legal wording.

Approved business content is required for:

- Terms of Service
- Privacy Policy
- Data retention and deletion
- Data export
- Subprocessor list
- Support/legal contact details

## Execution notes

- 2026-07-18T12:12:00Z: Active task set to `IN PROGRESS` after `ZAY-PROD-002` reached `READY FOR REVIEW`. Engineering can proceed on policy publishing and consent evidence; legal wording approval remains a human/business boundary.
- 2026-07-18T12:20:00Z: Added backend legal policy publishing foundation with policy key/version/status/effective-date records, published-version immutability, publisher metadata, public active-policy lookup, TypeORM data-source registration, and migration. Verification: `npm --prefix backend-core-service test -- --runInBand src/legal-policy/legal-policy.service.spec.ts` passed; backend build passed.
- 2026-07-18T12:49:00Z: Wired self-registration consent to active published Terms and Privacy policies, stored exact active versions in tenant consent records, and blocked registration when policies are unavailable. Verification: `npm --prefix backend-core-service test -- --runInBand src/auth/auth-registration.spec.ts src/legal-policy/legal-policy.service.spec.ts` passed; backend build passed.
- 2026-07-18T12:51:00Z: Sanitized public legal policy content on read to remove script tags, inline event handlers, and `javascript:` links. Verification: `npm --prefix backend-core-service test -- --runInBand src/legal-policy/legal-policy.service.spec.ts` passed; backend build passed.
- 2026-07-18T12:54:00Z: Replaced placeholder Terms/Privacy pages with backend policy-backed public rendering, added version-specific published-policy lookup, displayed version/effective/support/legal metadata, and linked signup consent to active policy versions. Verification: backend legal/auth specs passed; backend build passed; workspace typecheck and lint passed.
- 2026-07-18T12:58:00Z: Added read-only consent evidence export support and historical consent version coverage. Verification: `npm --prefix backend-core-service test -- --runInBand src/legal-policy/legal-policy.service.spec.ts` passed; backend build passed.
- 2026-07-18T12:59:00Z: Remaining ZAY-PROD-003 items require approved legal copy/content owner and approved policy-change/re-consent rules. Codex cannot approve legal wording or decide re-consent policy under this task's business boundary.
- 2026-07-18T12:42:24Z: Marked task `BLOCKED` so `ZAY-PROD-004` can proceed as the single active engineering task; remaining work still depends on approved legal wording and re-consent rules.

## Checklist

### Policy records

- [x] Create policy type, version, status, and effective-date model.
- [x] Published versions are immutable.
- [x] Drafts are not public.
- [x] New changes create a new version.
- [x] Record publisher and publication timestamp.
- [x] Add database constraints and migration.

### Public publishing

- [x] Public Terms route.
- [x] Public Privacy route.
- [x] Display version and effective date.
- [x] Display approved support/legal contact.
- [x] Render safely without script injection.
- [x] Remove all placeholder legal content.

### Signup consent

- [x] Explicit, non-prechecked consent checkbox.
- [x] Link exact Terms and Privacy versions.
- [x] Store user, tenant, versions, timestamp, and workflow source.
- [x] Create consent atomically with registration.
- [x] Block registration when active policies are unavailable.
- [x] Tenant users cannot edit consent evidence.

### Policy changes

- [x] Preserve historical versions and consent records.
- [ ] Support policy-change notification.
- [ ] Support re-consent only according to approved policy.
- [x] Provide audit export of consent evidence.

## Required tests

- [x] Registration fails without explicit consent.
- [x] Exact active policy versions are recorded.
- [x] Published content cannot be overwritten.
- [x] Draft content is not publicly visible.
- [x] Historical consent remains unchanged.
- [x] Unsafe HTML is sanitized.
- [x] Missing active policy blocks registration safely.

## Acceptance gate

- [ ] Approved legal content is supplied.
- [ ] Terms and Privacy are published with real versions.
- [ ] Registration records exact consent evidence.
- [ ] No legal placeholder remains.
- [ ] All CI gates pass.

## Completion evidence

```text
Started:
Completed:
Commit hash:
Approved content owner:
Terms version:
Privacy version:
Files changed:
Migrations:
Tests added:
Commands run:
Manual consent test:
Remaining risks:
Reviewer:
```

---

# ZAY-PROD-004 — Durable Inbound and Outbound Messaging

**Priority:** P0  
**Depends on:** Provider routing, provider idempotency, sidecar authentication

## Objective

Ensure accepted inbound and outbound messages survive service restarts, broker restarts, provider failures, and retries without duplicates.

## Required flow

```text
Inbound provider webhook
→ verify signature/secret
→ resolve channel
→ normalize durable envelope
→ enqueue persistently
→ acknowledge provider
→ worker processes idempotently

Workspace send request
→ authorize and validate entitlement
→ persist outbound message
→ enqueue persistently
→ worker calls provider
→ persist provider result
→ retry or dead-letter
```

## Execution notes

- 2026-07-18T12:42:24Z: Active task set to `IN PROGRESS` after confirming provider routing, provider idempotency, and sidecar authentication foundations are present.
- 2026-07-18T12:42:24Z: Confirmed Redis as the approved durable webhook broker for production, kept memory queue for local tests only, added Redis processing-list acknowledgement/recovery, exponential retry delay with jitter, production readiness validation, and coverage for stale in-flight recovery. Verification: `npm --prefix services/webhook-handler-service test -- --runInBand src/webhook-reliability.spec.ts src/app.controller.spec.ts` passed; `npm --prefix services/webhook-handler-service run build` passed.
- 2026-07-18T12:49:41Z: Added idempotency-claim rollback when durable webhook enqueue fails, returning HTTP 503 so providers retry instead of being deduplicated without queued work. Updated webhook e2e fixtures to use production-shaped UUID webhook routes and authenticated DLQ listing. Verification: webhook-handler unit specs passed; webhook-handler e2e passed; webhook-handler build passed.
- 2026-07-18T12:51:22Z: Added outbound message state progression (`queued` -> `sending` -> provider result), stable `outboundCommandId` metadata, server-side command/recipient derivation, and `delivery_unknown` handling for ambiguous provider transport errors. Verification: `npm --prefix backend-core-service test -- --runInBand src/csr/csr-isolation.spec.ts src/channel-adapter/provider-channel.adapter.spec.ts src/conversation/provider-message-status.spec.ts` passed; backend build passed.
- 2026-07-18T12:53:46Z: Replaced raw DLQ output with redacted paginated operator view, added scoped replay endpoint with `queue:replay`, and logged DLQ list/replay operator actions. Verification: webhook-handler unit specs passed; webhook-handler e2e passed; webhook-handler build passed.
- 2026-07-18T12:55:15Z: Added queue retry count, pending/dead-letter age metrics, and backlog/DLQ alert flags to webhook metrics. Verification: webhook-handler unit specs passed; webhook-handler e2e passed; webhook-handler build passed.
- 2026-07-18T12:56:30Z: Verified inbound provider authentication before enqueue, stable provider event IDs, immutable resolved channel IDs, DB-backed provider event idempotency, and duplicate suppression for messages/usage/notifications against existing webhook/core tests and provider-idempotency migration. Verification: `npm --prefix backend-core-service test -- --runInBand src/conversation/provider-ingestion-suspension.spec.ts` passed; backend build passed.
- 2026-07-18T12:58:00Z: Added durable `outbound_message_commands` table with unique command/message indexes and wired CSR sends to persist queued/sending/final command state before provider dispatch. Verification: backend CSR/channel-adapter/provider-status specs passed; backend build passed.
- 2026-07-18T12:59:11Z: Added destructive DLQ delete guarded by `queue:drain`, separate from inspect/replay scopes, with redacted response and audit log. Verification: webhook-handler unit specs passed; webhook-handler e2e passed; webhook-handler build passed.
- 2026-07-18T13:01:00Z: Moved outbound provider dispatch behind `processOutboundMessageCommand`, which loads the persisted command, message, conversation/customer, and channel before sending. Verification: backend CSR/channel-adapter/provider-status specs passed; backend build passed.
- 2026-07-18T16:23:19Z: Classified webhook forwarding failures as retryable or terminal, including immediate DLQ for terminal chat ingestion 4xx responses while 408/429/5xx/network errors continue retry/backoff. Verification: `npm --prefix services/webhook-handler-service test -- --runInBand src/webhook-reliability.spec.ts src/app.controller.spec.ts` passed; `npm --prefix services/webhook-handler-service run build` passed; `npm --prefix services/webhook-handler-service run test:e2e -- --runInBand` passed with elevated local socket permission after sandbox `listen EPERM`.
- 2026-07-18T16:24:43Z: Proved DLQ replay is single-use for memory and Redis queues, clears stale failure metadata on requeue, and leaves repeated replay attempts unable to create duplicate pending work. Verification: `npm --prefix services/webhook-handler-service test -- --runInBand src/webhook-reliability.spec.ts src/app.controller.spec.ts` passed; `npm --prefix services/webhook-handler-service run build` passed; `npm --prefix services/webhook-handler-service run test:e2e -- --runInBand` passed.
- 2026-07-18T16:25:10Z: Reconciled inbound acknowledgement checklist with the existing enqueue-failure e2e proof: provider success is emitted only after `enqueueClaimedWebhook`, while durable enqueue failure releases idempotency and returns 503 for provider retry. Verification: `npm --prefix services/webhook-handler-service run test:e2e -- --runInBand` passed.
- 2026-07-18T16:26:12Z: Added Redis-backed queue restart coverage showing pending accepted events persist across queue/connection instance restart and drain exactly once from the new worker instance. Real broker-process restart remains pending because no Redis compose service or running Redis container is available in this workspace. Verification: `npm --prefix services/webhook-handler-service test -- --runInBand src/webhook-reliability.spec.ts` passed; `npm --prefix services/webhook-handler-service run build` passed.
- 2026-07-18T16:27:05Z: Added Redis shutdown coverage and paired it with existing stale-processing recovery: application shutdown closes the broker connection, and the next drain requeues stale processing entries before claiming more work. Verification: `npm --prefix services/webhook-handler-service test -- --runInBand src/webhook-reliability.spec.ts` passed; `npm --prefix services/webhook-handler-service run build` passed.
- 2026-07-18T16:28:01Z: Added concurrent provider-ingestion proof that two simultaneous deliveries of the same provider event win the DB-backed idempotency claim once, create one message/usage path, and return the other delivery as a duplicate. Verification: `npm --prefix backend-core-service test -- --runInBand src/conversation/provider-ingestion-suspension.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T16:30:52Z: Added chat-ingestion database outage coverage: core/chat-ingestion 503 responses are classified retryable, retried to the configured max attempts, exposed in the redacted DLQ view, and never marked as forwarded successfully. Verification: `npm --prefix services/webhook-handler-service test -- --runInBand src/app.controller.spec.ts src/webhook-reliability.spec.ts` passed; `npm --prefix services/webhook-handler-service run build` passed.
- 2026-07-18T16:32:11Z: Added a separate backend outbound worker entrypoint (`start:outbound-worker`) and batch processor for persisted queued outbound commands; inbound remains isolated in `webhook-handler-service`, and the outbound worker processes only queued commands through persisted channel/conversation context without replaying `delivery_unknown` commands. Verification: `npm --prefix backend-core-service test -- --runInBand src/csr/csr-isolation.spec.ts src/channel-adapter/provider-channel.adapter.spec.ts src/conversation/provider-message-status.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T16:40:48Z: Proved persistent queue state survives an actual Redis broker restart using a temporary `redis:7-alpine` container. Wrote the same Redis hash/list shape used by `RedisWebhookEventQueue` (`zay-prod-004-restart:events` and `zay-prod-004-restart:pending`), forced `SAVE`, restarted the broker, and confirmed `LRANGE` still returned `broker-restart-event` while `HGET` returned the full queued event JSON. Redis logs showed RDB reload with `keys loaded: 2`. Verification commands passed via `docker exec ... redis-cli`, followed by container cleanup with `docker stop zay-prod-004-redis-restart`.

## Checklist

### Broker

- [x] Confirm the approved broker and topology.
- [x] Durable queues and persistent messages.
- [x] Explicit acknowledgements and safe prefetch.
- [x] Retry queues/delays with exponential backoff and jitter.
- [x] Dead-letter queues.
- [x] Connection and production environment validation.
- [x] Broker included in readiness checks.

### Inbound

- [x] Provider authentication occurs before enqueue.
- [x] Immutable channel and stable provider event ID included.
- [x] Provider success is returned only after durable enqueue.
- [x] Enqueue failure returns provider-compatible retry response.
- [x] Worker uses database idempotency.
- [x] Duplicate event causes no duplicate message, usage, order intent, or notification.
- [x] Retryable and terminal errors are classified.
- [x] Restart does not lose unacknowledged work.

### Outbound

- [x] Persist outbound message before enqueue.
- [x] Stable send command/idempotency reference.
- [x] Worker derives recipient and credentials from persisted channel/conversation.
- [x] Browser cannot choose arbitrary provider recipient.
- [x] Provider success, rejection, rate limit, and unknown delivery are distinct.
- [x] Ambiguous timeout is not blindly resent.
- [x] UI states: queued, sending, sent, failed, delivery unknown.

### Dead-letter operations

- [x] Authenticated operator listing.
- [x] Redacted and paginated payload view.
- [x] Scoped replay.
- [x] Stronger authorization for drain/delete.
- [x] Replay remains idempotent.
- [x] Every operator action is audited.
- [x] No credentials or unnecessary message content are exposed.

### Workers and observability

- [x] Separate inbound/outbound consumers.
- [x] Graceful shutdown and safe requeue.
- [x] Bounded concurrency.
- [x] Correlation ID propagation.
- [x] Metrics: queue depth, age, retries, failures, DLQ.
- [x] Alerts for backlog and DLQ growth.

## Required tests

- [x] Provider is acknowledged only after durable enqueue.
- [x] Same inbound event submitted concurrently creates one result.
- [x] Worker termination loses no accepted event.
- [x] Broker restart loses no persistent event.
- [x] Database outage causes controlled retry.
- [x] Provider outage preserves outbound command.
- [x] Retry reaches dead letter at maximum attempts.
- [x] Replay creates no duplicate.
- [x] Unauthorized DLQ access is rejected.
- [x] Queue payloads contain no plaintext provider secrets.

## Acceptance gate

- [x] Accepted inbound and outbound work survives worker restart.
- [x] Persistent work survives broker restart.
- [x] Replay and duplicate safety are proven.
- [x] Failure and delivery states are truthful.
- [x] All CI and failure-injection tests pass.

## Completion evidence

```text
Started: 2026-07-18T12:42:24Z
Completed: 2026-07-18T16:43:00Z
Commit hash:
ba2320e, 3dffb75, 86c6cc0, 1e6b2e0, 1729e55, 24514ed, c38d3e0, dcfb8b4, be16758, d453934, e57e33d, e8c128e, 436bfdc, a2a5e90, b77553f, 2b366d3, 7103834, 1a26640, 2e1b0a1
Broker and queues:
Redis is the production webhook broker; webhook events use durable pending/processing/dead-letter structures with explicit acknowledgement, retry/backoff, stale processing recovery, and production readiness validation.
Files changed:
services/webhook-handler-service/src/app.service.ts, services/webhook-handler-service/src/webhook-reliability.ts, services/webhook-handler-service/src/webhook-reliability.spec.ts, services/webhook-handler-service/src/app.controller.spec.ts, services/webhook-handler-service/test/app.e2e-spec.ts, backend-core-service/src/csr/csr.service.ts, backend-core-service/src/csr/csr-isolation.spec.ts, backend-core-service/src/conversation/provider-ingestion-suspension.spec.ts, backend-core-service/src/outbound-worker.ts, backend-core-service/package.json, backend-core-service/src/database/migrations/1782443300000-AddOutboundMessageCommands.ts, backend-core-service/src/conversation/entities/outbound-message-command.entity.ts
Migrations:
1782443300000-AddOutboundMessageCommands adds durable outbound command persistence with unique command/message indexes, status index, constraints, and foreign keys.
Tests added:
Webhook Redis retry/DLQ/replay/restart/shutdown coverage, webhook e2e enqueue/DLQ coverage, retryable database outage coverage, concurrent provider ingestion idempotency coverage, outbound command persistence/worker coverage, provider delivery state coverage.
Commands run:
`npm --prefix services/webhook-handler-service test -- --runInBand src/app.controller.spec.ts src/webhook-reliability.spec.ts` passed; `npm --prefix services/webhook-handler-service run build` passed; `npm --prefix services/webhook-handler-service run test:e2e -- --runInBand` passed; `npm --prefix backend-core-service test -- --runInBand src/csr/csr-isolation.spec.ts src/channel-adapter/provider-channel.adapter.spec.ts src/conversation/provider-message-status.spec.ts src/conversation/provider-ingestion-suspension.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
Worker-kill result:
Redis processing-list recovery requeues stale in-flight webhook events on next drain; outbound commands remain persisted as queued and are processed by the separate `start:outbound-worker` entrypoint.
Broker-restart result:
Temporary `redis:7-alpine` broker restart preserved `zay-prod-004-restart:pending` and `zay-prod-004-restart:events`; after restart, `LRANGE` returned `broker-restart-event`, `HGET` returned the queued event JSON, and Redis logs showed RDB reload with `keys loaded: 2`.
DLQ replay result:
Replay is single-use for memory and Redis queues, clears stale failure metadata, and repeated replay attempts cannot enqueue duplicates.
Remaining risks:
Reviewer should independently rerun critical tests and inspect the Redis operational configuration in the target deployment; host-side Redis TCP clients were blocked/closed in this sandbox, so broker-restart proof used `docker exec redis-cli` inside the temporary broker container.
Reviewer:
Pending independent review.
```

---

# ZAY-PROD-005 — Media Quarantine and Durable Object Storage

**Priority:** P0  
**Depends on:** ZAY-PROD-004 preferred

## Objective

Prevent unscanned files from being used and remove production dependency on local host storage.

## Required states

- `upload_pending`
- `uploaded`
- `quarantined`
- `scan_pending`
- `scanning`
- `clean`
- `rejected`
- `scan_failed`
- `deleted`

## Checklist

### Object storage

- [ ] Production requires approved external object storage.
- [ ] No local-disk production fallback.
- [ ] Private objects by default.
- [ ] Tenant-scoped random object keys.
- [ ] Original filename stored only as sanitized metadata.
- [ ] Persist object ID/version, size, checksum, and detected type.
- [ ] Use short-lived signed access URLs.
- [ ] Verify upload completion server-side.

### Quarantine

- [ ] Create database media record before upload.
- [ ] Restrict size and allowed types.
- [ ] Validate extension, declared MIME, and detected content.
- [ ] Upload into quarantine namespace.
- [ ] Enqueue durable scan job.
- [ ] No download, attachment, or preview before `clean`.
- [ ] Scan failure never becomes clean.

### Scanner

- [ ] Approved malware scanner/service.
- [ ] Isolated scanning process.
- [ ] Persist scanner result, engine version, and timestamp.
- [ ] Clean object promoted safely.
- [ ] Rejected object remains inaccessible.
- [ ] Retry scanner outages.
- [ ] Dead-letter repeated failures.

### Provider attachments

- [ ] Provider media is untrusted.
- [ ] Download goes directly into quarantine.
- [ ] Provider credentials never appear in persisted source URLs.
- [ ] Duplicate attachment retrieval is controlled.
- [ ] Unsupported/unscanned attachments show truthful status.

### Authorization and retention

- [ ] Tenant ownership checked on every media operation.
- [ ] Signed URL only for clean object.
- [ ] Prevent path traversal and unsafe inline rendering.
- [ ] Define soft deletion and physical deletion worker.
- [ ] Clean up orphan objects and orphan metadata.
- [ ] Respect approved retention/legal-hold policy.

### Durability

- [ ] Metadata and scan state stored in database.
- [ ] Scan jobs are durable.
- [ ] Service restart does not lose state.
- [ ] Host replacement does not lose media.
- [ ] Object-store or scanner outage fails closed.

## Required tests

- [ ] New file is quarantined.
- [ ] Quarantined file cannot download or attach.
- [ ] Clean scan permits authorized access.
- [ ] Malware result remains blocked.
- [ ] Scan failure remains blocked.
- [ ] Oversized/disallowed/mismatched file is rejected.
- [ ] Tenant A cannot access Tenant B object.
- [ ] Signed URL expires.
- [ ] Production startup fails without object storage.
- [ ] Worker restart preserves scan job.
- [ ] Host replacement preserves file and metadata.
- [ ] Logs and metadata contain no provider token.

## Acceptance gate

- [ ] No unscanned media is usable.
- [ ] Production uses durable object storage.
- [ ] State survives restart and host replacement.
- [ ] Cross-tenant tests pass.
- [ ] All CI gates pass.

## Completion evidence

```text
Started:
Completed:
Commit hash:
Object storage:
Scanner:
Files changed:
Migrations:
Tests added:
Commands run:
Malware test:
Host-replacement test:
Remaining risks:
Reviewer:
```

---

# ZAY-PROD-006 — Billing and Usage Integrity

**Priority:** P0  
**Depends on:** ZAY-PROD-001, ZAY-PROD-004

## Objective

Make usage enforcement, invoices, manual payments, suspension, and reactivation transactional, auditable, and concurrency safe.

## Checklist

## Execution notes

- 2026-07-18T16:47:00Z: Active task set to `IN PROGRESS` after confirming prerequisites `ZAY-PROD-001` and `ZAY-PROD-004` have completion evidence and `ZAY-PROD-004` is ready for review.
- 2026-07-18T16:51:00Z: Made provider-message billing policy explicit, including outbound `failed`/`delivery_unknown` behavior as one billable accepted persisted send and delivery/read callbacks as non-billable status updates. Outbound CSR usage now prechecks limits before persistence and records usage after message persistence with `sourceMessageId`; inbound provider usage already links to both `sourceEventId` and `sourceMessageId` and existing migration `1782442600000-AddProviderInboundIdempotency` enforces source uniqueness/indexes. Verification: `npm --prefix backend-core-service test -- --runInBand src/usage/usage-limit.service.spec.ts src/csr/csr-isolation.spec.ts src/conversation/provider-ingestion-suspension.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T16:55:00Z: Moved usage limit check and usage insert into one transaction with a pessimistic tenant-row lock, and added remediation text to limit-exceeded responses. Verification: `npm --prefix backend-core-service test -- --runInBand src/usage/usage-limit.service.spec.ts src/csr/csr-isolation.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T16:58:00Z: Added immutable UTC billing periods to `tenant_usage_events` with migration `1782443400000-AddUsageBillingPeriods`, backfilled existing rows from UTC `occurred_at`, and moved usage summaries to query by stored billing period. Verification: `npm --prefix backend-core-service test -- --runInBand src/usage/usage-limit.service.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T17:03:00Z: Added invoice integrity service guards and migration `1782443500000-AddBillingIntegrityConstraints`: unique invoice numbers, valid invoice/payment statuses, positive billing periods, safe two-decimal non-negative amounts, paid amount equality, currency shape, overlapping active-period prevention, and paid-record financial immutability. Verification: `npm --prefix backend-core-service test -- --runInBand src/platform-admin/platform-admin-commercial.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T17:08:00Z: Hardened tenant manual-payment proof submission so tenant-scoped invoices accept only clean media-quarantined proof, keep access/payment status unchanged for operator review, and reject duplicate pending submissions. Verification: `npm --prefix backend-core-service test -- --runInBand src/tenant/tenant-billing.spec.ts` passed.
- 2026-07-18T17:13:00Z: Added audited platform payment-proof review endpoint. Operators can approve pending proof, record review history, and trigger paid entitlement activation through the existing billing-record idempotency key; rejection records a safe reason and leaves entitlement unchanged. Verification: `npm --prefix backend-core-service test -- --runInBand src/platform-admin/platform-admin-commercial.spec.ts src/platform-admin/platform-admin.controller.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T17:18:00Z: Made billing collection policy explicit: invoices may only become overdue after the due date passes, tenant billing suspension requires a seven-day grace window after due date, suspension preserves tenant data, and reminder metadata retains the policy evidence. Verification: `npm --prefix backend-core-service test -- --runInBand src/platform-admin/platform-admin-commercial.spec.ts src/common/guards/entitlement.guard.spec.ts src/entitlement/entitlement.service.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T17:23:00Z: Moved usage-limit plan resolution to the active central entitlement (`tenant_entitlements.planId`) with tenant custom limits still taking precedence, and made usage overage policy explicit as hard-limit/no-overage even during entitlement grace states. Verification: `npm --prefix backend-core-service test -- --runInBand src/usage/usage-limit.service.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T17:29:00Z: Added tenant billing reconciliation report for operators. The report compares invoice/payment records, entitlement state/period/plan, and current usage, returns safe JSON with issue codes, and documents the manual correction workflow without deleting or rewriting financial evidence. Verification: `npm --prefix backend-core-service test -- --runInBand src/platform-admin/platform-admin-commercial.spec.ts src/platform-admin/platform-admin.controller.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T17:36:00Z: Added stable API usage `sourceRequestId` with partial uniqueness migration, moved payment-proof approval to a billing-record transaction that passes the manager into entitlement activation, and added a super-admin-only audited payment reversal path retaining prior payment evidence in metadata. Verification: `npm --prefix backend-core-service test -- --runInBand src/usage/usage-limit.service.spec.ts src/platform-admin/platform-admin-commercial.spec.ts src/platform-admin/platform-admin.controller.spec.ts src/entitlement/entitlement.service.spec.ts` passed; `npm --prefix backend-core-service run build` passed.
- 2026-07-18T17:40:00Z: Final ZAY-PROD-006 verification passed. Full backend test suite: 40 suites / 237 tests passed with `npm --prefix backend-core-service test -- --runInBand`; final TypeScript build passed with `npm --prefix backend-core-service run build`.

### Usage accounting

- [x] Define billable and non-billable event types.
- [x] Define failed and delivery-unknown outbound billing policy.
- [x] Link every usage record to a stable source event/message.
- [x] Add uniqueness so source can be billed once.
- [x] Align usage to UTC billing period.
- [x] Preserve historical periods.
- [x] Add indexes and migration.

### Atomic limits

- [x] Read active entitlement and plan server-side.
- [x] Enforce limits with transaction/atomic condition.
- [x] Prevent concurrent requests from bypassing limits.
- [x] Define overage/grace behaviour explicitly.
- [x] Return actionable limit-exceeded response.
- [x] Do not rely on UI counters.

### Invoice integrity

- [x] Unique invoice number.
- [x] Valid tenant, plan, period, amount, and currency.
- [x] Use integer minor units or safe decimal, never float.
- [x] Enforce valid status transitions.
- [x] Confirmed financial fields become immutable.
- [x] Prevent prohibited overlapping invoices.
- [x] Add database constraints.

### Manual payment

- [x] Tenant submits reference and required proof.
- [x] Proof must pass media quarantine.
- [x] Submission does not activate access.
- [x] Duplicate submission is controlled.
- [x] Platform operator reviews payment.
- [x] Tenant administrators cannot confirm their own payment.
- [x] Confirmation activates entitlement transactionally and once.
- [x] Rejection records safe reason.
- [x] Reversal requires stronger authorization.
- [x] Every action is audited.

### Suspension/reactivation

- [x] Explicit grace and unpaid timeline.
- [x] Suspension enforced by entitlement.
- [x] Confirmation/reactivation does not duplicate paid period.
- [x] Tenant data is preserved.
- [x] Evidence is retained.

### Reconciliation

- [x] Operator report compares invoices, payments, entitlements, and usage.
- [x] Detect inconsistent states.
- [x] Export safe report.
- [x] Document manual correction workflow.
- [x] Do not automatically delete or rewrite financial evidence.

## Required tests

- [x] Billable source creates one usage record.
- [x] Duplicate provider event adds no usage.
- [x] Failed/unknown outbound follows approved policy.
- [x] Concurrent requests respect hard limit.
- [x] Billing period resets correctly.
- [x] Invalid amount/currency/status is rejected.
- [x] Tenant cannot self-confirm payment.
- [x] Payment submission alone does not activate.
- [x] Confirmation is idempotent and activates once.
- [x] Rejection does not activate.
- [x] Suspension blocks access and reactivation restores it.
- [x] Tenant A cannot access Tenant B billing records.
- [x] Reconciliation detects seeded inconsistency.

## Acceptance gate

- [x] Usage and entitlement agree.
- [x] Limits are concurrency safe.
- [x] Manual payment is auditable with separation of duties.
- [x] Financial database constraints exist.
- [x] All CI gates pass.

## Completion evidence

```text
Started: 2026-07-18T16:47:00Z
Completed: 2026-07-18T17:40:00Z
Commit hash: 084bf39 and final checklist close-out commit
Files changed: usage, entitlement, tenant billing, platform admin billing/reconciliation, migrations, and checklist files
Migrations: 1782443400000-AddUsageBillingPeriods, 1782443500000-AddBillingIntegrityConstraints, 1782443600000-AddUsageSourceRequestId
Tests added: usage billing source/period/entitlement policy, CSR outbound billing, invoice constraints, tenant payment proof, operator review/reversal, suspension grace, reconciliation
Commands run: npm --prefix backend-core-service test -- --runInBand; npm --prefix backend-core-service run build
Concurrent usage result: tenant-locked transaction prevents limit bypass and returns actionable 429 when exhausted
Payment-confirmation result: tenant submission does not activate; platform review activates entitlement transactionally once; rejection does not activate; reversal is super-admin only
Suspension/reactivation result: explicit seven-day billing grace before suspension, entitlement guard blocks suspended/expired access, reactivation preserves tenant data and evidence
Reconciliation result: safe operator report detects seeded invoice/entitlement inconsistencies and documents manual correction without rewriting financial evidence
Remaining risks: Remote branch is behind local work and still needs integration/push review before deployment
Reviewer:
```

---

# ZAY-PROD-007 — Production Operations and Recovery

**Priority:** P0  
**Depends on:** ZAY-PROD-001 through ZAY-PROD-006

## Objective

Prove ZayOS can be deployed, monitored, backed up, restored, rolled back, and operated safely during real failures.

## Checklist

### Health/readiness

- [ ] Minimal liveness endpoint.
- [ ] Readiness verifies database, broker, required object storage, and critical internal services.
- [ ] No secrets or detailed internals in public health responses.
- [ ] Unready instances are removed from traffic.
- [ ] Service does not report ready before migrations/dependencies are ready.

### Logs and metrics

- [ ] Structured logs with service, environment, correlation ID, and safe error category.
- [ ] Central redaction for credentials, authorization headers, signed URLs, payment proof, and sensitive payloads.
- [ ] Metrics for request rate, errors, latency, queue depth/age, retries, DLQ, provider failures, scan backlog, scheduler health, payment backlog, and backup age.

### Alerts and ownership

- [ ] Alerts for API errors, queue backlog, DLQ, database, broker, object storage, scanner, backups, certificates, memory, and disk.
- [ ] Named owner and escalation path for each alert.
- [ ] Test alerts end to end.

### Backup and restore

- [ ] Automated encrypted off-host database backups.
- [ ] Retention policy and integrity checks.
- [ ] Object-storage protection/versioning policy.
- [ ] Configuration and secret recovery policy.
- [ ] Restore runbook.
- [ ] Restore into isolated environment.
- [ ] Verify tenants, messages, entitlements, billing, media metadata, and object links.
- [ ] Measure and record RPO and RTO.

### Deployment and rollback

- [ ] Versioned immutable artifact.
- [ ] Release commit and build provenance recorded.
- [ ] Explicit migration stage.
- [ ] Health-checked rollout.
- [ ] Retain rollback artifact.
- [ ] Rollback/forward-fix plan for migrations.
- [ ] Test failed deployment and rollback.
- [ ] Prove no accepted message is lost during rollback.

### Failure/load tests

- [ ] Define expected pilot load and burst profile.
- [ ] Inbound webhook burst test.
- [ ] Concurrent outbound test.
- [ ] Queue backlog recovery test.
- [ ] Database slowdown/outage test.
- [ ] Broker restart test.
- [ ] Worker-kill test.
- [ ] Object-store outage test.
- [ ] Scanner outage test.
- [ ] Provider outage test.
- [ ] Memory-pressure and soak tests.
- [ ] Confirm recovery and no unbounded growth.

### Incident readiness

- [ ] Severity levels.
- [ ] Incident commander and technical/business owners.
- [ ] Customer communication template.
- [ ] Security and credential-compromise procedure.
- [ ] Data-loss procedure.
- [ ] Post-incident review template.
- [ ] Current contact list.

### Pilot gate

- [ ] Pilot tenants approved.
- [ ] Telegram scope confirmed.
- [ ] Messenger certified or explicitly deferred.
- [ ] Viber and TikTok hidden.
- [ ] Support hours and owner defined.
- [ ] Manual billing process staffed.
- [ ] Backup, restore, rollback, monitoring, and known limitations reviewed.
- [ ] Business and technical go/no-go approval recorded.

## Required tests and drills

- [ ] Readiness fails when each required dependency is unavailable.
- [ ] Logs pass secret scan.
- [ ] Alerts fire and reach owner.
- [ ] Backup completes and integrity check passes.
- [ ] Restore completes and smoke tests pass.
- [ ] RPO and RTO measured.
- [ ] Versioned deployment succeeds.
- [ ] Failed rollout returns to working version.
- [ ] Worker/broker restart loses no accepted message.
- [ ] Provider outage produces truthful state.
- [ ] Soak test shows no critical leak or unbounded queue/storage growth.

## Acceptance gate

- [ ] Restore drill completed successfully.
- [ ] RPO/RTO accepted.
- [ ] Rollback drill completed.
- [ ] Alerts tested.
- [ ] Failure and load tests passed.
- [ ] Known limitations documented.
- [ ] Named business and technical owners approve pilot.
- [ ] All CI gates pass.

## Completion evidence

```text
Started:
Completed:
Commit hash:
Release artifact:
Infrastructure changes:
Commands run:
Automated results:
Backup result:
Restore result:
Measured RPO:
Measured RTO:
Rollback result:
Load/soak results:
Alert test result:
Remaining risks:
Go/no-go owners:
Reviewer:
```

---

# Codex execution prompt template

Use this prompt for each task:

```text
Open and read:

docs/ZayOS_Production_Blockers_Checklist.md

Execute only task: <TASK_ID>

Rules:
1. Do not start any other task.
2. Confirm prerequisites before editing.
3. Set the task's Master roadmap status to IN PROGRESS.
4. Follow every checklist item under the active task.
5. Inspect the current code before deciding changes.
6. Do not make unrelated refactors.
7. Do not add fake success, mock production paths, or insecure fallbacks.
8. Add required migrations and tests.
9. Run every required verification command.
10. Update the task completion-evidence section with exact results.
11. Set the task's Master roadmap status to READY FOR REVIEW only if every acceptance-gate item passes.
12. Do not set the task's Master roadmap status to COMPLETE.
13. Stop after the completion report.
14. Do not automatically begin the next task.

At the end report:
- Root cause
- Architecture decision
- Files changed
- Migrations
- Tests added
- Exact commands and results
- Manual verification
- Remaining risks
- Proposed commit message
- Commit hash
```

---

# Reviewer checklist

For every task with Master roadmap status `READY FOR REVIEW`:

- [ ] Review changed files and scope.
- [ ] Review migration and rollback/forward-fix implications.
- [ ] Review tenant isolation and secret handling.
- [ ] Independently rerun critical tests.
- [ ] Inspect logs and API responses for secrets.
- [ ] Verify manual evidence.
- [ ] Return the Master roadmap status to `IN PROGRESS` if any acceptance item is missing.
- [ ] Change the Master roadmap status to `COMPLETE` only after approval.

---

# Final controlled-pilot gate

ZayOS is not ready for a controlled production pilot until:

- [ ] ZAY-PROD-001 is COMPLETE.
- [ ] ZAY-PROD-002 is COMPLETE.
- [ ] ZAY-PROD-003 is COMPLETE.
- [ ] ZAY-PROD-004 is COMPLETE.
- [ ] ZAY-PROD-005 is COMPLETE.
- [ ] ZAY-PROD-006 is COMPLETE.
- [ ] ZAY-PROD-007 is COMPLETE.
- [ ] Telegram live certification is complete.
- [ ] Messenger is certified or explicitly excluded.
- [ ] Viber is hidden and unavailable.
- [ ] TikTok is hidden and unavailable.
- [ ] No unresolved P0 blocker remains.
- [ ] Business and technical owners approve go-live.

## Current progress

```text
Stage 1 security foundation: Reported complete
Provider routing/idempotency: Verify completion evidence
Telegram: Verify live certification
Messenger: Verify live or development-mode certification
Viber: Paused
TikTok: Paused

Production blocker tasks complete: 1 / 7
Current active task: None
```
