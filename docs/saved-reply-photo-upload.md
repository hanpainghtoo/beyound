# Saved-Reply Photo Upload — Design, Code & Database

> Batch: `fix/workspace_dashboard`, all work **uncommitted** as instructed.
> Covers the photo feature in depth, plus the two sibling fixes shipped in the same batch.

---

## 1. What shipped in this batch

| # | Track | Status |
|---|---|---|
| 1 | Hide the chat button for customers whose channel is not connected | ✅ verified |
| 2 | Saved-reply photo: upload/pick with preview on create, replace/remove on edit | ✅ verified |
| 3 | Remove the tag UI from the **add-new-customer** form | ✅ verified |
| 4 | Move "Manage categories" into the products page nav bar | ✅ verified |
| 5 | Migration `1782447200000` — `canned_responses.image_media_id` | ✅ applied (64/64) |

---

## 2. Database change

### 2.1 The migration

`backend-core-service/src/database/migrations/1782447200000-AddCannedResponseImageMediaId.ts`

```sql
ALTER TABLE "canned_responses" ADD "image_media_id" character varying;
-- down:
ALTER TABLE "canned_responses" DROP COLUMN "image_media_id";
```

State: **64/64 migrations applied** (`migrations` table row `AddCannedResponseImageMediaId1782447200000`).

### 2.2 `canned_responses` — before vs after

The table gained exactly one column. Nothing else moved, renamed, or changed type.

| # | Column | Type | Nullable | Default | |
|---|---|---|---|---|---|
| 1 | `id` | uuid | NO | `uuid_generate_v4()` | |
| 2 | `tenant_id` | uuid | NO | — | |
| 3 | `category_id` | varchar | YES | — | |
| 4 | `title` | varchar | NO | — | |
| 5 | `shortcut` | varchar | YES | — | |
| 6 | `content` | text | NO | — | |
| 7 | `tags` | jsonb | NO | `'[]'` | |
| 8 | `visibility` | varchar | NO | `'public'` | |
| 9 | `created_by` | uuid | YES | — | |
| 10 | `usage_count` | integer | NO | `0` | |
| 11 | `is_active` | boolean | NO | `true` | |
| 12 | `created_at` | timestamp | NO | `now()` | |
| 13 | `updated_at` | timestamp | NO | `now()` | |
| **14** | **`image_media_id`** | **varchar** | **YES** | **—** | ← **new** |

Indexes: unchanged — only the primary key `PK_1df87c74d99c463b1c7fb30dc14`. No index was added; lookups are always by `id`, never by photo.

`canned_responses.image_media_id` is now the **only** `*_media_id` column in the whole schema.

### 2.3 Why `varchar` and **not** a foreign key

**No FK, deliberately.** The bytes live in the separate *file-storage* microservice. This database has **no media table** to point at — there is nothing for a foreign key to reference. The column is an opaque foreign reference:

- Deleting a saved reply does **not** delete its photo (media is independent).
- Deleting a media file does **not** break a row — the UI degrades to "Photo unavailable" instead of failing.
- No cross-service referential integrity is implied or required.

**Why `type: 'varchar'` is written explicitly** — this is the one non-obvious line. The column is typed `string | null`. Under TypeScript's `strictNullChecks`, TypeORM's decorator metadata *reflects* that as `Object`, and at boot TypeORM throws:

```
DataTypeNotSupportedError: Data type "Object" in "CannedResponse.imageMediaId"
is not supported by "postgres" database.
```

This blocked `npm run migration:run` (DB stayed at 63/63 until fixed). The fix is an explicit `type: 'varchar'`, which matches both the migration's `character varying` and the dominant convention in this repo.

> ⚠️ **Latent anomaly worth knowing:** `Customer.channelId` is declared the same way (`string | null`, no explicit type) and also emits `design:type = Object`, yet the app boots with it. The explicit type here is required regardless; the `Customer` case is unexplained and untested.

### 2.4 The full new DB structure (relevant slice)

```
tenant_subscription_periods   ← period/quota ledger (see §7 — source of the upload 500)
        │
        │  resolves entitlement (storage_gb quota)
        ▼
media / file-storage service   ← owns bytes + file records (different database)
        ▲
        │  opaque id, no FK
canned_responses.image_media_id  ← NEW, varchar, nullable
```

---

