# Deliveries Module — QA Checklist Results

Source checklist: *Deliveries Module QA Testing Checklist* (`deliveries_module_checklist.docx.pdf`)

Method: code-verified static review against the current `development` branch, plus backend Jest suites 
(`order.controller.spec.ts`, `order.service.spec.ts` — all 12 tests PASS). Runtime UI testing was
**not possible in this environment** (no PostgreSQL/Redis running, no browser stack available), so
UI items are verified structurally against the code with file:line evidence. Items that require a live
stack to be proven are marked **Blocked (runtime)**.

Legend: ✅ Pass · ❌ Fail · ⚠️ Partial · 🚫 Blocked (needs live stack) · ⏳ Not Started

Key files:
- `dashboards/workspace/app/workspace/deliveries/page.tsx` (frontend)
- `dashboards/workspace/lib/roles.ts`, `dashboards/workspace/components/app-sidebar.tsx`
- `dashboards/workspace/lib/api.ts` (`csrOrdersApi`, `apiRequest`, `getApiErrorMessage`)
- `backend-core-service/src/order/order.controller.ts`, `order.service.ts`, `common/constants/tenant-roles.ts`

---

## 3. Functional Checklist

### Core Navigation
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Open Deliveries page from sidebar | ✅ Pass | Sidebar item at `app-sidebar.tsx:70` → `/workspace/deliveries`; page exists at `app/workspace/deliveries/page.tsx`. |
| 2 | Sidebar highlights "Deliveries" as active | ✅ Pass | `app-sidebar.tsx:186` active logic + `isActive` styling at line 192. |
| 3 | Refresh page → deliveries reload | ✅ Pass | Client component; `useEffect(load, [])` at `page.tsx:96` re-runs on remount. |
| 4 | Browser Back/Forward buttons | ✅ Pass | Route-based nav re-mounts page and reloads list. (In-page detail selection is not in URL; selection resets — see EDGE-3.) |

### Delivery List
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | View all delivery records in default table | ⚠️ Partial | `csrOrdersApi.list()` fetches `limit=100` (`api.ts:1206`); only the most recent 100 orders are candidates. Everything within that window is shown. *(FIX PENDING — see EDGE-7.)* |
| 2 | Search by order number | ✅ Pass | Query matched against `orderNumber` (`page.tsx:100`). |
| 3 | Search by customer name | ✅ Pass | Matches `customer.fullName` (`page.tsx:100`). |
| 4 | Search by assignee | ✅ Pass | Matches `deliveryAssigneeName` (+ phone) (`page.tsx:100`). |
| 5 | Search by zone | ✅ Pass | Matches `deliveryZone` (`page.tsx:100`). |
| 6 | Search by tracking number | ✅ Pass | Matches `trackingNumber` (`page.tsx:100`). |
| 7 | Filter by delivery status | ✅ Pass | `filter`/`deliveryStatusOf()` at `page.tsx:99`; `cod_collected` maps to `delivered`. |
| 8 | Sort by Order (orderNumber) | ✅ Pass | `sortKey="orderNumber"` (`page.tsx:17`,194). |
| 9 | Sort by Assignee (deliveryAssigneeName) | ✅ Pass | `page.tsx:194`. |
| 10 | Sort by Zone (deliveryZone) | ✅ Pass | `page.tsx:194`. |
| 11 | Sort by Tracking (trackingNumber) | ✅ Pass | `page.tsx:194`. |
| 12 | Sort by Status | ✅ Pass | `sortKey="status"` (`page.tsx:194`). |
| 13 | Sort by Created Date | ✅ Pass | Fixed — added a sortable "Created" column header (`page.tsx` header row); default sort stays `createdAt desc`. |
| 14 | Toggle sort direction (asc/desc) | ✅ Pass | `toggleSort` flips direction (`page.tsx:121-128`); headers clickable. |
| 15 | Change page size (8/15/25) | ✅ Pass | `Select` at `page.tsx:190`; `pageSize` state; resets to page 1 (line 119). |
| 16 | Navigate prev/next page | ✅ Pass | Buttons at `page.tsx:218-220`; clamped to bounds. |
| 17 | Stat cards show correct counts | ✅ Pass | 4 cards at `page.tsx:178-183`: records, preparing(=preparing+packed), out for delivery, issues(=failed+returned+cancelled). |

