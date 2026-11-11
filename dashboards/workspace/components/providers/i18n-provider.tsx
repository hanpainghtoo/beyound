"use client"

import * as React from "react"

import {
  DEFAULT_LOCALE,
  LOCALE_HTML_ATTRIBUTE,
  LOCALE_STORAGE_KEY,
  buildEnglishIndex,
  interpolate,
  isLocale,
  loadTranslations,
  peekTranslations,
  resolveKey,
  translateDynamicValue,
  type EnglishIndex,
  type Locale,
  type TranslationResource,
} from "@/i18n_translation/translation"

type TranslateValues = Record<string, string | number>

type I18nContextValue = {
  /** Currently rendered locale. */
  locale: Locale
  /** Look up a dot-separated key, with optional `{token}` interpolation. */
  t: (key: string, values?: TranslateValues) => string
  /**
   * Translate a value that arrived from outside the catalog - a plan name or
   * CTA label configured in the Platform Console. Returns the input unchanged
   * when it is not in `en.json`, so nothing ever renders as a key or blank.
   */
  translate: (value: string) => string
  /** Switch language. Synchronous when the resource is already cached. */
  changeLanguage: (next: Locale) => void
  /** True only while an uncached locale chunk is in flight. */
  isSwitching: boolean
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

/** Mirrors the preference into localStorage and a readable cookie. */
function persistLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* storage can be unavailable in private mode; cookie still applies */
  }
  try {
    // Not httpOnly: the value is a non-sensitive UI preference and the
    // pre-hydration script reads it. Max-age mirrors the theme convention.
    document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  } catch {
    /* ignore */
  }
}

function applyDocumentLocale(locale: Locale) {
  const root = document.documentElement
  root.setAttribute("lang", locale)
  root.setAttribute(LOCALE_HTML_ATTRIBUTE, locale)
}

export function I18nProvider({
  children,
  initialLocale,
  initialResource,
  initialSourceResource,
}: {
  children: React.ReactNode
  /** Locale resolved on the server, so the first client render matches the HTML. */
  initialLocale: Locale
  /** That locale's resource, awaited on the server before rendering. */
  initialResource: TranslationResource
  /**
   * The English catalog, also awaited on the server. It is the source every
   * API-authored sentence is written in, and it is what the reverse index is
   * built from, so hydration sees the same translations as the HTML.
   */
  initialSourceResource?: TranslationResource
}) {
  const [locale, setLocale] = React.useState<Locale>(initialLocale)
  const [resource, setResource] = React.useState<TranslationResource>(initialResource)
  const [isSwitching, setIsSwitching] = React.useState(false)

  const sourceIndex = React.useMemo<EnglishIndex | undefined>(
    () => (initialSourceResource ? buildEnglishIndex(initialSourceResource) : undefined),
    [initialSourceResource],
  )

  const changeLanguage = React.useCallback(
    (next: Locale) => {
      const target = isLocale(next) ? next : DEFAULT_LOCALE
      persistLocale(target)
      applyDocumentLocale(target)

      const cached = peekTranslations(target)
      if (cached) {
        // Already loaded: update in this tick, so the switch feels instant.
        // Marked as a transition because changing locale re-renders every
        // string on the page at once - without it React does that work in one
        // uninterruptible task (measured 190ms in prod, up to 615ms in dev)
        // and the screen reads as frozen. As a transition React yields between
        // renders, so input and paint stay live while the new text streams in.
        React.startTransition(() => {
          setLocale(target)
          setResource(cached)
        })
        return
      }

      setIsSwitching(true)
      loadTranslations(target)
        .then((loaded) => {
          React.startTransition(() => {
            setLocale(target)
            setResource(loaded)
          })
        })
        .catch(() => {
          /* keep the current locale rather than rendering untranslated text */
        })
        .finally(() => setIsSwitching(false))
    },
    [],
  )

  // Reconcile exactly once, right after mount, with the preference the inline
  // pre-hydration script resolved. When the server cookie was absent or stale
  // that script copies localStorage onto <html data-locale> while the markup is
  // still in the server's locale, so the two disagree and the stored choice has
  // to be adopted here. When the cookie was present - the normal case - this is
  // a no-op.
  //
  // It must NOT re-run on later `locale` changes. The old version compared
  // against `initialLocale` on every change, so it fought the user: once the
  // server locale's catalog sat in the cache it snapshotted back to it. Hovering
  // the EN button caches EN via preloadTranslations, which is why clicking MY
  // appeared broken and reverted to English. Declared before the effect that
  // writes <html lang>, so the script's value is still readable here.
  const hasReconciled = React.useRef(false)
  React.useEffect(() => {
    if (hasReconciled.current) return
    hasReconciled.current = true
    const resolved = document.documentElement.getAttribute(LOCALE_HTML_ATTRIBUTE)
    if (isLocale(resolved) && resolved !== initialLocale) {
      changeLanguage(resolved)
    }
  }, [initialLocale, changeLanguage])

  // Keep <html lang> authoritative for assistive tech and CSS.
  React.useEffect(() => {
    applyDocumentLocale(locale)
  }, [locale])

  const t = React.useCallback(
    (key: string, values?: TranslateValues) => {
      // Current locale first, then the default locale, then the key itself so a
      // missing translation is obvious instead of rendering blank.
      const resolved =
        resolveKey(resource, key) ??
        resolveKey(peekTranslations(DEFAULT_LOCALE), key) ??
        key
      return interpolate(resolved, values)
    },
    [resource],
  )

  const translate = React.useCallback(
    (value: string) => translateDynamicValue(value, resource, sourceIndex),
    [resource, sourceIndex],
  )

  const value = React.useMemo<I18nContextValue>(
    () => ({ locale, t, translate, changeLanguage, isSwitching }),
    [locale, t, translate, changeLanguage, isSwitching],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider")
  }
  return context
}
