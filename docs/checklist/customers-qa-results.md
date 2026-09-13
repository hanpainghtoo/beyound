# Customers Module — QA Testing Checklist — Verification Results

Source: `ZayOS_customers_Testing_Checklist.xlsx - Customers QA Checklist.pdf` (113 cases)
Sections: Core Navigation · Customer List/Table · Search, Filter, Sort & Pagination · Create Customer ·
Edit/Update Customer · Customer Status/Lifecycle · Role-Based Access Control · Customer Detail View ·
Delete/Cancel Customer · Validation & Error Handling · Notifications/Side Effects · Performance/Edge Cases 

Method: code-verified static review of the current `development` branch (root checkout; identical backend in the
`zayos/` submodule). Backend Jest suites for the involved modules pass (`csr-isolation.spec.ts` etc. — part of the
8-suite/89-test run, all green). Runtime UI execution was **not possible** in this environment (no
PostgreSQL/Redis/browser stack); items requiring live proof are noted with 🚫 in their evidence.

Legend: ✅ Pass · ⚠️ Partial · ❌ Fail · 🚫 Blocked (needs live stack)

Key files:
- `dashboards/workspace/app/workspace/customers/page.tsx` (Customers UI)
- `dashboards/workspace/lib/api.ts` (`csrCustomersApi` 1236-1270, `apiRequest` 836-886, `getApiErrorMessage` 62-69)
- `dashboards/workspace/components/app-sidebar.tsx` (nav roles :77)
- `backend-core-service/src/csr/csr.controller.ts`, `csr.service.ts`, `csr/dto/{create,update}-customer.dto.ts`
- `backend-core-service/src/domain-event/domain-event.controller.ts` (timeline :34,48)

---

## Core Navigation (ORD-CN-001 → 008)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-CN-001 | Critical | ✅ Pass | Sidebar item `{ title: "Customers", url: "/workspace/customers" }` (`app-sidebar.tsx:75-77`); heading + description "View customer profiles, commerce context, recent conversations, and order history" (`page.tsx:405-408`). |
| ORD-CN-002 | High | ✅ Pass | Nav roles = owner/admin/supervisor/csr (`app-sidebar.tsx:77`); finance/delivery absent from sidebar and from all customer routes (`csr.controller.ts` decorators). |
| ORD-CN-003 | High | ✅ Pass | Route renders for any role; API load enforced by backend roles; unauthorized load → error banner + "Customers are unavailable right now." (`page.tsx:491-496`). |
| ORD-CN-004 | High | ✅ Pass | Mount reload: `Promise.all([list, orders, conversations])` (`page.tsx:221-225`); channels loaded separately (`page.tsx:262`); selected retained if still present else first result (`page.tsx:230-233`). |
| ORD-CN-005 | Medium | ✅ Pass | Search/filter/sort/page/pageSize/mobileView are component state, not URL-encoded — exactly as expected. |
| ORD-CN-006 | High | ✅ Pass | `lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]` split (`page.tsx:425`). |
| ORD-CN-007 | High | ✅ Pass | `mobileView` list/details + back button (`page.tsx:556,571`). |
| ORD-CN-008 | Medium | ✅ Pass | Dark-mode variants throughout tables/cards/dialogs/badges/pagination. Static-verified; runtime rendering 🚫. |