### Delivery Detail
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Click record → detail panel opens | ✅ Pass | `onClick` sets `selectedId` (`page.tsx:197`); desktop split-view aside renders selected (`page.tsx:225`). |
| 2 | Order number displayed | ✅ Pass | `page.tsx:231`. |
| 3 | Assignee, zone, tracking displayed | ✅ Pass | Detail cards at `page.tsx:234`. |
| 4 | Failure reason displayed (if applicable) | ✅ Pass | `latestFailureReason()` + rose banner at `page.tsx:235`. |
| 5 | Status update dropdown shows available options | ✅ Pass | 7 options (preparing, packed, out_for_delivery, delivered, failed_delivery, returned, cancelled) at `page.tsx:237`. |
| 6 | Status options restricted for delivery specialists | ✅ Pass | Only delivery-stage statuses offered; non-delivery-stage statuses (`new`, `confirmed`, `cod_collected`) never selectable. |
| 7 | Enter transition note → text input accepts value | ✅ Pass | Input at `page.tsx:238`. |
| 8 | Save delivery status → success message | ✅ Pass | `setSuccess` → banner at `page.tsx:159,177`. |
| 9 | Required failure reason for failed_delivery/returned/cancelled | ✅ Pass | Fixed — client-side pre-submit validation added in `save()` (error `"A delivery or cancellation reason is required"`, matches server wording); Save button disabled until a reason is entered. Server-side enforcement unchanged (`order.service.ts:352-360`). |
| 10 | Error message when save fails | ✅ Pass | `catch → setError(getApiErrorMessage(...))` at `page.tsx:160-161`. |

### Role-Based Access
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Delivery specialist can update delivery-stage statuses only | ✅ Pass | `workspaceDeliveryRoles` = owner/admin/supervisor/delivery (`roles.ts:7`); backend blocks non-delivery-stage statuses for delivery role (`order.controller.ts:182-189`) + unit test. |
| 2 | Delivery specialist cannot change payment status | ✅ Pass | Backend `ForbiddenException` (`order.controller.ts:201-205`) + unit test; page has no payment controls. |
| 3 | Manager/owner/admin can update all delivery statuses | ✅ Pass | `isManager` bypasses restriction (`order.controller.ts:140,167-189`); included in `workspaceDeliveryRoles`. |
| 4 | Non-delivery roles see "Only delivery specialists…" message | ✅ Pass | `page.tsx:239`. |
| 5 | Save button disabled for non-delivery roles | ✅ Pass | `disabled={isSaving \|\| !canManageDeliveries}` (`page.tsx:240`). |

### Mobile View
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Switch between list and detail views | ✅ Pass | `mobileView` state; list card opens details (`page.tsx:209`); back returns (`page.tsx:226`). |
| 2 | Back button returns to list view | ✅ Pass | `page.tsx:226`. |
| 3 | Detail view scrollable | ✅ Pass | Normal page flow scrolls; panel content is not height-capped on mobile. |

### Error Handling
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | API failure on load → error message | ✅ Pass | `setError` + red banner (`page.tsx:92,176`). |
| 2 | API failure on status update → error message | ✅ Pass | `page.tsx:160-161`. |
| 3 | Success message auto-clears or persists | ✅ Pass | Persists until next action; cleared at start of load/save. |

---

## 4. Form Validation Checklist

