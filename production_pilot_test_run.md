# Production Pilot Test Run

This file records what was validated directly from the current development environment after commit `c6c0190` and what still requires a live production-pilot test session.

## Scope

Validated here:

- focused backend automated tests
- backend TypeScript compile
- platform-console TypeScript compile
- workspace TypeScript compile
- source-level verification of checklist coverage and role gating

Not directly validated here:

- real production pilot browser interaction
- real mobile device behavior
- real webhook/provider traffic
- real production database/audit rows
- real production email/webhook side effects

## Executed Checks

| Check | Result |
| ----- | ------ |
| `npm --prefix backend-core-service test -- --runInBand src/platform-admin/platform-admin-commercial.spec.ts src/platform-admin/platform-admin.controller.spec.ts` | Pass |
| `npm --prefix backend-core-service exec -- tsc -p backend-core-service/tsconfig.json --noEmit` | Pass |
| `npm --prefix dashboards/platform-console exec -- tsc -p dashboards/platform-console/tsconfig.json --noEmit` | Pass |
| `npm --prefix dashboards/workspace exec -- tsc -p dashboards/workspace/tsconfig.json --noEmit` | Pass |

## What I Verified

| Area | Result | Evidence |
| ---- | ------ | -------- |
| Platform support/viewer/finance role enforcement | Verified locally | Controller role metadata and sidebar/API wiring |
| Platform billing reminder and overdue follow-up flow | Verified locally | Service/controller/tests compile and pass |
| Platform reporting center | Verified locally | Live report page implementation compiles against real API wrappers |
| Platform orders report filters | Verified locally | Order API now supports date/channel filtering and page uses them |
| Platform conversation and delivery report filters | Verified locally | Backend/controller/api now accept date filters for these surfaces |
| Merchant workspace mobile hardening | Verified locally | Layout changes remove desktop-only min-height/min-width assumptions in core pages |
| Production checklist P1 completion state | Verified locally | [production_checklist.md](/home/kyaw/kme/kme-omnichannel/production_checklist.md) now shows `55 Working / 0 Partial / 0 Missing` for P1 |

## Still Needs Live Pilot Evidence

These should be executed by the team using [production_pilot_testing_checklist.md](/home/kyaw/kme/kme-omnichannel/production_pilot_testing_checklist.md):

1. Public CTA and contact/demo submissions on the real pilot domain.
2. Real password-reset delivery path in the pilot environment.
3. Real merchant notifications after billing reminder actions.
4. Real audit log rows after billing/tenant/report workflows.
5. Real role-by-role UI access in platform and merchant sessions.
6. Real mobile interaction on phone-sized viewports.

## Recommendation

Use this as the pilot handoff sequence:

1. Start from commit `c6c0190`.
2. Use [production_pilot_testing_checklist.md](/home/kyaw/kme/kme-omnichannel/production_pilot_testing_checklist.md) as the manual production script.
3. Record evidence inline in that checklist or in a copied sheet.
4. Add any pilot-only failures back into [production_checklist.md](/home/kyaw/kme/kme-omnichannel/production_checklist.md) if real runtime behavior contradicts local verification.
