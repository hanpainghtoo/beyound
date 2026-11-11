# Production Readiness Audit

**System:** ZayOS / KME Omnichannel
**Audit date:** 2026-07-18
**Source revision:** `d0b1497` (`fix(security): authenticate internal sidecar services`)
**Second-pass blocker sweep:** completed 2026-07-18
**Remediation update:** P0 security/CI/dependency fixes reviewed through commit `d0b1497`
**Decision:** **NO-GO for broad production launch**

## Executive summary

The repository contains a substantial product foundation: a public plan and registration flow, tenant and platform workspaces, persisted usage events, a manual billing ledger, encrypted provider credentials, real Telegram and Messenger API clients, inbound webhook normalization, and automated backend tests.

It is not yet safe or operationally complete enough for a public self-service launch. A tightly controlled pilot could become reasonable after the P0 gates in this report are closed, using **Telegram only**, a small number of known merchants, manually operated billing, and explicit support ownership.

Since the original audit snapshot, the following P0 security and release-gate issues have been remediated in code:

- `3c4319f` — password reset no longer returns usable reset tokens/URLs and now uses hashed, one-time secure tokens.
- `612522b` — tenant-user responses and audit payloads no longer expose password hashes, invite URLs, reset URLs, tokens, or credential material.
- `97354d0` — tenant-user identity now uses a globally unique normalized email model.
- `bfda7bf` — critical/high production dependency advisories were remediated.
- `d0b1497` — internal sidecar endpoints now require scoped short-lived service JWTs.

The product is still not ready for broad production launch. Remaining launch blockers include placeholder legal policies, trials/entitlements that are not fully enforced, provider credential checks that are not truly provider-native, webhook URL/tenant-secret issues for multi-tenant providers, uploads that are usable without malware quarantine, non-durable delivery paths, missing database-level provider idempotency, and unproven live-environment gates. The standard `ci:phase1` gate now passes, but `ci:full` remains blocked in the local browser-stack migration step by a PostgreSQL credential mismatch, so browser and live HTTP authorization verification still need a clean CI/runtime environment.

### Readiness by area

| Area | Current state | Production assessment |
|---|---|---|
| Customer acquisition and onboarding | Pricing, lead capture, registration, tenant creation, and onboarding UI exist | **Not ready** — identity verification, consent, entitlement lifecycle, abuse protection, and trial-to-paid conversion are incomplete |
| Social platform integration | Telegram and Messenger clients plus inbound processing exist; TikTok inbound work exists | **Not ready** — connection tests are superficial, multi-tenant webhook secrets are unresolved, queueing is not crash-safe, and provider certification is incomplete |
| Billing and usage | Plans, records, payment proof, manual confirmation, limits, and usage dashboards exist | **Pilot only** — it is a manual ledger, not a complete subscription lifecycle; expiry and important accounting invariants are not enforced |
| Security and privacy | JWT auth, role guards, credential encryption, sanitized audit/logging, secure password reset, normalized identity, and internal service JWTs now exist | **Improved but not ready** — security headers, legal/privacy controls, malware quarantine, provider secret isolation, session hardening, and live security tests still block launch |
| Reliability and operations | PM2 topology, health endpoints, migrations, logs, runbooks, and deterministic phase-one CI now exist | **Not ready** — single-host/local-state defaults, weak dependency readiness, missing alert evidence, and unproven backup/restore and rollback remain |
| Verification and release process | `ci:phase1`, focused tests, builds, lint, type checks, and production dependency audit now pass | **Improved but not ready** — `ci:full` browser-stack verification is blocked locally by database credentials; live provider/load/restore/security tests remain unproven |

## Scope and method

This was a source-code and repository audit focused on:

1. How a customer discovers, buys/subscribes to, activates, and uses the service.
2. Social platform connection, inbound webhook handling, outbound messages, and operational failure modes.
3. Billing, payment, entitlements, usage measurement, and limit enforcement.
4. Cross-cutting security, privacy, reliability, deployment, and release controls that affect those three flows.