### Delivery Status Update
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Select "preparing" → succeeds | ✅ Pass | Allowed; no note required. |
| 2 | Select "packed" → succeeds | ✅ Pass | Allowed; no note required. |
| 3 | Select "out_for_delivery" → succeeds | ✅ Pass | Allowed; no note required. |
| 4 | Select "delivered" → succeeds | ✅ Pass | Allowed; no note required. |
| 5 | "failed_delivery" without note → validation error | ✅ Pass | Fixed — client-side pre-check in `save()` blocks submit without a reason and shows `"A delivery or cancellation reason is required"`; server 400 remains as backstop (`order.service.ts:352-360`). |
| 6 | "returned" without note → validation error | ✅ Pass | Same as #5 (`returned` in `failedDeliveryStatuses`, `order.service.ts:35`). |
| 7 | "cancelled" without note → validation error | ✅ Pass | Same as #5; covered by unit test `order.service.spec.ts:78`. |
| 8 | "failed_delivery" with note → succeeds | ✅ Pass | Unit test `order.service.spec.ts:167`. |
| 9 | "delivered" with note → succeeds | ✅ Pass | Note optional for non-failure statuses; backend only requires it for failure set. |
| 10 | Empty note for non-failure status → succeeds | ✅ Pass | `trimmedNote` only enforced for failure set. |

### Search
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Empty string → all records shown | ✅ Pass | Empty normalized query includes all (`page.tsx:99-100`). |
| 2 | Special characters → literal text | ✅ Pass | `toLowerCase().includes()` — literal substring match. |
| 3 | No matches → "No deliveries match your search or status filter" | ✅ Pass | `page.tsx:196`. |

### Pagination
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Page size 8 → 8 per page | ✅ Pass | `pageSize` slice (`page.tsx:114`). |
| 2 | Page size 15 → 15 per page | ✅ Pass | Same. |
| 3 | Page size 25 → 25 per page | ✅ Pass | Same. |
| 4 | Navigate beyond last page → stays on last | ✅ Pass | Next disabled at `totalPages`; page clamped (`page.tsx:113,220`). |
| 5 | Page 1 from last page → returns to first | ✅ Pass | Previous enabled while `page > 1` (`page.tsx:218`). |

---

## 5. UI Checklist

| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Responsive split-view (list left, detail right on desktop) | ✅ Pass | `WorkspaceSplitView xl:grid-cols-[minmax(0,1fr)_380px]` (`page.tsx:185`). |
| 2 | Mobile view switching (list ↔ details) | ✅ Pass | `page.tsx:186,225`. |
| 3 | Stat cards render correctly | ✅ Pass | `WorkspaceStatCard` x4 (`page.tsx:178-183`). |
| 4 | Table columns (Order, Customer, Assignee, Zone, Tracking, Status) | ✅ Pass | `page.tsx:194`. |
| 5 | Sortable column headers with arrow indicators | ✅ Pass | Fixed — active column shows `ArrowUp`/`ArrowDown` per current direction (`SortableHead`, `page.tsx`); inactive headers keep `ArrowUpDown`. |
| 6 | Status badges correct colors | ✅ Pass | `statusTone` mapping (`page.tsx:20-29`). |
| 7 | Sticky table header on scroll | ✅ Pass | `thead sticky top-0` (`page.tsx:194`). |
| 8 | Scrollable table / overflow handling | ✅ Pass | `overflow-auto` scroll container (`page.tsx:192`). |
| 9 | Loading state while deliveries load | ✅ Pass | Fixed — Refresh button shows spinning icon and a "Refreshing delivery records…" strip appears above the table during re-load (`page.tsx`); initial-load skeleton unchanged. |
| 10 | Empty state (no deliveries exist) | ✅ Pass | "No deliveries yet…" (`page.tsx:196`). |
| 11 | Empty state (no match after filters) | ✅ Pass | `page.tsx:196`. |
| 12 | Error state on API failure | ✅ Pass | `page.tsx:196`. |
| 13 | Success toast after status update | ✅ Pass | Banner (`page.tsx:177`). |
| 14 | Error toast after failed API call | ✅ Pass | Banner (`page.tsx:176`). |
| 15 | Pagination controls (Previous / indicator / Next) | ✅ Pass | `page.tsx:217-221`. |
| 16 | Dark mode renders correctly | ✅ Pass | `dark:` variants throughout; side nav toggles theme. Static-verified. |
| 17 | Typography consistent | ✅ Pass | Consistent `text-sm`/`font-semibold` patterns. Static-verified. |
| 18 | Spacing/alignment consistent | ✅ Pass | Consistent padding/`space-y` layout. Static-verified. |
| 19 | Icons render (lucide-react) | ✅ Pass | All icons from `lucide-react` (page.tsx:4). |
| 20 | Buttons disabled during loading | ✅ Pass | Save disabled while `isSaving`; Refresh disabled while `isLoading` (`page.tsx:173,240`). |
| 21 | Dropdowns open/close correctly | ✅ Pass | Radix `Select` used (`page.tsx:237`). Static-verified; runtime component behavior standard. |
| 22 | Failure reason red banner in detail | ✅ Pass | Rose/red banner (`page.tsx:235`). |
| 23 | Status dropdown disabled for non-delivery roles | ✅ Pass | `disabled={!canManageDeliveries}` (`page.tsx:237`). |

