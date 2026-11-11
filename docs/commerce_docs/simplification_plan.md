# Commerce Simplification Plan

Status: COM-011 engineering DONE; COM-011c DONE; COM-013a DONE; COM-015a DONE; COM-014 DONE; COM-013 DONE; COM-013c DONE; COM-018 DONE with historical evidence. COM-004, COM-009, and COM-010 are START because legacy lifecycle writers/DTO values remain. COM-019 is the current Batch 4 WIP. COM-011b is owner-me START and blocks DEPLOY-GATE only.

Batch 4 tracker status: COM-020, COM-022, and COM-023 remain DONE on historical evidence, not reproduced in the 2026-10-10 audit. The audit reran Workspace tsc/lint, the root build, and `npx jest src/order`; the latter failed its suite gate because `conversation-list-filter.spec.ts` has four constructor-arity TypeScript errors, although 8 suites and 51 tests passed. COM-019 remains WIP because `npm run smoke:api` was not run against a verified disposable API/database. The historical `1782446700000-UpgradeSupersededChecks` assertion remains a COM-021 migration-test follow-up.

Prepared: 2026-10-08; audited 2026-10-10 (Asia/Yangon); tracker reverified 2026-10-10 at `ebd25deb6397bf6f301264579f22b300f620db22e`

## Scope and approval gate

This is the approved-with-changes target contract. COM-000 is complete and Batch 1 is being executed one WIP task at a time.

TypeORM entities remain the canonical schema. Existing QA/checklist documents remain historical and receive a banner. `shared/database-schemas/*.sql` remains reference-only and receives a deprecation note.

## Current blocker order

1. Legacy lifecycle removal (COM-004/COM-009/COM-010)
2. COM-015 Workspace cleanup
3. COM-019 smoke:api on a verified disposable DB
4. COM-021 migration-test repair
5. COM-011b Burmese approval
6. COM-001b down() hardening
7. COM-024 Workspace Playwright
8. DEPLOY-GATE production-snapshot review
9. COM-029 final CI and verification

No gate is marked passed. COM-025, COM-026, COM-028, and SEED-LEGACY remain open as tracker tasks outside this blocker sequence.

## 2026-10-10 audit command results

- `cd dashboards/workspace && npx tsc --noEmit`: PASS, exit 0, no diagnostics.
- `cd dashboards/workspace && npm run lint -- --max-warnings=0`: PASS, exit 0, no diagnostics.
- `npm run build`: PASS, exit 0. Backend, Workspace, platform-console, and all five services built. Next emitted existing multiple-lockfile warnings and the existing missing Next ESLint plugin warning; no build errors occurred.
- `cd backend-core-service && npx jest src/order --runInBand`: FAIL, 1 suite failed and 8 passed; 51 tests passed. `src/order/conversation-list-filter.spec.ts` failed to compile with four constructor-arity errors for `OrderService`/`DeliveryService`. `order.service.spec.ts` and the other order suites passed.
- `git rev-parse HEAD`: `ebd25deb6397bf6f301264579f22b300f620db22e`.
- `git status --short`: `M dashboards/workspace/package-lock.json` and `?? .mcp.json`; no other files were changed by the audit before the documentation edits.

## 1. Target contract

### Address

There is exactly one `shipping_address` value: trimmed free text, required at checkout, with a 500-character DTO validation limit. Do not add a database CHECK length limit. Workspace uses one multiline textbox; Telegram asks for the complete address in one message; no split address fields exist.

Workspace and platform revenue use the same definition: `status = confirmed`, `payment_status = paid`, and `delivery_status <> returned`. Returned confirmed-paid totals are reported separately. Revenue report aggregation is server-side; the Workspace report does not cap revenue calculations at the first 100 browser-loaded orders.

The migration serializer is only for existing JSONB rows. For objects use known keys in this order: `name`, `phone`, `line1`, `line2`, `address`, `city`, `township`, `region`, `state`, `postalCode`, `country`; trim non-empty values and join with `, `. Unknown keys are appended deterministically only after preflight review. Scalar JSON strings become text and null remains null.

### States and transitions

Order status: `pending` (default), `confirmed`, `cancelled`, `rejected`.

Payment status: `unpaid` (default), `paid`.