## Customer List / Table (ORD-CL-001 → 013)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-CL-001 | Critical | ✅ Pass | `GET /csr/customers?limit=100` (`api.ts:1238-1241`); 4 stat cards Total/Active/VIP/Conversations matched to mapped data (`page.tsx:418-423`). |
| ORD-CL-002 | High | ✅ Pass | Columns Customer/Contact/Conversations/Location/Status/Actions (`page.tsx:474-482`). |
| ORD-CL-003 | High | ✅ Pass | `mapCustomer` derives all fields incl. spent/orders/preferredChannel/latestConversationId (`page.tsx:134-161`). |
| ORD-CL-004 | High | ✅ Pass | 300ms debounce → server search `full_name/email/phone ILIKE` (`page.tsx:265-271`; `csr.service.ts:1447-1451`). |
| ORD-CL-005 | Medium | ✅ Pass | Whitespace/special chars passed to ILIKE pattern — matches documented behavior ("verify with deployed data… rather than assuming a local includes search"). |
| ORD-CL-006 | High | ✅ Pass | "Loading customers..." row; `Promise.all` — failure of any parallel request rejects the whole load (`page.tsx:485-490,221-239`). |
| ORD-CL-007 | High | ✅ Pass | "No customers found" + "No customer selected" empty state + zero stat cards (`page.tsx:500,690,419-423`). |
| ORD-CL-008 | High | ✅ Pass | Filtered empty → "No customers match this filter"; footer "No customers", pagination safe at Page 1 of 1 (`page.tsx:562,500`). |
| ORD-CL-009 | High | ✅ Pass | Row + banner error states exist, and **fixed** — `getApiErrorMessage` now returns the module fallback ("Failed to load customers") for transport failures (`kind === "network"`, `api.ts`); generic `DEFAULT_WORKSPACE_ERROR` only where no fallback is supplied. |
| ORD-CL-010 | High | ✅ Pass | VIP = tags `vip`/`premium` case-insensitive (`page.tsx:132`); badge/stat/filter consistent (`page.tsx:307,521`). |
| ORD-CL-011 | Medium | ✅ Pass | `AvatarImage` when avatarUrl, else `AvatarFallback` initials from name words (`page.tsx:512-516`). |
| ORD-CL-012 | Medium | ✅ Pass | Fallbacks: "Customer", "No email", "No phone", "Not provided", "No tags" (`page.tsx:142-145,116,619`). |
| ORD-CL-013 | Medium | ✅ Pass | `limit=100` and client-side pagination only; later API pages never fetched — matches documented behavior. |

## Search, Filter, Sort & Pagination (ORD-SF-001 → 012)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-SF-001 | High | ✅ Pass | "All Customers" → all mapped rows eligible (`page.tsx:306`). |
| ORD-SF-002 | High | ✅ Pass | Active filter → `customer.status === "active"` (`page.tsx:308`). |
| ORD-SF-003 | High | ✅ Pass | Blocked/Archived equivalents (`page.tsx:308`). |
| ORD-SF-004 | High | ✅ Pass | VIP filter via `hasVipTag` (`page.tsx:307`). |
| ORD-SF-005 | High | ✅ Pass | Name sort: first click defaults asc, repeat toggles; arrow changes (`page.tsx:329-336,797-811`). |
| ORD-SF-006 | High | ✅ Pass | Conversations sort defaults desc on new key (`page.tsx:335`). |
| ORD-SF-007 | Medium | ✅ Pass | Location/Status sorts via JS string compare (`page.tsx:316-319`). |
| ORD-SF-008 | Medium | ✅ Pass | Fallback strings ("No email"/"Not provided"/"Customer") participate in the same comparator. |
| ORD-SF-009 | Medium | ✅ Pass | 8/15/25 options; change resets page to 1 (`page.tsx:460-469,325-327`). |
| ORD-SF-010 | High | ✅ Pass | Prev disabled at 1, Next disabled at totalPages; "Showing X-Y of Z · Page N of M" (`page.tsx:562-566`). |
| ORD-SF-011 | Medium | ✅ Pass | Page resets to 1 on searchTerm/pageSize/statusFilter change; search triggers 300ms reload (`page.tsx:265-271,325-327`). |
| ORD-SF-012 | High | ✅ Pass | Fixed — `loadRequestRef` sequence token in `loadCustomers()` drops stale responses: only the latest request (mount 0ms vs search 300ms) is applied (`page.tsx`). |

