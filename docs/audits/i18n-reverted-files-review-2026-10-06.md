# Reverted i18n Files — Review of Two Uncommitted Working-Tree Edits

**System:** ZayOS / KME Omnichannel — `dashboards/workspace`
**Review date:** 2026-10-06
**Branch:** `feat/translation` (clean at `f7d0799`, in sync with origin)
**Files under review:** 2 modified, **deliberately left uncommitted**
**Method:** source diff against `HEAD`, catalog cross-reference, provenance search
across commits/stashes/branches
**Status:** gates pass with these files present; **decision outstanding**

## Executive summary

Two files in the working tree replace translation keys with hardcoded English
literals. They undo i18n wiring that is already committed, while the catalog
continues to define every key they drop — including the completed Burmese
translations.

| file | route | diff |
|---|---|---|
| `components/product-page-client.tsx` | `/product` | 266 lines (+109 / −157) |
| `components/payment/payment-method-card.tsx` | `/subscribe` | 11 lines (+3 / −8) |
| **total** | | **2 files, +112 / −165** |

**77 translation keys** are no longer referenced by these files. Of those,
**54 become fully orphaned** — nothing else in `dashboards/workspace` references
them. The remaining 23 are still used elsewhere, mostly by
`components/marketing-landing-figma.tsx`, which means the same phrase can render
localized on one route and hardcoded English on another.

The provenance of these edits is **unknown**: they match no commit, no stash, and
neither `development` nor `origin/development`. Nothing in the reflog records a
checkout that would produce them.

Separately, `payment-method-card.tsx` removes an `onMouseEnter` handler — a
behaviour change unrelated to translation, which is the main reason this looks
like an unintended revert rather than a considered decision.

**No action has been taken on these two files.** Everything else in the original
batch was committed and pushed as `f7d0799`.

## Scope and method

- Read the full working-tree diff for both files.
- Extracted every catalog key referenced by `HEAD` and by the working tree, and
  took the set difference (77 keys).
- Scanned all 210 source files under `dashboards/workspace` (excluding
  `node_modules`, `.next`, `i18n_translation`) to find which of those 77 keys
  still have a reference elsewhere — this separates *fully orphaned* from
  *partially orphaned*.
- Confirmed each of the 77 keys exists in **both** `en.json` and `my.json`.
- Searched for provenance: `HEAD`, `HEAD~1..HEAD~5`, every commit touching each
  file, `stash@{0..4}`, `development`, `origin/development`, `MERGE_HEAD`,
  `CHERRY_PICK_HEAD`, and `git reflog`.

## Finding 1 — the edits invert i18n rather than change copy

The diff does not reword English text; it changes the mechanism from
key-lookup to literal.

`product-page-client.tsx`:

```diff
-  descriptionKey: "product.channels.pageInbox",
-  logoSrc: "/brand/facebook.svg",
+  description: "Page inbox",
+  icon: <ServiceLogo src="/brand/facebook.svg" alt="Facebook logo" />,
```

```diff
-type ConnectedChannel = {
-  label: string;
-  labelKey?: string;
-  descriptionKey: string;
-  ...
-};
-const connectedChannels: ConnectedChannel[] = [
+const connectedChannels = [
```

The `labelKey` / `descriptionKey` / `detailKey` types are deleted outright, along
with the `ReactNode` import they needed. Affected data structures:
`connectedChannels`, `struggleItems`, `workflowItems`, `benefits`,
`integrationTicker`.

`payment-method-card.tsx`:

```diff
-import { useI18n } from "@/components/providers/i18n-provider"
-  const { t } = useI18n()
-            {t("registration.optionsAvailable", { count: method.options.length })}
+            {method.options.length} options available
-  const label = option.accountNumber ? t("registration.accountNo") : t("registration.phoneNo")
+  const label = option.accountNumber ? "Account No" : "Phone No"
-                  aria-label={t("registration.copyAccountNumber")}
-                {t("registration.downloadQr")}
+                Download QR
```

Dropping `aria-label={t("registration.copyAccountNumber")}` also removes the
accessible name on the copy button, so it is not purely a copy change.

## Finding 2 — 54 keys become fully orphaned

