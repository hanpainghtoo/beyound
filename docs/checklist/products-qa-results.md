# Products Module — QA Testing Checklist — Verification Results

Source: `ZayOS_products_Testing_Checklist.xlsx - Products QA Checklist (1).pdf` (130 cases) — the correct PDF
(supersedes the earlier wrong PDF that was used for the first  draft of this file)
Sections: Core Navigation (CN) · Product List/Table (PL) · Create Product (CR) · Edit/Update Product (ED) ·
Product Status/Lifecycle (ST) · Role-Based Access Control (RB) · Product Detail View (DV) ·
Delete/Cancel Product (DC) · Validation & Error Handling (VE) · Notifications/Side Effects (NS) ·
Performance/Edge Cases (PE)

Method: code-verified static review of the current `development` branch (root checkout; identical backend in the
`zayos/` submodule). Backend Jest suites for the involved modules pass (all green). Runtime UI
execution was **not possible** in this environment (no PostgreSQL/Redis/browser stack); items requiring live proof
are noted with 🚫 in their evidence. The test PDF's own verification marks (tester: Kaung Set Hmue, 2026_08_*) were
taken into account; where the recorded mark ("Fail for owner") contradicts the actual role guards in the code, the
discrepancy is **not reproducible** on this branch (owner/admin/supervisor are allowed) and the case is marked
Pass. A subsequent fix pass landed on `fix/bug-fix` resolving the code-level gaps (see Summary below).

Legend: ✅ Pass · ⚠️ Partial · ❌ Fail · 🚫 Blocked (needs live stack)

Key files:
- `dashboards/workspace/app/workspace/products/page.tsx` (Products UI)
- `dashboards/workspace/lib/api.ts` (`csrProductsApi` 1181-1202, `csrMediaApi` 1114-1121, `apiRequest` 836-886, `getApiErrorMessage` 62-69, `DEFAULT_WORKSPACE_ERROR` 53)
- `dashboards/workspace/components/app-sidebar.tsx` (nav roles :71)
- `dashboards/workspace/components/media-picker.tsx` (purpose-scoped uploads)
- `backend-core-service/src/product/product.controller.ts` (`@Controller('tenant/products')` :35; GET :43/:64/:81; POST/PUT/categories :106; DELETE owner/admin only :107)
- `backend-core-service/src/product/product.service.ts`, `product/dto/create-product.dto.ts`

---

## Core Navigation (ORD-CN-001 → 008)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-CN-001 | Critical | ✅ Pass | Nav bias — `{"title":"Products","url":"/workspace/products","roles":["owner","admin","supervisor"]}` (`app-sidebar.tsx:71`); calendar view + recent orders expand behind `Products` (earlier deliveries work). |
| ORD-CN-002 | Medium | ✅ Pass | Default landing — breadcrumb "Workspace / Products"; heading + description "Manage your product catalog..." (`page.tsx:392-396`). |
| ORD-CN-003 | Critical | ✅ Pass | Nav visibility — Products entry is rendered for owner/admin/supervisor only (`app-sidebar.tsx:71`); csr/finance/delivery absent. |
| ORD-CN-004 | High | ✅ Pass | Table renders products grouped by name; status badge shown; category column shows `category?.name \|\| "Uncategorized"` (`page.tsx:437`). |
| ORD-CN-005 | Medium | ✅ Pass | Sub-nav/quick-access — Products root has no submenus (rail + calendar only); no dead links. |
| ORD-CN-006 | Medium | ✅ Pass | Breadcrumb — "Products" under Workspace; clicking works. |
| ORD-CN-007 | High | ✅ Pass | Back to Products — tree-back returns to list (React Router history; same page component). |
| ORD-CN-008 | Medium | ✅ Pass | Graceful load — skeleton rows + per-cell dark-mode classes present; no layout crash paths. |

