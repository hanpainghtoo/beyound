# Localization Configuration

How the ZayOS marketing/public workspace resolves, loads, and renders localized
copy. Everything described here lives in `dashboards/workspace`.

## Supported Locales

| Locale | Language | Native label | Short | Role |
| --- | --- | --- | --- | --- |
| `my` | Myanmar (Burmese) | မြန်မာ | `MY` | Product default |
| `en` | English | English | `EN` | Source language |

- `my` is `DEFAULT_LOCALE`: a first-time visitor with no saved preference gets
  Myanmar.
- `en` is `SOURCE_LOCALE`: every string authored in the Platform Console or
  returned by the API (plan names, price summaries, CTA labels) is written in
  English, so English doubles as the lookup key for copy that has no key.

## File Map

| Path | Purpose |
| --- | --- |
| `i18n_translation/translation.ts` | Locale list, `Locale` type, defaults, validation, resource loading/caching, key resolution, interpolation, English reverse index |
| `i18n_translation/en.json` | English catalog (source of truth for dynamic copy) |
| `i18n_translation/my.json` | Myanmar catalog (must mirror `en.json` exactly) |
| `i18n_translation/check-keys.mjs` | Build-time integrity gate (`npm run i18n:check`) |
| `components/providers/i18n-provider.tsx` | `I18nProvider` + `useI18n()` hook |
| `components/language-switcher.tsx` | Header language toggle |
| `app/layout.tsx` | Server-side locale resolution, pre-hydration script, provider mount |
| `app/globals.css` | Myanmar font fallbacks on `--font-sans` |

## Key Conventions

- Keys are dot-separated and camelCase: `product.hero.titleLine1`,
  `pricing.plan.perMonth`.
- The first segment is a page or domain section (`common`, `navigation`,
  `footer`, `home`, `product`, `pricing`, `signIn`, …).
- Interpolation uses `{token}` placeholders:
  `footer.copyright` → `"© {year} ZayOS. All rights reserved."`.
- Brand and product names (Facebook, Viber, TikTok, ZayOS, …) are **not**
  translated. Components keep a raw `label` and only use a `labelKey` when the
  label itself is generic English (`Website Chat`).

## Locale Resolution Order

1. **Server (first paint).** `RootLayout` reads the readable `zayos-language`
   cookie and calls `resolveLocale()`, which returns the value only if it is a
   known locale and otherwise falls back to `my`. The active catalog and the
   English source catalog are awaited before rendering, so the first
   server-rendered HTML is already in the visitor's language — no
   Myanmar → English flash, and hydration matches.
2. **Pre-hydration script.** An inline `<head>` script mirrors a surviving
   `localStorage` preference into the cookie when the cookie is missing (hard
   refresh after a cleared cookie) and stamps `lang` / `data-locale` on
   `<html>`.
3. **Client.** `I18nProvider` reconciles with the inline script's decision once,
   and only when the server cookie was absent or stale.

## Storage and Document Attributes

| Name | Value |
| --- | --- |
| Cookie / localStorage key | `zayos-language` |
| Cookie flags | `path=/; max-age=31536000; samesite=lax` (not `httpOnly`) |
| `<html lang>` | Active locale |
| `<html data-locale>` | Active locale (`LOCALE_HTML_ATTRIBUTE`) |

`localStorage` is written first by the provider; the cookie exists so the
*next* server request renders in the right language. `data-locale` is exposed
for CSS so styling can react to language without JS-driven classes; no rules
depend on it yet.

## Loading and Switching

- Each locale is a separate async chunk (`translationLoaders`), so a page only
  pays for the language it renders. `my` and `en` are code-split independently.
- Loaded resources are cached in an in-memory `Map` for the document lifetime:
  switching `my → en → my` never re-fetches.
- `preloadTranslations()` runs on hover/focus of the language switcher, so the
  switch resolves in the same tick when the chunk arrives.
- `changeLanguage()` applies synchronously when the target is already cached,
  otherwise sets `isSwitching` while the import is in flight. It never reloads
  or navigates.
- If a chunk fails to load, the currently rendered locale stays put rather than
  rendering untranslated keys.

## Using Translations in Components

```tsx
"use client"

import { useI18n } from "@/components/providers/i18n-provider"

export function Example() {
  const { t, locale, changeLanguage, isSwitching } = useI18n()
  return <h1>{t("product.hero.titleLine1")}</h1>
}
```

`useI18n()` exposes:

| Member | Behaviour |
| --- | --- |
| `locale` | Currently rendered `Locale` |
| `t(key, values?)` | Resolve a dot-separated key, then interpolate `{token}` values |
| `translate(value)` | Translate an API/Platform-Console sentence (see below) |
| `changeLanguage(next)` | Switch locale; instant when cached |
| `isSwitching` | `true` only while an uncached locale chunk is loading |

Fallback chain inside `t()`: active locale → default locale (`my`) → the key
itself. A missing translation is therefore visible as a key, never blank.

> **`useI18n()` is a client hook.** Calling it from a Server Component fails at
> runtime only when that branch renders. `npm run i18n:check` catches it at
> build time by requiring a `"use client"` directive in any file that calls it.

### Interpolating

```tsx
t("footer.copyright", { year: 2026 })
t("product.alt.logoTemplate", { brand: "Facebook" })
```

Unknown tokens are left untouched so a missing value is visible rather than
silently blanked.

### Copy that has no key (plan names, prices, CTA labels)

API and Platform-Console strings arrive as finished English sentences. Use
`translate()` instead of `t()`:

```tsx
const { translate } = useI18n()
<span>{translate(plan.name)}</span>
<span>{translate(plan.monthlyPriceDisplay)}</span>
```

