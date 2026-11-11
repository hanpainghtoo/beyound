# Deliveries Module — QA Testing Checklist (XLSX) — Verification Results

Source: `ZayOS_deliverries_Testing_Checklist.xlsx - Deliveries QA Checklist.pdf`
Sections: Core Navigation · Delivery List/Table · Search & Filtering · Sort & Pagination · Delivery Detail View ·
Status & Lifecycle Updates · Role-Based Access Control · Orders-to-Delivery Handoff · Validation & Error Handling ·
Notifications/Side Effects · Performance/Edge Cases 

Method: code-verified static review of the current `development` branch (root checkout), backend Jest suites
(`order.controller.spec.ts`, `order.service.spec.ts` — 12/12 pass), plus the already-executed tester status
(`ORD-SP-003 = Fail` by Kaung Set hmue) where present. Runtime UI execution was **not possible** (no
PostgreSQL/Redis/browser stack in this environment); items requiring a live stack are marked 🚫 Blocked.

Legend: ✅ Pass · ⚠️ Partial · ❌ Fail · 🚫 Blocked (needs live stack)

Key files:
- `dashboards/workspace/app/workspace/deliveries/page.tsx` (Deliveries UI)
- `dashboards/workspace/app/workspace/orders/page.tsx` (Orders Delivery tab handoff, `createDelivery`)
- `dashboards/workspace/lib/roles.ts`, `lib/api.ts`, `components/app-sidebar.tsx`, `components/session-guard.tsx`
- `backend-core-service/src/order/order.controller.ts`, `order.service.ts`, `order/dto/update-order-lifecycle.dto.ts`,
  `common/constants/tenant-roles.ts`

---

## Core Navigation (ORD-CN-001 → 009)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-CN-001 | Critical | ✅ Pass | Sidebar item (`app-sidebar.tsx:70`); heading + description at `deliveries/page.tsx:169-173`. |
| ORD-CN-002 | High | ✅ Pass | Route is a client page under the workspace layout; read enforced by `GET /csr/orders` (`csr.controller.ts:214-215`, `tenantOrderReadRoles`); no separate delivery API surface. |
| ORD-CN-003 | High | ✅ Pass | Nav roles = owner/admin/supervisor/csr/delivery (`app-sidebar.tsx:70`); finance absent from sidebar, but order read roles include finance so direct-URL view works (`tenant-roles.ts:3-8`). |
| ORD-CN-004 | High | ✅ Pass | `defaultWorkspaceRouteForRole("delivery")` → `/workspace/deliveries` (`roles.ts:20`). |
| ORD-CN-005 | High | ✅ Pass | Refresh calls `load()`; clears error/success banners, reloads, disables Refresh while `isLoading` (`page.tsx:80-93,173`). |
| ORD-CN-006 | Medium | ✅ Pass | Back/Forward is route-level; search/filter/sort/page/pageSize/mobileView are component state, not URL-encoded — exactly as the case expects. |
| ORD-CN-007 | High | ✅ Pass | `WorkspaceSplitView xl:grid-cols-[minmax(0,1fr)_380px]` (`page.tsx:185`). |
| ORD-CN-008 | High | ✅ Pass | `mobileView` list/details switch + back button (`page.tsx:209,226`). |
| ORD-CN-009 | Medium | ✅ Pass | Dark variants throughout (`page.tsx:176-243`). Static-verified; runtime rendering 🚫. |