## 3. Backend

### 3.1 Entity

`backend-core-service/src/common/entities/canned-response.entity.ts`

```ts
/**
 * Opaque id of the photo in the file-storage service. No FK: that service
 * owns its own records and this database has no media table. Nullable — most
 * saved replies have no photo.
 */
@ApiPropertyOptional({ nullable: true })
@Column({ name: 'image_media_id', type: 'varchar', nullable: true })
imageMediaId: string | null;
```

### 3.2 DTO

`backend-core-service/src/tenant/dto/create-canned-response.dto.ts`

```ts
@ApiPropertyOptional({ nullable: true })
@IsOptional()
@IsString()
imageMediaId?: string | null;
```

The update DTO is `PartialType(CreateCannedResponseDto)`, so it inherits the field with no extra code. **No service change was needed** — create/update spread the DTO onto the entity, so the column round-trips for free.

### 3.3 The `null` vs `undefined` contract (the important bit)

The update path uses `Object.assign`, which **skips `undefined` keys**. Therefore:

| Client sends | `Object.assign` does | Stored result |
|---|---|---|
| `{ imageMediaId: "abc" }` | sets it | `"abc"` |
| `{ imageMediaId: null }` | sets it (explicit) | `null` ← **this is what "Remove" sends** |
| `{}` / key omitted | key dropped | previous value **preserved** |

This is deliberate and is the whole reason the frontend payload builder always emits the key:

```ts
const toPayload = (form) => ({
  ...,
  // `null` is deliberate: it is what clears a stored photo. Omitting the key
  // would leave the previous photo in place.
  imageMediaId: form.imageMediaId,
})
```

### 3.4 Verified API round-trip

| Operation | Result |
|---|---|
| create **without** the key | `imageMediaId: null` ✅ |
| create **with** the key | echoed back ✅ |
| update **omitting** the key | **preserved** ✅ |
| update with `null` | **cleared** ✅ |
| update with a new id | set ✅ |
| list (`GET /tenant/canned-responses`) | key present on all rows ✅ |

### 3.5 Signed URLs are never stored

Only the id is persisted. The signed URL is minted on demand:

```
GET /media/:id/download-url  →  { download: { url } }   (1 h TTL)
```

Because the URL expires, writing it back to the record would silently rot the data. The id is stable; the URL is a per-render ephemeral.

---

## 4. Frontend

### 4.1 Form state holds an id, never a URL

`dashboards/workspace/app/workspace/saved-replies/page.tsx`

```ts
type ResponseFormState = {
  title: string
  shortcut: string
  content: string
  tags: string
  visibility: "public" | "private" | "team"
  /** Media-library id of the photo. `null` means "no photo"; the signed URL
   *  used for preview is never part of the form state. */
  imageMediaId: string | null
}
```

`toFormState()` reads `response.imageMediaId ?? null`; `toPayload()` writes `imageMediaId: form.imageMediaId`.

### 4.2 `useMediaImage` — id → signed URL

`dashboards/workspace/hooks/use-media-image.ts`

A four-state machine:

```
{ status: "idle" }     no mediaId → nothing to do
{ status: "pending" }  request in flight
{ status: "ready", url }  signed URL resolved
{ status: "failed" }   file deleted / link expired / network error
```

- Resolves via `agentMediaApi.download(mediaId)`.
- Uses a `cancelled` flag so a stale response cannot overwrite a newer id.
- **Never throws** — a missing file becomes `failed`, so callers render a recoverable state instead of a broken image.
- The signed URL lives only in React state; it is never written back to the form or the server.

### 4.3 `SavedReplyPhoto` — the visual component

Four render branches:

| Condition | Rendered |
|---|---|
| `!mediaId` + `onAdd` supplied | dashed **"Add photo"** dropzone button |
| `!mediaId` + no `onAdd` | `null` (detail pane without a photo renders nothing) |
| `status === "failed"` | amber **"Photo unavailable"** banner, with a Remove action in edit mode |
| `status === "ready"` | the `<img>` in a rounded frame, with **Replace photo** / **Remove photo** |
| otherwise (`idle`/`pending`) | loading placeholder — the *first paint after an id appears* is `idle`, so it is treated as loading, **not** as failure |

