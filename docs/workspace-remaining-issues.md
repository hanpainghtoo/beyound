# Workspace dashboard — remaining work

Living checklist of what is still outstanding after the `bug/workspace` task batch.
Tracked here rather than in commits so it can be worked through independently.

Branch at time of writing: `feat/translation`
Last commit touching this work: see `git log --oneline -5`

---

## A. i18n — inbox (task 2) is DONE

Everything below was completed and verified:

- Inbox page converted. The 122 pre-existing `workspace.inbox.*` keys in `en.json` were
  **orphaned and roughly half wrong** — 28 contained the literal `(needs review)`, 8 keys
  all read `"Failed to load inbox queue"`, and 8 more all read `"Payment update"`. They were
  rebuilt from what the UI actually renders.
- `components/inbox/*` (8 files) and `components/media-picker.tsx` converted.
- Burmese delivered for 166 keys and merged into `my.json`.
- Added `scripts/check-dynamic-i18n-keys.mjs`: `check-keys.mjs` only validates **literal**
  `t("...")` calls, so keys held in module-scope arrays (filter chips, context tabs) were
  invisible to it. This scans for those and asserts they exist in both catalogs.

Deliberately **not** translated, by design:

| Thing | Where | Why |
|---|---|---|
| Conversation / message content | `inbox/page.tsx` `:185`, `:196`, `:212`, `:529` | Customer- and agent-authored data |
| `"Attachment"` fallback | `inbox/page.tsx:1047`, `message-bubble.tsx` | Persisted into the message record |
| Audit-trail `reason` strings | `inbox/page.tsx:1099`, `:1112` | Written as data, not copy |
| `"Customer"` / `"Channel"` sentinels | `inbox/page.tsx:181`, `:183` | `channel-icon.tsx` compares against the literal |
| Provider-supplied failure text | `message-bubble.tsx` | Passes through untouched; only our generic fallback is translated |

---

## B. Remaining i18n work outside the inbox

### B1. Billing tabs — biggest gap, fully unconverted (no `useI18n` at all)

| File | Strings |
|---|---|
| `components/billing-history-tab.tsx` | 54 |
| `components/my-plan-tab.tsx` | 31 |
| `components/packages-tab.tsx` | 27 |

These are the Plan & Billing page. Highest value — the page is actively in use.

### B2. Partially converted (already have the hook)

| File | Strings | Note |
|---|---|---|
| `app/workspace/channels/page.tsx` | 85 | Provider flow panels done; toasts, table headers, form labels, dialogs remain |
| `app/workspace/settings/page.tsx` | 12 | Nearly done |
| `app/workspace/audit/page.tsx` | 6 | "Total Audit Events", "Active Members", "View Activity" and friends |
| `app/workspace/orders/proof-viewer.tsx` | 2 | Visible in the orders detail panel |
| `components/media-picker.tsx` | 7 | Shared with the inbox composer — convert alongside B1 |

### B3. Cannot be fixed with a hook — needs an approach decision

**`app/workspace/reports/report-data.ts` (70 strings)** — a data module, not a component.
Consumed via `translate()`. **10 of these resolve against no key at all**, so they render
English even when the user picks Burmese. Affected: `Confirmed + paid, excluding returned`,
`Returned revenue`, `Shown separately`, `Average revenue order`, `Confirmed + paid`,
`Awaiting review`, `Returned paid amount`, `Confirmed paid orders`, `Revenue definition`,
`Delivery status`.

This is a **live bug**, not just missing translation. Table *row cells* are also not
translated (`reports/_components/report-client.tsx`), so fallbacks like `"Direct"`,
`"Unknown"`, `"No SKU"`, `"Not recorded"` stay English.

**`lib/format.ts` (8 strings)** — `humanize()`, `formatWait()`, `formatDayDividerLabel()`,
`formatLocation()` are shared English generators used by the inbox **and** orders. They are
plain functions, so they cannot call `useI18n()`. Fixing means threading a locale or
translator through, which reaches beyond i18n keys.

### B4. 32 new `paymentMethods` keys still English in `my.json`

Created for the payment-method fix; the user has not translated these yet.
Requested from the user, keys listed under `workspace.paymentMethods.*` in `en.json`.

### B5. Brand / placeholder values left English deliberately

`Guided Pilot`, `Facebook Messenger`, `UTC`, `SKU`, `VIP`, `Business Growth`,
`Business Launch`, `Enterprise`, plus ~31 email and URL placeholder values.
Confirm whether any should be Burmese.

### B6. Out of original scope (arrived with the `development` merge)

`components/bot-templates/*` — 15 strings across 5 files. Not part of task 2; flagged only.

---

## C. Backend / correctness issues found during the task batch

### C1. Audit logs record the proxy's loopback address — FIXED

`trust proxy` was never set, so with the dashboard reaching the API through the Next.js
`/api/proxy` route, `request.ip` was `127.0.0.1` for every user and every action. Fixed via
`src/common/config/trust-proxy.ts` (hop-count resolver, rejects the Express `true`
sentinel). Also fixed the login rate limiter key, which read the same broken IP and was
therefore global-per-email rather than per-IP.

### C2. Login is never audited — STILL OPEN

`logLogin` / `logLogout` in `audit-log.service.ts` have **zero callers**. `AuthController`
carries no `@AuditLog`, and `logging.interceptor.ts` bails on `!user?.id` — precisely the
anonymous login case. So IPs are now correct on the rows that exist, but logins still
produce no row. Out of scope by design; listed here so it is not forgotten.

### C3. `tenant_users.is_online` is permanently `false` — STILL OPEN

