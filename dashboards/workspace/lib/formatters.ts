"use client"

import { useMemo } from "react"
import { useI18n } from "@/components/providers/i18n-provider"

/**
 * Locale-aware currency/number/date formatting for the workspace app.
 *
 * Single source of truth so every report page formats the same way. Two
 * deliberate decisions the old per-file copies got wrong:
 *
 * - Latin digits (`-u-nu-latn`). For `my`, `Intl` defaults to Myanmar digits
 *   (၀၁၂), which clash with the Latin digits the rest of the product (and
 *   invoice numbers, order numbers, phone numbers) uses.
 * - Asia/Yangon timezone. The settings default for `timezone`, so a timestamp
 *   does not shift with the viewer's machine.
 */

export const WORKSPACE_TIME_ZONE = "Asia/Yangon"

/** A `my` value here still renders Latin digits for numbers/currency. */
export function localeWithLatinDigits(locale: string): string {
  return locale === "en" ? "en-US" : `${locale}-u-nu-latn`
}

export function formatCurrencyValue(
  value: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(localeWithLatinDigits(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatShortNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

/** Formats an ISO timestamp (or Date) in the workspace timezone. */
export function formatDateTimeValue(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(localeWithLatinDigits(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: WORKSPACE_TIME_ZONE,
  }).format(typeof value === "string" ? new Date(value) : value)
}

/** Formats a calendar date (no clock) in the workspace timezone. */
export function formatDateValue(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(localeWithLatinDigits(locale), {
    dateStyle: "medium",
    timeZone: WORKSPACE_TIME_ZONE,
  }).format(typeof value === "string" ? new Date(value) : value)
}

/** Hook: returns the shared formatters bound to the active locale. */
export function useFormatters() {
  const { locale } = useI18n()
  return useMemo(
    () => ({
      currency: (value: number, currency = "MMK") => formatCurrencyValue(value, currency, locale),
      shortNumber: formatShortNumber,
      dateTime: (value: string | Date) => formatDateTimeValue(value, locale),
      date: (value: string | Date) => formatDateValue(value, locale),
    }),
    [locale],
  )
}