Used in two places:
- **Detail pane** — `<SavedReplyPhoto mediaId={selectedResponse.imageMediaId} />` inside the Preview tab bubble (no add/replace/remove handlers → read-only).
- **ResponseForm** — with `onAdd` / `onRemove`, so it becomes interactive.

### 4.4 `MediaPicker` — shared component, two new props

`dashboards/workspace/components/media-picker.tsx`

New props, both **optional and backward-compatible** (inbox and products callers unchanged):

```ts
accept?: string             // e.g. "image/*"
acceptErrorMessage?: string // i18n string shown on rejection
```

What the new props do:
1. **Filter the browsed grid** — non-matching library files are hidden.
2. **Set the native `accept`** on the hidden file input.
3. **Re-check at upload time** (see §4.5).

On select it reports only the id: `onSelect(file) → onChange({ ...form, imageMediaId: file.id })`.

#### The `error` vs `notice` split (a bug this feature would otherwise have shipped)

The grid's fallback branch is driven by `error`:

```jsx
{isLoading ? "Loading media…"
 : error       ? "Media files are unavailable right now."   ← grid REPLACED
 : files.length === 0 ? "No uploaded media found."
 : files.map(...)}
```

Originally a single `error` state served both **load failures** and **upload failures**. Routing the new image-only validation through `error` meant that picking a wrong file **wiped out the file grid** and displayed a misleading "unavailable" message — exactly when the user most needed to pick a different file.

Fix — two states with separate meanings:

| State | Meaning | Effect |
|---|---|---|
| `error` (red banner) | the **library** could not load | banner **and** grid replaced by "unavailable" |
| `notice` (amber banner) | something **the user** did — rejected type, failed upload | banner only; **grid stays put** |

Verified by test: `file grid SURVIVES the rejection (not replaced by 'unavailable') — cards after=1 (was 1)` ✅

### 4.5 `matchesFileAccept` — image-only enforcement

`dashboards/workspace/lib/file-accept.ts`

Browsers treat `accept` on `<input type="file">` as **advisory** — the picker's "All Files" option ignores it. So the rule is re-checked at upload time, client-side, **before any network call**:

```ts
export function matchesFileAccept(file, accept?): boolean {
  if (!accept?.trim()) return true
  const name = (file.name || "").toLowerCase()
  const type = (file.type || "").toLowerCase()
  return accept.split(",").some((raw) => {
    const entry = raw.trim().toLowerCase()
    if (!entry) return false
    if (entry.startsWith("."))  return name.endsWith(entry)      // .pdf
    if (entry.endsWith("/*"))   return type.startsWith(entry.slice(0, -1)) // image/*
    return type === entry                                        // image/png
  })
}
```

Supports all three forms the HTML spec allows. The saved-reply form passes `accept="image/*"`, so **only images** are accepted. Size limits are deliberately **deferred to the backend** (`25 MB` via `@Max` on `CreateMediaUploadDto`).

Because rejection happens before `setIsUploading`, a rejected file triggers **no network request at all** — which is why it stays testable even while uploads are broken (§7).

### 4.6 Wiring it into the form

```jsx
<div className="space-y-2">
  <Label>{t("workspace.savedReplies.photo")}</Label>
  <SavedReplyPhoto
    mediaId={form.imageMediaId}
    onAdd={() => setIsMediaPickerOpen(true)}
    onRemove={() => onChange({ ...form, imageMediaId: null })}   // ← null, not undefined
  />
  <MediaPicker
    open={isMediaPickerOpen}
    onOpenChange={setIsMediaPickerOpen}
    purpose="saved-reply-photo"
    accept="image/*"
    acceptErrorMessage={t("workspace.savedReplies.unsupportedFileType")}
    onSelect={(file) => onChange({ ...form, imageMediaId: file.id })}
  />
</div>
```

---

## 5. End-to-end flow

```
CREATE
  user clicks "Add photo"
        → MediaPicker opens, lists library (filtered to images)
        → picks a file (or uploads one)
        → form.imageMediaId = file.id
        → SavedReplyPhoto resolves id → signed URL → shows <img> preview
        → Replace / Remove buttons appear
  user saves
        → POST /tenant/canned-responses { ..., imageMediaId: "…" }
        → row stored with image_media_id

EDIT
  row loads → toFormState() seeds imageMediaId → preview renders
  Replace → MediaPicker → onSelect → new id
  Remove  → onChange({ imageMediaId: null })  → empty state returns
  save    → PUT /tenant/canned-responses/:id { imageMediaId: null } → column cleared

DETAIL PANE (read-only)
  selectedResponse.imageMediaId → SavedReplyPhoto (no handlers)
  → preview bubble shows the photo, or "Photo unavailable" if it is gone
```