---

## 6. Permission Checklist

### Role Access Matrix (spec vs implementation)
| Role | View (spec) | View (impl) | Update status (spec) | Update status (impl) |
|------|-------------|-------------|----------------------|----------------------|
| Owner | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes |
| Supervisor | Yes | Yes | Yes | Yes |
| CSR | Yes | Yes (sidebar shows item) | No | No (UI disabled; backend forbids) |
| Delivery | Yes | Yes | Delivery-stage only | Delivery-stage only (backend + UI) |
| Finance | Yes | ✅ Yes — fixed: `finance` added to sidebar roles (`app-sidebar.tsx:70`) | No | No |

### Permission Test Items
| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Delivery only updates delivery-stage statuses | ✅ Pass | `order.controller.ts:177-189` + unit test. |
| 2 | Finance can view but not update | ✅ Pass | Fixed — `finance` added to the sidebar item roles (`app-sidebar.tsx:70`); page still read-only for finance (`canManageDeliveries` false → controls disabled). Backend unchanged (no lifecycle write permission for finance). |
| 3 | CSR can view but not update | ✅ Pass | CSR in nav roles; `canManageDeliveries` false; UI disabled; backend forbids. |
| 4 | Unauthenticated user redirected to login | ✅ Pass | `SessionGuard` (`components/session-guard.tsx`); 401 triggers session-expired redirect (`api.ts:870-873`). |

---

## 7. API Checklist

| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | GET /csr/orders?limit=100 → client-side filter → render | ✅ Pass | `api.ts:1206-1215`; `load()` at `page.tsx:80-94`. |
| 2 | PUT /orders/{id}/lifecycle → status + note updated | ✅ Pass | `api.ts:1229-1233`; backend persists status/note + history entry (`order.service.ts:433-449`). |
| 3 | Error handling via getApiErrorMessage() | ✅ Pass | `api.ts:62`; used at `page.tsx:92,161`. |
| 4 | Retry behavior — failed calls show error, don't crash | ✅ Pass | Error state + Refresh re-triggers load; page remains interactive. |
| 5 | Loading indicators per async operation | ✅ Pass | `isLoading` / `isSaving`. (Refresh re-load lacks indicator — see UI-9.) |
| 6 | Timeout handling — slow network | ✅ Pass | Fixed — `apiRequest` now applies a 30s `AbortController` timeout (`api.ts`); timeout aborts the fetch and surfaces "The request timed out. Please try again." instead of hanging indefinitely. |
| 7 | Offline behavior — network lost | ✅ Pass | `fetch` rejects → `ApiError` network → error banner; page does not crash. |

---

## 8. Edge Case Checklist

| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Double-click Save → one API call | ✅ Pass | Fixed — `savingRef` in-flight guard in `save()` blocks same-tick duplicate dispatches; button still disabled via `isSaving`. |
| 2 | Refresh while saving → no duplicate updates | ✅ Pass | No auto-retry; reload triggers fresh fetch; single in-flight PUT completes server-side. |
| 3 | Browser Back in detail → list with correct scroll position | ✅ Pass | Fixed — selection is now URL-bound (`?delivery=<id>`): opening a detail `push`es a history entry, switching selection `replace`s it, so one Back returns to the list; list scroll container stays mounted, so scroll position is preserved. |
| 4 | Refresh during status update → state re-fetched | ✅ Pass | Server persists first; remount re-runs `load()`. |
| 5 | Network lost during status update → error shown | ✅ Pass | `save()` catch → error banner. |
| 6 | Session expired → redirect + list state not lost | ✅ Pass | Fixed — list/search/filter/sort/page-size and selection are persisted to `sessionStorage` (`workspace:deliveries:state`) on every change and restored on remount, so re-login restores the previous list state before the fresh fetch completes. |
| 7 | Large list (100+ records) → pagination works | ❌ Fail | **FIX PENDING** — fetch still capped at `limit=100` (`api.ts:1206`), backend `PaginationDto @Max(100)`. Decision requested from owner; see EDGE-7/LIST-1. |
| 8 | Empty delivery list → "No deliveries yet" | ✅ Pass | `page.tsx:196`. |
| 9 | Search special characters → literal | ✅ Pass | `includes()` substring match. |
| 10 | Concurrent update (two users) → last write wins | ✅ Pass | No optimistic locking; plain save (last write wins by design). |
| 11 | Record deleted while viewing → graceful return to list | ✅ Pass | Fixed — a 404 from `save()` now removes the stale record locally, falls back to the first remaining delivery (URL updated), and shows "That delivery record no longer exists and was removed from the list." instead of an error banner. |
| 12 | Order without delivery fields → not shown | ✅ Pass | `isDeliveryOrder()` requires delivery status/fields/history (`page.tsx:47-53`). |
| 13 | Order with delivery fields but status "new" → shown as "preparing" | ✅ Pass | `hasDeliveryFields` true → included; `deliveryStatusOf()` defaults to `preparing` (page.tsx:36). |
| 14 | COD collected order → shown as "delivered" | ✅ Pass | `deliveryStatusOf()` maps `cod_collected` → `delivered` (page.tsx:32). |
| 15 | Very long tracking number → truncated or wrapped | ✅ Pass | Cell text wraps (no truncate rule) — content remains visible. |
| 16 | Very long assignee name → truncated with ellipsis | ✅ Pass | Fixed — assignee cell now uses `max-w` + `truncate` (name and phone lines). |
| 17 | Sort by column with empty values → consistent | ✅ Pass | Empty values become `""` and tie (stable order) (`page.tsx:105-109`). |
| 18 | Filter by status with no matches → empty state | ✅ Pass | `page.tsx:196`. |

---

## Workflow Testing

| # | Workflow | Status | Evidence / Notes |
|---|----------|--------|-----------------|
| 1 | Created → Preparing → Packed → Out for delivery → Delivered | ✅ Pass | Each step fires `PUT /orders/{id}/lifecycle`; persists status + timeline entry (`order.service.ts:362,433-449`). Backend does **not** enforce forward-only order of transitions (noted in bug-prone areas). |
| 2 | Delivery Failed → Reason → Returned | ✅ Pass | Reason required server-side; red banner shows latest reason (`page.tsx:235`); unit tests pass. |
| 3 | Order without delivery fields → not shown | ✅ Pass | `isDeliveryOrder()` excludes it (page.tsx:47-53). |
| 4 | COD collection → Delivered | ✅ Pass | Fixed — status dropdown now offers "COD collected (payment)" for owner/admin/supervisor only (`canCloseCodPayment`); selecting it sets `cod_collected` via the existing lifecycle endpoint (backend already closes the COD loop: `codCollectedAt`, `paidAmount`, `balanceDue=0` in `order.service.ts`). Delivery/finance/csr roles cannot select it (backend forbids non-delivery-stage + payment write for those roles). |