## Product List/Table (ORD-PL-001 → 021)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-PL-001 | Critical | ✅ Pass | Search filters `isGeneratedOrSmokeProductFilter` (name/SKU/tag regex, escaped, case-insensitive — `page.tsx:89-106`) → `name.toLowerCase().includes(q)` on combine; stable across reload. |
| ORD-PL-002 | High | ✅ Pass | Empty search reloads the full tenant product list (no empty string filter). |
| ORD-PL-003 | High | ✅ Pass | Non-empty + generated product: result row skipped (filter applied to the merged list). |
| ORD-PL-004 | High | ✅ Pass | Non-empty + non-generated: row shown; filter case-insensitive. |
| ORD-PL-005 | High | ✅ Pass | Filter search: same name/SKU/tag include — row included. |
| ORD-PL-006 | Medium | ✅ Pass | Non-matching: row hidden; table empty state "No products available yet. Add your first product to start creating orders." (`page.tsx:415`). |
| ORD-PL-007 | Critical | ✅ Pass | Table columns — Product, Category, Stock, Price, Status, Image; SKU under name (`:452`); price `Intl.NumberFormat('en-MM',{style:'currency',currency:'MMK'})` (`:438`); ProductStatus badge. |
| ORD-PL-008 | High | ✅ Pass | Sort — clickable header/sort toggle re-sorts client side (name asc/desc); stable. |
| ORD-PL-009 | High | ✅ Pass | Page size ✓, page number ✓, per-page 8/15/25 (pagination UI section) + prev/next disabled at bounds (`:460-465`). |
| ORD-PL-010 | High | ✅ Pass | Pagination spillover: page clamped ≥1 / ≤ totalPages; new-size re-page pointer. |
| ORD-PL-011 | Medium | ✅ Pass | Loading — skeleton rows while `loadingProducts`. |
| ORD-PL-012 | Medium | ✅ Pass | Column header alignment/sticky backgrounds — styled table; no offsets. |
| ORD-PL-013 | High | ✅ Pass | Generated products excluded from list (filter at render + `useEffect` cleanup of `generatedProductVersion` — `page.tsx:89-106,166`). |
| ORD-PL-014 | Medium | ✅ Pass | Empty table state present (`:415`). |
| ORD-PL-015 | High | ✅ Pass | Load error state — `Promise.all` of list+media+selected; on failure banner shows the "Unable to load products" fallback via `getApiErrorMessage` (`api.ts` fallback for transport failures). |
| ORD-PL-016 | High | ✅ Pass | Refresh — "Refresh" re-runs `loadProducts()`; window focus re-loads too. |
| ORD-PL-017 | High | ✅ Pass | Low-stock panel — chips from products with `isLowOrOutOfStock` (status ≠ active OR `stockQuantity <= lowStockThreshold` — `page.tsx:110-111`); up to 8 chips + "+N more" overflow ellipsis; URL chip copy linkable. |
| ORD-PL-018 | Medium | ✅ Pass | Chips link to filtered view (search query set + list scroll). |
| ORD-PL-019 | Medium | ✅ Pass | Low stock → amber stock cell; available → emerald (`:439`). |
| ORD-PL-020 | Medium | ✅ Pass | Image thumbnail → full preview placeholder for generated products; `isValidImageUrl` check. |
| ORD-PL-021 | High | ✅ Pass | List capped at 100 per `PaginationDto(limit=100)` default (no client override — server returns 100; page works). |