All 77 keys still exist in `en.json` and `my.json`. If these files are committed
as-is, the Burmese written for them can never render.

- **54 fully orphaned** — no other referrer anywhere in `dashboards/workspace`
- **23 partially orphaned** — still referenced elsewhere, so only these two
  routes lose localization

All 23 partially orphaned keys are still referenced by
`components/marketing-landing-figma.tsx`; `pricing.heroCta` is additionally
referenced by `app/pricing/pricing-client.tsx`. The group is the `home.*` block,
`pricing.heroCta`, and most of `product.channels.*` — so those phrases keep their
Burmese on the landing page while showing hardcoded English on `/product`.

The 54 fully orphaned keys break down by section as follows (sums to 54):

| section | count | examples |
|---|---|---|
| `product.benefits.*` | 8 | `fasterReplies.title`, `teamwork.body` |
| `product.useCases.*` | 8 | `retail.title`, `salesTeams.body` |
| `product.journey.*` | 6 | `point1..3`, `title`, `body`, `eyebrow` |
| `product.struggles.*` | 5 | `followUps`, `insights`, `badge` |
| `registration.*` | 5 | `optionsAvailable`, `accountNo`, `phoneNo`, `downloadQr`, `copyAccountNumber` |
| `product.alt.*` | 4 | `unifiedInbox`, `logoTemplate` |
| `product.cta.*` | 3 | `title`, `body`, `eyebrow` |
| `product.hero.*` | 3 | `titleLine1`, `titleLine2`, `subtitle` |
| `product.biz.*` | 3 | `eyebrow`, `title`, `body` |
| `product.ops.*` | 3 | `eyebrow`, `title`, `body` |
| `product.modulesSection.*` | 2 | `title`, `description` |
| `product.workflowSection.*` | 2 | `title`, `description` |
| `product.changes.body` | 1 | |
| `product.channels.websiteChat` | 1 | the only channel key with no other referrer |

Note the asymmetry in `product.channels.*`: **all 7** channel keys are dropped by
this file, but 6 of them survive on `marketing-landing-figma.tsx`. Only
`websiteChat` becomes fully orphaned.

