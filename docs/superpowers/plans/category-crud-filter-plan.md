# Plan — Category CRUD + Products Category Filter

**Branch:** `fix/workspace_dashboard`  **Status:** approved by user (2026-10-06)

## Goal

Let merchant/tenant users manage product categories (full CRUD) and filter the
products list by category.

## Global Constraints

- **Never write Burmese.** New i18n keys go into `en.json` only. `my.json` is
  the user's file — do not touch it.
- Frontend gates (all must be 0): `npx tsc --noEmit`,
  `npm run lint -- --max-warnings=0`, `npm run build`, `npm run i18n:check`
  (run from `dashboards/workspace`).
- **Do not run `npm run build` while the pm2 dev server is up** (shared
  `.next/`). Stop → build → start.
- Backend typecheck (`cd backend-core-service && npx tsc --noEmit`) has **1
  pre-existing failure** at `src/tenant/tenant-disconnect.spec.ts(177,21)`
  TS2554 — confirmed present on `origin/development`. Not ours; ignore it, but
  no *new* backend tsc errors may appear.
- Preserve existing architecture, routes and schema. No gratuitous rewrites.
- Roles: manage operations are `owner | admin | supervisor` (matches the
  existing `canManageCatalog` predicate in the products page exactly).
- Standing user rule: when merging `development`, also merge into
  `fix/workspace_dashboard`.

## Decisions already made with the user

1. **Filter UI** = a `<Select>` dropdown in the products toolbar (beside
   search + per-page), not stat-strip tabs.
2. **Create entry point** = `+` icon beside the category `<Select>` in the
   product dialog.
3. **Scope** = full CRUD (create, read, update, delete).
4. **Delete semantics** = reassign referencing products to Uncategorized
   (`category_id = NULL`) in the same transaction, then delete the category.
   No migration — the column is already nullable.

## Design notes from DB inspection

- `product_categories`: only PK + FK(tenant_id) + FK(parent_category_id).
  **No unique on (tenant_id, name)** → duplicate protection stays app-level
  (a race can still duplicate; accepted, no migration).
- **No index on `products.category_id`** → filter seq-scans (5 rows; fine).
- `getAllCategories` filters `isActive: true` → inactive categories vanish
  from the dropdown and the filter while products keep displaying their name
  via the join. That is the soft-hide mechanism.
- "Uncategorized" is a **client-side sentinel meaning `category_id IS NULL`**;
  there is no row to point at.
- The products list is **server-paginated** → the filter must be server-side.

---

## Task 1 — Backend: DTOs + endpoints + service

**Files**

- `backend-core-service/src/product/dto/create-category.dto.ts` (new)
- `backend-core-service/src/product/dto/update-category.dto.ts` (new)
- `backend-core-service/src/product/product.controller.ts`
- `backend-core-service/src/product/product.service.ts`
- `backend-core-service/src/product/product.service.spec.ts` (tests first)
- `backend-core-service/src/product/dto/product-list-query.dto.ts`

**Steps (RED → GREEN)**

1. Write failing tests in `product.service.spec.ts`:
   - `createCategory` trims name, 409 on duplicate within tenant.
   - `createCategory` rejects empty/missing name (DTO validation).
   - `updateCategory` 404 for unknown id / foreign tenant.
   - `updateCategory` 409 on rename collision.
   - `updateCategory` renames and toggles `isActive`.
   - `deleteCategory` nulls `products.category_id` then removes category in
     one transaction.
   - `deleteCategory` 404 for unknown id / foreign tenant.
   - `getAllProducts` filters by `categoryId`; `uncategorized` → IS NULL.
2. Run → expect failures (methods/params do not exist).
3. Implement: DTOs, controller routes, service methods, `categoryId` filter.
4. Run → green. `npx tsc --noEmit` → only the pre-existing error remains.

**Endpoints**

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| POST | `categories` | owner/admin/supervisor | existing — switch to `CreateCategoryDto`, trim, 409 dup |
| PATCH | `categories/:id` | owner/admin/supervisor | new — 404, 409 rename collision, `@AuditLog product_category_updated` |
| DELETE | `categories/:id` | owner/admin/supervisor | new — 404, reassign→NULL then delete in one tx, `@AuditLog product_category_deleted` |
| GET | `categories` | +agent | existing — add `?includeInactive=true` (default `false`, backwards compatible) |

## Task 2 — Frontend API client

**File:** `dashboards/workspace/lib/api.ts`

- `updateCategory(id, payload)`, `deleteCategory(id)`.
- `categoryId?: string` on `AgentProductListOptions`, forwarded to the query
  string by `agentProductsApi.list`.
- `createCategory` already exists (dead code) — leave signature as-is unless
  the backend DTO renames a field.

**Verify:** `tsc` 0.

## Task 3 — Products page: toolbar category filter

**File:** `dashboards/workspace/app/workspace/products/page.tsx`

- `categoryFilter` state (`"all" | "uncategorized" | <uuid>`).
- `<Select>` in the toolbar beside search/per-page; changing it resets
  `page` to 1 and passes `categoryId` into `useProductsList`.
- Options: All categories / Uncategorized / each active category.
- **Ruling:** no "uncategorized" option when `categoriesQuery` has not loaded —
  keep the control disabled until the categories query settles, so the option
  list cannot flicker empty.

**i18n:** new `en.json` keys only.

**Verify:** `tsc` 0, `lint` 0, `i18n:check` 0.

## Task 4 — Products page: create + manage category UI

**File:** `dashboards/workspace/app/workspace/products/page.tsx`

- `+` icon button beside the category `<Select>` → quick-create dialog
  (name, description) → `createCategory` → **invalidate
  `productKeys.categories()`** (query has `staleTime: 10min` and nothing
  invalidates it today) → auto-select the new category in the form.
- `Manage` button beside `+` → dialog listing all categories
  (`?includeInactive=true`) with rename, active toggle, and delete.
- Delete flow shows "used by N products" as consequence text before commit.
- Everything gated by existing `canManageCatalog`.

**i18n:** new `en.json` keys only.

**Verify:** all 4 frontend gates, then manual: create → appears in dropdown →
filter returns correct counts → rename/delete behave.

## Review Focus (for the final reviewer)

- Server-side filter correctness: pagination totals must reflect the filter.
- Transaction integrity of delete (reassign + delete atomic).
- Cross-tenant isolation on PATCH/DELETE (id must be scoped by tenantId).
- Missing-name 400 vs 500 on POST categories.
- i18n: no Burmese written, `my.json` untouched.