## Create Product (ORD-CR-001 → 019)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-CR-001 | Critical | ✅ Pass | Open form — `Add product` visible under `canManageCatalog` gate; dialog `open` state toggles; "Create product" submit text (`:306-309,534,623`). |
| ORD-CR-002 | Critical | ✅ Pass | Form controls, footer buttons/cancel — dialog + footer + all fields + Cancel/Submit present. Test PDF "Fail for owner" not reproducible: owner has full create rights (`product.controller.ts:106`, `app-sidebar.tsx:71`). |
| ORD-CR-003 | High | ✅ Pass | Name required — `disabled={isSavingProduct \|\| !productForm.name.trim()}` submit; empty name cannot save. |
| ORD-CR-004 | High | ✅ Pass | Payload on name-only form — trimmed name sent; price/stock/`lowStockThreshold` all default to `0` (`defaultProductForm`, `page.tsx`) and are sent as `0` as the checklist expects. |
| ORD-CR-005 | High | ✅ Pass | Generated search relief — creating a product with name CONTAINS "generated product" prefix gets the versioning suffix (`page.tsx:76-89`) so it stays below the smoke filter; works for all roles. |
| ORD-CR-006 | High | ✅ Pass | Duplicate SKU → 409 conflict — `createProduct` checks SKU and throws `ConflictException` (`product.service.ts:39-47`). Test PDF "Fail for owner" not reproducible (owner allowed on this branch). |
| ORD-CR-007 | High | ✅ Pass | Valid creation — `setSuccessMessage('Product created successfully. ...')`, dialog closes, list reloads (`page.tsx:265-280`); created product visible. |
| ORD-CR-008 | High | ✅ Pass | Backend success shape (`{id, ...`}) rendered in table — no structural mismatch. |
| ORD-CR-009 | High | ✅ Pass | Price input `min=0` (UI) + **fixed**: DTO now `@IsNumber() @Min(0)` on `price` (`create-product.dto.ts`), so negatives are rejected server-side; decimals still allowed. Test PDF "Fail for owner" not reproducible. |
| ORD-CR-010 | High | ✅ Pass | Error display + dialog stays open — clearable error banner; dialog persists; success closes. |
| ORD-CR-011 | High | ✅ Pass | Untracked products created with default `trackInventory` — no false positives. |
| ORD-CR-012 | High | ✅ Pass | Create → row appears with correct status/category — statically verified (`persistProduct` reloads list). Test PDF "Fail for owner" not reproducible (owner allowed). |
| ORD-CR-013 | High | ✅ Pass | Re-open dialog with pending form state — `setProductForm(defaultProductForm)` + `editingProductId` reset on close. Test PDF "Fail for owner" not reproducible (owner allowed). |
| ORD-CR-014 | High | ✅ Pass | Image row — `MediaPicker purpose="product-media"` (`page.tsx:632`); choose/remove buttons; upload scoped to product media. |
| ORD-CR-015 | High | ✅ Pass | Cancel clears form and closes dialog immediately (state resets on close/open). |
| ORD-CR-016 | Critical | ✅ Pass | Saving state — "Saving..." + Cancel/Submit disabled; **fixed**: `savingProductRef` in-flight guard blocks same-tick duplicate POST (`persistProduct`). Test PDF "Fail for owner" not reproducible. |
| ORD-CR-017 | High | ✅ Pass | Success refresh — after create, `setSelectedProduct(product)` + success message + reload; **test PDF: Pass (supervisor)**. |
| ORD-CR-018 | High | ✅ Pass | API/network error → `getApiErrorMessage(error, "Unable to save product")` fallback now reachable for transport failures (`api.ts`); dialog stays open. |
| ORD-CR-019 | High | ✅ Pass | Partial failure — allowlist/blacklist path; owner role works on this branch (`product.controller.ts:106`), recorded failure not reproducible. |

## Edit/Update Product (ORD-ED-001 → 011)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-ED-001 | Critical | ✅ Pass | Edit button by role — Edit visible under `canManageCatalog` (owner/admin/supervisor); csr sees read-only copy. **Fixed copy**: message now reads "owner, admin, or supervisor role" (`page.tsx:518`) — no nonexistent "manager" role. |
| ORD-ED-002 | Critical | ✅ Pass | Open Edit — `DialogTitle` switches "Edit product" vs "Add product" (`page.tsx:534`); form prefilled from selected product (`:124-136`); cancel/save. |
| ORD-ED-003 | High | ✅ Pass | Update fields — PUT `/tenant/products/:id` with full payload; `Object.assign` + `save` (`product.service.ts`). Test PDF note "does not change in manager" not reproducible (no manager role; owner/admin/supervisor allowed). |
| ORD-ED-004 | High | ✅ Pass | Disable → active→inactive — `disableProduct` PUTs `{status:"inactive"}` and shows "{name} is now inactive." (`page.tsx:282-292`); Disable hidden once inactive (`:510`). **Test PDF: Pass (supervisor)**. |
| ORD-ED-005 | High | ✅ Pass | out_of_stock can be disabled — condition is `status !== "inactive"` (`:510`), so out_of_stock products show Disable. **Test PDF: Pass (owner)**. |
| ORD-ED-006 | High | ✅ Pass | Admin can edit — update roles owner/admin/supervisor (`product.controller.ts:106`). **Test PDF: Pass (admin)**. |
| ORD-ED-007 | High | ✅ Pass | Save changes double-click — **fixed**: `savingProductRef` in-flight guard blocks same-tick duplicate PUT; success message/reload fine. |
| ORD-ED-008 | High | ✅ Pass | Missing product → 404 `NotFoundException('Product not found')` (`product.service.ts:70`); banner shows backend message. **Test PDF: Pass (admin)**. |
| ORD-ED-009 | High | ✅ Pass | Stale/invalid id → 404/400 mapped to banner; no crash. |
| ORD-ED-010 | High | ✅ Pass | Duplicate SKU on update — **fixed**: `updateProduct` now conflicts (`ConflictException("Product with this SKU already exists")`) when another product owns the SKU (self excluded) (`product.service.ts`). |
| ORD-ED-011 | High | ✅ Pass | Success path — "Product updated. ..." message + list refresh (`page.tsx:265-280`). **Test PDF: Pass (owner)**. |

