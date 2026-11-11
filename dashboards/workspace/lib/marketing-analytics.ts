"use client"

type MarketingEventParams = Record<string, string | number | boolean | null | undefined>

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
    gtag?: (...args: unknown[]) => void
  }
}

export function trackMarketingEvent(eventName: string, params: MarketingEventParams = {}) {
  if (typeof window === "undefined") return

  const payload = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined))

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, payload)
  }

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: eventName, ...payload })
  }
}