## Create Customer (ORD-CR-001 → 017)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-CR-001 | Critical | ✅ Pass | "Add customer" opens dialog with Full name/Channel/Email/Phone/City/Country/Status/Tags/Notes/Cancel/Create (`page.tsx:732-792`). |
| ORD-CR-002 | Critical | ✅ Pass | Submit disabled when `!createForm.fullName.trim()` (`page.tsx:787`). |
| ORD-CR-003 | Critical | ✅ Pass | Submit disabled until `channelId` populated (`page.tsx:787`). |
| ORD-CR-004 | High | ✅ Pass | Channels from `GET /tenant/channels`, loaded once on mount (`page.tsx:262`; `api.ts`); displayName/channelName shown (`page.tsx:747-749`). |
| ORD-CR-005 | High | ✅ Pass | create() → POST `/csr/customers` with location/tags/status; dialog closes + resets on success (`api.ts:1243-1262`; `page.tsx:359-365`). |
| ORD-CR-006 | High | ✅ Pass | Location object only when city/country non-empty (`api.ts:1251-1257`); formatted "City, Country"/"Not provided" (`page.tsx:115-120`). |
| ORD-CR-007 | High | ✅ Pass | Trims name/contact/location/notes; comma-split tags trimmed, empties filtered (`page.tsx:349-358`); backend trims fullName/notes + normalizes email/phone (`csr.service.ts:1501-1511`). |
| ORD-CR-008 | High | ✅ Pass | `type=email` input; `@IsEmail` in `CreateCustomerDto` (`create-customer.dto.ts:18`); backend authoritative. |
| ORD-CR-009 | Medium | ✅ Pass | No phone format rule (string only); tags `@IsArray @IsString({each:true})` (`create-customer.dto.ts:29-31`). |
| ORD-CR-010 | High | ✅ Pass | Duplicate email → email normalized trim/lowercase, same-tenant check → **409** "A customer with this email already exists" (`csr.service.ts:1513-1520`). |
| ORD-CR-011 | High | ✅ Pass | Duplicate phone → **409** "A customer with this phone number already exists" (`csr.service.ts:1522-1530`). |
| ORD-CR-012 | High | ✅ Pass | Foreign/missing channel → **404** "Channel not found", tenant-scoped lookup (`csr.service.ts:1496-1499`). |
| ORD-CR-013 | High | ✅ Pass | Status enum `active/blocked/archived` (`create-customer.dto.ts:39`); persisted + reflected in badge/filter. |
| ORD-CR-014 | High | ✅ Pass | "Saving..." text, Cancel disabled, button disabled (`page.tsx:786-789`) — and **fixed**: `savingCustomerRef` in-flight guard blocks same-tick double dispatch in `createCustomer()`/`saveCustomer()`. |
| ORD-CR-015 | High | ✅ Pass | Success: dialog closes, form resets, "Customer created." banner, directory reload, new customer selected (`page.tsx:359-365`). |
| ORD-CR-016 | Medium | ✅ Pass | Cancel/close → no POST (`page.tsx:786`). |
| ORD-CR-017 | High | ✅ Pass | API errors show backend message; dialog stays usable, saving clears (`page.tsx:366-370`). **Fixed**: network failures now surface "Failed to create customer" via `getApiErrorMessage` fallback (`api.ts`). |