The audit included two source-review passes, controller/service/entity tracing, tenant-scope sampling, configuration and runbook review, test/build/type/lint execution, placeholder searches, and production-dependency audits. It did **not** include a live production environment, real provider credentials, penetration testing, load/soak testing, a restore drill, or verification of external approvals.

No source-only review can prove that no other blocker exists. Final assurance also requires the live-environment gates in this report. The second pass is intended to reduce omission risk and records newly confirmed findings rather than replacing those runtime gates.

## What is already in good shape

- Public pricing is backed by canonical subscription-plan data rather than hard-coded display-only identifiers.
- Registration creates a tenant owner and session, and there is a usable workspace onboarding path.
- Tenant and platform consoles expose billing, usage, channel, and operational views.
- Provider credentials are encrypted with authenticated encryption and redacted from normal API responses.
- Password reset now returns a generic public response, stores token hashes, uses cryptographically random tokens, and enforces one-time expiry semantics.
- Tenant-user APIs now use explicit response contracts and centralized redaction protects logs/audit records from common secret fields.
- Tenant-user login identity now uses a persisted globally unique normalized email.
- Internal sidecar service endpoints now use scoped short-lived service JWTs rather than unauthenticated or shared-key access.
- Telegram and Messenger have real outbound client implementations.
- Inbound messages are normalized and persisted through the conversation flow.
- Provider-message and API-request usage events are persisted with useful indexes.
- Billing supports manual payment proof, operator review, reminders, and tenant suspension.
- The deterministic phase-one gate now passes, including configuration validation, type checks, lint gates, tests, builds, and production dependency audit.

These are valuable foundations, but they do not remove the launch gates below.

## P0 remediation status since the original audit

| Original blocker | Current status | Evidence / caveat |
|---|---|---|
| SEC-01 password-reset takeover | **Remediated in code** | Commit `3c4319f`; focused reset tests pass. Session-revocation remains limited to existing infrastructure. |
| SEC-02 critical/high production dependencies | **Remediated in code** | Commit `bfda7bf`; `npm run ci:audit` reports zero high/critical production advisories. |
| SEC-03 tenant-user/audit secret exposure | **Remediated in code** | Commit `612522b`; explicit tenant-user DTOs and centralized redaction added. |
| AUTH-01 ambiguous tenant-user identity | **Remediated in code** | Commit `97354d0`; normalized email column, uniqueness migration, and duplicate preflight script added. |
| INT-04 unauthenticated sidecar endpoints | **Remediated in code** | Commit `d0b1497`; scoped internal service JWT package, guards, clients, tests, and documentation added. Live HTTP checks are still pending because the local browser/full stack is blocked by database credentials. |
| CI-01 broken phase-one release gate | **Mostly remediated** | `npm run ci:phase1` passes. `npm run ci:full` still fails at browser-stack migration with local PostgreSQL auth (`password authentication failed for user "postgres"`), so full browser evidence remains pending. |

## P0 launch blockers and current disposition

P0 means the issue must be resolved before any real customer pilot unless the row explicitly narrows the safe pilot scope.

