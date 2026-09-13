# ZayOS Production Launch Program Plan

Last updated: 2026-07-11

This document turns ZayOS launch into a release program, not another open-ended implementation project.

It sits above:

- [Public Launch Engineering Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/public-launch-engineering-checklist.md)
- [Remaining Work Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/remaining-work-checklist.md)
- [Production Launch Program Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/production-launch-program-checklist.md)
- [Clean Release Verification Matrix](/home/kyaw/kme/kme-omnichannel/docs/operations/clean-release-verification-matrix.md)

## Current Recommendation

The recommended path is:

1. Freeze Phase 1 scope.
2. Close the remaining launch gates.
3. Run a controlled production pilot.
4. Approve broad public launch only after pilot evidence and external sign-off exist.

The engineering foundation is already largely in place. The remaining critical path is now mostly:

- production credential smoke
- release verification
- security and operations sign-off
- business, legal, support, and onboarding readiness

## Launch Tracks

## Track A: Controlled Production Pilot

Launch the first production phase with:

- one to three selected merchants
- Telegram as the certified production channel
- manual onboarding
- manual billing and payment confirmation
- chat-to-order
- COD and partial-payment recording
- manual delivery assignment
- Commerce Workspace, Business Workspace, and Platform Console
- AI disabled
- TikTok inbound-only or disabled
- Facebook disabled until certification passes

## Track B: Broad Public Launch

Proceed only after all of the following are complete:

- Facebook production certification
- TikTok approved-surface production certification
- final production security sign-off
- backup, restore, and rollback rehearsal
- monitoring and incident ownership
- legal, privacy, pricing, support, and onboarding approval

## Phase 1 Scope

## Included

- Telegram messaging
- Facebook after certification
- TikTok inbound lead/comment capture after certification
- customer and conversation management
- chat-to-order
- product management
- order lifecycle
- COD and partial payment
- manual delivery management
- notifications and operational reporting
- subscription, plan, usage, and billing operations
- platform merchant administration

## Explicitly Deferred

- AI replies, bots, and scoring
- automated routing and workforce scheduling
- delivery-partner integration
- payment gateway reconciliation
- automatic invoice generation
- inventory reservation and movement
- full Customer 360
- advanced campaign analytics
- tenant impersonation and data export
- full custom-role builder

Deferred items must not return to the launch queue unless they resolve a production-critical defect.

## Program Ownership

Each role must be named before go-live:

| Role | Responsibility |
| --- | --- |
| Release owner | Overall go/no-go decision and launch coordination |
| Engineering sign-off owner | Confirms build, test, migration, smoke, and defect disposition |
| Security reviewer | Confirms production security configuration and findings ownership |
| Operations owner | Confirms deploy, rollback, monitoring, backups, and incident handling |
| Operations backup | Secondary owner for launch-day coverage |
| Business/legal owner | Approves pricing, policies, support model, and onboarding |

## Release Phases

## Phase 0: Freeze And Govern

Objective:

- prevent feature drift
- hold the launch scope stable
- move decision-making into explicit ownership

Required outputs:

- Phase 1 scope approval
- named owners
- launch risk register
- single go/no-go checklist
- launch calendar with pilot and broad-launch target windows

## Phase 1: Final Engineering Closure

Objective:

- close the remaining repository-owned launch work
- gather release evidence from a clean environment

Priority engineering closure:

- finish subscription, usage, and billing sign-off
- add real-time inbox acceptance for live event updates
- prioritize backend service tests for security and commercial risk
- run the full clean release gate

The engineering source of truth remains:

- [Public Launch Engineering Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/public-launch-engineering-checklist.md)
- [Remaining Work Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/remaining-work-checklist.md)

## Phase 2: Production Security Sign-Off

Objective:

- verify the deployed production configuration, not only local code behavior

Required review areas:

- authentication and token lifecycle
- tenant isolation
- platform authorization
- file security
- production configuration

Exit rule:

- no unowned critical or high-severity finding

## Phase 3: Operations And Recovery Rehearsal

Objective:

- prove the team can deploy, observe, recover, and communicate under production conditions

Required rehearsal:

- deploy production build in staging
- run migration
- run smoke tests
- validate monitoring
- exercise rollback
- validate backup and restore ownership
- validate incident runbooks

## Phase 4: Controlled Production Pilot

Objective:

- validate real merchant onboarding and production operations with limited blast radius

Pilot rules:

- select one to three merchants
- use approved production credentials only
- keep manual onboarding and manual finance confirmation
- record every issue, workaround, and operator dependency

Pilot success criteria:

- merchants can onboard successfully
- inbound and outbound production messaging works for the approved channel set
- conversations, orders, payments, and delivery flows run end-to-end
- billing and usage visibility matches operator expectations
- incidents are detectable and owned

## Phase 5: Broad Public Launch Approval

Objective:

- transition from limited pilot to public launch only when external and operational gates are complete

Broad-launch prerequisites:

- pilot completed with evidence
- provider certifications complete for the intended public surface
- launch policy and pricing approved
- support and onboarding approved
- security and operations sign-off complete

## Phase 6: Post-Launch Stabilization

Objective:

- protect the first 30 days after launch

Timebox:

- 30-day stabilization window

Focus:

- incident response
- launch bug triage
- support feedback loops
- usage and cost review
- deferral re-prioritization based on real production evidence

## Go/No-Go Rules

Launch must remain `NO-GO` if any of the following are true:

- production provider smoke is incomplete for the intended launch surface
- a critical security finding is unowned
- rollback or backup/restore rehearsal is incomplete
- monitoring and incident ownership are not assigned
- legal, privacy, pricing, support, or onboarding approval is missing
- the pilot has not completed successfully for Track B

## Evidence Model

Every closed gate should include:

- owner
- environment
- date
- command, artifact, or walkthrough evidence
- result
- known limitation
- next review date if still conditional

Use the checklist template in:

- [Production Launch Program Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/production-launch-program-checklist.md)

## What Codex Can Help With

I can directly help with the repository-owned part of this release program:

- turn launch decisions into concrete docs, checklists, and sign-off artifacts
- tighten engineering scope and identify what is truly launch-blocking
- implement missing regression tests and smoke coverage
- build release verification commands and evidence templates
- write runbooks for deploy, rollback, incident triage, and provider smoke
- audit launch paths for fallback logic, dead routes, fixture behavior, and missing states
- prepare pilot-only configuration notes and launch-day engineering checklists
- translate human launch decisions into code, scripts, and operational documentation

I cannot independently complete external approvals such as:

- legal approval
- business pricing approval
- tenant-owned production credentials
- production infra ownership assignment
- human go/no-go authority

## Recommended Next Codex-Owned Work

The best next repo-owned workstream is:

1. complete the remaining subscription, usage, and billing edge-state sign-off
2. add the real-time inbox browser acceptance proof
3. add the focused critical backend service regression sweep
4. build a clean-release verification runbook and command matrix
5. prepare pilot evidence templates and launch-day operator checklists