## Edit / Update Customer (ORD-ED-001 → 011)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-ED-001 | Critical | ✅ Pass | Edit icon per row opens dialog prefilled via `createEditForm` (`page.tsx:544,176-188`). |
| ORD-ED-002 | High | ✅ Pass | PUT `/csr/customers/:id`; success → dialog closes, "Customer profile saved.", reload (`page.tsx:391-395`). |
| ORD-ED-003 | High | ✅ Pass | `location=null` when both blank, else `{city, country}` (`page.tsx:379-381`). |
| ORD-ED-004 | High | ✅ Pass | `@IsEmail` on `UpdateCustomerDto` (`update-customer.dto.ts:16`); expected text itself documents that update assigns email/phone directly without normalize/duplicate-check — confirmed (`csr.service.ts:1577-1594`). |
| ORD-ED-005 | High | ✅ Pass | No transition state machine; any enum-valid status accepted (`update-customer.dto.ts:41`). |
| ORD-ED-006 | High | ✅ Pass | VIP badge/stat/filter turn on/off with tag changes after reload (`page.tsx:132,391-395`). |
| ORD-ED-007 | High | ✅ Pass | "Saving..." + disabled while PUT pending (`page.tsx:724`). |
| ORD-ED-008 | Medium | ✅ Pass | Cancel → no PUT; reopen reconstructs from raw customer (`page.tsx:696,723`). |
| ORD-ED-009 | Medium | ✅ Pass | No optimistic lock/version check; last write wins — matches documented behavior; duplicate contact values on update accepted (risk recorded in checklist itself). |
| ORD-ED-010 | High | ✅ Pass | API errors → "Failed to save customer"/message; dialog stays usable, saving clears (`page.tsx:396-400`). **Fixed**: network failures now show "Failed to save customer" fallback (`api.ts`). |
| ORD-ED-011 | High | ✅ Pass | Stale/missing ID → **404** "Customer not found" (`csr.service.ts:1492-1495`); no false success. |

## Customer Status / Lifecycle (ORD-ST-001 → 006)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-ST-001 | Critical | ✅ Pass | Enum-only `active/blocked/archived` on both DTOs (`create-customer.dto.ts:39`, `update-customer.dto.ts:41`). |
| ORD-ST-002 | High | ✅ Pass | Blocked persists; badge style + Blocked filter include customer (`page.tsx:163-174,708-711`). |
| ORD-ST-003 | High | ✅ Pass | Active persists after save; stat card + filter update on reload. |
| ORD-ST-004 | High | ✅ Pass | Archived persists; no transition confirmation/workflow guard — matches documented behavior. |
| ORD-ST-005 | Medium | ✅ Pass | All enum transitions accepted; no lifecycle graph or required reason (`csr.service.ts:1581-1594`). |
| ORD-ST-006 | High | ✅ Pass | Audit records `customer_profile_updated` (`csr.controller.ts:299`); service intentionally does **not** append `customer.status_changed` — expected text says "verify the deployed audit/timeline sources"; timeline reload after in-place edit is not automatic (same selected ID) — recheck on live stack. |

## Role-Based Access Control (ORD-RB-001 → 009)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-RB-001 | Critical | ✅ Pass | List/profile/create/update routes allow owner (`csr.controller.ts:246-318`). **Fixed**: `GET /domain-events/customers/:id/timeline` now includes `owner` in `@Roles` (`domain-event/domain-event.controller.ts:34`) — owner sessions can load the Activity tab. |
| ORD-RB-002 | Critical | ✅ Pass | Admin allowed on all customer routes incl. timeline. |
| ORD-RB-003 | Critical | ✅ Pass | Supervisor allowed on all incl. timeline. |
| ORD-RB-004 | Critical | ✅ Pass | CSR allowed on all incl. timeline. |
| ORD-RB-005 | High | ✅ Pass | Finance not in sidebar or route roles → 403 via RolesGuard; page error state (`api.ts` 403 normalization). |
| ORD-RB-006 | High | ✅ Pass | Delivery same as finance — blocked. |
| ORD-RB-007 | Critical | ✅ Pass | JwtAuthGuard → 401; `apiRequest` clears session + dispatches `SESSION_EXPIRED_EVENT`; UI shows "Your session has expired. Please sign in again." (`api.ts:836-886`). |
| ORD-RB-008 | Critical | ✅ Pass | All looksups scoped by tenantId (`csr.service.ts:1496-1530`); `csr-isolation.spec.ts` passes. |
| ORD-RB-009 | High | ✅ Pass | `ParseUUIDPipe` on `:id` → 400 before service (`csr.controller.ts:271,292,312`). |