| ID | Finding and impact | Evidence | Required exit condition |
|---|---|---|---|
| SEC-01 | **Remediated — password reset account-takeover exposure.** Original issue returned `resetUrl`/token and disclosed account existence. | Commit `3c4319f`; secure reset-token hash migration and reset tests. | Keep generic reset responses, real delivery configuration, rate limiting, and redacted logs in place. Add session revocation if/when durable session storage is introduced. |
| SEC-02 | **Remediated — high/critical production dependency advisories.** Original audit found critical/high advisories in backend, sidecars, workspace, and platform console. | Commit `bfda7bf`; `npm run ci:audit` reports zero high/critical production advisories. | Continue running the dependency audit gate and handle future advisories through normal security patch SLAs. |
| SEC-03 | **Remediated — tenant-user response and audit secret exposure.** Original issue exposed serializable `passwordHash` and token-bearing invite URLs. | Commit `612522b`; explicit DTOs/mappers, redaction utility, interceptor sanitization, and regression tests. | Historical audit records from before remediation may still require compliance-led remediation if they contain secrets. |
| AUTH-01 | **Remediated — ambiguous tenant-user identity.** Original model allowed duplicate emails across tenants while login/reset selected by raw email. | Commit `97354d0`; normalized email column, global uniqueness migration, duplicate preflight, and service lookup updates. | Multi-workspace membership remains out of scope and requires a separate global-user/member architecture. |
| LEG-01 | **Terms and privacy pages are placeholders, and registration records no policy consent/version.** A public signup cannot establish informed agreement or meet a credible privacy posture. | `dashboards/workspace/app/privacy-policy/page.tsx:18`; `terms-of-service/page.tsx:18`; registration DTO/service contains no consent record | Obtain approved terms/privacy/cookie wording; show it before signup; record policy versions, timestamp, tenant/user, and source; publish retention, deletion, export, subprocessors, and support contacts |
| ENT-01 | **A 14-day subscription end is written but never enforced.** Authentication only depends on active tenant status, so an expired trial can continue indefinitely. Self-registration also creates no invoice or explicit trial/subscription state. | `backend-core-service/src/auth/auth.service.ts:234-248`; `backend-core-service/src/tenant/entities/tenant.entity.ts:79`; no expiry enforcement path found | Introduce an entitlement state machine and scheduled transition; enforce expiry centrally while retaining billing/export/support access; create trial/subscription and billing records atomically; test expiry, grace, conversion, suspension, and reactivation |
| ONB-01 | **The backend accepts any active plan ID, including plans the UI may hide or mark non-self-serve.** Direct API calls can bypass the pricing-page filter. Signup also bypasses the repository's stronger 12-character password policy and has no email verification. | `register-workspace.dto.ts:19` uses minimum 8; registration service validates active plan but not public/self-serve availability | Enforce `visible`, available, and `features.public.selfServe` server-side; use the strong password policy everywhere; verify email ownership before activation; add distributed rate limiting and bot controls at ingress and API |
| INT-01 | **Provider “test connection” does not contact the provider.** It checks credential-field presence, allowing invalid secrets to mark channels connected/ready. | `services/integration-service/src/app.service.ts:156`; `backend-core-service/src/channel/provider-credentials.util.ts:108`; status changes in `tenant.service.ts:815-873` | Implement provider-native identity/permission checks with timeouts and redacted errors; persist verified provider identity and test timestamp; do not mark connected until the live check and webhook check pass |
| INT-02 | **Generated webhook routes do not reliably identify the saved channel.** URL construction uses a slug of the channel name before the channel UUID exists, while webhook processing treats the path value as the channel identifier used by core. | `backend-core-service/src/tenant/tenant.service.ts:746`, `:1094`; webhook routes/services use `channelId` | Save the channel first, build the callback from its opaque UUID (or a dedicated random routing token), then register it; migrate existing URLs; add end-to-end tests from provider request through tenant/channel resolution |
| INT-03 | **Messenger and Viber verification secrets are global, not tenant/channel scoped.** That design cannot safely support tenant-owned credentials across multiple customers. | `services/webhook-handler-service/src/app.service.ts:85`, `:307`, `:360` uses `MESSENGER_VERIFY_TOKEN`, `MESSENGER_APP_SECRET`, and `VIBER_AUTH_TOKEN` | Resolve the target channel first and retrieve its secret through an authenticated internal call/cache; verify signatures using that channel's secret; define secret rotation and cache invalidation; prove isolation with two-tenant tests |
| INT-04 | **Remediated in code — internal sidecar actions now require scoped service identity.** Internal/admin endpoints are protected by short-lived service JWTs with issuer, audience, caller, and scope checks. Public provider callbacks remain public and provider-verified. | Commit `d0b1497`; shared `packages/internal-service-auth`, sidecar guards, client auth headers, env validation, and route inventory documentation. | Complete live HTTP authorization checks once the local/CI full stack starts successfully. Consider asymmetric signing and distributed JTI replay checks as future hardening. |
| MEDIA-01 | **Uploaded files are not quarantined or automatically scanned before use.** The core upload flow does not enqueue a media scan. The scanning service defaults to a non-blocking `placeholder` verdict, and core only stores recent media callbacks in memory without enforcing infected/clean state. A tenant can therefore share or download an allowed-type file before any malware decision. | No `MEDIA_PROCESSING_URL` or `/media/jobs` call in `media-library.service.ts`; `media-processing-service/src/app.service.ts:286-295`; `media-callback.service.ts` stores callbacks in an in-memory array | Add pending/quarantined/clean/rejected file states; verify actual bytes/type/size; enqueue a mandatory durable scan on completion; permit download/attachment only after a clean verdict; archive infected content; make scan state durable; fail production startup if required scanning is unavailable |
| REL-01 | **Inbound and outbound delivery are not durably recoverable.** Webhook Redis processing removes an event with `LPOP` before success and drains inline in the request; no visibility-timeout recovery worker was found. Outbound sending is synchronous with no durable retry worker. | `services/webhook-handler-service/src/webhook-reliability.ts:266-276`; `app.service.ts:192`; direct adapter send path | Use a durable queue with ack/retry/backoff, visibility timeout, poison handling, idempotent consumers, replay tooling, and a separate worker; acknowledge provider webhooks promptly after durable enqueue; queue outbound sends and expose delivery state |
| REL-02 | **Production storage/media defaults are host-local.** PM2 defaults `STORAGE_DRIVER` to `local-contract`, which falls back to local behavior; S3 metadata is held in local JSON and direct-upload completion is not durably finalized. Media processing also defaults to local JSON state. | `ecosystem.config.js:186`; file-storage and media-processing adapters/configuration | Make an external object store and durable metadata database mandatory in production; implement upload completion/verification; make media jobs durable; validate required settings at startup; test replacement of the application host without data loss |
| DATA-01 | **Provider idempotency is check-then-insert without database uniqueness.** Messages, provider customers, and provider conversations have no unique constraints for their provider identity keys. Concurrent deliveries or replay after the Redis idempotency TTL can create duplicates and double-count usage. | `conversation.service.ts:140-204`, `:437-507`; no unique indexes on `external_message_id`, customer channel/external ID, or provider conversation identity in entities/migrations | Add correctly scoped unique constraints; use transactional upsert/insert-on-conflict; record the provider event ID durably; make usage recording and message acceptance idempotent together; test concurrent duplicates and replay after queue/idempotency expiry |
| CI-01 | **Mostly remediated — phase-one release gate is deterministic and blocking.** Next.js type/lint suppression has been removed, workspace/platform type checks pass, changed-file backend lint is enforced, and CI configuration/audit gates exist. | P0-004 remediation; latest verification shows `npm run ci:phase1` passes. | `npm run ci:full` still needs a clean browser-stack run; the latest local attempt failed during migration because the local PostgreSQL password for user `postgres` did not match the expected CI value. |