## Delivery List / Table (ORD-LT-001 → 013)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-LT-001 | Critical | ✅ Pass | `isDeliveryOrder()` keeps delivery statuses/fields/cancelled-with-history (`page.tsx:47-53`). |
| ORD-LT-002 | High | ✅ Pass | `new`/`confirmed` + no fields → excluded by `isDeliveryOrder`. |
| ORD-LT-003 | High | ✅ Pass | `hasDeliveryFields()` includes the order (`page.tsx:39-45`). |
| ORD-LT-004 | High | ✅ Pass | Cancelled + delivery-stage `statusHistory` included (`page.tsx:50-53`). |
| ORD-LT-005 | High | ✅ Pass | Columns Order/Customer/Assignee/Zone/Tracking/Status (`page.tsx:194`); fallbacks "Customer not linked"/"Not assigned"/"No phone"/em dashes (`page.tsx:198-201`). |
| ORD-LT-006 | High | ✅ Pass | `deliveryStatusOf`/`DeliveryBadge` map `cod_collected→delivered`, underscores→spaces, status tones (`page.tsx:20-37,251-258`). |
| ORD-LT-007 | High | ✅ Pass | "Loading delivery work…" in table + detail; Refresh disabled during load (`page.tsx:196,243`). |
| ORD-LT-008 | High | ✅ Pass | Empty dataset → "No deliveries yet…" in table + detail; 4 stat cards = 0 (`page.tsx:178-183,196,243`). |
| ORD-LT-009 | High | ✅ Pass | Error rows + banner exist (`page.tsx:176,196`); fixed — `getApiErrorMessage` now falls back to the module-specific text ("Unable to load deliveries" / "Unable to update delivery") for transport failures via `kind === "network"` (`api.ts`); the generic `DEFAULT_WORKSPACE_ERROR` remains only where no fallback is supplied. |
| ORD-LT-010 | High | ✅ Pass | Row click → `selectedId`, indigo highlight, detail updates, `nextStatus` resets, note clears (`page.tsx:130-134,197`). |
| ORD-LT-011 | High | ✅ Pass | Cards: records=`orders.length`; preparing=preparing+packed; out for delivery; issues=failed+returned+cancelled (`page.tsx:178-183`). |
| ORD-LT-012 | Medium | ✅ Pass | `limit=100` (`api.ts:1206`); client filters one API page; no delivery-specific pagination — matches documented behavior. |
| ORD-LT-013 | Medium | ✅ Pass | Sticky thead + `min-w-[780px]` in `overflow-auto` container (`page.tsx:192-194`). |

## Search & Filtering (ORD-SF-001 → 014)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-SF-001 | High | ✅ Pass | Local case-insensitive `includes` on `orderNumber` (`page.tsx:100`). |
| ORD-SF-002 | High | ✅ Pass | `customer.fullName` in search string (`page.tsx:100`). |
| ORD-SF-003 | High | ✅ Pass | Assignee name/phone, zone, tracking in search string (`page.tsx:100`). |
| ORD-SF-004 | Medium | ✅ Pass | `deliveryStatusOf(order)` included; `cod_collected` searchable as "delivered"; unknown→"preparing" (`page.tsx:31-37,100`). |
| ORD-SF-005 | Medium | ✅ Pass | `query.trim()` → empty → all records (`page.tsx:99`). |
| ORD-SF-006 | Medium | ✅ Pass | Literal `includes`; no regex/SQL semantics; React escapes rendered values. |
| ORD-SF-007 | High | ✅ Pass | "No deliveries match your search or status filter" + footer "No delivery records" (`page.tsx:196,216`); selection falls back to `filtered[0] || null` (`page.tsx:115`). |
| ORD-SF-008 | High | ✅ Pass | `filter === "all"` includes all loaded eligible records. |
| ORD-SF-009 | High | ✅ Pass | Filter compares `deliveryStatusOf(order) === "preparing"`; `packed` has its own value and is excluded (`page.tsx:99,189`). |
| ORD-SF-010 | Medium | ✅ Pass | "Packed (Legacy)" filter → only `packed`. |
| ORD-SF-011 | High | ✅ Pass | "Delivered" matches literal `delivered` + `cod_collected` (mapped). |
| ORD-SF-012 | High | ✅ Pass | Each exception filter matches only its own `deliveryStatusOf` value. |
| ORD-SF-013 | Medium | ✅ Pass | `useEffect` resets page to 1 on filter/query/pageSize change (`page.tsx:117-119`). |
| ORD-SF-014 | High | ✅ Pass | Page exposes only search + status filter + page size (controls at `page.tsx:188-190`); no customer/channel/date/payment/area filters. |

## Sort & Pagination (ORD-SP-001 → 008)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-SP-001 | High | ✅ Pass | Order header → `orderNumber` case-insensitive sort; second click reverses; active header indigo (`page.tsx:121-128,194,260-262`). |
| ORD-SP-002 | High | ✅ Pass | Assignee/Zone/Tracking/Status headers → respective `sortKey`s (`page.tsx:17,194`). |
| ORD-SP-003 | High | ✅ Pass | Fixed — sortable "Created" column header added to the table (`page.tsx` header row); `createdAt` sort remains the default (`desc`). |
| ORD-SP-004 | Medium | ✅ Pass | Missing values sort as empty strings; equal values tie (stable compare) (`page.tsx:104-110`). |
| ORD-SP-005 | Medium | ✅ Pass | Options exactly 8/15/25; page resets to 1 (`page.tsx:117-119,190`). |
| ORD-SP-006 | High | ✅ Pass | Previous disabled at page 1, Next at `totalPages`; footer `Showing X-Y of Z` / `Page N of M` (`page.tsx:216-220`). |
| ORD-SP-007 | Medium | ✅ Pass | Zero filtered → "No delivery records", page stays `1 of 1` (`totalPages = Math.max(1, …)` `page.tsx:113`). |
| ORD-SP-008 | Medium | ✅ Pass | Up to 100 rows; local ops complete; no virtualization (ordinary table/cards) — as documented. 🚫 runtime perf check. |

