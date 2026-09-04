import { isServerConfigurationError, resolveCoreApiBaseUrl } from "../../shared/server-core-api-config.js"

export type PublicSubscriptionPlan = {
  id: string
  name: string
  description?: string | null
  monthlyPrice: number
  /** @deprecated Legacy field. New plans use calendar-month periods. */
  durationDays?: number | null
  /** @deprecated Legacy field. New plans always use independent limits. */
  messageQuotaMode?: "combined" | "directional" | null
  maxCsrs: number
  maxChannels: number
  /** @deprecated Legacy aggregate cap. New enforcement uses directional limits. */
  messageLimit: number | null
  /** Monthly inbound message limit. null = unlimited, 0 = blocked. */
  inboundMessageLimit: number | null
  /** Monthly outbound message limit. null = unlimited, 0 = blocked. */
  outboundMessageLimit: number | null
  allowedProviders: string[]
  apiLimit: number | null
  storageLimitGb: number
  status: string
  public?: {
    displayOrder?: number | null
    eyebrow?: string | null
    summary?: string | null
    targetCustomer?: string | null
    recommended?: boolean
    recommendationLabel?: string | null
    selfServe?: boolean
    ctaLabel?: string | null
    ctaHref?: string | null
    currencyCode?: string | null
    billingInterval?: "monthly" | "one_time" | "custom" | null
    monthlyPriceLabel?: string | null
    setupFeeMmk?: number | null
    setupFeeLabel?: string | null
    setupFeeStartsFrom?: boolean
    includedUsersLabel?: string | null
    includedChannelsLabel?: string | null
    featureList?: string[] | null
    availability?: "enabled" | "contact-only" | null
  }
}

export type DisplaySubscriptionPlan = PublicSubscriptionPlan & {
  code: string
  displayOrder: number
  eyebrow: string
  summary: string
  targetCustomer: string
  ctaLabel: string
  ctaHref: string
  recommended: boolean
  recommendationLabel: string
  selfServe: boolean
  monthlyPriceDisplay: string
  periodDurationLabel: string
  setupFeeTitle: string
  setupFeeDisplay: string
  includedUsersLabel: string
  includedChannelsLabel: string
  supportedProvidersLabel: string
  featureList: string[]
  availability: "enabled" | "contact-only"
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function listOfStrings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

const PROVIDER_LABELS: Record<string, string> = {
  messenger: "MESSENGER",
  telegram: "TELEGRAM",
  viber: "VIBER",
  tiktok: "TIKTOK",
}

export function planCodeFromName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function formatMoney(amount: number, currencyCode: string) {
  return `${currencyCode} ${amount.toLocaleString()}`
}

export function formatPlanPrice(
  monthlyPrice: number,
  options: {
    monthlyPriceLabel?: string | null
    currencyCode?: string | null
    billingInterval?: "monthly" | "one_time" | "custom" | null
    availability?: "enabled" | "contact-only" | null
  } = {},
) {
  const monthlyPriceLabel = stringOrNull(options.monthlyPriceLabel)
  if (monthlyPriceLabel) return monthlyPriceLabel

  const currencyCode = stringOrNull(options.currencyCode)
  const billingInterval = stringOrNull(options.billingInterval)
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0 || !currencyCode || !billingInterval) {
    return options.availability === "contact-only" ? "Custom proposal" : "Pricing unavailable"
  }

  if (billingInterval === "monthly") return `${formatMoney(monthlyPrice, currencyCode)} / month`
  if (billingInterval === "one_time") return `${formatMoney(monthlyPrice, currencyCode)} one-time`
  return "Custom proposal"
}

export function formatSetupFee(setupFeeMmk?: number | null, setupFeeLabel?: string | null, setupFeeStartsFrom?: boolean) {
  const amount = numberOrNull(setupFeeMmk)
  if (amount === null) return stringOrNull(setupFeeLabel) || "Pricing unavailable"
  return `${setupFeeStartsFrom ? "From " : ""}${formatMoney(amount, "MMK")}`
}

