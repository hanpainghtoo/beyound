# ZayOS Production Launch Program Checklist

Last updated: 2026-07-11

This is the operational go/no-go checklist for launch execution.

Use it together with:

- [Production Launch Program Plan](/home/kyaw/kme/kme-omnichannel/docs/operations/production-launch-program-plan.md)
- [Public Launch Engineering Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/public-launch-engineering-checklist.md)
- [Remaining Work Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/remaining-work-checklist.md)

## Current Launch Recommendation

- Track A controlled pilot: `GO WHEN GATES PASS`
- Track B broad public launch: `NOT YET`

## Program Setup

- [ ] Release owner named.
- [ ] Engineering sign-off owner named.
- [ ] Security reviewer named.
- [ ] Operations owner named.
- [ ] Operations backup named.
- [ ] Business/legal owner named.
- [ ] Launch calendar published.
- [ ] Risk register opened and reviewed.
- [ ] Phase 1 scope freeze approved.
- [ ] Deferred scope explicitly approved.

## Engineering Release Gate

- [ ] Remaining engineering launch blockers reviewed against [Remaining Work Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/remaining-work-checklist.md).
- [ ] Subscription, usage, and billing implementation sign-off complete.
- [ ] Subscription, usage, and billing manual verification complete.
- [x] Real-time inbox acceptance proves live event updates without manual refresh.
- [ ] Focused backend service regression sweep complete for auth, tenant isolation, ingestion, orders, usage enforcement, and plan changes.
- [ ] Clean-environment install passes.
- [ ] Clean-environment build passes.
- [ ] Lint passes or accepted warnings are recorded.
- [ ] Typecheck passes.
- [ ] Database migration rehearsal passes.
- [ ] Backend tests pass.
- [ ] API smoke passes.
- [ ] Workspace browser acceptance passes.
- [ ] Platform browser acceptance passes.
- [ ] Provider smoke harness passes in production-safe mode.
- [ ] PM2 boot and readiness checks pass.

## Provider Launch Gate

- [ ] Telegram production credentials verified.
- [ ] Telegram webhook registration smoke passes.
- [ ] Telegram inbound event smoke passes.
- [ ] Telegram outbound send smoke passes.
- [ ] Telegram delivery or provider-failure smoke passes.
- [ ] Facebook production credentials verified.
- [ ] Facebook webhook verification and signature smoke passes.
- [ ] Facebook inbound message smoke passes.
- [ ] Facebook outbound send smoke passes.
- [ ] Facebook delivery, read, and provider-error smoke passes.
- [ ] TikTok approved-surface credentials verified.
- [ ] TikTok signature and duplicate-delivery smoke passes.
- [ ] TikTok inbound lead/comment normalization smoke passes.
- [ ] TikTok core-forwarding smoke passes.
- [ ] TikTok outbound availability explicitly decided.
- [ ] Provider evidence recorded without storing secrets in the repo.

## Security Sign-Off Gate

- [ ] Production CORS allowlists verified against real dashboard origins.
- [ ] Access-token and refresh-token settings reviewed.
- [ ] Rotation, revocation, and logout invalidation reviewed.
- [ ] Suspended-tenant behavior verified in production-like conditions.
- [ ] Auth rate limits and brute-force protections verified.
- [ ] Tenant isolation regression evidence attached.
- [ ] Platform authorization for sensitive actions verified by role.
- [ ] File upload, download, archive, and signed-URL authorization verified.
- [ ] Credential and secret redaction in logs verified.
- [ ] No debug endpoints exposed in production.
- [ ] No production database synchronization enabled.
- [ ] No production seed path allowed.
- [ ] No critical or high-severity finding remains unowned.

## Operations And Recovery Gate