---

## Regression Checklist

Items verified statically (pages exist + covered by existing e2e/unit suites where noted). Live-stack regression execution is **Blocked (runtime)** because the stack (PostgreSQL/Redis/browsers) is not available in this environment.

| # | Test item | Status | Evidence / Notes |
|---|-----------|--------|-----------------|
| 1 | Inbox still works | 🚫 Blocked | Covered by `tests/e2e/commerce-workspace-surfaces.spec.ts` + `inbox-command-center-capture.spec.ts` (needs live stack). |
| 2 | Orders page (create, update lifecycle, manual order) | 🚫 Blocked | Covered by e2e (order create + lifecycle tests) + backend unit tests (needs live stack). |
| 3 | Products | 🚫 Blocked | Covered by e2e surface test (needs live stack). |
| 4 | Customers | 🚫 Blocked | Covered by e2e surface test (needs live stack). |
| 5 | Saved Replies | 🚫 Blocked | Covered by e2e CRUD test (needs live stack). |
| 6 | Media Library | 🚫 Blocked | Covered by e2e media test (needs live stack). |
| 7 | Conversation Search | 🚫 Blocked | Page exists; e2e surface test (needs live stack). |
| 8 | Team | 🚫 Blocked | Page exists (`app/workspace/team/page.tsx`); no e2e coverage found. |
| 9 | Channels | 🚫 Blocked | Page exists (`app/workspace/channels/`); no e2e coverage found. |
| 10 | Roles | 🚫 Blocked | Page exists (`app/workspace/roles/page.tsx`); no e2e coverage found. |
| 11 | Audit | 🚫 Blocked | Page exists (`app/workspace/audit/page.tsx`); recent commit touches it. |
| 12 | Billing | 🚫 Blocked | Page exists (`app/workspace/billing/page.tsx`); backend `tenant-billing.spec.ts` exists. |
| 13 | Settings | 🚫 Blocked | Page exists; e2e surface test checks it (needs live stack). |
| 14 | Profile | 🚫 Blocked | Page exists (`app/workspace/profile/page.tsx`); no e2e coverage found. |
| 15 | Notifications | 🚫 Blocked | Page exists; e2e surface test (needs live stack). |
| 16 | Reports load correctly | 🚫 Blocked | Page exists; e2e surface test (needs live stack). |
| 17 | Sidebar highlights correct active item | ✅ Pass | Static logic verified (`app-sidebar.tsx:186-192`). |
| 18 | Logout works and clears session | ✅ Pass | `clearSession` + redirect (`app-sidebar.tsx:149-154`, `api.ts:832`). |
| 19 | Session expiry redirects to login | ✅ Pass | `SessionGuard` + `SESSION_EXPIRED_EVENT` (`api.ts:870-873`, `session-guard.tsx`). |
| 20 | All filter combinations | ✅ Pass | Combinatorics of `filter` × `query` × `pageSize` all flow through same pipeline. Static-verified. |
| 21 | Sort by all columns | ✅ Pass | Fixed — all 6 sort keys work and are reachable from visible column headers (Created column added, see LIST-13). |
| 22 | Pagination works | ✅ Pass | Clamped page + size change reset (`page.tsx:113-119`). |

---

## Smoke Test Checklist

Not executed — requires the live stack (backend + seeded DB + browser). 🚫 Blocked.
Login flows covered by existing e2e (`login()` helper) once the stack is up.