Delivery status: `packed` (default), `out_for_delivery`, `delivered`, `failed_delivery`, `returned`.

| Field | Transitions and rules |
|---|---|
| order | `pending -> confirmed/cancelled/rejected`; eligible bot proof retry `rejected -> pending`; `confirmed -> cancelled`; cancel is blocked for delivery `out_for_delivery` or `delivered`; cancel/reject needs a reason; staff cancellation of `rejected` remains allowed |
| payment | `unpaid <-> paid`, only while order status is `pending` or `confirmed`; marking paid sets `paid_amount=total_amount`, unpaid sets `paid_amount=0` |
| delivery | `packed -> out_for_delivery`; `out_for_delivery -> delivered/failed_delivery`; `failed_delivery -> out_for_delivery/returned`; `delivered -> returned`; returned terminal; only when order is confirmed; reason/note required for failed/returned |

All payment and delivery changes are manual by owner, admin, supervisor, agent, and existing finance roles where applicable. Keep the delivery role constant but do not require it. Workspace has media upload/download and COM-013a now provides the tenant-checked order-attachment linker before the paid-proof UI is complete. The linker accepts uploaded `image/*` or PDF files up to 10 MiB, is idempotent for the same file/role, permits at most 10 attachments per order, and is limited to pending/confirmed orders. Proof is not hard-required unless COM-000 changes that default. `order_payment_proofs` stays unwired.

Revenue definition is implemented as `confirmed AND paid AND delivery_status <> 'returned'`, with returned confirmed-paid totals shown separately. `backend-core-service/src/report/report.service.ts:55-68` applies the server-side rule; Workspace report data applies the same filter at `dashboards/workspace/app/workspace/reports/report-data.ts:68-69,151-152`. No owner confirmation remains open in the current tracker; COM-011b is the only owner approval blocker.

Platform-admin order detail retains full attachments because platform operators need payment-proof access for support and audit; list endpoints expose only `paymentProofSubmitted` and `attachmentCount`.

Payment method is display-only: `cod | online | bank_transfer`. Deliveries list confirmed orders and filters all five delivery values. Do not rewrite historical `status_history`.

### Inventory, expiry, retry

New orders reserve inventory. Do not backfill reservations. Inspection of the pre-simplification confirm/cancel code found no per-order negative `stock_movements` for orders without reservation rows, so legacy orders are not restocked. Current converted reservations write a negative `reservation_converted` movement; confirmed cancellation restores only when that movement exists and writes the idempotent `confirmed_order_cancelled_restocked` marker.

Agent-created orders never auto-expire. Bot-created orders expire regardless of payment method, including bot COD orders holding reserved stock, when `expires_at` is set. Expiry changes status to `cancelled`, records literal reason `expired`, uses a system actor, and releases reservations.

Rejected bot orders require a reason, append it to status history, and send it to the customer. During the retry window, a new proof is appended and `rejected -> pending` retains the reservation. The retry cap is tenant-configurable as `orderExpirySettings.rejectedRetryMax`, default `3`. After the timer, `rejected -> cancelled` with reason `expired`; staff `rejected -> cancelled` remains allowed with a non-expiry reason.

Every new status-history entry has `field: order | payment | delivery`. Payment and delivery transitions emit `order.payment_status_changed` and `order.delivery_status_changed` through the same transaction manager.

Rejected-retry count is derived from status-history entries with `field = order`, `previousStatus = rejected`, `status = pending`, and `actorType = customer`. `getDeliveryDetail` returns 404 for unconfirmed orders so it matches the confirmed-only deliveries list.

## 2. API, events, and endpoint removal

Remove `PUT /orders/:id/lifecycle` in this release with no alias. Add focused endpoints:

- `PUT /orders/:id/status` `{ status, reason? }`
- existing attachment upload endpoint, called before payment marking
- `PUT /orders/:id/payment-status` `{ status, reason?, attachmentReference? }`; marking unpaid requires `reason`.
- `PUT /orders/:id/delivery-status` `{ status, reason? }`; delivery is allowed to owner/admin/supervisor/agent, not finance.

Staff order-status DTO accepts only `confirmed`, `rejected`, and `cancelled`; `pending` is reachable only through the customer bot retry transition. Payment proof ownership is checked inside the locked payment transition, and the attachment reference is recorded in payment history and the payment-status event payload. Marking unpaid requires a non-blank reason.