Under the hood `translate()` matches the sentence against a reverse index built
from `en.json` (`buildEnglishIndex`), then resolves the recovered key in the
active locale. Two generated suffixes are matched structurally so an admin who
edits a price still gets a translated unit:

| English suffix | Key |
| --- | --- |
| `/ month` | `pricing.plan.perMonth` |
| ` one-time` | `pricing.plan.oneTimeSuffix` |

Anything that does not match is returned unchanged, so a freshly edited plan
renders its English copy instead of a key name.

## Fonts and Typography

Geist is Latin-only. For Myanmar pages, Burmese glyphs are served from two
self-hosted Pyidaungsu weights in `public/fonts/` rather than relying on OS fonts:

```css
[data-locale="my"] {
  /* Latin still stops at Geist; only Myanmar glyphs reach Pyidaungsu. */
  --font-sans: var(--font-geist-sans), "Pyidaungsu", "Noto Sans Myanmar", Padauk, ...
}
```

- `pyidaungsu-regular.ttf` is weight `400 600`; `pyidaungsu-bold.ttf` is a true
  Pyidaungsu 2.5.3 Bold at weight `700 900`. Declaring ranges (instead of
  `400` / `700`) makes `500/600` and `800/900` resolve deterministically to a
  real file rather than the browser synthesising a wrong face.
- English text keeps Geist; the `data-locale="my"` scope means the TTFs are
  only fetched for Myanmar visitors. The bold face is a true Pyidaungsu Bold —
  not "Pyidaungsu Book", which is a different typeface and produced visibly
  mismatched bold copy when paired with the regular weight.
- A `--myanmar-line-height: 1.6` floor and `overflow-wrap: break-word` are
  applied globally to `[data-locale="my"]`, because Burmese is wider than
  English and wraps without spaces; `break-word` is a last-resort wrap and does
  not alter min-content sizing the way `anywhere` would.

English text keeps Geist unchanged.

## Integrity Gate

```bash
npm run i18n:check   # from dashboards/workspace
```

`i18n_translation/check-keys.mjs` fails the build when:

1. `en.json` and `my.json` do not expose the identical key structure (missing
   or extra keys in either direction).
2. Any value in `my.json` is empty or whitespace-only.
3. Any value in `my.json` is not NFC-normalised Unicode. Myanmar is a
   mark-sequence script; a reversed mark pair (`U+103A U+1037`) is a distinct,
   wrong codepoint sequence even though it renders almost identically, so it is
   rejected here rather than in review. This gate now catches what code review
   missed on `92c6976` (`signIn.metaTitle`).
4. A static `t("some.key")` call site uses a key that does not exist in
   `en.json`.
5. A file calls `useI18n()` without a `"use client"` directive.

It scans `app`, `components`, `lib`, and `hooks` (`.ts` / `.tsx`).

**Known limitation:** only literal `t("...")` call sites are scanned. Keys held
in data arrays and passed as variables (`t(labelKey)`), and keys built from
template strings, are not statically verified — those keys must be added to
both catalogs by hand and verified manually. A leading `!` in a key opts it out
of the scan.

## Tests

Marketing copy assertions are English-specific, and the default locale is
Myanmar, so tests opt in explicitly:

```ts
const LOCALE_KEY = "zayos-language"

await page.context().addCookies([
  { name: LOCALE_KEY, value: "en", url: baseURL },
])
```

See `useEnglish()` in `tests/e2e/app-boundaries.spec.ts`.

The Myanmar layout guard lives in `tests/e2e/myanmar-layout.spec.ts`. It runs
against the six public routes and asserts no Burmese text is clipped, both
Pyidaungsu weight ranges report `loaded`, and no Burmese-bearing element
resolves to a fallback font. Because a grid/flex track cannot shrink below its
min-content size, Burmese strings overflow their `fr` columns silently when
truncated or unsized — `minmax(0, …)` tracks plus `min-w-0` children are the
fix, so the guard fails if those are removed.

For authenticated workspace routes, seed a session and stub the app's own
proxy rather than the core API, because that is what the browser actually
calls:

```ts
await context.route("**/api/proxy/**", handler)
await context.addInitScript(({ key, session }) =>
  window.localStorage.setItem(key, JSON.stringify(session)),
  { key: "kme-auth-session", session })
```

Stub `usage-summary` as a `TenantUsageSummaryDto` (with `effectiveLimits` +
`inboundMessages`) and `subscription/periods` as
`TenantSubscriptionPeriodsResponseDto` (with `entitlement.quotaState`); the
sidebar warning banner reads them and will 500 the shell otherwise.

## Working on Translations

**Adding a string**

1. Add the key to `i18n_translation/en.json`.
2. Add the same key to `i18n_translation/my.json` with a real translation (an
   empty value fails the gate).
3. Use `t("section.key")` from a client component, or `translate()` for
   API-authored sentences.
4. Run `npm run i18n:check`.

**Adding a locale**

1. Append it to `LOCALES` and `LOCALE_LABELS` in `i18n_translation/translation.ts`.
2. Add a loader entry in `translationLoaders`.
3. Create `i18n_translation/<locale>.json` mirroring `en.json`.
4. Update the hardcoded `stored === "my" || stored === "en"` check in the
   pre-hydration script in `app/layout.tsx`.
5. Append the locale's fonts to `--font-sans` in `app/globals.css` if the
   script needs them.
6. Run `npm run i18n:check`, then typecheck, lint, and build.

## Verification Commands

Run from `dashboards/workspace`:

```bash
npm run i18n:check
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm run build
```

From the repository root the same gates are available as
`npm run ci:typecheck`, `npm run ci:lint`, and `npm run ci:build`.