- [ ] Deployment owner confirms the production deploy path.
- [ ] Staging deployment rehearsal complete.
- [ ] Migration rehearsal complete.
- [ ] Post-deploy smoke rehearsal complete.
- [ ] Rollback rehearsal complete.
- [ ] Backup schedule confirmed.
- [ ] Restore owner named.
- [ ] Latest restore drill recorded.
- [ ] Monitoring and alerts verified for readiness failures.
- [ ] Monitoring and alerts verified for webhook dead letters.
- [ ] Monitoring and alerts verified for provider errors.
- [ ] Monitoring and alerts verified for usage-limit warnings.
- [ ] Incident-response owner and backup confirm on-call coverage.
- [ ] Webhook failure runbook reviewed.
- [ ] Media failure runbook reviewed.
- [ ] Customer communication path for incidents approved.

## Business, Legal, And Support Gate

- [ ] Terms of service approved.
- [ ] Privacy policy approved.
- [ ] Data processing policy and processor terms approved if required.
- [ ] Launch pricing approved.
- [ ] Plan limits approved.
- [ ] Tax and discount rules approved.
- [ ] Exception authority approved.
- [ ] Support hours approved.
- [ ] Severity levels approved.
- [ ] Response targets approved.
- [ ] Escalation path approved.
- [ ] Merchant onboarding process approved.
- [ ] Credential collection process approved.
- [ ] Training and handoff process approved.

## Track A: Controlled Pilot Gate

- [ ] Pilot merchants selected.
- [ ] Merchant owners and launch contacts recorded.
- [ ] Approved pilot channel scope recorded.
- [ ] Manual onboarding plan approved.
- [ ] Manual billing and payment handling plan approved.
- [ ] Manual delivery handling plan approved.
- [ ] Pilot success metrics agreed.
- [ ] Pilot issue log opened.
- [ ] Pilot start date approved.
- [ ] Pilot completion review scheduled.

## Track A Pilot Exit Criteria

- [ ] At least one merchant completes onboarding successfully.
- [ ] Approved production messaging flow works end to end.
- [ ] Conversation-to-order flow works end to end.
- [ ] COD or partial-payment recording works end to end.
- [ ] Operator billing and usage visibility matches production data.
- [ ] Incident detection and escalation are proven.
- [ ] Pilot issues are triaged into fix now, acceptable for launch, or defer.
- [ ] Release owner signs off Track A completion.

## Track B: Broad Public Launch Gate

- [ ] Facebook certification complete for intended public launch surface.
- [ ] TikTok certification complete for intended public launch surface.
- [ ] Pilot evidence reviewed.
- [ ] Security sign-off complete.
- [ ] Operations sign-off complete.
- [ ] Business/legal sign-off complete.
- [ ] Public pricing and onboarding copy approved.
- [ ] Public support path approved.
- [ ] Public go-live date approved.
- [ ] Go/no-go meeting held.
- [ ] Final broad-launch decision recorded.

## Launch-Day Checklist

- [ ] Production configuration double-checked.
- [ ] Latest deploy artifact identified.
- [ ] Database migration plan confirmed.
- [ ] Rollback operator online.
- [ ] Monitoring dashboards open.
- [ ] Alert destinations verified.
- [ ] Provider health status checked.
- [ ] Support and incident contacts online.
- [ ] Release owner approves start.
- [ ] Post-deploy smoke completed.
- [ ] First merchant or public signup observation window opened.
- [ ] Launch status update recorded.

## Post-Launch 30-Day Stabilization

- [ ] Daily launch review cadence scheduled.
- [ ] Incident review log active.
- [ ] Support issue taxonomy active.
- [ ] Production usage and cost review active.
- [ ] Deferred scope review date scheduled.
- [ ] Day-7 review completed.
- [ ] Day-14 review completed.
- [ ] Day-30 stabilization review completed.

## Evidence Template

```text
Item:
Owner:
Environment:
Evidence:
Result:
Known limitations:
Follow-up date:
Commit / ticket:
```

## Codex Completed In Repo

- 2026-07-11: added the live inbox browser acceptance path covering an already-open conversation and duplicate-event deduplication.
- 2026-07-11: added [Clean Release Verification Matrix](/home/kyaw/kme/kme-omnichannel/docs/operations/clean-release-verification-matrix.md) so the release engineering gate has runnable commands and evidence structure.