The transition service is the only state writer. Preserve tenant isolation, audit guards, transactional history, and events. Add payment/delivery status events as needed.

## 3. Migration mapping and backup

Before destructive drops, COM-001 creates a temporary backup table containing: `id`, `status`, `payment_status`, `paid_amount`, `balance_due`, `cod_amount`, `tracking_number`, `delivery_zone`, `billing_address`, and old `shipping_address`. The plan and migration must say: retain this table until production verification completes, then drop it in a separately approved cleanup action.

The backup also retains `reservation_managed`, `cod_collected_at`, `expires_at`, and `tenant_id` with the source column types. Provisional retention date is 2026-11-07 (30 days after the 2026-10-08 local implementation date; recalculate from the actual production deployment if later). The cleanup action must purge rows for deleted tenants using `tenant_id`, then drop the table only after production verification sign-off. This cleanup is not part of COM-001.

Down migration uses the backup table when present to restore removed values and old JSONB address data; if absent, it documents best-effort/lossy restoration. Never rewrite historical status history.

| Legacy order status | New order status |
|---|---|
| `new`, `pending_payment`, `payment_submitted`, `pending` | `pending` |
| `confirmed`, `preparing`, `packed`, `processing`, `out_for_delivery`, `delivered`, `cod_collected` | `confirmed` |
| `cancelled`, `expired` | `cancelled` |
| `rejected` | `rejected` |
| `returned`, `failed_delivery` | `confirmed` |

| Legacy status/payment evidence | New value |
|---|---|
| `out_for_delivery` | delivery `out_for_delivery` |
| `delivered`, `cod_collected` | delivery `delivered` |
| `returned` | delivery `returned` |
| `failed_delivery` | delivery `failed_delivery` |
| everything else | delivery `packed` |
| order status `cod_collected` (regardless of `payment_status`) | payment `paid`, `paid_amount=total_amount` |
| otherwise payment `paid` or `cod_collected` | payment `paid`, `paid_amount=total_amount` |
| all other payment values | payment `unpaid`, `paid_amount=0` |

The status-derived `cod_collected -> paid` rule takes precedence over the legacy payment-status value. Pending expiry uses the single `orderExpirySettings.pendingPayment` key.

## 4. Bot-origin discriminator and COM-000 evidence

Approved Option A: do not create a database unique index. Enforce one pending+unpaid bot order per `(tenant, customer)` in `createBotOrder` with a transaction-scoped PostgreSQL advisory lock plus an in-transaction check. Agent-created creation must stop setting `expires_at`; bot-created COD orders retain expiry and reserved-stock behavior. The expiry worker may continue using `expires_at IS NOT NULL` as its eligibility predicate after that correction.

Evidence required by COM-000:

- `backend-core-service/src/agent/agent.service.ts:2211-2276` (`createOrderFromChat`) calls `createManagedAgentOrder`.
- The stale violation claim is corrected: `backend-core-service/src/order/order-creation.service.ts:289-290` sets `expiresAt: null` on the agent path. The previous claim that the current agent path violates the decision is no longer valid.
- `backend-core-service/src/telegram-bot/telegram-commerce.service.ts:385-401` calls `createBotOrder`.
- `backend-core-service/src/order/order-creation.service.ts:477-507` creates the bot order without a `createdBy` assignment (so the current path relies on the column default/null) and sets `expiresAt` at line 499; the same path currently accepts COD at lines 487-496.
- Local seeded DB preflight found no expired rows and no pending rows with non-null `created_by` plus `expires_at`; its only pending-like row was `status='new'`, `created_by IS NOT NULL`, and `expires_at IS NULL`. This is evidence for the current snapshot, not proof for all historical data.

Existing pending agent orders that have `expires_at` and `created_by IS NOT NULL` must have `expires_at` cleared during migration before the expiry worker can act on them. Existing bot rows are the rows with the bot creation-path identity (currently null `created_by`); if a historical row cannot be safely classified, the migration must stop for review rather than expire it. If code review or production preflight shows bot and agent rows cannot be safely distinguished, fall back to Option B: add an explicit persisted `source`/`creation_source` column with `bot|agent` and use it for the check and expiry eligibility.

