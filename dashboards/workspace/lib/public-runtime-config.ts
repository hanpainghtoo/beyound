export type PublicRuntimeConfig = {
  billingBankAccount?: string
  billingKbzpayNumber?: string
  billingWavepayNumber?: string
  contactEmail?: string
  metaAppId?: string
  platformConsoleUrl?: string
  socketBaseUrl?: string
  tiktokClientKey?: string
}

declare global {
  interface Window {
    __ZAYOS_PUBLIC_CONFIG__?: PublicRuntimeConfig
  }
}

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  if (typeof window === "undefined") return {}
  return window.__ZAYOS_PUBLIC_CONFIG__ || {}
}