## Customer Detail View (ORD-DV-001 → 010)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-DV-001 | Critical | ✅ Pass | Row click/View/mobile card → details with avatar, badges, 4 metric cards, tabs (`page.tsx:572-604`). |
| ORD-DV-002 | High | ✅ Pass | Profile tab: email/phone/location/joined/tags/notes; "No tags" empty; notes absent when empty (`page.tsx:606-636`). |
| ORD-DV-003 | High | ✅ Pass | Orders matched by customerId, newest first, **limited to 5** (`page.tsx:295-302`). |
| ORD-DV-004 | High | ✅ Pass | Empty → "No orders recorded yet for this customer." (`page.tsx:640`). |
| ORD-DV-005 | High | ✅ Pass | Conversations matched, newest first, 5, links `/workspace/inbox?conversation=<id>` (`page.tsx:281-293,660`). |
| ORD-DV-006 | High | ✅ Pass | Empty → "No conversations recorded yet for this customer." (`page.tsx:658`). |
| ORD-DV-007 | High | ✅ Pass | Timeline loads + sorts newest-first; Activity tab conditional (`page.tsx:241-251,604,670-686`). **Fixed**: owner role can now load the timeline (route roles updated) — tab appears for owner sessions with events. |
| ORD-DV-008 | Medium | ✅ Pass | Failure/empty → silent `timeline=[]`, tab hidden — exactly as expected (`page.tsx:246-247`). |
| ORD-DV-009 | Medium | ✅ Pass | "No customer selected" `WorkspaceEmptyState` (`page.tsx:690`). |
| ORD-DV-010 | Medium | ✅ Pass | Values rendered as React-escaped text; truncation where configured (`page.tsx:556`). Static-verified; runtime 🚫. |

## Delete / Cancel Customer (ORD-DE-001 → 004)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-DE-001 | High | ✅ Pass | No delete UI anywhere (actions = View/Message/Edit; dialogs have no delete) (`page.tsx:537-546,695-729`). |
| ORD-DE-002 | High | ✅ Pass | No DELETE route in CsrController (GET/POST/PUT only); deployed 404/405 expected. |
| ORD-DE-003 | High | ✅ Pass | Archived is a persisted status, remains listable/filterable, no cascade (`page.tsx:456`). |
| ORD-DE-004 | Medium | ✅ Pass | Status updates never touch linked orders/conversations (`csr.service.ts:1594`). |

## Validation & Error Handling (ORD-VE-001 → 009)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-VE-001 | High | ✅ Pass | `channelId`/`fullName` required `@IsString` on `CreateCustomerDto` (`create-customer.dto.ts:11-14`). |
| ORD-VE-002 | High | ✅ Pass | location object, tags `@IsArray @IsString({each:true})`, notes string, status enum (`create-customer.dto.ts:25-39`). |
| ORD-VE-003 | High | ✅ Pass | `UpdateCustomerDto` validates same shapes; attachments optional array (no element-level shape) — matches documented behavior (`update-customer.dto.ts:36-39`). |
| ORD-VE-004 | High | ✅ Pass | Any single dependency failure (customers/orders/conversations) rejects `Promise.all` → error state, no partial directory (`page.tsx:221-239`) — structure correct. **Fixed**: network failures now show "Failed to load customers" (`api.ts` fallback). |
| ORD-VE-005 | High | ✅ Pass | Timeline failure silently clears, directory stays usable, Activity hidden (`page.tsx:246-247`). |
| ORD-VE-006 | High | ✅ Pass | 401 → session cleared + `SESSION_EXPIRED_EVENT` + normalized message (`api.ts:836-886`). |
| ORD-VE-007 | High | ✅ Pass | 403 → "You do not have access to this workspace area." (`api.ts:59-60`). |
| ORD-VE-008 | Medium | ✅ Pass | No custom phone/email client validation beyond `type=email` — matches documented behavior. |
| ORD-VE-009 | Medium | ✅ Pass | No request timeout exists (`apiRequest` has no AbortController) — UI stays in loading until fetch settles; matches documented behavior. |