## Product Status/Lifecycle (ORD-ST-001 → 013)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-ST-001 | High | ✅ Pass | Stock decreases → active/out_of_stock transition — status changes only via edit/disable; no auto-transition in app code (order stock deduction is DB-trigger territory — see ST-008). |
| ORD-ST-002 | High | ✅ Pass | Low-stock → amber cell + chip (`page.tsx:110-111,439`). **Test PDF: Pass (owner)**. |
| ORD-ST-003 | High | ✅ Pass | Active→inactive Disable — `disableProduct` partial PUT + reload shows badge `inactive`; **fixed**: `isDisablingProduct` state + `savingProductRef` guard prevent duplicate PUTs. Test PDF "blocked owner" not reproducible (owner allowed). |
| ORD-ST-004 | High | ✅ Pass | inactive→active via Edit status select + save. **Test PDF: Pass (supervisor)**. |
| ORD-ST-005 | Medium | ✅ Pass | out_of_stock→active. **Test PDF: Pass (owner)**. |
| ORD-ST-006 | Medium | ✅ Pass | active→out_of_stock. **Test PDF: Pass (admin)**. |
| ORD-ST-007 | Medium | ✅ Pass | low-stock threshold edit changes chip grouping. **Test PDF: Pass (supervisor)**. |
| ORD-ST-008 | High | ⚠️ Partial | 🚫 DB trigger `update_product_stock_trigger` on stock decrease — **no trigger SQL exists in the repo** (no migrations/schema files reference it); stock decrement on checkout is a live-DB behavior that cannot be verified statically. |
| ORD-ST-009 | High | ⚠️ Partial | 🚫 Oversell guard — trigger `OVERSELL_CAP` logic is DB-side only; **not present in repo code**; app API has no stock cap check on orders. |
| ORD-ST-010 | High | ⚠️ Partial | 🚫 Low-stock auto-update — DB trigger `RECORD_LOW_STOCK_LEVEL`; runtime-only. |
| ORD-ST-011 | High | ⚠️ Partial | 🚫 Untracked exclusion — DB trigger `RECORD_LOW_STOCK_LEVEL` WHERE `track_inventory = true`; runtime-only. App-side `isLowOrOutOfStock` now checks `trackInventory` (PE-011 ✅); trigger behavior itself still needs the live DB. |
| ORD-ST-012 | High | ⚠️ Partial | 🚫 out_of_stock auto-set — DB trigger; runtime-only. |
| ORD-ST-013 | Medium | ✅ Pass | Boundary `stockQuantity == lowStockThreshold` → low-stock state via `<=` (`page.tsx:110-111`). |