### Provider scope gate

Until INT-01 through INT-03 and REL-01 are closed:

- Do not advertise Messenger as multi-tenant production-ready.
- Do not advertise Viber outbound: the integration client exists, but the core adapter currently routes Viber through the internal/fake adapter.
- Treat TikTok as inbound-only and only after external approval and live evidence.
- A later pilot should start with Telegram only and still requires a real credential check, UUID-safe webhook registration, durable queueing, and provider acceptance evidence.

## P1 requirements before expanding beyond a controlled pilot

### Customer acquisition, identity, and lifecycle

- Make registration atomic. Tenant creation, owner creation, policy consent, entitlement creation, and initial billing/trial state should commit or roll back together.
- Make company-code allocation collision-safe with a database uniqueness constraint and retry.
- Add email verification, welcome/activation delivery, resend controls, and verified-domain support where appropriate.
- Replace the hidden-field-only bot defense with ingress/API protections that also cover direct backend calls.
- Define an explicit commercial model. Current copy suggests a guided rollout while the API creates an active tenant immediately.
- Add lifecycle flows for upgrade/downgrade, cancellation, data export, account deletion, reactivation, and trial conversion.
- Add customer-facing onboarding completion, channel verification state, help content, support SLA, and escalation ownership.
- Keep auth/reset/private routes out of the public sitemap and apply appropriate `noindex`/robots policy.

