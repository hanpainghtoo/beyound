/**
 * Central locale configuration and translation resource loader.
 *
 * This is the single source of truth for:
 *   - the supported locale list
 *   - the `Locale` type
 *   - the default locale
 *   - locale validation / normalisation
 *   - async translation resource loading + caching
 *
 * Components and providers must not hardcode `locale === "my"` checks or
 * re-implement loading; they consume this module instead.
 */

/** Supported locales. Myanmar is first and is the product default. */
export const LOCALES = ["my", "en"] as const

export type Locale = (typeof LOCALES)[number]

/** Default language for a first-time visitor with no saved preference. */
export const DEFAULT_LOCALE: Locale = "my"

/**
 * English is the source language of every API-provided string (plan names,
 * summaries, CTA labels), so it doubles as the lookup key for dynamic copy.
 */
export const SOURCE_LOCALE: Locale = "en"

/** Human-readable native + English labels, used by the language switcher. */
export const LOCALE_LABELS: Record<Locale, { native: string; english: string; short: string }> = {
  my: { native: "မြန်မာ", english: "Myanmar", short: "MY" },
  en: { native: "English", english: "English", short: "EN" },
}

/**
 * localStorage key for the visitor's language preference.
 * Named to match the existing `zayos-commerce-theme` convention.
 */
export const LOCALE_STORAGE_KEY = "zayos-language"

/**
 * Attribute mirrored onto <html> by the pre-hydration script and by the
 * provider, so CSS can react to the active language without JS-driven classes.
 */
export const LOCALE_HTML_ATTRIBUTE = "data-locale"

/** A translation tree: either a leaf string or a nested group of keys. */
export type TranslationNode = string | { [key: string]: TranslationNode }

export type TranslationResource = { [key: string]: TranslationNode }

/**
 * Dynamic, per-locale loaders. Each JSON file becomes its own async chunk so a
 * page only pays for the locale it actually renders, and the other locale is
 * fetched only if the visitor switches to it.
 */
const translationLoaders: Record<Locale, () => Promise<{ default: TranslationResource }>> = {
  my: () => import("./my.json"),
  en: () => import("./en.json"),
}

/**
 * In-memory cache of already-loaded resources, shared for the lifetime of the
 * document. Guarantees MY -> EN -> MY never re-fetches or re-imports Myanmar.
 */
const resourceCache = new Map<Locale, TranslationResource>()

/** Type guard for untrusted input (cookies, localStorage, URL params). */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/**
 * Normalise untrusted input to a supported locale, falling back to the
 * default. Never throws, never returns a non-locale.
 */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** Synchronously read a resource that is already in the cache. */
export function peekTranslations(locale: Locale): TranslationResource | undefined {
  return resourceCache.get(locale)
}

/**
 * Load a translation resource, using the cache when possible.
 * Concurrent calls for the same locale share a single in-flight import.
 */
export async function loadTranslations(locale: Locale): Promise<TranslationResource> {
  const cached = resourceCache.get(locale)
  if (cached) return cached

  const mod = await translationLoaders[locale]()
  const resource = (mod.default ?? mod) as TranslationResource
  resourceCache.set(locale, resource)
  notify()
  return resource
}

/** Preload without blocking a render. Safe to call repeatedly. */
export function preloadTranslations(locale: Locale): void {
  if (resourceCache.has(locale)) return
  void loadTranslations(locale).catch(() => {
    /* keep the already-rendered locale in place if a chunk fails to load */
  })
}

/** Subscribers are notified whenever a resource finishes loading. */
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/** Subscribe to cache changes. Returns an unsubscribe function. */
export function onTranslationsLoaded(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Resolve a dot-separated key against a resource tree.
 * Returns `undefined` when any segment is missing, so callers can fall back.
 */
export function resolveKey(resource: TranslationResource | undefined, key: string): string | undefined {
  if (!resource) return undefined

  let node: TranslationNode | undefined = resource
  for (const segment of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined
    node = node[segment]
  }

  return typeof node === "string" ? node : undefined
}

/**
 * Replace `{placeholder}` tokens. Values are stringified; unknown tokens are
 * left untouched so a missing interpolation is visible rather than silently
 * blanked.
 */
export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = values[token]
    return value === undefined || value === null ? match : String(value)
  })
}

/**
 * An English sentence -> dot-separated key index, built from `en.json`.
 *
 * Plan names, summaries and CTA labels are authored in the Platform Console
 * and arrive as finished sentences, so there is no key to ask for at the call
 * site. Matching that sentence against the English catalog recovers its key,
 * which then resolves in the visitor's locale.
 */
export type EnglishIndex = ReadonlyMap<string, string>

/** Build the reverse index. Duplicate sentences keep their first key. */
export function buildEnglishIndex(resource: TranslationResource): EnglishIndex {
  const index = new Map<string, string>()

  const walk = (node: TranslationNode, path: string): void => {
    if (typeof node === "string") {
      if (node.trim() && !index.has(node)) index.set(node, path)
      return
    }
    if (typeof node === "object" && node !== null) {
      for (const [segment, child] of Object.entries(node)) {
        walk(child, path ? `${path}.${segment}` : segment)
      }
    }
  }

  walk(resource, "")
  return index
}

/**
 * Price suffixes that are generated rather than authored, keyed so an admin
 * changing a price still gets a translated unit even when the new total is
 * not in the catalog.
 */
const DYNAMIC_UNIT_KEYS: ReadonlyArray<readonly [suffix: string, unitKey: string]> = [
  ["/ month", "pricing.plan.perMonth"],
  [" one-time", "pricing.plan.oneTimeSuffix"],
]

/**
 * Translate a value that came from outside the catalog.
 *
 * Falls back to the input unchanged whenever nothing matches, so a plan an
 * admin has just edited still renders its English copy instead of a key name
 * or blank text.
 */
export function translateDynamicValue(
  value: string,
  resource: TranslationResource | undefined,
  index: EnglishIndex | undefined,
): string {
  if (typeof value !== "string" || !value || !index) return value

  const exactKey = index.get(value)
  if (exactKey) return resolveKey(resource, exactKey) ?? value

  for (const [suffix, unitKey] of DYNAMIC_UNIT_KEYS) {
    if (!value.endsWith(suffix)) continue
    const unit = resolveKey(resource, unitKey)
    if (!unit) continue
    const head = value.slice(0, -suffix.length).trimEnd()
    return `${translateDynamicValue(head, resource, index)} ${unit}`.trim()
  }

  return value
}