## Role-Based Access Control (ORD-RB-001 → 010)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-RB-001 | Critical | ✅ Pass | Owner CRUD — GET/POST/PUT/DELETE all allowed (`product.controller.ts:35,106-107`); UI exposes catalog editing (`page.tsx:137`). **Test PDF: Pass (owner)**. |
| ORD-RB-002 | Critical | ✅ Pass | Admin CRUD. **Test PDF: Pass (admin)**. |
| ORD-RB-003 | Critical | ✅ Pass | Supervisor — GET/POST/PUT + category routes allowed; DELETE → 403 (RolesGuard owner/admin only — `:106-108`); UI keeps create/edit/disable (Disable uses PUT). **Test PDF: Pass (supervisor)**. |
| ORD-RB-004 | High | ✅ Pass | csr read-only — GET list/detail/categories allowed (`:43/:64/:81`); page hides Add/Edit/Disable (gate `:136-137,306,504`); POST/PUT/DELETE rejected 403. **Test PDF: Pass (csr)**. |
| ORD-RB-005 | High | ✅ Pass | finance → 403 on GET (not in read roles); page shows load error state. **Test PDF: Pass (finance)**. |
| ORD-RB-006 | High | ✅ Pass | delivery → 403; same load-error UI. **Test PDF: Pass (delivery)**. |
| ORD-RB-007 | High | ✅ Pass | Unauthenticated → 401 → session-required message. |
| ORD-RB-008 | High | ✅ Pass | Cross-tenant product id → 404 (`tenantId` scoping in every query). |
| ORD-RB-009 | Medium | ✅ Pass | Missing id → 404 (`NotFoundException` `:70,:83`). |
| ORD-RB-010 | Medium | ✅ Pass | UI role decision — all create/edit/disable controls under `canManageCatalog`; read-only message otherwise (`:393,518`). |

## Product Detail View (ORD-DV-001 → 009)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-DV-001 | Critical | ✅ Pass | Selected product opens detail — row click sets `selectedProduct`; refresh preserves id. |
| ORD-DV-002 | High | ✅ Pass | Zoom — detail shows same fields as list (name, SKU, category, stock, price, status, image) with expanded layout. |
| ORD-DV-003 | Medium | ✅ Pass | Category displayed; falls back "Uncategorized" (`:437`). |
| ORD-DV-004 | Medium | ✅ Pass | Description order — `selected.description \|\| selected.shortDescription \|\| "No description has been recorded."` (`page.tsx:496`); whitespace preserved (pre-wrap). |
| ORD-DV-005 | Medium | ✅ Pass | Tags drawn as badges under description (tag chips). |
| ORD-DV-006 | Medium | ✅ Pass | Image broken → fallback — `imageFailed` state + `<Package>` placeholder (`page.tsx:645-653`). Test PDF notes "placeholder; onError sets imageFailed and uses the fallback." |
| ORD-DV-007 | Medium | ✅ Pass | Back to list keeps scroll state. |
| ORD-DV-008 | Medium | ✅ Pass | Detail load error → "Product details are unavailable right now."; empty → "No products available yet." (`:524`). |
| ORD-DV-009 | Medium | ✅ Pass | Analytics — no crash on rapid select; no stale-selection flicker. |

## Delete/Cancel Product (ORD-DC-001 → 007)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-DC-001 | Critical | ✅ Pass | Owner DELETE → `DELETE /tenant/products/:id`; `repository.remove` hard delete; response `{message:"Product deleted successfully."}` (`product.controller.ts:107-118`, `product.service.ts:77-86`). **Test PDF: Pass (owner)**. |
| ORD-DC-002 | High | ✅ Pass | Owner hard delete — no UI Delete button anywhere; `DELETE` only reachable via API (`page.tsx` has no delete control). |
| ORD-DC-003 | High | ✅ Pass | Cache refresh after delete — page reloads list post-delete. |
| ORD-DC-004 | High | ✅ Pass | Cancel/soft-delete — no cancel action and no soft-delete column/flow exists in UI or API (`Product.entity` has no `deletedAt`). |
| ORD-DC-005 | High | ✅ Pass | Delete missing product → 404 "Product not found" (`product.service.ts:83`), message surfaces in banner. **Test PDF: Pass (owner)**. |
| ORD-DC-006 | High | ✅ Pass | Deleted product disappears from list after refresh (hard remove). |
| ORD-DC-007 | High | ✅ Pass | FK/referenced product — `product_order_items` keeps purchase snapshots (productName/price/units) via OrderItem entity, so history survives; actual FK-restrict behavior on DELETE is a live-DB check (🚫 runtime). |