## 5. Read-only preflight and deployment gate

The local preflight script was run on 2026-10-08 against `kme_omnichannel` on `localhost:5432` with `transaction_read_only=on` and rollback: 7 orders; statuses `cancelled=1`, `confirmed=1`, `delivered=1`, `new=1`, `out_for_delivery=1`, `packed=1`, `returned=1`; payment statuses one each of `cod_collected`, `cod_pending`, `failed`, `paid`, `partially_paid`, `pending`, `refunded`; partial=1; refunded=1; returned=1; failed_delivery=0; order-status `cod_collected=0`; expired split returned no rows; pending-like rows with non-null `created_by` and `expires_at=0`; no duplicate bot-candidate or all-order groups; shipping object=7, scalar/null=0; keys city=7, country=6, township=1. The script is `scripts/commerce-simplification-preflight.sql`.

Migration ordering was checked: the latest existing migration is `1782447700000-BackfillPaymentMethodEditPermission.ts`; `1782447800000-SimplifyCommerceStatuses.ts` sorts after all existing migrations.

COM-003 (which includes the already-completed local COM-002 work) commits the preflight as a re-runnable SQL/script file. It must also report: expired orders split by `created_by IS NULL` versus non-null, and pending-like orders with `expires_at IS NOT NULL AND created_by IS NOT NULL`. It must run against a production snapshot or staging copy before deployment. Go/no-go: stop for review before migration if duplicate groups, unknown address keys, any `partially_paid` rows, or any returned/failed_delivery rows are present; reviewers must explicitly disposition each finding. The script remains read-only.

## 6. Platform scope

Platform-admin backend endpoints are explicit scope: inspect/update the platform-admin order, delivery, payment-summary, report, and merchant-order endpoints and remove/convert legacy status, COD, tracking, zone, and lifecycle assumptions. The platform-console UI is explicit scope: `sales-orders`, `deliveries`, `reports`, merchant order views, and `lib/api.ts`.

The prior local grep found no matching lifecycle/payment-status/delivery-status consumer in `services/*`. The platform console does read the affected fields and therefore must be updated.

Current recorded verification (2026-10-10): migrations and expanded integration runs were recorded against the disposable `zayos_commerce_test` database only. The recorded integration results are 2 suites/25 tests and, for the expanded fixtures, 3 suites/27 tests. The newest recorded backend run is 37 suites/249 tests. These are historical recorded results, not re-run in this audit. In this audit, Workspace tsc/lint and the root build passed; `npx jest src/order` failed its suite gate because `conversation-list-filter.spec.ts` has four constructor-arity TypeScript errors, although 8 suites passed and 51 tests passed. Platform-admin backend compatibility grep is historical; dashboard, legacy order-service/DTO, seed, schema, and smoke-script hits remain assigned to COM-015/COM-019/COM-028/COM-029.

### Batch 2 verification and intentional grep exceptions

- COM-016 server reports now expose binary `paid`/`unpaid` payment breakdowns and independent five-value delivery breakdowns; report source has no COD/balance metrics.
- COM-011 uses a trimmed single-string Telegram address, routes proof through `OrderTransitionService`, sets/clears `paymentSubmittedAt`, emits `order.payment_proof_submitted`, and does not mark orders paid or confirmed. `telegram-commerce.service.ts:30-52` is the bot message catalog for this flow. Burmese keys currently fall back to plain English at runtime; review comments retain the needed Burmese translations as `NEEDS NATIVE REVIEW`.
- Workspace i18n behavior: `I18nProvider.t()` resolves the requested locale first and then falls back to the default English resource; it does not render a missing key when English contains that key. `dashboards/workspace/i18n_translation/check-keys.mjs` reports every English key missing from `my.json`. New English-only UI keys are listed as `NEEDS NATIVE REVIEW` until Burmese approval.
- COM-011c mirrors bot payment proofs through Telegram `downloadFile`, `MediaLibraryService.createUpload`, and the existing signed upload path. The storage file ID is authoritative in `orders.attachments`; the Telegram file ID remains metadata for deduplication. The Workspace proof viewer is implemented under COM-013c; browser coverage remains COM-024, and deployment remains blocked by COM-011b/DEPLOY-GATE.
- COM-027 platform-admin order, delivery, payment-summary, report, and merchant views expose target statuses, delivery status, payment-proof signal, and attachment references. The platform-admin compatibility/lifecycle grep result is historical evidence, not reproduced in the 2026-10-10 audit.
- Full-repo compatibility hits intentionally remaining after COM-027: Workspace and platform-console API types, views, reports, and translations still mention legacy COD/balance/tracking/zone fields and are COM-028 frontend work; `backend-core-service/scripts/schema/01_create_schema.sql` and `scripts/api-smoke.js` are reference/smoke artifacts assigned to COM-029; old migrations and migration tests retain historical column/status names; subscription, entitlement, onboarding, session, and media URL `expired` values are unrelated to order expiry. The only order-specific `expired` occurrences are the intentional cancellation reason and historical migration/event-index references; order consumers use cancelled + reason `expired`.

