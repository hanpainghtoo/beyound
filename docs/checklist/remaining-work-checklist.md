# ZayOS Remaining Work Checklist

Last audited: 2026-07-11

This is the focused execution queue extracted from `public-launch-engineering-checklist.md` after the conversation-to-commerce UX and workspace/platform boundary work passed acceptance. The public-launch checklist remains the canonical implementation record; completed items should be updated in both files.

For launch-program ownership, pilot governance, and go/no-go tracking, also use:

- [Production Launch Program Plan](/home/kyaw/kme/kme-omnichannel/docs/operations/production-launch-program-plan.md)
- [Production Launch Program Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/production-launch-program-checklist.md)

## Current Status

| Area | State | Owner / dependency |
| --- | --- | --- |
| Commerce Workspace UX acceptance | Complete | Engineering |
| Workspace / Platform Console boundary | Complete | Engineering |
| Seeded dashboard acceptance | Complete: Workspace 18/18, Platform Console 6/6 | Engineering |
| Subscription / billing alignment slice | In progress: canonical pricing, signup plan IDs, merchant route consolidation, workspace request workflow, and operator plan-change UI complete | Engineering |
| Production provider credential smoke | Blocked on tenant-owned credentials | Tenant / operations |
| Launch policy and commercial decisions | Pending | Legal / business / support |
| Post-launch product expansion | Deferred | Product planning |

## P0 — Public Launch Blockers

### Production Provider Smoke

- [x] Obtain tenant-owned Telegram production bot credentials and webhook target.
- [x] Run Telegram production webhook registration, inbound event, outbound send, and failure-callback smoke.
- [ ] Obtain tenant-owned Facebook App/Page production credentials and webhook configuration.
- [ ] Run Facebook webhook verification/signature, inbound message, outbound send, delivery/read, and provider-error smoke.
- [ ] Obtain tenant-owned TikTok credentials for the approved lead/comment product surface.
- [ ] Run TikTok signature, duplicate-delivery, inbound lead/comment normalization, and core-forwarding smoke.
- [ ] Record provider smoke evidence, credential owner, environment, date, and result without storing secrets in the repository.
- [ ] Confirm whether tenant-specific TikTok outbound messaging access exists.
  - [ ] If approved access exists, define and implement the outbound/response client.
  - [ ] Otherwise retain inbound-only launch scope and document the limitation in onboarding material.
- [ ] Run `npm run smoke:providers` with production-safe environment configuration.
- [ ] Confirm production webhook URLs, TLS, secrets, retry behavior, dead-letter visibility, and operational ownership.

### Final Production Security Review

- [ ] Re-audit production CORS allowlists against deployed dashboard origins.
- [ ] Re-audit JWT access/refresh lifetime, rotation, revocation, and logout behavior.
- [ ] Re-audit platform and tenant role guards on sensitive mutations.
- [ ] Re-audit tenant-scoped file upload, download, archive, and signed-URL authorization.
- [ ] Run the focused tenant-isolation and credential-redaction regression suites.
- [ ] Record security review owner, findings, accepted risks, and remediation deadlines.

### Launch Operations

- [ ] Assign incident-response owner and backup.
- [ ] Confirm provider webhook failure and stuck-media runbooks with the on-call owner.
- [ ] Confirm database backup schedule, retention, restore owner, and latest restore drill.
- [ ] Confirm monitoring/alert destinations for readiness failures, webhook dead letters, provider errors, and usage-limit warnings.
- [ ] Complete a staging deployment, migration, rollback, and post-deploy smoke rehearsal.

## P1 — Repository-Owned Engineering Follow-Up

### Runtime And API Quality

- [x] Add browser acceptance that proves a websocket event updates an already-open inbox without manual refresh.
- [x] Consolidate product route ownership currently split between `TenantController` and `ProductController`.
- [ ] Add focused backend service tests for auth, tenant, platform admin, csr, conversation, order, and product services.
- [ ] Decide and implement platform identity settings that affect supported app-shell metadata.
- [ ] Finish the README/documentation sweep for stale user-facing KME ZayOS references while preserving intentional legal/company references.
- [ ] Centralize the ZayOS palette into shared dashboard tokens and audit shell reuse.

### Roles And Platform Operations