### Authentication and application security

- Rotate refresh tokens, detect reuse, store session records, revoke on logout/password change/reset, and reduce access-token lifetime from the current long default.
- Prefer secure, same-site, HTTP-only cookies or otherwise materially reduce the impact of storing access and refresh tokens in `localStorage`.
- Add MFA and step-up authentication for platform administrators and sensitive billing/provider actions.
- Add Helmet-equivalent headers, CSP, HSTS at ingress, frame protection, strict referrer policy, and a tested CORS policy.
- Replace per-process rate limiting with a distributed store and define endpoint-specific limits.
- Remove or authenticate production Swagger, metrics, queue, drain, and debug/administrative endpoints.
- Redact signed-URL query parameters from logs. File-storage request/error logs currently record `originalUrl`, including signature, expiry, and tenant parameters.
- Gate GA/GTM behind the approved consent policy where consent is legally required; the current layout loads configured analytics immediately.
- Add secret scanning, SAST, authorization tests, and an external penetration test.

### Social integration correctness

- Fail closed for unknown/unsupported channel types. The current adapter fallback can return a fake `sent` response.
- Pin provider API versions and define deprecation/upgrade monitoring.
- Add provider-specific contract tests for signature verification, duplicate delivery, out-of-order events, attachment limits, rate limits, token expiry, and provider downtime.
- Make dead-letter replay an authenticated product operation with audit logs and idempotency override semantics.
- Verify provider/core/Redis connectivity in readiness checks rather than checking only environment presence.
- Complete or remove the currently undecorated WebSocket command handlers; if typing/join/status commands are supported, bind them explicitly and recheck conversation authorization on every event.
- Complete and retain real approval, subscription, webhook, inbound, outbound, and retry evidence for every advertised provider.

### Billing and usage correctness

- Treat the current implementation as a **manual accounts-receivable ledger**, not automated subscription billing.
- Define who creates invoices, reviews proof, reconciles bank receipts, follows up, suspends, reactivates, and handles disputes. Give each action an SLA and audit requirement.
- Add database constraints for invoice number and billing-period uniqueness, valid currency, non-negative amounts, and valid status transitions.
- Validate that payment proof points to a completed, scanned file owned by the same tenant. Use collision-safe IDs.
- Make plan change, invoice creation, request resolution, notifications, and status transitions transactional or safely idempotent.
- Enforce separation of duties. A role named `finance_viewer` must not confirm payment, mutate billing, or suspend tenants.
- Add amount/reference/paid-at requirements, prevent overpayment without a credit model, and prevent contradictory paid/void/overdue states.
- Before self-service scale, add recurring invoice generation, renewal, proration policy, tax treatment, discounts/credits/refunds, immutable issued invoices, reconciliation, dunning, and either a payment gateway or a rigorously controlled manual process.
- Make usage-limit checks atomic. The current sum-then-insert approach can exceed a cap under concurrent requests.
- Do not block billing, upgrade, export, logout, or support/control-plane actions when an API limit is reached.
- Accept and durably store inbound customer messages even when a tenant is over limit; meter them separately and apply a commercial grace/suspension policy instead of losing messages.
- Decide whether failed outbound attempts are billable. The current flow can count usage before successful provider delivery.
- Align metering periods with subscription/billing periods rather than assuming every tenant uses a UTC calendar month.
- Move file metadata and storage accounting into durable shared state and reserve capacity atomically during upload.
- Make order creation and order-item replacement transactional. Current flows can leave an order without all items, or delete existing items before a later save fails.
- Replace count-based order numbering with a database-backed per-tenant sequence and a unique constraint.