Compatibility sweep groups and owners from the 2026-10-10 audit (migration hits are reported separately):

- Core/lifecycle — COM-004/COM-009/COM-010, with final verification COM-029: `backend-core-service/src/order/order.service.ts`, `backend-core-service/src/order/dto/update-order-lifecycle.dto.ts`, `backend-core-service/src/agent/dto/create-order.dto.ts`, `backend-core-service/src/agent/agent.service.ts`, `backend-core-service/src/agent/conversation-intent.ts`, and `backend-core-service/src/agent/conversation-queue-filter.spec.ts` retain legacy lifecycle/COD/status assumptions.
- Workspace — COM-015: `dashboards/workspace/app/workspace/inbox/page.tsx`, `dashboards/workspace/app/workspace/reports/deliveries/page.tsx`, `dashboards/workspace/components/invoice-document.tsx`, `dashboards/workspace/i18n_translation/en.json`, `dashboards/workspace/i18n_translation/my.json`, `dashboards/workspace/lib/inbox-badges.ts`, and `dashboards/workspace/tests/e2e/commerce-workspace-surfaces.spec.ts`.
- Platform-console — COM-028: `dashboards/platform-console/app/platform-console/deliveries/page.tsx`, `dashboards/platform-console/app/platform-console/merchants/[merchantId]/page.tsx`, `dashboards/platform-console/app/platform-console/reports/page.tsx`, `dashboards/platform-console/app/platform-console/sales-orders/page.tsx`, and `dashboards/platform-console/lib/api.ts`.
- Scripts/seeds/docs — COM-019/COM-025/COM-029: `backend-core-service/scripts/api-smoke.js`, `scripts/commerce-simplification-preflight.sql`, `backend-core-service/src/database/seed-inbox-volume.ts`, `backend-core-service/src/database/seed.ts`, `production_checklist.md`, `docs/telegram_bot/step3_design.md`, `docs/telegram_bot/step4_design.md`, and `shared/database-schemas/01_create_schema.sql`. The four unowned artifacts are explicitly assigned to COM-025/COM-029 for documentation/schema cleanup.
- Unrelated hits — COM-029 records but does not change them: subscription, entitlement, onboarding, session, and media URL `expired` values are outside order expiry.
- Migration hits — COM-021/COM-029: old migrations and migration tests retain historical column/status names, including the `1782446700000-UpgradeSupersededChecks` failure described below.

`backend-core-service/src/platform-admin` had no remaining compatibility hits in the audit evidence. The order-service/DTO hits are material: the new transition service and migration coexist with legacy lifecycle code on this branch, so the compatibility cleanup is not complete.

### Production incident — 2026-10-10

`/workspace/orders` crashed with `Cannot read properties of undefined (reading 'replaceAll')` because the order list and detail mappers omitted `deliveryStatus`, although the entity defines it as non-nullable with default `packed`. The hotfix added `deliveryStatus` to both mappers and added backend regression tests; the order service spec passed. Pending/rejected/cancelled orders now show a `packed` delivery badge; owner COM-014 must decide whether that should be hidden or displayed as `—`. Add an API contract test for order list/detail shapes under COM-024 or COM-020. Production commit and deployment state are UNVERIFIED from the repository.

### COM-026 change record