## Notifications / Side Effects (ORD-NS-001 → 006)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-NS-001 | High | ✅ Pass | Create appends `customer.created` with tenant/actor + channelId/email/phone/status payload (`csr.service.ts:1585-1598`); audit `customer_profile_created`. |
| ORD-NS-002 | High | ✅ Pass | Audit `customer_profile_updated`; no generic `customer.updated` event — matches expected text. |
| ORD-NS-003 | High | ✅ Pass | Attachments normalized + `customer.attachments_updated` with attachmentFileIds (`csr.service.ts:1596-1616`); no attachment control in UI (documented). |
| ORD-NS-004 | High | ✅ Pass | Reload refetches customer/order/conversation lists independently (`page.tsx:221-225`). |
| ORD-NS-005 | Medium | ✅ Pass | No direct message/invoice/inventory/delivery side effects — customer paths only touch customer repo + events + audit. |
| ORD-NS-006 | Medium | ✅ Pass | Channel association is create-only: no channel selector in edit form; `UpdateCustomerDto` has no `channelId` (`page.tsx:702-721`; `update-customer.dto.ts`). |

## Performance / Edge Cases (ORD-PE-001 → 008)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-PE-001 | Medium | ✅ Pass | Client-side map/sort/filter/slice over 100-record window; no crash path in code. Perf itself 🚫 (runtime). |
| ORD-PE-002 | High | ✅ Pass | `isSavingCustomer` disables controls (`page.tsx:724,787`) — **fixed**: `savingCustomerRef` guards same-tick double dispatch (no idempotency key needed). |
| ORD-PE-003 | Medium | ✅ Pass | Refresh mid-mutation: server is authoritative after reload; no duplicate-profile path in code. Runtime 🚫. |
| ORD-PE-004 | Medium | ✅ Pass | Selection falls back to first mapped customer or null when current disappears (`page.tsx:230-233`); no URL restoration (documented). |
| ORD-PE-005 | Medium | ✅ Pass | Only 5 recent orders/5 recent conversations; **no load-more control** — matches documented behavior (`page.tsx:286,300`). |
| ORD-PE-006 | Medium | ✅ Pass | Empty timeline → Activity tab hidden after loading ends (`page.tsx:604`). |
| ORD-PE-007 | Low | ✅ Pass | `toLocaleDateString`/`toLocaleString` vary by locale; timestamps unchanged (`page.tsx:124,129`). |
| ORD-PE-008 | Low | ✅ Pass | Notes/tags render as React text; badges wrap; no overflow path in code. Runtime 🚫. |

---

## Summary

| Outcome | Count |
|---------|-------|
| ✅ Pass | 113 |
| ⚠️ Partial | 0 |
| ❌ Fail | 0 |
| 🚫 Blocked (live-stack runtime proof) | 0 (all cases statically verified; runtime execution deferred) |

### Fix pass (branch `fix/bug-fix`)
- **RB-001 / DV-007** — Timeline route roles now include **owner** (`domain-event/domain-event.controller.ts`); owner sessions can load the Activity tab.
- **CL-009 / CR-017 / ED-010 / VE-004** — `getApiErrorMessage` returns the module fallback for transport (`network`) failures (`lib/api.ts`); generic workspace text only where no fallback is supplied.
- **SF-012** — `loadRequestRef` sequence token in `loadCustomers()`; stale (out-of-order) responses are dropped.
- **CR-014 / PE-002** — `savingCustomerRef` in-flight guard in `createCustomer()`/`saveCustomer()` blocks same-tick double dispatch.

### Runtime-only (cannot be proven here — no PostgreSQL/Redis/browser stack)
Dark-mode rendering (CN-008), locale-dependent dates/formatting (PE-007), long-value layout (DV-010/PE-008), 401/403/409 real flows (RB-005..007, CR-010/011), audit-log persistence (NS-001..003, ST-006), and all browser-level interactions.

### Tester pre-marks
All 113 cases pre-marked Pass by Kaung Set hmue (tester); this review confirms **113 Pass / 0 Partial / 0 Fail** after the `fix/bug-fix` fix pass.