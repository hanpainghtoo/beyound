# Myanmar Layout and Font Review

**System:** ZayOS / KME Omnichannel — `dashboards/workspace`
**Review date:** 2026-10-02
**Branch:** `feat/translation`
**Reviewed range:** `7944e76..92c6976` (4 commits pulled from `origin/feat/translation`)
**Method:** source review plus direct inspection of the shipped font binaries and the
Myanmar catalogs
**Decision:** 3 of 4 commits are sound; **1 commit (`92c6976`) is a suspected
regression** and needs revert or native-speaker confirmation

## Executive summary

The four pulled commits are follow-up fixes to the Myanmar localization work, and
three of them correctly address one root cause: **Burmese is written without spaces
between words, and every localized string runs far wider than the English it
replaced.** Combined with the CSS rule that a grid item's automatic minimum size
is its min-content width, a bare `fr` track cannot shrink below its content — so the
track pushes wider than its parent and an ancestor's `overflow-hidden` silently
clips the text. The documented failure was the sign-in card, whose tracks measured
349px + 375px inside a 566px card, cutting the form off entirely.

The commits address it at four layers: font correctness (`457fde4`), layout
correctness (`923fa4c`), automated regression cover (`e1d941d`), and a translation
edit (`92c6976`).

`92c6976` does not fit that pattern. It changes a single Burmese character pair in
`signIn.metaTitle`, and the resulting string is now the **only** non-canonical
sequence in a 1,517-value catalog, out of step with the four other identical
"Sign in" labels in the same file. Evidence is in
[Finding 4](#finding-492c6976--sign-in-meta-title-suspected-regression).

Separately, `docs/localization-configuration.md` is now **stale**: its
*Fonts and Typography* section still describes the pre-Pyidaungsu behaviour
(see [Documentation drift](#documentation-drift)).

## Scope and method

- Read the full diff for `7944e76..92c6976` (9 files, +209/-20, incl. one binary).
- Parsed the `name` and `OS/2` tables of both shipped TTFs directly to confirm the
  font-family claim rather than trusting the commit message.
- Compared the `signIn.metaTitle` value against every other occurrence of the same
  label, and against Unicode canonical-ordering rules for the two marks involved.
- Cross-checked that the code comments describing prior CSS behaviour match the
  actual component source (`Button` base classes, `cn()` merge strategy).

## The four commits

| Commit | Subject | Assessment |
|---|---|---|
| `457fde4` | Pair Pyidaungsu regular and bold from one family | Sound |
| `923fa4c` | Stop Burmese text overflowing its grid tracks | Sound |
| `e1d941d` | Myanmar layout regression guard | Sound |
| `92c6976` | Correct sign in meta title | **Suspected regression** |

---

## Finding 1 — `457fde4` font pairing

**Defect.** The shipped `pyidaungsu-bold.ttf` was not Pyidaungsu Bold. It was
**"Pyidaungsu Book"**, a separate typeface whose glyphs are visibly unrelated to the
regular. Both files were declared under the single CSS family `"Pyidaungsu"`, so
every bold Burmese string rendered in a different typeface from the body copy
immediately beside it.

**Fix.** The binary was replaced (264,592 → 234,480 bytes) and weight resolution was
made deterministic (`app/globals.css:22-36`):

```css
@font-face { font-family: "Pyidaungsu"; src: url("/fonts/pyidaungsu-regular.ttf") format("truetype"); font-weight: 400 600; font-display: swap; }
@font-face { font-family: "Pyidaungsu"; src: url("/fonts/pyidaungsu-bold.ttf")    format("truetype"); font-weight: 700 900; font-display: swap; }
```

**Verification.** Metadata read directly from the shipped binaries:

| File | Family | Subfamily | `usWeightClass` | `fsSelection` |
|---|---|---|---|---|
| `pyidaungsu-regular.ttf` | Pyidaungsu | Regular | 400 | `0x40` (regular) |
| `pyidaungsu-bold.ttf` | Pyidaungsu | **Bold** | 700 | `0x20` (bold bit) |

Same family, same version (2.053). The claim holds.

The **weight ranges** are the load-bearing part, not cosmetic. Pyidaungsu ships only
two weights, so declaring `400 600` and `700 900` pins every request to a real file
instead of letting the browser synthesise a faux-bold from the wrong face. A
comment at `globals.css:8-21` warns against substituting "Pyidaungsu Book" again.

---

## Finding 2 — `923fa4c` layout overflow

Four distinct classes of fix, all downstream of the min-content sizing rule.

### 2a. Shrinkable grid tracks — `app/login/login-client.tsx`

```diff
-<div className="grid lg:grid-cols-[0.95fr_1.05fr]">
+<div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
```

`minmax(0, …)` lifts the track floor off min-content so the columns can shrink and
wrap. `min-w-0` was also added to the `<aside>` and the form column, because
`min-w-0` is what lets the *children* inside those tracks shrink too.

### 2b. Multi-line CTA — same file

```diff
-<Button className="h-11 w-full rounded-xl … ">
+<Button className="min-h-11 w-full whitespace-normal py-2.5 text-center text-base leading-6 rounded-xl … ">
```

- `whitespace-normal` overrides the `Button` base's `whitespace-nowrap`.
- `min-h-11` + `py-2.5` replaces the fixed `h-11`, which clipped the second line
  inside the pill.
- The label is wrapped in `<span className="min-w-0">` and the arrow gets
  `shrink-0`, so only the text wraps, never the icon.

**Verified this override actually takes effect.** `Button`'s base
(`components/ui/button.tsx:8`) does set `whitespace-nowrap`, so the fix depends on
cascade order. It works because `cn()` is `twMerge(clsx(...))`
(`lib/utils.ts:2-5`), so the later `whitespace-normal` wins on conflict resolution
rather than on stylesheet order.

### 2c. Locale-scoped last-resort wrap — `app/globals.css:509-511`

```css
[data-locale="my"] { overflow-wrap: break-word; }
```

`break-word` rather than `anywhere` is deliberate: `anywhere` *also* changes
min-content sizing, which is the very thing that collapses every track to zero
before wrapping is considered. `break-word` activates only once a word genuinely
cannot fit, so ordinary Burmese wrapping is untouched. It is deliberately unlayered
so it beats Tailwind's `@layer theme`.

### 2d. Removal of silent truncation

`truncate` / `whitespace-nowrap` were silently eating Burmese text in three
places, because the strings are short in English but wide in Burmese:

| File | Change | Measured case |
|---|---|---|
| `app/pricing/pricing-cards.tsx` | dropped `truncate` from 5 stat values, `whitespace-nowrap` from the channels line | `အကန့်အသတ်မရှိ` — 94px in a 69px column |
| `components/marketing-landing-figma.tsx` | ticker detail `truncate` → `line-clamp-2` | ~207px in a 168px chip |
| `components/product-page-client.tsx` | identical `TickerItem`, same change | identical |
| `components/product-workspace-hero.tsx` | dropped `truncate` from module title and detail | ~207px in a 160px column |

`line-clamp-2` is preferred over plain wrapping in the ticker because the pill is a
fixed-width chip whose `min-h` already accommodates two lines.

---

## Finding 3 — `e1d941d` regression guard

New file: `tests/e2e/myanmar-layout.spec.ts` (130 lines). Auto-discovered —
`playwright.config.ts` sets `testDir: "./tests/e2e"`, `workers: 1`, Chromium,
base URL `http://127.0.0.1:6110`.

The specs set the `zayos-language=my` cookie, wait for `document.fonts.ready`, then:

1. **Clipping scan** across `/`, `/login`, `/pricing`, `/product`, `/trial`,
   `/forgot-password`. Walks `body *`, keeps only elements holding a *direct*
   Myanmar text node (`[\u1000-\u109f]`), and flags `scrollWidth > clientWidth`
   with a 2px subpixel tolerance. It separates two failure modes:
   `overflow-x != visible` means glyphs are genuinely **lost**; `overflow: visible`
   means text paints outside its box (broken but readable). A `DECORATIVE`
   allowlist skips intentional bleed (`min-h-screen`, `group relative`,
   `animate-marquee`).
2. **Font pairing** — asserts `document.fonts` reports exactly `["400 600",
   "700 900"]`, all `loaded`, guarding against a mismatched bold reappearing.
3. **No fallback font** — every Burmese-bearing element's computed `fontFamily`
   must contain `Pyidaungsu`, so glyphs cannot silently fall through to whatever
   the OS happens to have.

The scoping is deliberate and well-argued in the file header: the same overflow on
`en` is a different bug with a different cause, so the guard does not fire on it.

---

## Finding 4 — `92c6976` sign in meta title (suspected regression)

**High confidence this is a mistake, not a fix.**

The commit changes one line in `i18n_translation/my.json`, swapping two adjacent
Burmese marks. It is visually identical in a diff and had to be caught by
comparing codepoints:

```
old: … 1004 **1037 103A** 101D …
new: … 1004 **103A 1037** 101D …

U+1037 MYANMAR SIGN DOT BELOW   category Mn   combining class 7
U+103A MYANMAR SIGN ASAT        category Mn   combining class 9
```

Four independent signals say the new order is wrong:

1. **It desynchronises from the identical label elsewhere.** The *old* value was
   byte-identical to the canonical "Sign in" string, which appears in four other
   places in the same catalog: `navigation.signIn`, `footer.signIn`,
   `signIn.panelTitle`, and `meta.login.title`. After this commit,
   `signIn.metaTitle` is the only one that differs.

   | Key | Value | Order |
   |---|---|---|
   | `navigation.signIn` | အကောင့်ဝင်ရန် | `1037 103A` (canonical) |
   | `footer.signIn` | အကောင့်ဝင်ရန် | `1037 103A` (canonical) |
   | `signIn.panelTitle` | အကောင့်ဝင်ရန် | `1037 103A` (canonical) |
   | `meta.login.title` | အကောင့်ဝင်ရန် | `1037 103A` (canonical) |
   | `signIn.metaTitle` (before) | အကောင့်ဝင်ရန် | `1037 103A` (canonical) |
   | `signIn.metaTitle` (**after**) | အကောင့်ဝင်ရန် | **`103A 1037`** ← outlier |

2. **It contradicts the file-wide convention.** 271 strings use
   base + `U+1037` + `U+103A`, with bases `င` (U+1004, 298×), `ည` (U+100A, 87×),
   and `န` (U+1014, 32×) — the standard Burmese asat cluster after those
   consonants. After this commit the catalog holds **exactly 1** reversed
   occurrence.

3. **It is not NFC-normalised.** Canonical ordering sorts combining marks by
   combining class ascending, so `1037` (7) before `103A` (9) is the canonical
   sequence. The old string was NFC; the new one is not.

4. **No gate would catch it.** `i18n_translation/check-keys.mjs` validates key
   structure, empty values, literal call sites, and the `"use client"` directive.
   It performs **no Unicode normalization check** (verified: no `normalize`,
   `NFC`, or codepoint handling in the file). The value is non-empty and the key
   exists, so `npm run i18n:check` passes.

### Recommendation

Revert the single hunk, restoring byte-identity with the other four "Sign in"
labels. Because the correctness question is one of Burmese orthography rather than
mechanical encoding, confirm with a native speaker first — but note that the
mechanical evidence above points clearly at revert, not at keeping the change.

Optionally, close the class of bug by having `check-keys.mjs` assert that every
`my.json` value equals its NFC form. That would fail loudly on any future
non-canonical sequence instead of letting it reach a `<title>` tag.

---

## Documentation drift

`docs/localization-configuration.md` § *Fonts and Typography* (line 151) is now
wrong on two counts. It still states:

> Geist is Latin-only. `app/globals.css` appends Myanmar-capable system fonts as a
> fallback so Burmese glyphs render **without a font download**

Reality after `457fde4` and the surrounding branch work:

- Burmese is served from **self-hosted TTFs** (`/fonts/pyidaungsu-*.ttf`), so
  there *is* a font download.
- The stack is **scoped to `[data-locale="my"]`**, not global — English keeps
  Geist and never requests the files. The doc's "English keeps Geist unchanged"
  is right, but for the wrong stated reason.
- Weights are declared as ranges `400 600` / `700 900`; the doc lists none.
- Undocumented in that section: the `--myanmar-line-height: 1.6` floor
  (`globals.css:456`) applied with `!important` through three selectors
  (`globals.css:479-493`), the `overflow-wrap: break-word` rule
  (`globals.css:509-511`), and the header type-scale trims
  (`globals.css:526+`).
- § *Tests* (line 186) documents only the `useEnglish()` cookie helper. The new
  spec introduces the `useMyanmar()` counterpart.

---

## Recommendations

| # | Action | Owner suggestion |
|---|---|---|
| 1 | Revert `signIn.metaTitle` to the canonical `1037 103A` order | Localization owner |
| 2 | Confirm the intended wording with a native speaker | Localization owner |
| 3 | Update `docs/localization-configuration.md` § Fonts and Typography and § Tests | Docs owner |
| 4 | Add an NFC assertion to `check-keys.mjs` | Tooling owner |
| 5 | Keep `457fde4`–`e1d941d` as-is | — |

## Reproducing this review

```bash
git fetch origin
git diff 7944e76..92c6976
```

Confirm the font-pairing claim by reading the `name` and `OS/2` tables of both
shipped binaries:

```bash
cd dashboards/workspace/public/fonts
python3 - <<'PY'
import struct
for f in ("regular", "bold"):
    d = open(f"pyidaungsu-{f}.ttf", "rb").read()
    n = struct.unpack(">H", d[4:6])[0]
    tabs, off = {}, 12
    for _ in range(n):
        tag = d[off:off+4].decode("latin1")
        o, l = struct.unpack(">II", d[off+8:off+16])
        tabs[tag] = (o, l)
        off += 16
    o, _ = tabs["name"]
    cnt, so = struct.unpack(">HH", d[o+2:o+6])
    for i in range(cnt):
        pid, _, _, nid, ln, off2 = struct.unpack(">HHHHHH", d[o+6+i*12:o+18+i*12])
        if pid == 3 and nid in (1, 2):
            print(f, {1: "Family", 2: "Subfamily"}[nid],
                  d[o+so+off2:o+so+off2+ln].decode("utf-16-be"))
    o, _ = tabs["OS/2"]
    print(f, "usWeightClass", struct.unpack(">H", d[o+4:o+6])[0],
          "fsSelection", hex(struct.unpack(">H", d[o+62:o+64])[0]))
PY
```

Expected output: both files report `Family` = `Pyidaungsu`, with
`Subfamily` = `Regular` / `Bold` and `usWeightClass` = `400` / `700`.

Confirm the Finding 4 ordering outlier by diffing codepoints against the canonical
label:

```bash
python3 - <<'PY'
import json, unicodedata as u
d = json.load(open("dashboards/workspace/i18n_translation/my.json"))
a, b = d["signIn"]["metaTitle"], d["navigation"]["signIn"]
print("metaTitle  ", " ".join(f"{ord(c):04X}" for c in a), "| NFC:", a == u.normalize("NFC", a))
print("navigation ", " ".join(f"{ord(c):04X}" for c in b), "| NFC:", b == u.normalize("NFC", b))
print("identical  ", a == b)
PY
```

Expected output at the time of this review: `identical False`, and
`metaTitle` reporting `NFC: False`.

Run the guard from `dashboards/workspace` (needs a built app on `:6110`, or set
`CSR_DASHBOARD_URL`):

```bash
npm run build && npm run start -- --port 6110   # separate shell
npx playwright test tests/e2e/myanmar-layout.spec.ts
```

## Related documentation

- `docs/localization-configuration.md` — locale resolution, catalog conventions,
  integrity gate (currently stale, see above)
- `tests/e2e/myanmar-layout.spec.ts` — the guard this review assesses
- `app/globals.css` — the `[data-locale="my"]` typography system