Full key list in the [appendix](#appendix-the-77-affected-keys).

## Finding 3 — an unrelated behaviour change is bundled in

`payment-method-card.tsx` also deletes:

```diff
-      onMouseEnter={() => setIsExpanded(true)}
```

This has nothing to do with translation. With it gone, hovering a collapsed
payment card no longer expands it, so a user must click to reveal options. This
handler is not removed anywhere else in the diff, and it is the strongest signal
that the edit was not a deliberate localization decision — it looks like a
wholesale reversion to an earlier file revision.

## Finding 4 — provenance is unknown

Evidence collected:

| check | result |
|---|---|
| mtime | `2026-10-06 02:23:34` and `02:23:31` +0630 (orders wiring was `00:01`) |
| `git diff HEAD` | not equal |
| `HEAD~1..HEAD~5` | not equal |
| all commits touching each file | `product-page-client` has only 2 in history (`923fa4c`, `69b12bd`) — neither matches |
| `stash@{0..4}` | not equal |
| `development`, `origin/development` | not equal |
| `MERGE_HEAD` / `CHERRY_PICK_HEAD` | absent — no merge in progress |
| `git reflog` | no checkout after `bb52dc4`; nothing explains the state |

Conclusion: these are edits applied directly to the working tree at 02:23, with
no recorded origin. They should be treated as **unverified** until someone
confirms they were intentional.

## Finding 5 — why every gate stayed green

All four gates pass with these files present:

| gate | result | why it cannot catch this |
|---|---|---|
| `npx tsc --noEmit` | ✅ exit 0 | hardcoded strings type-check fine |
| `npm run lint -- --max-warnings=0` | ✅ exit 0 | no rule forbids string literals |
| `npm run build` | ✅ exit 0 | build only checks compilability |
| `npm run i18n:check` | ✅ 2173 keys | validates catalog **structure** — en/my parity, NFC normalization, `"use client"` presence — and does **not** verify that every key is referenced by source |

`i18n_translation/check-keys.mjs` contains no unused/orphan-key check. That is
the gap: **key removal from source is invisible to the current test suite.**

Suggested follow-up (not implemented): add an orphan-key check that builds a
reverse index of all `t("…")` / `descriptionKey` / `labelKey` / `detailKey`
references and fails when a catalog key has no referrer. Note this needs care —
keys can be constructed dynamically (`t(titleKey)`), so the scan must account
for indirect references rather than only matching literals.

## Impact if committed as-is

- `/product` renders entirely in English regardless of locale.
- `/subscribe` payment cards render option counts, account/phone labels, the QR
  download label and the copy-button accessible name in English only.
- 54 catalog keys, including their completed Burmese translations, become dead
  weight in both catalogs.
- The product page and `marketing-landing-figma.tsx` can disagree on the same
  phrase within one session.
- Hover-to-expand on the payment card stops working.

None of this is user-visible *today* only because nothing forces a locale
mismatch — switch to Myanmar and it appears immediately on those two routes.

## Decision required

Options, with the trade-off for each:

1. **Restore the committed versions** — `git checkout HEAD --` both files.
   Restores localization, removes the orphan risk, reverts the `onMouseEnter`
   removal. Discards whatever these edits were meant to do.
2. **Commit as-is** — accepts the de-localization of `/product` and `/subscribe`,
   54 orphaned keys, and the hover behaviour change. Only correct if the edits
   were intentional and localization of these routes is being dropped on purpose.
3. **Keep holding** — leave both uncommitted until their origin is established.

**Recommendation: option 1**, unless someone confirms these edits were intended.
The presence of an unrelated behaviour change, plus provenance that matches no
commit, stash or branch, points to an unintended reversion rather than a
deliberate product decision.

## Appendix: the 77 affected keys

### Fully orphaned — no other referrer in `dashboards/workspace` (54)

```
product.alt.chatWorkflows              product.alt.connectedSales
product.alt.logoTemplate               product.alt.unifiedInbox
product.benefits.betterVisibility.body product.benefits.betterVisibility.title
product.benefits.fasterReplies.body    product.benefits.fasterReplies.title
product.benefits.fewerMistakes.body    product.benefits.fewerMistakes.title
product.benefits.teamwork.body         product.benefits.teamwork.title
product.biz.body                       product.biz.eyebrow
product.biz.title                      product.changes.body
product.channels.websiteChat           product.cta.body
product.cta.eyebrow                    product.cta.title
product.hero.subtitle                  product.hero.titleLine1
product.hero.titleLine2                product.journey.body
product.journey.eyebrow                product.journey.point1
product.journey.point2                 product.journey.point3
product.journey.title                  product.modulesSection.description
product.modulesSection.title           product.ops.body
product.ops.eyebrow                    product.ops.title
product.struggles.badge                product.struggles.body
product.struggles.followUps            product.struggles.insights
product.struggles.title                product.useCases.localBrands.body
product.useCases.localBrands.title     product.useCases.onlineShops.body
product.useCases.onlineShops.title     product.useCases.retail.body
product.useCases.retail.title          product.useCases.salesTeams.body
product.useCases.salesTeams.title      product.workflowSection.description
product.workflowSection.title          registration.accountNo
registration.copyAccountNumber         registration.downloadQr
registration.optionsAvailable          registration.phoneNo
```

### Still referenced elsewhere — Burmese retained on other routes (23)

All 22 of these are referenced by `components/marketing-landing-figma.tsx`;
`pricing.heroCta` is additionally referenced by `app/pricing/pricing-client.tsx`.

```
home.flowSteps.conversation.detail     home.flowSteps.conversation.label
home.flowSteps.customer.detail         home.flowSteps.customer.label
home.flowSteps.delivery.detail         home.flowSteps.delivery.label
home.flowSteps.order.detail            home.flowSteps.order.label
home.flowSteps.report.detail           home.flowSteps.report.label
home.onePlatformTitle                  home.struggles.messages
home.struggles.orders                  home.whatChanges
pricing.heroCta                        product.channels.botMessages
product.channels.businessChat          product.channels.directChat
product.channels.leadMessages          product.channels.pageInbox
product.channels.siteWidget            product.connectedChannelsLabel
product.connectedSalesChannels
```