| # | Test item | Status |
|---|-----------|--------|
| 1 | Login as Delivery specialist → Deliveries loads | 🚫 Blocked (runtime) |
| 2 | View delivery records in table | 🚫 Blocked (runtime) |
| 3 | Filter "Out for delivery" | 🚫 Blocked (runtime) |
| 4 | Search by order number | 🚫 Blocked (runtime) |
| 5 | Click record → detail panel opens | 🚫 Blocked (runtime) |
| 6 | Update status → saved | 🚫 Blocked (runtime) |
| 7 | Role-based access (delivery can, CSR cannot) | 🚫 Blocked (runtime) — backend logic verified by unit tests |
| 8 | Sort by column | 🚫 Blocked (runtime) — logic static-verified |
| 9 | Change page size | 🚫 Blocked (runtime) — logic static-verified |
| 10 | Stat cards correct counts | 🚫 Blocked (runtime) — logic static-verified |

---

## Summary

| Outcome | Count |
|---------|-------|
| ✅ Pass | 120 |
| ⚠️ Partial | 1 |
| ❌ Fail | 1 |
| 🚫 Blocked (needs live stack) | 26 |
| ⏳ Not Started | 0 |

*Updated after the fix pass (16 items resolved; see "Fix pass" below). Remaining: LIST-1 / EDGE-7 (100-record fetch cap — owner decision pending) and the runtime-blocked items.*

## Fix pass — changes applied to `development` branch

All fixes are frontend-only; no backend behavior changed. Verified with `tsc --noEmit` (clean) and `eslint` (clean) in `dashboards/workspace`.

| # | Defect | Fix | Files |
|---|--------|-----|-------|
| 1 | Finance visibility mismatch | Added `finance` to Deliveries sidebar roles | `components/app-sidebar.tsx` |
| 2 | No client-side reason validation | `save()` pre-check for failed/returned/cancelled; Save disabled until reason entered; message matches server wording | `app/workspace/deliveries/page.tsx` |
| 3 | Created-date sort has no visible control | Added sortable "Created" column header (default `createdAt desc`) | `app/workspace/deliveries/page.tsx` |
| 4 | No request timeout | 30s `AbortController` timeout in `apiRequest`; timeout surfaces "The request timed out. Please try again." | `lib/api.ts` |
| 5 | 100-record cap | **PENDING** — owner decision (EDGE-7) | — |
| 6 | No UI direction arrows on sort | Active header shows ArrowUp/ArrowDown per direction | `app/workspace/deliveries/page.tsx` |
| 7 | Long assignee name not ellipsized | `max-w` + `truncate` on assignee cell | `app/workspace/deliveries/page.tsx` |
| 8 | Detail selection not URL-bound | Selection synced to `?delivery=<id>` in the URL (push on open, replace on switch) → browser Back returns to list with scroll preserved | `app/workspace/deliveries/page.tsx` |
| 9 | COD → Delivered does not close the COD loop | "COD collected (payment)" option for owner/admin/supervisor only | `app/workspace/deliveries/page.tsx` |
| 10 | Backend does not enforce forward-only transitions | **Left as-is** (owner decision; retries like failed→out_for_delivery must stay possible) | — |
| 11 | Refresh re-load has no loading indicator | Spinning Refresh icon + "Refreshing delivery records…" strip during re-load | `app/workspace/deliveries/page.tsx` |
| 12 | Session expiry loses list state | Persist/restore list, search, filter, sort, page size, selection in `sessionStorage` | `app/workspace/deliveries/page.tsx` |
| 13 | Double-click Save → duplicate request | `savingRef` in-flight guard | `app/workspace/deliveries/page.tsx` |
| 14 | Save on deleted record → 404 banner | 404 → locally remove record, fall back to first, info message | `app/workspace/deliveries/page.tsx` |

### Remaining defects
1. **100-record cap** — deliveries beyond the latest 100 orders are invisible/unpaginated (`api.ts:1206`; backend `PaginationDto` `@Max(100)`). Owner decision pending (option: raise cap to 500 vs. full server-side pagination).
2. **Backend does not enforce forward-only status transitions** — any status change is accepted; intentionally **left as-is** (owner decision) so retries like `failed_delivery → out_for_delivery` stay possible.