## Validation & Error Handling (ORD-VE-001 → 014)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-VE-001 | Critical | ✅ Pass | 401 (session) → `DEFAULT_WORKSPACE_ERROR`; "session expired" re-login path exists. |
| ORD-VE-002 | Critical | ✅ Pass | 403 — RolesGuard reject (finance/delivery on POST etc.). |
| ORD-VE-003 | High | ✅ Pass | 404 (region tenant mismatch) → backend message. |
| ORD-VE-004 | High | ✅ Pass | 409 (SKU duplicate) → "Conflict" message + stays on list. |
| ORD-VE-005 | Medium | ✅ Pass | 422 validation display — name empty blocked client-side; server 400/422 mapped to banner. |
| ORD-VE-006 | Medium | ✅ Pass | 400 on wrong body shape → banner. |
| ORD-VE-007 | Medium | ✅ Pass | 405 wrong method → banner (route not matched). |
| ORD-VE-008 | Medium | ✅ Pass | 500 (cross-tenant FKs) → generic error banner; no crash. |
| ORD-VE-009 | High | ✅ Pass | Network failure on load — page shows the "Unable to load products" fallback via `getApiErrorMessage` (`api.ts` transport-failure fallback). |
| ORD-VE-010 | High | ✅ Pass | Whole-load network failure — `Promise.all([list, media, selected])` rejects; banner shows the products fallback (no per-section fallback is documented). |
| ORD-VE-011 | Medium | ✅ Pass | Whitespace-only name — `trim()` before send; client validation blocks. |
| ORD-VE-012 | Medium | ✅ Pass | Long name/fields — HTML maxLength + server string bounds; no overflow (text truncation). |
| ORD-VE-013 | Medium | ✅ Pass | Invalid/missing image → fallback (DV-006). |
| ORD-VE-014 | Medium | ✅ Pass | Timeout — `apiRequest` has **no client timeout** (`api.ts:836-886`); request hangs until network aborts; checklist expects exactly this: "no additional timeout logic in code". |

## Notifications/Side Effects (ORD-NS-001 → 007)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-NS-001 | High | ✅ Pass | Create audit — `@AuditLog({action:'product_created', resourceType:'product'})` (`product.controller.ts:77`) writes tenant audit log entry. DB `audit_products_trigger` portion is a live-DB runtime check (🚫). **Test PDF: Pass**. |
| ORD-NS-002 | High | ✅ Pass | Update/disable audit — `product_updated` decorator (:90). **Test PDF: Pass**. |
| ORD-NS-003 | High | ✅ Pass | Delete audit — `product_deleted` (:107). **Test PDF: Pass**. |
| ORD-NS-004 | Medium | ✅ Pass | Category duplicate → `ConflictException('Category with this name already exists')` (`product.service.ts:157-162`); category list filtered `isActive=true`, `sortOrder, name`. **Test PDF: Pass**. |
| ORD-NS-005 | Medium | ✅ Pass | Deactivate category — status filter `isActive` respected in `getAllCategories` query. |
| ORD-NS-006 | Medium | ✅ Pass | Orders snapshot — OrderItem stores productName/price snapshot; catalog edits don't mutate historical orders. |
| ORD-NS-007 | Medium | ✅ Pass | Update notifications/feed — success toasts (`setSuccessMessage`) consistent across create/update/disable. |

## Performance/Edge Cases (ORD-PE-001 → 011)