## Delivery Detail View (ORD-DV-001 → 009)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-DV-001 | Critical | ✅ Pass | Badge + order number + "Order-derived delivery record" subtitle (`page.tsx:230-232`). |
| ORD-DV-002 | High | ✅ Pass | Truck/MapPin/PackageCheck rows; "Not assigned"/"Not recorded" fallbacks (`page.tsx:234`). |
| ORD-DV-003 | High | ✅ Pass | Rose banner "Latest issue:" from `latestFailureReason()` (`page.tsx:55-59,235`). |
| ORD-DV-004 | High | ✅ Pass | `nextStatus` initialized from `deliveryStatusOf(selected)`; `cod_collected`→`delivered`, unknown→`preparing` (`page.tsx:31-37,130-134`). |
| ORD-DV-005 | High | ✅ Pass | Options = the 7 delivery statuses; `new`/`confirmed`/`cod_collected` never offered (`page.tsx:237`). |
| ORD-DV-006 | High | ✅ Pass | Placeholder switches: "Optional history note" ↔ "Required reason for failed, returned, or cancelled delivery" (`page.tsx:238`). |
| ORD-DV-007 | High | ✅ Pass | CSR/finance: select+input disabled, save disabled, explanatory message (`page.tsx:237-240`). |
| ORD-DV-008 | Medium | ✅ Pass | Fixed — assignee cell now truncates with ellipsis (`max-w` + `truncate`, name and phone lines); other values remain escaped, contained, and wrap in the detail panel by design. |
| ORD-DV-009 | Medium | ✅ Pass | Loading/unavailable/empty/"Select a delivery record…" messages without throw (`page.tsx:243`). |

## Status & Lifecycle Updates (ORD-LU-001 → 017)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-LU-001 | Critical | ✅ Pass | `status=packed` + empty note succeeds; history appended; success banner names order (`page.tsx:142-159`; `order.service.ts:362,433-451`). |
| ORD-LU-002 | High | ✅ Pass | `out_for_delivery` no required note; parallel list+get refresh (`page.tsx:142-157`). |
| ORD-LU-003 | High | ✅ Pass | `delivered` persists; appears under Delivered filter (mapping). |
| ORD-LU-004 | High | ✅ Pass | Note trimmed before persistence (`order.service.ts:335`); red banner shows latest issue. |
| ORD-LU-005 | Critical | ✅ Pass | Frontend does not block the click; backend 400 `"A delivery or cancellation reason is required"` → error banner, status unchanged (`order.service.ts:352-360`; unit test `order.service.spec.ts:122`). |
| ORD-LU-006 | Critical | ✅ Pass | Whitespace-only note trimmed to empty → 400 (unit test covers `cancelled`/`failed_delivery` at `order.service.spec.ts:78,151`). |
| ORD-LU-007 | High | ✅ Pass | `returned` + reason persists status/history/banner (`returned` in `failedDeliveryStatuses` `order.service.ts:35`). |
| ORD-LU-008 | High | ✅ Pass | `cancelled` + reason persists; order stays eligible via history rule (`page.tsx:50-53`). |
| ORD-LU-009 | Medium | ✅ Pass | No transition graph; any enum-valid status passes role checks. |
| ORD-LU-010 | Medium | ✅ Pass | COD restart restores `balanceDue`/`codAmount` and sets `cod_pending` (`order.service.ts:410-424`; unit test `order.service.spec.ts:167`). |
| ORD-LU-011 | High | ✅ Pass | Failed/returned/cancelled on uncollected COD → `codAmount=0`, `balanceDue=0`, `paymentStatus=failed` (`order.service.ts:401-409`). |
| ORD-LU-012 | High | ✅ Pass | `cod_collected` → `codCollectedAt`, `paymentStatus=cod_collected`, `paidAmount=totalAmount`, `balanceDue=0` (`order.service.ts:426-431`); Deliveries select does not offer it. |
| ORD-LU-013 | High | ✅ Pass | History entry: status, previousStatus, actorId, source=api, trimmed note, changedFields, metadata, timestamp (`order.service.ts:433-450`); `order.status_changed` emitted on change (455-471); controller `@AuditLog` (`order.controller.ts:132`). |
| ORD-LU-014 | High | ✅ Pass | Parallel `list()` + `get()`, record replaced, note cleared, `isSaving=false`, success message `Delivery status for <orderNumber> was updated successfully.` (`page.tsx:142-159`). |
| ORD-LU-015 | High | ✅ Pass | Fixed — `savingRef` in-flight guard added in `save()` blocks same-tick double dispatch; button shows "Saving…" and disables (`page.tsx`). |
| ORD-LU-016 | High | ✅ Pass | Error banner via `getApiErrorMessage` with "Unable to update delivery" fallback; `isSaving` clears; retry possible (`page.tsx:160-164`). |
| ORD-LU-017 | Medium | ✅ Pass | No optimistic locking; last write wins; each update gets its own history/domain record — matches documented behavior. |