### Reliability, deployment, and operations

- Remove single-host assumptions: externalize state, define load balancing, use multiple instances where appropriate, and test process/host failure.
- Use TLS certificate verification for PostgreSQL; `rejectUnauthorized: false` is not an acceptable default.
- Add centralized structured logs, request/correlation IDs across services, metrics suitable for alerting, traces, error reporting, and dashboards.
- Define SLOs for API availability/latency, inbound webhook latency, outbound delivery, queue age, billing jobs, and storage/media processing.
- Configure alerts and named on-call ownership for error rate, latency, queue backlog/DLQ, provider failures, database/Redis/storage health, disk, certificates, and failed billing jobs.
- Make readiness reflect dependencies needed to serve traffic, including database, Redis/queue, core API, and required provider configuration.
- Schedule encrypted off-host backups, define retention/PITR, and complete a timed restore drill with recorded RPO/RTO evidence.
- Deploy immutable, versioned artifacts; make migrations a controlled step; implement health-checked rollback to an identified previous artifact.
- Add load, soak, failover, queue-recovery, migration, rollback, and disaster-recovery exercises before broad launch.

## Recommended customer and revenue lifecycle

The product should implement and report one explicit lifecycle rather than inferring status from scattered dates and records:

1. **Prospect:** public plan data and honest provider/feature availability.
2. **Signup:** server-authorized self-serve plan, bot protection, policy consent, and email ownership verification.
3. **Trial pending:** tenant exists but sensitive/provider actions remain gated until identity is verified.
4. **Trial active:** an entitlement has start/end/grace timestamps and a scheduled transition.
5. **Onboarding:** live provider credential test, webhook registration, first inbound/outbound test, and an auditable activation checklist.
6. **Metering:** atomic usage events with an explicit billable/non-billable policy.
7. **Invoice/payment:** immutable invoice, proof or gateway payment, reconciliation, and audit trail.
8. **Renewal/dunning:** reminders, grace, suspension, payment recovery, and reactivation.
9. **Cancellation:** stop renewal, retain access through the agreed period, export data, then execute the retention/deletion policy.

A dedicated entitlement record should be the authorization source of truth. Tenant status, a plan foreign key, and a date alone are not sufficient for trials, grace, suspension, plan changes, and renewal.

## Suggested delivery sequence

### Phase 0 — Security stop-work items

1. Complete the remaining live full-stack verification: fix the local/CI PostgreSQL credential mismatch, run `npm run ci:full`, and perform the manual HTTP authorization checks for sidecar routes.
2. Publish approved legal policies and record policy consent/version at signup.
3. Add entitlement expiry/grace/suspension enforcement before any self-service or paid pilot.
4. Implement malware quarantine/scan enforcement before files can be downloaded or attached.
5. Add durable queueing/idempotency for inbound/outbound provider events and database-level provider uniqueness.
6. Resolve provider-native connection checks, UUID-safe webhook registration, and tenant-scoped provider secrets before advertising multi-provider production readiness.

### Phase 1 — Controlled Telegram pilot

1. Implement entitlement expiry and atomic signup/trial records.
2. Enforce self-serve plan eligibility and email verification.
3. Fix channel routing, implement a real Telegram connection test, and prove provider registration end to end.
4. Introduce durable inbound/outbound queues and durable storage/media state.
5. Define the manual billing operating procedure, invariants, roles, and reconciliation evidence.
6. Add monitoring, alerts, backup scheduling, restore proof, and an on-call runbook.
7. Run security, load, provider failure, restore, and rollback tests.