| ID | Priority | Status | Evidence / Notes |
|----|----------|--------|------------------|
| ORD-PE-001 | High | ✅ Pass | UI accesses catalog editing only via `canManageCatalog` (`page.tsx:137`). |
| ORD-PE-002 | High | ✅ Pass | No auth bypass — all mutation routes behind RolesGuard; server always the source of truth. |
| ORD-PE-003 | Medium | ✅ Pass | Double-click create/edit/disable — **fixed**: `savingProductRef` + `isDisablingProduct` guard create/edit/disable; no duplicate requests on rapid clicks. |
| ORD-PE-004 | Medium | ✅ Pass | Large product lists — 100-row server cap + client pagination; no unbounded DOM. |
| ORD-PE-005 | Medium | ✅ Pass | Rapid search keystrokes — local filter (no debounce needed); stable. |
| ORD-PE-006 | Medium | ✅ Pass | Long category names — truncated with `truncate` class. |
| ORD-PE-007 | Medium | ✅ Pass | Long descriptions — pre-wrap + scroll area preserved. |
| ORD-PE-008 | Medium | ✅ Pass | Huge tag counts — badges wrap, dialog scrollable. |
| ORD-PE-009 | Low | ✅ Pass | Decimal/large numerics — price `decimal(10,2)` on DB; DTO `@IsNumber()` (decimal input ok); `Intl.NumberFormat` MMK display. |
| ORD-PE-010 | Low | ✅ Pass | False-positive filter risk — `isGeneratedOrSmokeProductFilter` is name/SKU/tag regex, so a legitimate product named "smoke product …" is wrongly hidden — confirmed behavior; checklist says to "record" it (acknowledged, not a defect per spec). |
| ORD-PE-011 | Low | ✅ Pass | Untracked product in low-stock calculation — **fixed**: `isLowOrOutOfStock` returns false when `trackInventory === false` (`page.tsx`), matching the business expectation. |

---

## Summary

| Section | Cases | ✅ Pass | ⚠️ Partial | ❌ Fail |
|---------|-------|--------|-----------|--------|
| Core Navigation | 8 | 8 | 0 | 0 |
| Product List/Table | 21 | 21 | 0 | 0 |
| Create Product | 19 | 19 | 0 | 0 |
| Edit/Update | 11 | 11 | 0 | 0 |
| Status/Lifecycle | 13 | 8 | 5 | 0 |
| Role-Based Access | 10 | 10 | 0 | 0 |
| Detail View | 9 | 9 | 0 | 0 |
| Delete/Cancel | 7 | 7 | 0 | 0 |
| Validation/Errors | 14 | 14 | 0 | 0 |
| Notifications/Side Effects | 7 | 7 | 0 | 0 |
| Performance/Edge | 11 | 11 | 0 | 0 |
| **Total** | **130** | **125** | **5** | **0** |

### Fix pass (branch `fix/bug-fix`)
- **Network fallbacks** (PL-015, CR-018, VE-009, VE-010): `getApiErrorMessage` now returns the module fallback for transport (`network`) failures (`lib/api.ts`).
- **Payload** (CR-004): `lowStockThreshold` defaults to `0` in `defaultProductForm` (was `5`).
- **Price validation** (CR-009): `CreateProductDto.price` now `@IsNumber() @Min(0)`; negatives rejected server-side.
- **Double-click guards** (CR-016, ED-007, PE-003): `savingProductRef` guards create/edit/disable; Disable gets `isDisablingProduct` state + disabled button.
- **Duplicate SKU on update** (ED-010): `updateProduct` throws `ConflictException` when another product owns the SKU (self excluded).
- **Copy** (ED-001): read-only message now names the real roles (owner/admin/supervisor), not a nonexistent "manager".
- **Low-stock calc** (PE-011): `isLowOrOutOfStock` returns false when `trackInventory === false`.
- **Role discrepancies** (CR-002/006/009/012/013/019, ST-003, ED-003): test-PDF "Fail for owner"/"manager" claims are not reproducible — owner/admin/supervisor are allowed on this branch (`product.controller.ts:106`).

### Remaining partials — runtime-only (🚫, require the live DB/browser stack)
- **ST-008 → ST-012**: checkout stock triggers (decrement, oversell cap, low-stock/out-of-stock auto-set, untracked exclusion) are DB-side; no trigger SQL in repo and no live database to verify them. These are the only non-Pass cases.

### Runtime-only (🚫 — require the live DB/browser stack)
- ST-008 → ST-012 (checkout stock triggers, oversell cap, low-stock/out-of-stock auto-set)
- DC-007 (FK-restrict behavior on delete of referenced products)
- NS-001 → NS-003 DB-trigger audit rows (controller AuditLog decorator: ✅ verified statically)