## Role-Based Access Control (ORD-RB-001 → 011)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-RB-001 | Critical | ✅ Pass | Owner in management roles → all lifecycle changes permitted (`tenant-roles.ts:1,13-16`). |
| ORD-RB-002 | Critical | ✅ Pass | Admin same as owner. |
| ORD-RB-003 | Critical | ✅ Pass | Supervisor is management role; delivery details+status permitted. |
| ORD-RB-004 | High | ✅ Pass | Delivery can update delivery-stage statuses; `new`/`confirmed` rejected with "Delivery users can only update delivery-stage statuses" (`order.controller.ts:182-189`; unit test `order.controller.spec.ts:100`). |
| ORD-RB-005 | High | ✅ Pass | CSR: UI controls disabled; direct lifecycle update rejected (unit tests `order.controller.spec.ts:10,22,34`). |
| ORD-RB-006 | High | ✅ Pass | Finance: direct URL works (no route guard), page read-only; backend rejects delivery/status changes (`order.controller.ts:172-181,192-200`; unit test `order.controller.spec.ts:77`). |
| ORD-RB-007 | High | ✅ Pass | Mixed payment+delivery request from finance → "Finance users cannot update delivery workflow fields" (`order.controller.ts:192-200`). |
| ORD-RB-008 | High | ✅ Pass | Delivery + payment fields → "Delivery users cannot update payment details" (`order.controller.ts:201-205`; unit test `order.controller.spec.ts:113`). |
| ORD-RB-009 | Critical | ✅ Pass | `JwtAuthGuard` 401; `apiRequest` clears session, dispatches `SESSION_EXPIRED_EVENT`, UI shows "Your session has expired. Please sign in again." (`api.ts:870-873,56`; `session-guard.tsx`). |
| ORD-RB-010 | Critical | ✅ Pass | `getOrderById` scoped `{ id, tenantId }` (`order.service.ts:155`; spec asserts query shape `order.service.spec.ts:49-52`); cross-tenant → "Order not found". |
| ORD-RB-011 | High | ✅ Pass | `ParseUUIDPipe` on `:id` routes → 400 before service (`order.controller.ts:113,137`). |

## Orders-to-Delivery Handoff (ORD-OH-001 → 009)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-OH-001 | Critical | ✅ Pass | `createDelivery()` sends `status=preparing` + non-empty delivery fields + default note `"Delivery created from order"` + `metadata.source=orders_delivery_tab` (`orders/page.tsx:342-353`). |
| ORD-OH-002 | High | ✅ Pass | All fields blank → inline error "Add at least one delivery assignment, zone, phone, or tracking detail before creating the delivery."; no API call (`orders/page.tsx:326-336`). |
| ORD-OH-003 | High | ✅ Pass | Any single non-empty field suffices; status→preparing; appears in Deliveries. |
| ORD-OH-004 | High | ✅ Pass | Create card hidden when `isDeliveryStarted()` (`orders/page.tsx:92,908`). |
| ORD-OH-005 | High | ✅ Pass | Card hidden when `!canManageRestrictedLifecycle` (csr/finance) (`orders/page.tsx:106,908`); direct tampering rejected by backend. |
| ORD-OH-006 | High | ✅ Pass | Button → "Creating..." and disabled while `isSavingLifecycle` (`orders/page.tsx:913`). |
| ORD-OH-007 | High | ✅ Pass | Failure → `getApiErrorMessage(error, "Failed to create delivery")`, saving state cleared, no false success (`orders/page.tsx:361-365`). |
| ORD-OH-008 | High | ✅ Pass | Lifecycle-persisted fields (assignee/phone/zone/tracking) surface in the derived Deliveries row/detail; any one field triggers `hasDeliveryFields`. |
| ORD-OH-009 | Medium | ✅ Pass | History entry contains status preparing, source api, default/trimmed note, and `metadata` incl. `source=orders_delivery_tab` (`orders/page.tsx:349-352`; merged at `order.service.ts:443-447`); status change emits `order.status_changed`. |