export function toDisplayPlan(plan: PublicSubscriptionPlan): DisplaySubscriptionPlan {
  const code = planCodeFromName(plan.name)
  const publicMeta = plan.public || {}
  const packageId = encodeURIComponent(plan.id)
  const availability = publicMeta.availability === "contact-only" ? "contact-only" : "enabled"
  const featureList = listOfStrings(publicMeta.featureList)
  const setupFeeTitle = stringOrNull(publicMeta.setupFeeLabel) || "Setup and onboarding"
  const setupFeeDisplay =
    numberOrNull(publicMeta.setupFeeMmk) !== null
      ? formatSetupFee(publicMeta.setupFeeMmk, null, publicMeta.setupFeeStartsFrom)
      : availability === "contact-only"
        ? "Custom proposal"
        : "Pricing unavailable"
  // All normal plans are calendar-month subscriptions. The legacy duration
  // value must not be presented as a current business choice.
  const periodDurationLabel =
    publicMeta.billingInterval === "monthly"
      ? "Monthly subscription"
      : publicMeta.billingInterval === "one_time"
        ? "One-time pilot"
        : "Custom period"

  return {
    ...plan,
    code,
    periodDurationLabel,
    displayOrder: numberOrNull(publicMeta.displayOrder) ?? 999,
    eyebrow: stringOrNull(publicMeta.eyebrow) || "Subscription plan",
    summary: stringOrNull(publicMeta.summary) || plan.description || "Managed workspace package for your commerce team.",
    targetCustomer:
      stringOrNull(publicMeta.targetCustomer) ||
      `Commerce teams that need structured operations for up to ${plan.maxCsrs.toLocaleString()} users and ${plan.maxChannels.toLocaleString()} channels.`,
    ctaLabel:
      stringOrNull(publicMeta.ctaLabel) ||
      (publicMeta.selfServe === true ? "Start workspace" : availability === "contact-only" ? "Talk to Sales" : "Request pricing"),
    ctaHref:
      stringOrNull(publicMeta.ctaHref) ||
      (publicMeta.selfServe === true
        ? `/start?planId=${packageId}`
        : `/contact?intent=sales&source=pricing&planId=${packageId}`),
    recommended: publicMeta.recommended === true,
    recommendationLabel: stringOrNull(publicMeta.recommendationLabel) || "Recommended plan",
    selfServe: publicMeta.selfServe === true,
    monthlyPriceDisplay: formatPlanPrice(plan.monthlyPrice, {
      monthlyPriceLabel: publicMeta.monthlyPriceLabel,
      currencyCode: publicMeta.currencyCode,
      billingInterval: publicMeta.billingInterval,
      availability,
    }),
    setupFeeTitle,
    setupFeeDisplay,
    includedUsersLabel:
      stringOrNull(publicMeta.includedUsersLabel) ||
      (plan.maxCsrs > 0 ? `Up to ${plan.maxCsrs.toLocaleString()} team members` : "Commercially scoped"),
    includedChannelsLabel:
      stringOrNull(publicMeta.includedChannelsLabel) ||
      (plan.maxChannels > 0 ? `Up to ${plan.maxChannels.toLocaleString()} supported channels` : "Commercially scoped"),
    supportedProvidersLabel:
      listOfStrings(plan.allowedProviders).length > 0
        ? listOfStrings(plan.allowedProviders)
            .map((provider) => PROVIDER_LABELS[provider.toLowerCase()] || provider)
            .join(" · ")
        : "Commercially scoped",
    featureList,
    availability,
  }
}

export async function fetchPublicSubscriptionPlans(): Promise<DisplaySubscriptionPlan[]> {
  let apiBaseUrl: string
  try {
    apiBaseUrl = resolveCoreApiBaseUrl(process.env)
  } catch (error) {
    if (isServerConfigurationError(error)) {
      console.error(`[workspace-public-subscription-plans] ${error.message}`)
      throw new Error("Live subscription catalog is temporarily unavailable.", { cause: error })
    }
    throw error
  }

  const response = await fetch(`${apiBaseUrl}/public/subscription-plans`, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Unable to load public subscription plans (${response.status})`)
  }

  const payload = (await response.json()) as PublicSubscriptionPlan[]
  return payload.map(toDisplayPlan).sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name))
}