- [ ] Decide whether Phase 1 needs full custom-role CRUD beyond available-role reads and csr permission updates.
- [ ] If required, implement role create/update/archive APIs, authorization, audit events, and UI acceptance.
- [ ] Decide the supported tenant secondary actions:
  - [ ] Impersonate with explicit authorization, reason, expiry, banner, and audit trail.
  - [ ] Message tenant contacts through an approved channel and template.
  - [ ] Export tenant data with authorization, redaction, and audit coverage.

### Customer And Commerce Context

- [ ] Decide whether csrs may create customers directly.
- [ ] If approved, add tenant-scoped csr customer-create API, permissions, audit event, UI, and tests.
- [ ] Add or formally defer a customer order-history endpoint for the csr customer-detail surface.
- [ ] Decide whether a tenant-wide Commerce Timeline is required beyond the inbox timeline.
- [ ] Keep campaign metrics explicitly unavailable until a persisted campaign domain exists.

## P2 — Optional Channel Expansion

Viber is not part of the current three-channel public-launch requirement. Execute this section only after product prioritization and production API access are confirmed.

- [ ] Confirm Viber Business Messages API access, commercial terms, permissions, webhook requirements, and tenant credential model.
- [x] Implement Viber outbound send client in `integration-service`.
- [x] Implement Viber webhook verification and registration in `webhook-handler-service`.
- [x] Normalize Viber inbound payloads in `chat-ingestion-service`.
- [x] Add Viber delivery/error callbacks and provider retry hints.
- [x] Add Viber unit, integration, duplicate-delivery, and E2E coverage.
- [x] Add tenant-admin Viber setup and troubleshooting documentation.
- [ ] Complete production credential certification before advertising Viber support.

## External Business, Legal, And Support Work

These items require accountable business owners and approved content; repository implementation alone cannot complete them.

- [ ] Approve and publish terms of service.
- [ ] Approve and publish privacy policy.
- [ ] Approve and publish data processing policy and any required processor/subprocessor terms.
- [ ] Define support hours, severity levels, response targets, escalation path, and customer communication policy.
- [ ] Assign incident-response ownership and external communication authority.
- [ ] Approve launch pricing, plan limits, taxes, discounts, and exception authority.
- [ ] Define sales qualification, tenant onboarding, credential collection, training, launch approval, and handoff process.

## Explicitly Deferred Post-Launch Work

These are not public-launch blockers unless product leadership changes the launch scope.

### Service Hardening And Media

- [x] Add configurable production HTTP adapters for binary file scanning and multipart audio/video transcription.
- [x] Validate scan verdicts, reject empty transcripts and invalid media types, and use durable job retry/failure behavior for provider errors.
- [x] Pass scanning/transcription provider configuration through PM2 production and development runtime definitions.
- [ ] Select and commercially/security approve concrete production scanning and transcription vendors/endpoints.
- [ ] Certify every future provider adapter and webhook surface before enabling it for tenants.
- [ ] Reassess provider-specific throttling and retry tuning using production traffic evidence.

### Customer 360

- [ ] Expand the Commerce Timeline into a full Customer 360 event engine.
- [ ] Unify chat, order, payment, note, complaint, segmentation, and future call events in customer history.
- [ ] Add tenant-wide search, filtering, permissions, retention, and export behavior.

### Advanced Order Lifecycle

- [ ] Integrate delivery partners and automated rider/tracking updates.
- [ ] Add payment-gateway reconciliation.
- [ ] Add invoice generation.
- [ ] Add inventory movement and reservation automation.

### Advanced Productivity And AI

- [ ] Add routing-rule builder, next-available/round-robin assignment, and workforce scheduling.
- [ ] Add scoreboard, commission logic, and advanced performance reporting.
- [ ] Integrate approved AI providers for reply suggestions, bots, scoring, quality review, and reports.
- [ ] Add AI safety, consent, data-retention, tenant controls, evaluation, and cost limits before enabling production use.

## Completion Evidence Template

Use this template when closing an item:

```text
Item:
Owner:
Environment:
Implementation / decision:
Verification command or evidence:
Result:
Known limitations:
Date:
Commit / ticket:
```

## Exit Criteria

Broad public launch is ready only when:

- [ ] Telegram, Facebook, and TikTok approved-surface production smoke passes with tenant-owned credentials.
- [ ] The final production security review has an accountable sign-off and no unowned critical findings.
- [ ] Deployment, migration, rollback, backup/restore, monitoring, and incident ownership are rehearsed.
- [ ] Legal, privacy, support, pricing, and onboarding decisions are approved and published where required.
- [ ] Remaining deferred items are explicitly accepted as post-launch scope with owners or review dates.