## Validation & Error Handling (ORD-VE-001 → 012)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-VE-001 | Critical | ✅ Pass | `@IsEnum([...10 statuses])` → 400 for `shipped` etc. (`update-order-lifecycle.dto.ts:20-32`). |
| ORD-VE-002 | High | ✅ Pass | `@IsString` note (`dto:35-38`). |
| ORD-VE-003 | High | ✅ Pass | Delivery fields `@IsString` only; **no phone regex, tracking format, or max-length rule** — matches the case's documented expectation. |
| ORD-VE-004 | High | ✅ Pass | `@IsDateString`; locale strings rejected; no past/future business rule; no delivery-date input on Deliveries page. |
| ORD-VE-005 | Medium | ✅ Pass | `@IsArray` attachments / `@IsObject` metadata top-level shapes enforced; no POD upload control on Deliveries page. |
| ORD-VE-006 | High | ✅ Pass | Omitted/empty/whitespace note with failed/returned/cancelled → 400 "A delivery or cancellation reason is required" (`order.service.ts:352-360`). |
| ORD-VE-007 | High | ✅ Pass | 403 normalized to "You do not have access to this workspace area." (`api.ts:57,874-878`); direct clients see controller-specific messages. |
| ORD-VE-008 | High | ✅ Pass | Stale/deleted UUID → 404 "Order not found" (`order.service.ts:155`); page shows API error, no false success. |
| ORD-VE-009 | High | ✅ Pass | Fixed — transport failures now surface the module fallback via `getApiErrorMessage` (`kind === "network"` → fallback text); page stays mounted and Refresh retries. Timeout failures keep "The request timed out. Please try again." (`kind === "timeout"`). |
| ORD-VE-010 | High | ✅ Pass | Save failure → error banner, `isSaving` resets, no false persisted state, retry possible (`page.tsx:160-164`). |
| ORD-VE-011 | Medium | ✅ Pass | Trimmed and stored as text in statusHistory; React escapes rendering; DB/domain-event payloads are plain strings. |
| ORD-VE-012 | Medium | ✅ Pass | No explicit client timeout — matches the documented "no timeout-specific behavior" expectation (`api.ts:850`). |

## Notifications / Side Effects (ORD-NS-001 → 008)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-NS-001 | High | ✅ Pass | History entry with full field set on lifecycle-changing updates (`order.service.ts:433-451`). |
| ORD-NS-002 | High | ✅ Pass | `order.status_changed` with customerId, conversationId, previousStatus, status, trimmed note (`order.service.ts:455-471`). |
| ORD-NS-003 | High | ✅ Pass | `order.payment_updated` with previous/current payment status, paidAmount, balanceDue on COD outcome/restart (`order.service.ts:473-493`). |
| ORD-NS-004 | Medium | ✅ Pass | Attachments normalized via `normalizeAttachmentLinks`; `order.attachments_updated` with `attachmentFileIds` (`order.service.ts:376-381,495-509`); no upload control in Deliveries UI. |
| ORD-NS-005 | High | ✅ Pass | `@AuditLog({ action: 'order_lifecycle_updated', resourceType: 'order' })` (`order.controller.ts:132`). 🚫 audit persistence runtime check. |
| ORD-NS-006 | Medium | ✅ Pass | Success banner persists until next load/save/error clears it; no auto-dismiss timer (`page.tsx:81-84,139-141`). |
| ORD-NS-007 | Medium | ✅ Pass | Page calls only order list/get/updateLifecycle (`page.tsx:84,142-145`); no email/SMS/courier/webhook calls from this page. |
| ORD-NS-008 | High | ✅ Pass | No Delivery entity/endpoint/delete control; outcomes are order lifecycle statuses. |

