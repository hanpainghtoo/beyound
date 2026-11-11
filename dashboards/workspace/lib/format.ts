/**
 * Shared display formatters.
 *
 * These were duplicated per page with subtly different behaviour, which is
 * worse than duplication on its own: `formatCurrency` in the orders page uses
 * `Intl.NumberFormat` with a currency style, while the inbox and reports build
 * `"MMK 450,000"` by concatenation, and the two `formatDateTime` helpers pass
 * different `toLocaleString` options. Merging them under one name would have
 * silently changed what those pages render.
 *
 * So each distinct *behaviour* gets its own named export rather than one
 * canonical version pretending the variants do not exist. If two call sites
 * should look the same, that is a product decision and belongs in a change that
 * says so — not in a refactor that only claims to move code.
 */

/** "3 Oct, 14:30" — short, no year. Used by the inbox queue and threads. */
export function formatDateTimeShort(value?: string | null): string {
  if (!value) return "Unknown"
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Thread day-divider label — "Today" / "Yesterday" / "Mon, Oct 6" / older
 * with year. Compares local calendar days, so a thread crossing midnight
 * splits exactly where the agent perceives the day change.
 */
export function isSameLocalDay(a: string, b: string): boolean {
  const first = new Date(a)
  const second = new Date(b)
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

export function formatDayDividerLabel(value: string): string {
  const date = new Date(value)
  const now = new Date()
  const startOf = (day: Date) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.round((startOf(now) - startOf(date)) / dayMs)
  if (diffDays <= 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date)
}

/** Locale default, no explicit options. Used by the customers page. */
export function formatDateTimeLocale(value?: string | null): string {
  if (!value) return "Unknown"
  return new Date(value).toLocaleString()
}

/** "3 Oct 2026, 14:30" — includes the year, fixed to the "en" locale. */
export function formatDateTimeWithYear(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatDate(value?: string | null): string {
  if (!value) return "Unknown"
  return new Date(value).toLocaleDateString()
}

/**
 * `"MMK 450,000"` — plain concatenation.
 *
 * Deliberately not `Intl.NumberFormat`: for MMK the currency code is part of the
 * amount, and the Intl style renders it differently (and inconsistently across
 * the two call sites that already differ).
 */
export function formatCurrencyPlain(
  amount?: string | number | null,
  currency = "MMK",
): string {
  return `${currency} ${Number(amount || 0).toLocaleString()}`
}

/** Intl currency style, as the orders page renders money today. */
export function formatCurrencyIntl(amount: number | string, currency: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${amount} ${currency}`

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

/** "city, country", or "Not provided" when neither is usable. */
export function formatLocation(location?: Record<string, unknown> | null): string {
  if (!location) return "Not provided"
  const city = typeof location.city === "string" ? location.city : ""
  const country = typeof location.country === "string" ? location.country : ""
  return [city, country].filter(Boolean).join(", ") || "Not provided"
}

/** First letters of the first two words, upper-cased. */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

/** `failed_delivery` -> `Failed Delivery`. */
export function humanize(value: string): string {
  if (value === "failed_delivery") return "Failed Delivery"
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** Minutes since an instant, or null when there is nothing to measure from. */
export function minutesAgo(value?: string | null): number | null {
  if (!value) return null
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
}

/** "Just now" / "12m waiting" / "3h 4m waiting" / "No wait signal". */
export function formatWait(value?: string | null): string {
  const minutes = minutesAgo(value)
  if (minutes === null) return "No wait signal"
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m waiting`
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60
    return `${hours}h ${remainder}m waiting`
  }
  const days = Math.floor(minutes / (24 * 60))
  if (days < 7) return `${days}d waiting`
  if (days < 30) return `${Math.floor(days / 7)}w waiting`
  if (days < 365) return `${Math.floor(days / 30)}mo waiting`
  return `${Math.floor(days / 365)}y waiting`
}

/**
 * Same bands as `formatWait` without the suffix, for the reply-aware queue
 * slot: when the agent's message is latest the customer is not waiting, so
 * the card shows how long ago we replied instead of a wait that isn't one.
 */
export function formatAgo(value?: string | null): string {
  const text = formatWait(value)
  return text.endsWith(" waiting") ? text.slice(0, -" waiting".length) : text
}

/**
 * Media duration as `m:ss`, or `h:mm:ss` past an hour.
 *
 * Non-finite or negative input renders as an em dash rather than `0:00`:
 * a player that has not read its metadata yet is in an unknown state, and
 * showing a confident zero would read as "empty recording".
 */
export function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`
}