### Phase 2 — Broader provider and self-service launch

1. Implement tenant-scoped Messenger/Viber secrets and complete provider approvals.
2. Add provider-by-provider certification evidence and remove all placeholder adapters from advertised capability.
3. Complete recurring billing/dunning or integrate a payment provider.
4. Add HA deployment, SLO reporting, privacy lifecycle automation, and customer support operations.

## Release exit criteria

Broad production launch should require all of the following:

- Every P0 item is closed with tests and reviewed evidence.
- Zero unapproved critical/high production dependency vulnerabilities.
- No password-reset token or account-existence disclosure.
- Expired, suspended, grace, and paid entitlements behave correctly under automated tests.
- Every advertised provider passes real inbound, outbound, duplicate, retry, outage, and secret-isolation tests.
- A killed worker/host does not lose or duplicate an accepted inbound message or acknowledged outbound job.
- Tenant A cannot access, forge, route through, or inspect Tenant B's channel, webhook, file, usage, or billing data.
- No API response or audit/log record contains password hashes, reset/invite tokens, provider secrets, signed-URL secrets, or unredacted credentials.
- Provider duplicates are rejected atomically at the database boundary and do not double-count usage.
- Files remain quarantined until a durable clean scan result is recorded.
- The standard CI command succeeds without manual environment improvisation, and lint/type checks block release.
- Restore and rollback meet approved RPO/RTO in a recorded rehearsal.
- Alert delivery and on-call response are proven.
- Terms/privacy/consent, retention, export, deletion, subprocessors, and support obligations are approved.
- Manual billing has named owners and reconciliation evidence, or automated payment and recurring billing are proven.

## Verification performed

| Check | Result |
|---|---|
| `npm run ci:typecheck` | Passed |
| `npm run ci:test` | Passed |
| `npm run ci:lint` | Passed |
| `npm run ci:build` | Passed as part of `ci:phase1` |
| `npm run ci:phase1` | Passed |
| `npm run ci:audit` | Passed readiness threshold: zero high/critical production advisories |
| `git diff --check` / staged diff checks during P0-006 | Passed |
| Shared internal-auth package and sidecar guard tests | Passed through `ci:test` / focused sidecar suites |
| Password reset, tenant-user redaction, normalized identity, and dependency remediation tests | Passed during the related P0 implementation gates |
| `npm run ci:full` | **Blocked** at browser-stack migration: local PostgreSQL rejected user `postgres` with `password authentication failed`; phase-one gates completed before the browser-stack failure |
| Manual HTTP authorization checks for sidecar routes | Pending because the full local stack did not start successfully |
| Real provider traffic and approval | Not tested; no credentials/environment supplied |
| Penetration, load/soak, failover, restore, and rollback drills | Not performed |

## Final recommendation

Do not launch this as an open self-service omnichannel subscription product yet.

The P0 security posture is materially better than the original audit snapshot: password reset, tenant-user/audit secret exposure, normalized identity, production dependency advisories, and internal sidecar authentication have all been addressed in code. The remaining no-go decision is now driven mainly by legal/consent, entitlement enforcement, media quarantine, provider correctness/isolation, durable delivery/idempotency, and unproven live-environment/browser/security gates.

First close the remaining legal/consent, entitlement, media quarantine, provider-correctness, durable-delivery, idempotency, and live-verification gates, then run a small, invite-only Telegram pilot with manual billing and explicit operational ownership. Use that pilot to prove durable delivery, usage/billing reconciliation, recovery, and support. Add Messenger, TikTok, Viber, or broader self-service only after each provider and lifecycle is independently certified.

The highest-value architectural change is to make **entitlements**, **durable message jobs**, and **tenant-scoped provider identity/secrets** first-class concepts. Those three changes will remove many of the current inconsistencies across onboarding, social delivery, usage enforcement, and billing.