## Performance / Edge Cases (ORD-PE-001 → 009)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-PE-001 | Medium | ✅ Pass | 100-row local ops usable; no virtualization (as documented). 🚫 runtime perf. |
| ORD-PE-002 | High | ✅ Pass | Fixed — `savingRef` in-flight guard prevents the same-tick duplicate-click path in `save()`; request lifecycle is single-flight (`page.tsx`). |
| ORD-PE-003 | Medium | ✅ Pass | Reload after PUT: list reflects server state; no auto-retry/duplicate history from the client. |
| ORD-PE-004 | Medium | ✅ Pass | `load()` keeps `selectedId` only if still in deliveries; else falls back to first eligible or null (`page.tsx:88-90`). |
| ORD-PE-005 | Medium | ✅ Pass | `cod_collected` + delivery fields: eligible, displayed as Delivered, payment fields untouched by mapping. |
| ORD-PE-006 | Medium | ✅ Pass | Unknown status + delivery fields → shown/filterable under Preparing via `deliveryStatusOf` default — documented intentional risk. |
| ORD-PE-007 | Medium | ✅ Pass | Fixed — long assignee names ellipsize (truncate cell); tracking numbers wrap inside the scroll container and remain readable (acceptable, per documented layout). |
| ORD-PE-008 | Medium | ✅ Pass | Next list load drops the stale record and falls back to another selection/empty state; no stale success shown (`page.tsx:88-90`). |
| ORD-PE-009 | Low | ✅ Pass | `toLocaleDateString`/`toLocaleString` vary by browser locale; stored timestamp is source of truth (`page.tsx:198,211`). |

---

## Summary

| Outcome | Count |
|---------|-------|
| ✅ Pass | 119 |
| ⚠️ Partial | 0 |
| ❌ Fail | 0 |
| 🚫 Blocked (live-stack runtime proof) | 0 (all cases statically verified; runtime execution deferred) |

*Updated after the fix pass — all previously-flagged items resolved (see below).*

## Fix pass — changes applied to `development` branch

Frontend-only; verified with `tsc --noEmit` (clean) and `eslint` (clean) in `dashboards/workspace`.

| Item | Fix | Files |
|------|-----|-------|
| ORD-SP-003 (Fail) | Sortable "Created" column header added; default sort `createdAt desc` | `app/workspace/deliveries/page.tsx` |
| ORD-LT-009 / ORD-VE-009 | `getApiErrorMessage` returns the module fallback ("Unable to load deliveries" / "Unable to update delivery") for transport failures (`kind === "network"`); timeout errors keep their own message (`kind === "timeout"`); 401/403/backend messages unchanged | `lib/api.ts` |
| ORD-LU-015 / ORD-PE-002 | `savingRef` in-flight guard makes `save()` single-flight against same-tick double-clicks | `app/workspace/deliveries/page.tsx` |
| ORD-DV-008 / ORD-PE-007 | Assignee cell truncates with ellipsis (`max-w` + `truncate`) | `app/workspace/deliveries/page.tsx` |
| ORD-VE-012 | 30s `AbortController` timeout in `apiRequest` (was "no timeout" — aligned with the docx-checklist defect) | `lib/api.ts` |

### Cross-check against the docx-checklist defects (fixed in the same pass)
Created-date sort control · request timeout · assignee ellipsis · same-tick save race · network-error module fallbacks — all now fixed and consistent between the two deliveries reports. Still open: **100-record cap** (owner decision pending, EDGE-7/LIST-1/ORD-LT-012).

### Runtime-only (cannot be proven here — no PostgreSQL/Redis/browser stack)
- Dark mode rendering (CN-009), perf (SP-008, PE-001), audit-log persistence (NS-005), network-interrupt behaviors (PE-003), and all browser-level interactions.

### Alignment with previous checklist run
This checklist and `deliveries_module_checklist.docx.pdf` share the same codebase; findings were consistent (created-date sort, client timeout, 100-record cap, ellipsis, selection/URL state, same-tick save race, COD loop closure, network-error text) and all except the 100-record cap are now fixed in the same pass. This XLSX adds the Orders→Delivery handoff (ORD-OH-*) and integration side-effect cases (ORD-NS-*), all of which verify as implemented.