Nothing ever sets it `true`: login writes only `lastSeenAt`
(`auth.service.ts:255`), and `updateUserStatus` is only ever called with `false`
(`auth.controller.ts:369`, the logout handler). `tenant.service.ts:282` counts
`where: { isOnline: true }`, so the `activeAgents` dashboard metric is structurally always 0.

**No user-visible symptom**, because the team-page Online column is WebSocket-driven
(`useWorkspacePresence`), which now works correctly after the ref-counted socket fix.

Fixing properly needs DB writes on presence transitions. Caveat: presence is per-process
in-memory, so this is correct at 1 PM2 instance but would need a shared store if clustered.

### C4. Presence socket was torn down on every navigation — FIXED

Each component that called `useWorkspacePresence` opened its own socket and disconnected on
unmount, so the member-detail header read "Offline" while the team list read "Online". Now
a ref-counted singleton. Also split the helper that conflated account status with live
presence, which made the status badge dot reflect presence instead of status.

### C5. Audit pagination silently truncated — FIXED

`lib/api.ts` returned `response.data` and discarded `total`/`totalPages`/`hasNext`, so both
audit surfaces hard-capped at 100 and 50 with no way to page. Now paginated, plus a
server-side aggregate endpoint (`GET /tenant/audit-logs/summary`) because the member rollup
cannot be computed correctly from a page of rows.

Two bugs found and fixed in passing:

- The "Resource ID" column rendered `log.id` (the audit row's own id) instead of
  `log.resourceId`. The column was mislabelled as well as wrong.
- Both audit card descriptions claimed limits that did not hold ("last 50 events",
  "All audit events") while the query was capped at 50.

---

## D. Frontend bugs found and fixed

### D1. Payment methods showed four cards for everyone — FIXED

`components/payment-method-settings.tsx` seeded four methods in its initial state
(KBZPay, AYA Pay, and two blank "other" slots), and `load()` padded the server response
back up to four. A tenant that had configured nothing saw four cards reading as if they
had. Now renders exactly what the backend returns.

Two things worth knowing about this fix:

- **There was no "Add method" button at all.** The cards only ever existed because they
  were pre-seeded, so removing the defaults without adding a control would have made the
  component unusable. Added a dropdown offering only kinds the API accepts and that are
  not already used.
- Backend limits are mirrored in the UI so a user cannot build a combination the server
  rejects: 4 methods total, each built-in at most once, at most 2 custom
  (`payment.service.ts` `validateMethods`).
- **No remove button was added**, though the backend does exact replacement so one would
  work. Deleting an enabled method could strand in-flight orders, so this was left as a
  product decision.

### D2. Orders detail panel reflowed and lost state — FIXED

The detail was a fixed 360px column that unmounted when deselected, so the layout reflowed
on every click and scroll position was lost. Now uses the inbox pattern: fixed list rail,
flexible detail, minimise toggle, persisted pane visibility, and `?order=` in the URL so
refresh and browser Back work.

### D3. Un-guarded `router.back()` on billing request-payment — FIXED

It dead-ended on refresh (no history to return to) and ejected users who arrived from the
public `/pricing` page. Replaced with a deterministic href, matching what
`billing/invoice/[id]` already did. Also restored the missing `navKey` on 4 headers, so the
header icon stops disappearing in Burmese.

### D4. Edit button moved out of the team member header — FIXED

Removed from the profile header card and added inside the Profile & Details container.

---

## E. Small / housekeeping issues found

- **`npm run check:billing-layout` is dead.** It points at
  `scripts/check-billing-layout.mjs`, which was never committed and does not exist.
  Either restore the script or remove the npm script.
- **`lib/format.ts` returns hard-coded English** for day dividers ("Today", "Yesterday"),
  wait times ("5m waiting"), locations ("Not provided") and unknown dates ("Unknown").
  See B3.
- **`orders-settings` never highlights in the sidebar.** The `paymentMethods` nav item
  carries `?tab=payment`, which `usePathname()` cannot match. No nav item highlights on
  that route.
- **Pre-existing eslint warning** in `payment-method-settings.tsx`: `useEffect` has a
  missing `load` dependency. Present before the recent changes; not introduced by them.

---

## F. Test status — verified by baseline comparison

The e2e suite `dashboards/workspace/tests/e2e/commerce-workspace-surfaces.spec.ts` has
**12 of 17 tests failing**. This was confirmed to be **pre-existing** by running the same
spec against a clean `653bf4c` tree: identical 12 failures, same test names. None of the
work in this batch caused a regression.

The affected tests fail early on things unrelated to this work — e.g. the login test fails
on a missing "Good morning" heading on the workspace home page, which was never touched.

`tests/e2e/billing.spec.ts` invoice tests also fail, but at an earlier assertion
(`getByText('Balance due')`) than the back-button assertion that matters, and the only
change to that page was adding `navKey`. Believed pre-existing but **not** confirmed by a
clean baseline run — worth doing if the billing page is about to change.

---

## G. How to verify after any change

```bash
cd dashboards/workspace
npm run i18n:check                        # en/my key parity + literal key existence
node scripts/check-dynamic-i18n-keys.mjs  # keys held in data, not literals
npx tsc --noEmit -p tsconfig.json
npx eslint app components lib hooks

cd backend-core-service
npx tsc --noEmit -p tsconfig.json
npx jest src/common/config src/logging
```

`i18n:check` is **not** wired into CI or `npm run build` — it is manual/convention only.
Worth adding to the `dashboards` job in `.github/workflows/ci.yml`.