`docs/commerce_docs/order_simplification_changes.md` does not exist in this checkout. When COM-026 is completed, include the production incident record above in that change record, or explicitly remove the reference if the record is not being created.

### COM-011 review evidence

- Agent rejection reason is sent proactively by the order event consumer at `backend-core-service/src/order/order-activity.projector.ts:216-225`; the event payload reason is assembled by `OrderTransitionService.appendEvent` at `backend-core-service/src/order/order-transition.service.ts:253-258`.
- Expiry candidates are restricted to non-null `expires_at` and `pending`/`rejected` at `backend-core-service/src/order/order-expiry.worker.ts:42-70`, then become `cancelled` with literal reason `expired`. The event consumer sends the expiry message only when `eventType = order.cancelled` and `payload.reason = expired` at `backend-core-service/src/order/order-activity.projector.ts:216-235`; staff cancellation reasons do not match.
- `rg -n "order\\.expired" backend-core-service services dashboards --glob '!**/node_modules/**'` returns one historical migration-index hit at `backend-core-service/src/database/migrations/1782447500000-AddOrderActivityOutbox.ts:11`; there are no runtime `order.expired` consumers. Remaining `expired` status literals are subscription/onboarding/session domains, migration fixtures, or the intentional order cancellation reason.
- Workspace visibility: after COM-011c, proofs use file-storage IDs in `orders.attachments`, which matches agent rendering through `mediaLibraryService.getDownloadUrl` at `backend-core-service/src/agent/agent.service.ts:1750-1791`; Telegram IDs remain metadata only.

### COM-011b Burmese strings awaiting owner approval

Exact strings requiring native Burmese translation review:

1. Full shipping address prompt: `Send your full shipping address in one message (maximum 500 characters).`
2. Proof received: `Payment proof received. An agent will review it.`
3. Proof retry: `We could not accept that payment proof. Please upload the image again.`
4. Retry cap: `The payment-proof retry limit has been reached. Please contact an agent.`
5. Neutral rejection: `Your order was rejected: {reason}. If this is about your payment proof, please upload a correct proof here to try again.`

These are `NEEDS NATIVE REVIEW`; no Burmese text was authored by engineering.

## 7. COM-000 decisions recorded

COM-000 is approved and DONE:

1. Payment proof is optional. The existing attachment endpoint is called first; its reference is supplied when marking paid.
2. Rejected bot orders are retryable: proof re-upload within the timer gives `rejected -> pending`; expiry gives `rejected -> cancelled` with reason `expired`.
3. Option A is selected: no DB unique index; `createBotOrder` uses a transaction-scoped PostgreSQL advisory lock and check for one pending+unpaid bot order per `(tenant, customer)`. Agent-created paths must clear/omit `expires_at`; bot orders expire regardless of payment method, including bot COD. The expiry worker continues using `expires_at IS NOT NULL`. Existing pending/rejected agent rows with non-null `created_by` and `expires_at` are cleared during migration. Ambiguous historical rows stop migration for review; Option B is the fallback if safe classification fails.
4. Telegram uses the bot-local `BOT_MESSAGES` catalog. Rejection wording is neutral: `Your order was rejected: {reason}. If this is about your payment proof, please upload a correct proof here to try again.` All `my` proof/address/retry keys currently fall back to plain English until native review approves Burmese text.

### Telegram string diff for review

| Surface | Before | After/decision |
|---|---|---|
| Rejected status label | Existing English `Rejected`; existing Myanmar `ငြင်းပယ်ပြီး` | Reuse unchanged |
| Proof rejection | Previous proof-specific wording | Neutral order rejection with reason and upload-again instruction |
| Proof received/retry/cap | English-only runtime strings | Added to both `en` and `my` catalog keys; `my` falls back to English pending native review |
| Address prompt | Split-field prompt | One full-address prompt, max 500 characters |
| Burmese review | No runtime Burmese authored | Review comments mark each needed translation `NEEDS NATIVE REVIEW` |

## 8. Implementation safeguards

COM-004 combines entity and transition changes with affected specs to avoid a red entity-only commit. Every backend task carries its own affected-spec command and pass result. COM-020 and COM-022 are residual gap coverage only. COM-024 depends on converted seeds COM-018 and COM-019. COM-028 is the platform-console task; COM-029 is final verification.