---

## 6. i18n

Six new keys, added to **both** `en.json` and `my.json` as **identical English placeholder strings**. `my.json` contains no Burmese text from this work (it is the user's file, Pyidaungsu font).

| Key (`workspace.savedReplies.*`) | Value |
|---|---|
| `photo` | `Photo` |
| `addPhoto` | `Add photo` |
| `replacePhoto` | `Replace photo` |
| `removePhoto` | `Remove photo` |
| `photoUnavailable` | `Photo unavailable` |
| `unsupportedFileType` | `Only image files can be uploaded` |

Totals: **2198 keys**, 224 source files, all 6 verified byte-identical across `en`/`my`.

---

## 7. Known issues

### 7.1 Pre-existing: all media uploads return 500

`POST /media/uploads` → **500** `MissingActivePeriodError: PERIOD_OUTSIDE_CALENDAR_WINDOW`.

- The demo tenant's paid period window is `2026-09-01 → 2026-10-01`; today is past that, but `period_status` is still `active` and **no renewal/rollover job exists anywhere in the codebase**.
- Because `isPeriodScopedEnforcementEnabled()` hardcodes `return true`, enforcement is permanent.
- Every other caller of `resolveActiveSubscriptionEntitlement` catches `MissingActivePeriodError` and maps it to a designed **409** (e.g. `tenant.controller.ts` → `SUBSCRIPTION_PERIOD_NOT_ACTIVE`). `MediaLibraryService.createUpload` **does not**, so it surfaces as a raw 500.
- Impact: **all** uploads app-wide (product images included), not just saved-reply photos.

The photo feature's **browse-existing** path works and was fully verified; only **upload-new** is blocked. Image-only rejection is unaffected because it runs client-side before any request.

### 7.2 Not ours

- Held uncommitted, untouched: `payment/payment-method-card.tsx`, `product-page-client.tsx`.
- Pre-existing test failures: `tenant-disconnect.spec.ts(177,21)` TS2554; unused `IsEnum` in `create-product.dto.ts`; auth-registration / order / subscription-add-on / tenant specs.

---

## 8. Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0** errors |
| `npm run lint -- --max-warnings=0` | **0** |
| `npm run i18n:check` | **2198 keys**, identical, 224 files |
| unit tests (`file-accept`, `channel-connection`) | **11/11** |
| `npm run build` | ✅ 18.2s, 0 TS errors |
| `npm run migration:run` | ✅ **64/64** |
| pm2 | **8/8 online, 0 restarts** |
| Playwright (photo feature) | **20/20 checks, 0 × 5xx** |
| API round-trip | all 6 cases ✅ |
| DB after Remove + Save | `image_media_id IS NULL` ✅ |

Browser coverage: empty state → non-image rejected + grid survives → pick → preview + Replace/Remove → create → detail-pane photo → edit seeded preview → remove → empty state → save → API shows `null`. Test data cleaned up afterwards.

---

## 9. Files changed

**Backend**
- `src/common/entities/canned-response.entity.ts` — new column (explicit `varchar`)
- `src/tenant/dto/create-canned-response.dto.ts` — `imageMediaId?: string | null`
- `src/database/migrations/1782447200000-AddCannedResponseImageMediaId.ts` — **new, applied**

**Frontend**
- `app/workspace/saved-replies/page.tsx` — form state, `SavedReplyPhoto`, photo block, detail-pane preview
- `app/workspace/customers/page.tsx` — `canChat` gate + tag removal from the create dialog
- `app/workspace/products/page.tsx` — Manage-categories move
- `components/media-picker.tsx` — `accept` / `acceptErrorMessage` props, `error` vs `notice`
- `lib/api.ts` — DTO type
- `lib/file-accept.ts` + `lib/file-accept.test.ts` — **new**
- `lib/channel-connection.ts` + `lib/channel-connection.test.ts` — **new**
- `hooks/use-media-image.ts` — **new**
- `i18n_translation/en.json`, `i18n_translation/my.json` — +6 keys
