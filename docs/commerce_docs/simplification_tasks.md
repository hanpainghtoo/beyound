# Commerce Simplification Task Tracker

Last updated: 2026-10-10 (Asia/Yangon)

| Summary | Count |
|---|---:|
| Total | 38 |
| START | 14 |
| WIP | 2 |
| DONE | 22 |

Current WIP: COM-019 and COM-030. COM-001b is recorded as a future hardening task and has not started. COM-006 closed after the disposable-DB integration run.

Every task depends on COM-000 directly or through its dependency chain. Backend tasks include affected-spec updates and passing results in the same task.

## Task list

| ID | Area | Task | Depends on | Status | Started | Finished | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| COM-000 | gate | Resolve open questions and record final decisions | — | DONE | 2026-10-08 | 2026-10-08 | Plan/tracker decision record; stale agent expiry violation claim corrected: `backend-core-service/src/order/order-creation.service.ts:289-290` sets `expiresAt: null` | Option A approved |
| COM-001 | DB migration | Implement migration, temporary backup table, and safe up/down design | COM-000 | DONE | 2026-10-08 | 2026-10-08 | Historical evidence, not reproduced in the 2026-10-10 audit: migration and fresh/seeded local up/down results were not rerun; only Workspace tsc/lint, root build, and `npx jest src/order` were run. | No DB unique index; retain backup through production verification |
| COM-003 | DB preflight | Commit re-runnable preflight SQL/script and production-snapshot gate | COM-000 | DONE | 2026-10-08 | 2026-10-08 | Historical evidence, not reproduced in the 2026-10-10 audit: the local read-only preflight was not rerun; only Workspace tsc/lint, root build, and `npx jest src/order` were run. | Production snapshot still requires DEPLOY-GATE review |
| DEPLOY-GATE | manual | Run preflight on production snapshot and review findings | COM-003, COM-001b | START | — | — | — | Must remain not DONE until explicit user confirmation |
| COM-001b | backend/migration | Harden migration down() for lossless-safe rollback | COM-000, COM-001 | START | — | — | — | Blocks DEPLOY-GATE and COM-029; do not start until separately approved |
| COM-004 | backend | Combine TypeORM entity changes with transition service and affected specs | COM-000, COM-001 | START | 2026-10-09 | — | Legacy lifecycle writer remains in `backend-core-service/src/order/order.service.ts:426-545`; `backend-core-service/src/order/dto/update-order-lifecycle.dto.ts:12-88` still accepts legacy lifecycle/payment values. | Option A; no unique-index writer |
| COM-005 | backend | Refactor order writers and transactional detail updates | COM-000, COM-004 | DONE | 2026-10-09 | 2026-10-09 | Transactional item replacement, manager-scoped event, and rollback test; order specs pass 6/6 | Focused payment/delivery writers are COM-008/COM-009 |
| COM-006 | backend | Implement creation, advisory-lock uniqueness, reservation-driven stock, expiry, and retry behavior | COM-000, COM-004 | DONE | 2026-10-09 | 2026-10-09 | Historical evidence, not reproduced in the 2026-10-10 audit: claimed disposable-DB migrations/integration and 2 suites/24 tests were not rerun; only Workspace tsc/lint, root build, and `npx jest src/order` were run. | Agent-created omit expires_at; bot COD expires too |
| COM-007 | backend | Route delivery service through transition service | COM-000, COM-004 | DONE | 2026-10-09 | 2026-10-09 | Delivery specs 22/22 with transition coverage; build and no-direct-status-write grep pass | Five delivery values |
| COM-008 | backend | Implement attachment-first staff payment flow and events/projector | COM-000, COM-004 | DONE | 2026-10-09 | 2026-10-09 | Historical evidence, not reproduced in the 2026-10-10 audit: payment-specific 7/7 evidence was not rerun; the broader `npx jest src/order` command failed its suite gate despite 51 individual tests passing. | Optional proof; no `order_payment_proofs` |
| COM-009 | API | Add focused status/payment/delivery DTOs, endpoints, filters, Swagger | COM-000, COM-004 | START | 2026-10-09 | — | Focused endpoints exist, but legacy lifecycle service/DTO compatibility values remain: `order.service.ts:426-545` and `update-order-lifecycle.dto.ts:12-88`; removal is not complete. | Remove lifecycle endpoint |
| COM-010 | API | Apply role matrix, delivery alias, and tenant isolation | COM-000, COM-009 | START | 2026-10-09 | — | Focused role/tenant work exists, but the legacy lifecycle service/DTO and its legacy status/payment values remain in `order.service.ts:426-545` and `update-order-lifecycle.dto.ts:12-88`; full compatibility cleanup is incomplete. | Full-repo grep and platform-admin scope moved to COM-027/COM-029 |
| COM-011 | Telegram | Update checkout address, payment proof, rejection, retry, and status flow | COM-000, COM-006, COM-008, COM-009 | DONE | 2026-10-09 | 2026-10-09 | Historical evidence, not reproduced in the 2026-10-10 audit: claimed Telegram/order suites, 16/93, and disposable-DB integration 2/25 were not rerun; only Workspace tsc/lint, root build, and `npx jest src/order` were run. | Engineering complete; English runtime fallback verified |
| COM-011b | Telegram | Approved Burmese strings | COM-011 | START | — | — | — | Owner: me; blocks DEPLOY-GATE only |
| COM-011c | backend/media | Mirror payment proofs into file storage | COM-011 | DONE | 2026-10-09 | 2026-10-09 | Historical evidence, not reproduced in the 2026-10-10 audit: Telegram proof, transition, and disposable-DB tests were not rerun; root build was rerun, but not the cited proof commands. | External provider contract remains a deployment verification item; browser coverage remains COM-024 and deployment remains blocked by COM-011b/DEPLOY-GATE |
| COM-012 | frontend | Update Workspace API types, queries, mutations, and invalidation | COM-000, COM-009 | DONE | 2026-10-09 | 2026-10-09 | Claimed green was false at audit time (parse error); re-verified passing on 2026-10-10 at `ebd25deb6397bf6f301264579f22b300f620db22e` with Workspace `npx tsc --noEmit`. | Transitional UI consumers assigned to COM-013/COM-014/COM-015 |
| COM-013 | frontend | Update Workspace orders list/detail/create UI and focused actions | COM-000, COM-012 | DONE | 2026-10-09 | 2026-10-09 | Historical evidence, not reproduced in the 2026-10-10 audit: cited implementation details were read but the exact prior order-specific command was not rerun; Workspace tsc/lint and root build were rerun. | English UI fallback remains via existing i18n provider; backend item-edit guard rejects changed items after pending |
| COM-013a | API/frontend | Link uploaded media to an order for payment proof | COM-013 | DONE | 2026-10-09 | 2026-10-09 | Historical evidence, not reproduced in the 2026-10-10 audit: dedicated 10-test and disposable-DB 2-suite/26-test evidence was not rerun; only Workspace tsc/lint, root build, and `npx jest src/order` were run. | Attachment cap N=10; uploaded image/* or PDF <=10 MiB; pending/confirmed only; tenant-checked; roles owner/admin/supervisor/agent |
| COM-014 | frontend | Update Workspace deliveries UI and remove legacy mappings | COM-000, COM-010, COM-012 | DONE | 2026-10-09 | 2026-10-09 | Confirmed-only list, five server filters, server-side status counts, PATCH updates, assignee/date editing, role gating, and reason validation; historical evidence, not reproduced in the 2026-10-10 audit. Workspace tsc/lint/build were rerun; the cited delivery-specific test was not rerun. | Unconfirmed detail returns 404; no zone/tracking/COD fields. Follow-up: pending/rejected/cancelled orders now show a `packed` delivery badge; owner decision to hide it or show `—` is open. |
| COM-015a | frontend | Make Workspace typecheck green before page rewrites | COM-000, COM-012, COM-013a | DONE | 2026-10-09 | 2026-10-09 | Claimed green was false at audit time (parse error); re-verified passing on 2026-10-10 at `ebd25deb6397bf6f301264579f22b300f620db22e` with Workspace tsc/lint and root production build. | Page work may proceed; legacy cleanup remains COM-015 |
| COM-015 | frontend | Remove dead fields/statuses, role gates, settings, and translations | COM-000, COM-013, COM-014 | START | — | — | — | Workspace cleanup |
| COM-016 | reports | Update server reports for binary payment and independent delivery | COM-000, COM-005, COM-007, COM-008 | DONE | 2026-10-09 | 2026-10-09 | Revenue reports now expose binary payment and independent five-value delivery breakdowns; report spec and backend build pass. Report source contains no COD/balance fields. | Remove COD/balance metrics |
| COM-017 | reports | Update Workspace report aggregation and CSV output | COM-000, COM-016, COM-012 | DONE | 2026-10-09 | 2026-10-09 | Historical evidence, not reproduced in the 2026-10-10 audit: revenue-specific backend/report commands were not rerun; Workspace tsc/lint and root build were rerun. | No browser 100-order cap on revenue report |
| COM-013c | frontend/API | Harden Workspace order detail, proof viewer, and proof isolation | COM-013, COM-013a, COM-011c | DONE | 2026-10-10 | 2026-10-10 | Historical evidence, not reproduced in the 2026-10-10 audit: detail/proof-specific evidence was not rerun; Workspace tsc/lint and root build were rerun. | Blocks COM-024; selected-order proof state resets; failed proof loads retain attachment count and offer retry; COM-024 still requires browser coverage |
| COM-018 | seeds | Convert seeds and add required bot/agent/retry/delivery cases | COM-000, COM-001, COM-004, COM-006 | DONE | 2026-10-09 | 2026-10-10 | Historical evidence, not reproduced in the 2026-10-10 audit: disposable fixture load and 3-suite/27-test integration evidence was not rerun; only Workspace tsc/lint, root build, and `npx jest src/order` were run. | Legacy `02_seed_data.sql` is intentionally not repaired; follow-up SEED-LEGACY |
| COM-019 | seeds | Convert shell/media seeds and smoke/API checks | COM-000, COM-009, COM-018 | WIP | 2026-10-10 | — | PARTIAL: scoped scripts/services scan is clean after excluding intentional preflight mapping literals; `npm run smoke:api` remains unrun against a verified disposable DB | Batch 4 current WIP |
| COM-020 | tests | Add remaining service/controller transition gap coverage | COM-000, COM-004, COM-007, COM-009 | DONE | 2026-10-10 | 2026-10-10 | Historical evidence, not reproduced in the 2026-10-10 audit: claimed 25 suites/134 tests was not rerun. In this follow-up, backend `npx tsc --noEmit` passed after the five constructor-arity fixture fixes, and the affected order/tenant specs passed 5 suites/49 tests; the cited 25-suite/134-test command was not rerun. | Historical migration assertion is COM-021 follow-up |
| COM-021 | tests | Add migration up/down/backfill/address-conversion coverage | COM-000, COM-001 | START | — | — | Historical migration evidence remains open. The two `1782446700000-UpgradeSupersededChecks` tests fail because they expect `DROP CONSTRAINT` without `IF EXISTS`. | Migration tests only |
| COM-022 | tests | Add remaining role, isolation, event/history, and endpoint gaps | COM-000, COM-009, COM-010 | DONE | 2026-10-10 | 2026-10-10 | Historical evidence, not reproduced in the 2026-10-10 audit: claimed 17/17 and role/endpoint results were not rerun; only Workspace checks, root build, and `npx jest src/order` were run. | Tenant and role coverage green |
| COM-023 | tests | Update Telegram and agent integration tests | COM-000, COM-011 | DONE | 2026-10-10 | 2026-10-10 | Historical evidence, not reproduced in the 2026-10-10 audit: claimed 7 suites/45 tests and disposable integration 3 suites/27 tests were not rerun; only Workspace checks, root build, and `npx jest src/order` were run. | Retry, attachment, idempotency |
| COM-024 | tests | Add/update Workspace Playwright commerce flow | COM-000, COM-013, COM-014, COM-018, COM-019 | START | — | — | — | Converted seeds required |
| COM-025 | docs | Update ERD, product/current-stage, Telegram, architecture, and checklist docs | COM-000, COM-015, COM-016, COM-017 | START | — | — | — | Historical docs banner |
| COM-026 | docs | Write post-change record and intentional grep exceptions | COM-000, COM-025 | START | — | — | `docs/commerce_docs/order_simplification_changes.md` does not exist; include the 2026-10-10 production-incident record when creating it, or remove the reference. | Include mapping, backup, preflight, and incident evidence |
| COM-027 | platform API | Update platform-admin order/delivery/payment/report/merchant endpoints | COM-000, COM-009, COM-010, COM-016 | DONE | 2026-10-09 | 2026-10-09 | Historical evidence, not reproduced in the 2026-10-10 audit: claimed 10 suites/103 tests and platform-admin grep were not rerun; only Workspace checks, root build, and `npx jest src/order` were run. | Remaining dashboard/script compatibility hits are COM-028/COM-029 scope |
| COM-028 | platform UI | Update platform-console sales-orders, deliveries, reports, merchant views, and lib/api.ts | COM-000, COM-017, COM-027, COM-018, COM-019 | START | — | — | — | Five delivery values; remove COD/tracking/zone assumptions |
| COM-029 | verification | Run final build, lint, typecheck, tests, migration checks, CI, and report | COM-000, COM-003, COM-001b, DEPLOY-GATE, COM-018, COM-019, COM-020, COM-021, COM-022, COM-023, COM-024, COM-026, COM-027, COM-028 | START | — | — | — | Final report only |
| COM-030 | backend/frontend/Telegram | Add payment-method image upload, preview, replacement/removal, validation, and Telegram delivery | COM-011c, COM-012, COM-015 | WIP | 2026-10-10 | — | Follow-up verification: affected backend payment/media/Telegram/order/tenant specs passed 5 suites/49 tests; backend `npx tsc --noEmit` passed; Workspace `npx tsc --noEmit` and `npm run lint -- --max-warnings=0` passed; root `npm run build` passed for backend, both dashboards, and all five services. The previously cited file-storage 1-suite/17-test result was not rerun in this follow-up; Workspace upload browser coverage remains open. | Reuses `tenant_payment_methods.qr_media_id`; no migration |
| SEED-LEGACY | follow-up | Repair legacy `02_seed_data.sql` schema drift | — | START | — | — | — | Non-blocking follow-up; do not modify during COM-018 |

## Acceptance checks by task

### COM-000 — Resolve open questions — DONE

- [x] Record optional proof, retryable rejection, Option A advisory-lock uniqueness, expiry eligibility, existing pending-agent handling, and `en`/`my` string reuse. Evidence: `rg -n "COM-000 decisions recorded|Telegram string diff|Option A" docs/commerce_docs/simplification_plan.md`.
- [x] Verify creation-path `created_by`/`expires_at` evidence and local pending distinction. Evidence: `backend-core-service/src/agent/agent.service.ts:2211-2276`; `backend-core-service/src/order/order-creation.service.ts:289-290,477-507`; `backend-core-service/src/telegram-bot/telegram-commerce.service.ts:385-401`. The stale violation claim is corrected because the agent path sets `expiresAt: null`; the local DB query is historical evidence, not reproduced in the 2026-10-10 audit.

### COM-001 — Migration and backup — DONE

- [x] Add temporary backup table with the ten requested legacy columns before drops, retain it through production verification, and use it in down when available. Evidence: `backend-core-service/src/database/migrations/1782447800000-SimplifyCommerceStatuses.ts`; down verification retained `commerce_simplification_order_backup`.
- [x] Implement corrected status-derived delivery mapping, status `cod_collected` payment precedence, expiry cleanup for mapped pending/rejected agent rows, five-value checks, no shipping-address length CHECK, no unique index, and no reservation backfill. Evidence: focused migration test passed 7/7; `npm --prefix backend-core-service test -- --runInBand --testPathPattern='1782447800000-SimplifyCommerceStatuses'` and `npm --prefix backend-core-service run build` both passed.
- [x] Run migration up/down on fresh and seeded local copies only, including post-deploy edits, an order created after up, and up-down-up backup refresh. Evidence: disposable local fresh/seeded runs passed; post-deploy down preserved edited address/status and converted the new row to legacy-valid `delivered`/`pending` with JSONB address; second up/down passed; post-down checks showed fresh orders=0, seeded orders=7, `shipping_address=jsonb`, no `delivery_status`, backup retained. Temporary local databases were removed.

### COM-003 — Re-runnable preflight gate (includes completed local preflight)

- [x] Commit an idempotent read-only SQL/script file including expired split by `created_by` nullness and pending non-null-creator expiry counts, then run it against the local DB. Evidence: `scripts/commerce-simplification-preflight.sql`; `PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -f scripts/commerce-simplification-preflight.sql` passed with `ROLLBACK`.
- [x] Stop/go rule covers duplicates, unmapped values, unknown keys, partial-payment sums, returned/failed delivery, expired split, pending agent expiry, and status-history source distribution. Evidence: focused local output had zero unmapped values, zero ambiguous expiry candidates, zero duplicate groups, partial amount `15000.00`, refunded amount `0.00`.
- [ ] Run the same script against a production snapshot/staging copy and review findings. This remains DEPLOY-GATE and is not complete locally.

### DEPLOY-GATE — Production snapshot review

- [ ] Run the committed read-only preflight against a production snapshot or staging copy and review every duplicate, unknown key, partial payment, returned/failed-delivery, expired, and pending agent-expiry finding. Command: `PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -f scripts/commerce-simplification-preflight.sql`.
- [ ] Set this item to DONE only after explicit user confirmation; until then it remains START and blocks final verification.

### COM-001b — Harden migration down() — START (not started)

- [ ] Restore `paid_amount` from backup when the order is unchanged since `up()`.
- [ ] Restore `balance_due`, `cod_amount`, and `cod_collected_at` only when unchanged; otherwise recompute `balance_due = total_amount - paid_amount` and leave `cod_*` defaults.
- [ ] If current status/payment/delivery equal the mapping of backup values, restore the exact backup status and payment status; otherwise derive valid legacy values.
- [ ] Abort with a count and manual-rollback message when any order lacks a backup row (policy A).
- [ ] Restore `expires_at` only where current value is `NULL`.
- [ ] Detect duplicate violations before recreating legacy `UQ_orders_managed_active_unpaid_customer` in `down()`; `up()` explicitly drops it with `DROP INDEX IF EXISTS`. Option A still means no unique index in the new schema.
- [ ] Confirm transactional migration mode and backup column types match the real `orders` columns.
- [ ] Add tests for unchanged exact restore, changed/new orders, duplicate-index abort, `expires_at` restoration, and the real `createBotOrder` fixture.
- [ ] Extend preflight with non-null tracking/zone/billing counts, `cod_amount` and `balance_due` totals, and `reservation_managed` true/false counts by status.

### COM-004 — Entity and transition service — START

- [x] Entity and transition changes land together with four order states, five delivery states, payment pending/confirmed guard, history/events, and affected specs; no unique-index design remains. Command: `npm --prefix backend-core-service test -- --runInBand --testPathPattern='order|delivery|payment'`.
- [ ] The new transition service owns the target order, payment, and delivery state machines. PARTIAL: legacy lifecycle writers remain in `backend-core-service/src/order/order.service.ts:426-545` and `update-order-lifecycle.dto.ts:12-88`; final removal is not complete.
- [x] DeliveryService writes delivery transitions through the transition service, and reservation/stock behavior is driven only by reservation rows.
- [x] Domain events are appended through the same transaction manager as the state change.
- [x] No FE/API feature changes are included in this slice; seed address literals are serialized only to satisfy the new string entity type.
- [ ] Transitional dropped-column compatibility fields remain in the legacy order service/DTO and other consumers; assign remaining removals to COM-015/COM-019/COM-028/COM-029.
- [x] Full backend build and order/delivery/payment tests pass: 7 suites, 44 tests. Command: `npm --prefix backend-core-service run build && npm --prefix backend-core-service test -- --runInBand src/order src/delivery src/payment`.
- [x] Run the affected transition/order/delivery specs and `npm --prefix backend-core-service run build` with a green result.
- [x] Reservation release/convert/restock lock product IDs in ascending order; creation reserves agent items in product-ID order. Confirmed cancellation restores only movement-backed stock and is marker-idempotent.
- [x] `getDeliveryDetail` returns 404 for unconfirmed orders, matching the confirmed-only list.

### COM-005 — Order writers

- [x] Detail item delete/recreate and order save run in one manager transaction with rollback coverage. Command: `npm --prefix backend-core-service test -- --runInBand src/order/order.service.spec.ts`.
- [x] Shipping address is a single string DTO field and transactional detail updates append field-tagged history/events. Focused order specs pass 6/6; focused payment/status writers remain in COM-008/COM-009.

### COM-006 — Creation, stock, expiry, retry

- [x] New orders reserve; legacy orders without reservation rows are stock no-ops; expiry is `expires_at` only; rejected retry and expiry rules pass the available affected specs. Command: `npm --prefix backend-core-service test -- --runInBand src/order/order-transition.service.spec.ts src/order/order-reservation.service.spec.ts`.
- [x] `createBotOrder` uses a transaction-scoped advisory lock/check before product locks; active pending/unpaid and retry-window rejected orders are returned, retry cap is enforced, bot reservations are product-sorted, and agent/COD creation omits `expires_at`. Command: `rg -n "pg_advisory_xact_lock|lockBotCustomer|createManagedAgentOrder|createBotOrder|paymentMethod.*cod|expiresAt" backend-core-service/src/order/order-creation.service.ts backend-core-service/src/agent/agent.service.ts`.
- [x] Migration and integration acceptance passed on the disposable `zayos_commerce_test` database only: `npm --prefix backend-core-service run migration:run`; `npm --prefix backend-core-service run test:integration`. Expanded result: 2 suites, 24 tests passed, including concurrent creation, replacement/confirmation race, bot-only expiry, rejected-retry cap, and exactly-once confirmed cancellation restock. No credentials were printed and `kme_omnichannel` was refused by the target guard.

### COM-007 — Delivery service

- [x] Delivery updates use the transition service, confirmed-only queries, all five values, and required failure/return notes. Command: `npm --prefix backend-core-service test -- --runInBand src/delivery/delivery.service.spec.ts src/order/order-transition.service.spec.ts`.
- [x] Delivery service has no direct order-status writes. Command: `rg -n "\.status\s*=|order_status|delivery_status|failed_delivery|returned" backend-core-service/src/delivery` (matches are DTO/filter/query constants only).

### COM-008 — Payment and attachments

- [x] Existing attachment endpoint runs before mark-paid; the referenced file must already be present in the same order’s tenant-scoped attachments, proof remains optional, and `order_payment_proofs` is unwired. Command: `rg -n "attachments|order_payment_proofs|payment-status" backend-core-service/src/order backend-core-service/src/payment`.
- [x] Affected payment/order specs pass. Command: `npm --prefix backend-core-service test -- --runInBand src/order/order.service.spec.ts src/order/order.controller.spec.ts`.

### COM-009 — Focused API — START

- [x] Focused endpoints validate four order and five delivery values, payment guard, reason rules, and no lifecycle endpoint. Command: `npm --prefix backend-core-service test -- --runInBand src/order/order.controller.spec.ts src/order/order.service.spec.ts`.
- [x] Lifecycle route is absent from controller sources. Command: `rg -n "@Put\(':id/lifecycle'\)|updateOrderLifecycle" backend-core-service/src/order/order.controller.ts` (no matches).
- [ ] Legacy lifecycle service/DTO and compatibility values are removed. Remaining evidence: `backend-core-service/src/order/order.service.ts:426-545` and `backend-core-service/src/order/dto/update-order-lifecycle.dto.ts:12-88`.
- [ ] Temporary `deliveryZone`, `trackingNumber`, and `zone` DTO placeholders remain; this acceptance item is moved to COM-015/COM-029 rather than claimed complete.

### COM-010 — Roles and isolation — START

- [x] Owner/admin/supervisor/agent and existing finance payment roles work; delivery role is not required; tenant isolation passes. Core controller/payment role and isolation tests plus the disposable payment integration suite are green. Platform-admin endpoint/UI scope is tracked by COM-027/COM-028.
- [x] The Order entity no longer declares transitional compatibility fields; build and affected order/delivery/controller/transition specs pass. Command: `npm --prefix backend-core-service run build && npm --prefix backend-core-service test -- --runInBand src/order/order.service.spec.ts src/delivery/delivery.service.spec.ts src/order/order-transition.service.spec.ts src/order/order.controller.spec.ts`.
- [ ] Scoped compatibility cleanup is complete. Legacy lifecycle service/DTO values remain in `backend-core-service/src/order/order.service.ts:426-545` and `backend-core-service/src/order/dto/update-order-lifecycle.dto.ts:12-88`; full-repo cleanup remains assigned to COM-015/COM-019/COM-028/COM-029.
- [x] Controller payment reason, staff-status restriction, and transition-owned proof validation tests pass. Command: `npm --prefix backend-core-service test -- --runInBand src/order/order.controller.spec.ts src/order/order-transition.service.spec.ts`.

### COM-011 — Telegram — DONE (engineering)

- [x] Telegram uses one-message address, creates expiring bot pending orders, supports attachment-first proof, and sends rejection reason/retry copy. Command: `npm --prefix backend-core-service test -- --runInBand --testPathPattern='telegram'` — 7 suites/44 tests passed.
- [x] Telegram never marks payment/order confirmed; proof retry uses `OrderTransitionService` with the customer actor and cap. Command: `rg -n "confirm|paymentStatus|createBotOrder|expiresAt" backend-core-service/src/telegram-bot`; transition and disposable-DB integration coverage passed.
- [x] Bot proof sets `paymentSubmittedAt`, emits `order.payment_proof_submitted`, exposes the signal in list/detail/filter DTOs, and clears it on reject/paid. Commands: `npm --prefix backend-core-service test -- --runInBand src/order/order-transition.service.spec.ts src/telegram-bot/telegram-checkout.spec.ts`; disposable DB integration run — 2 suites/25 tests passed.
- [x] Photo/document proof is consumed only for a payment session order or an expiring rejected bot order; random photos fall through. Command: `npm --prefix backend-core-service test -- --runInBand src/telegram-bot/telegram-checkout.spec.ts`.
- [x] Duplicate proof identity is idempotent; paid orders are rejected; retry cap uses `PaymentProofRetryLimitError`; history uses `event: 'proof_submitted'`. Command: `npm --prefix backend-core-service test -- --runInBand src/order/order-transition.service.spec.ts`.
- [x] Proactive rejection and expiry notifications are event-consumer driven; staff cancellations do not receive expiry copy. Evidence: `backend-core-service/src/order/order-activity.projector.ts:111-112,216-235`; tests in `order-activity.projector.spec.ts`.
- [x] Engineering is complete; runtime English fallback is verified. Burmese approval is tracked separately in COM-011b.

### COM-011b — Approved Burmese strings — START

- [ ] Owner: me. Approve translations for the address prompt, proof received, proof retry, retry-cap reached, and neutral rejection/retry message. This item blocks DEPLOY-GATE only.

### COM-011c — Mirror payment proofs into file storage — DONE

- [x] Bot proof path downloads through Telegram `downloadFile`, creates a tenant media upload with purpose `message-media`, uploads bytes through the signed PUT path, and stores the file-storage ID in `orders.attachments` while retaining the Telegram ID only in attachment metadata. Command: `npm --prefix backend-core-service run build`.
- [x] Storage-ID ownership and metadata persistence tests pass; disposable DB integration passed 2 suites/25 tests. Command: `npm --prefix backend-core-service test -- --runInBand src/telegram-bot/telegram-checkout.spec.ts src/order/order-transition.service.spec.ts`.
- [x] Provider integration boundary is documented against the existing inbound-chat media path; live provider credentials are not used locally. Frontend viewer remains downstream COM-013/COM-024 work.

### COM-012 — Workspace API

- [x] API types contain one address string, five delivery values, focused endpoints, and attachment reference flow. Command: `rg -n "delivery_status|failed_delivery|shippingAddress|payment-status|lifecycle" dashboards/workspace/lib`.
- [x] Workspace typecheck passes. The audit found the prior parse failure at `inbox/page.tsx:2202`, fixed at line 235; this was re-verified passing on 2026-10-10 at `ebd25deb6397bf6f301264579f22b300f620db22e` with `npx tsc --noEmit`.

### COM-013 — Workspace orders

- [x] Orders UI uses one multiline address, required reasons, pending/confirmed payment actions, and upload-before-paid. Components: `orders-list.tsx`, `order-detail-panel.tsx`, `order-actions.tsx`, `proof-viewer.tsx`; Workspace tsc/lint/build passed.
- [x] Dashboard lint passes. Command: `npm --prefix dashboards/workspace run lint -- --max-warnings=0`.
- [x] Workspace typecheck passes. Command: `cd dashboards/workspace && npx tsc --noEmit`.

### COM-013a — Link payment proof attachment

- [x] Add a tenant-checked owner/admin/supervisor/agent endpoint that links an uploaded media ID into `orders.attachments`, validates role `payment_proof`, and requires media purpose `order-payment-proof`. Command: `npm --prefix backend-core-service run build`.
- [x] Dedicated tests cover unuploaded files, image/PDF allowlist, 10 MiB cap, duplicate idempotency, attachment cap N=10, pending/confirmed gating, audit metadata, role matrix, and cross-tenant rejection. Disposable `zayos_commerce_test` integration run passed 2 suites/26 tests, including real-DB idempotent linking.

### COM-015a — Make Workspace typecheck green

- [x] Workspace typecheck, lint, and production build pass before page rewrites. The claimed green was false at audit time because of the parse error; re-verification passed on 2026-10-10 at `ebd25deb6397bf6f301264579f22b300f620db22e`. The legacy cleanup itself remains COM-015.

### COM-014 — Workspace deliveries — DONE

- [x] Confirmed-only list and all five delivery filters/transitions render; historical evidence, not reproduced in the 2026-10-10 audit. Follow-up remains: pending/rejected/cancelled orders show a `packed` badge; owner must decide whether to hide it or show `—`.
- [x] Server-side status counts, assignee/date editing, PATCH updates, and unconfirmed detail 404 are covered by the delivery service contract. Command: `npm --prefix backend-core-service test -- --runInBand src/delivery/delivery.service.spec.ts` — 6 tests passed.
- [x] Workspace typecheck, lint, and production build passed: `cd dashboards/workspace && npx tsc --noEmit && npm run lint -- --max-warnings=0 && npm run build`.

### COM-015 — Workspace cleanup

- [ ] Active Workspace references to removed fields/lifecycle/legacy statuses are absent except documented history. Command: `rg -n "billing_address|tracking_number|delivery_zone|cod_amount|pending_payment|cod_collected|/lifecycle" dashboards/workspace`.
- [ ] Lint passes. Command: `npm --prefix dashboards/workspace run lint -- --max-warnings=0`.

### COM-016 — Server reports

- [x] Reports use binary payment and independent delivery, with COM-007 delivery semantics and no COD/balance KPIs. Command: `rg -n "\b(cod|balance)\b|cod_amount|balance_due" backend-core-service/src/report` returned no hits.
- [x] Report specs and build pass. Command: `npm --prefix backend-core-service test -- --runInBand src/report/report.service.spec.ts && npm --prefix backend-core-service run build`.

### COM-017 — Workspace reports

- [x] Workspace report pages use `/reports/revenue` server aggregation, with confirmed + paid + non-returned revenue and returned amounts separate. Command: `rg -n "reportsApi\.revenue|returnedRevenue" dashboards/workspace/app/workspace/reports dashboards/workspace/lib/api.ts`.
- [x] Workspace typecheck, lint, and production build passed after the report definition update.

### COM-018 — Required seed cases

- [x] Self-contained commerce fixtures include separate pending/rejected bot customers, a payment-submitted proof, five orders with items, a tracked product, active bot reservation, and delivered/failed assignee data. Command: `rg -n "commerce-fixture|payment_proof|order_item_reservations|failed_delivery|returned" backend-core-service/scripts/commerce-simplification-fixtures.sql`.
- [x] Fixture loader runs after migrations on disposable `zayos_commerce_test`; integration result: 3 suites/27 tests passed. Legacy `02_seed_data.sql` was not repaired; follow-up is `SEED-LEGACY`.

### COM-013c — Workspace order detail and proof hardening — DONE

- [x] Selected-order changes clear the reason and proof file, stale detail requests do not replace the selected order, and the panel has loading/error/empty states. Workspace production build passed.
- [x] Detail panel shows items, address, notes, totals, payment method, customer and delivery contact data, field-labelled history, and a Deliveries edit link. `OrderDetailsDialog` uses backend edit roles.
- [x] Proof viewer counts attachment data, uses the mirrored storage `fileId` (Telegram ID remains metadata), renders PDFs as links, and retains retry/error state when signed-url loading fails. Backend generic media listing excludes `order-payment-proof`; tenant-scoped download test passed 15/15 media tests.
- [ ] Browser-level proof A→B isolation and full Playwright commerce flow remain COM-024.

### COM-019 — Shell/media seeds

- [ ] Shell/media seeds and smoke checks send no removed fields/statuses and use focused endpoints. The scoped `scripts/services` scan is clean when the intentional preflight mapping file is excluded; the unscoped hits are preflight legacy-mapping literals.
- [ ] Relevant scripts complete without mutation outside their documented seed target. `npm run smoke:api` was not run because its default target is an API whose database could not be verified as the disposable database; rerun against a disposable local stack before closing this task.

### COM-020 — Transition gaps

- [x] Residual transition/controller gaps cover cross-rules, reason requirements, and event/history behavior. Historical evidence, not reproduced in the 2026-10-10 audit: 25 suites/134 tests were not rerun. In the follow-up, backend `npx tsc --noEmit` passed after the five constructor-arity fixture fixes, and the affected order/tenant specs passed 5 suites/49 tests; the cited 25-suite/134-test command remains unreproduced.

### COM-021 — Migration tests

- [ ] Up/down, backup restore, status-derived delivery mapping, `cod_collected` payment precedence, address conversion, and no-length-CHECK behavior are tested. Command: `npm --prefix backend-core-service test -- --runInBand --testPathPattern='migration'`.

### COM-022 — API/role gaps

- [x] Residual role, tenant isolation, endpoint, and audit/event gaps pass. Historical evidence, not reproduced in the 2026-10-10 audit: 17/17 and role/endpoint results were not rerun; only Workspace checks, root build, and `npx jest src/order` were run.

### COM-023 — Telegram/agent integration

- [x] Bot/agent expiry discriminator, attachment-first proof, rejected retry, idempotency, and non-confirmation assertions pass. Historical evidence, not reproduced in the 2026-10-10 audit: 7 suites/45 tests and disposable integration 3 suites/27 tests were not rerun; only Workspace checks, root build, and `npx jest src/order` were run.

### COM-024 — Workspace Playwright

- [ ] Converted seeds support create -> confirm -> upload proof -> mark paid -> packed -> out_for_delivery -> delivered and invalid actions. Command: `npm run test:e2e -- --grep commerce`.

### COM-025 — Documentation

- [ ] ERD, product, Telegram, architecture, and checklist docs reflect the target; historical docs have banners and SQL has deprecation notes. Command: `rg -n "historical|deprecated|failed_delivery|returned|shipping_address" docs shared/database-schemas`.
- [ ] Documentation diff is clean. Command: `git diff --check -- docs shared/database-schemas`.

### COM-026 — Change record

- [ ] Change record includes mapping, backup retention/drop-after-verification, preflight gate, intentional grep exceptions, and the 2026-10-10 production incident. `docs/commerce_docs/order_simplification_changes.md` is absent in the current checkout; create it with the incident record or remove the reference.

### COM-027 — Platform-admin backend — DONE

- [x] Platform-admin order, delivery, payment-summary, report, and merchant-order endpoints expose target statuses and attachment references with no lifecycle/COD/tracking/zone assumptions. Command: `rg -n "reservationManaged|reservation_managed|balanceDue|balance_due|codAmount|cod_amount|codCollectedAt|trackingNumber|tracking_number|deliveryZone|delivery_zone|billingAddress|billing_address|/lifecycle|lifecycle" backend-core-service/src/platform-admin` — no hits.
- [x] Platform-admin specs pass. Historical evidence, not reproduced in the 2026-10-10 audit: the claimed 10 suites/103 tests were not rerun.
- [x] Full-repo compatibility and order-expired sweeps were run; remaining hits are documented in the plan and assigned to COM-015/COM-019/COM-028/COM-029. This evidence is historical and was not reproduced in the current audit.

### COM-028 — Platform-console UI

- [ ] `sales-orders`, `deliveries`, `reports`, merchant order views, and `lib/api.ts` use five delivery values, target payment/order fields, and no stale COD/tracking/zone/lifecycle assumptions. Command: `rg -n "failed_delivery|returned|cod|tracking|zone|lifecycle|paymentStatus|deliveryStatus" dashboards/platform-console/app/platform-console dashboards/platform-console/lib/api.ts`.
- [ ] Platform-console lint/typecheck passes. Command: `npm --prefix dashboards/platform-console run lint -- --max-warnings=0 && npm --prefix dashboards/platform-console exec tsc -- --noEmit`.

### COM-029 — Final verification

- [ ] All relevant builds, changed-file lint, typechecks, tests, Playwright, migration up/down, re-runnable preflight gate, and CI pass. Command: `npm run ci:phase1`.
- [ ] Final report records command results and no-go dispositions. Command: `git diff --check && git status --short`.

### COM-030 — Payment method images — WIP

- [x] Reuse `tenant_payment_methods.qr_media_id`; no migration was added. The new tenant-scoped upload contract uses purpose `payment-method-image`, allows only PNG/JPEG/WebP, caps metadata at 2 MiB, and relies on file-storage magic-byte verification on the signed PUT. Evidence: `backend-core-service/src/payment/dto/payment-image-upload.dto.ts`, `backend-core-service/src/media/media-library.service.ts`, and `services/file-storage-service/src/content-type-signature.ts`.
- [x] Editor-only payment settings expose signed image preview information; non-editors receive only `hasImage`. Workspace supports upload, preview refresh, replace, remove, and client-side type/size errors. Evidence: `backend-core-service/src/payment/payment.service.ts`, `backend-core-service/src/payment/payment.controller.ts`, `dashboards/workspace/lib/api.ts`, and `dashboards/workspace/components/payment-method-settings.tsx`.
- [x] Historical payment-method versions and order snapshots block archival of referenced images; publish failure performs safe best-effort orphan cleanup through the existing media library. Evidence: `backend-core-service/src/media/media-library.service.ts` and `backend-core-service/src/payment/payment.service.ts`.
- [x] Telegram payment photos clamp captions to 1024 characters, preserve order/total/deadline, invalidate bot-token-specific QR caches, and fall back to text for signed-URL and stale cached-file failures. Evidence: `backend-core-service/src/telegram-bot/telegram-commerce.service.ts`.
- [x] Follow-up tests: affected backend payment/media/Telegram/order/tenant specs passed 5 suites/49 tests. Backend and Workspace `npx tsc --noEmit` passed; Workspace `npm run lint -- --max-warnings=0` passed; root `npm run build` passed across backend, both dashboards, and all five services. The previously cited file-storage magic-byte result (1 suite/17 tests) was not rerun in this follow-up.
- [ ] Workspace component coverage is implemented but browser/component test execution remains outstanding; root build and final CI remain COM-029 scope.
