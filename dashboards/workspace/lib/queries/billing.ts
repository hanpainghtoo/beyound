import { useMemo } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import {
  tenantBillingApi,
  tenantAllowedProvidersApi,
  type TenantBillingOverviewDto,
  type TenantSubscriptionPeriodsResponseDto,
  type TenantUsageSummaryDto,
  type TenantAddOnProductDto,
  type TenantAddOnPurchaseDto,
  type SubmitTenantPaymentProofInput,
} from "@/lib/api"
import type { DisplaySubscriptionPlan, PublicSubscriptionPlan } from "@/lib/public-subscription-plans"
import { toDisplayPlan } from "@/lib/public-subscription-plans"
import { daysUntil } from "../utils"

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const billingKeys = {
  all: ["billing"] as const,
  overview: () => [...billingKeys.all, "overview"] as const,
  periods: () => [...billingKeys.all, "periods"] as const,
  usageSummary: () => [...billingKeys.all, "usageSummary"] as const,
  addOnProducts: () => [...billingKeys.all, "addOnProducts"] as const,
  addOnPurchases: () => [...billingKeys.all, "addOnPurchases"] as const,
  allowedProviders: () => [...billingKeys.all, "allowedProviders"] as const,
  billingAccounts: () => [...billingKeys.all, "billingAccounts"] as const,
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Standardised current-plan resolution used by both MyPlanTab and PackagesTab.
 * Trial entitlement is authoritative when active; otherwise falls back to
 * billing overview, then entitlement, then active period.
 */
export function resolveCurrentPlanId(
  entitlement: { periodType?: string; planId?: string; periodStatus?: string } | null | undefined,
  activePeriod: { planId?: string } | null | undefined,
  billingPlanId: string | null | undefined,
): string | null {
  const trialAuthoritative =
    entitlement?.periodType === "trial" && entitlement?.periodStatus === "active"
  if (trialAuthoritative) return entitlement?.planId || null
  return billingPlanId || entitlement?.planId || activePeriod?.planId || null
}

// ---------------------------------------------------------------------------
// Query hooks — one per data source, deliberate staleTime per source
// ---------------------------------------------------------------------------

/** Billing overview — plan details, upgrade state, legacy usage metrics. */
export function useBillingOverview() {
  return useQuery<TenantBillingOverviewDto>({
    queryKey: billingKeys.overview(),
    queryFn: () => tenantBillingApi.get(),
    staleTime: 5 * 60_000,
  })
}

/** Subscription periods — entitlement, quota state, period usage. */
export function useSubscriptionPeriods() {
  return useQuery<TenantSubscriptionPeriodsResponseDto>({
    queryKey: billingKeys.periods(),
    queryFn: () => tenantBillingApi.getPeriods(),
    staleTime: 60_000,
  })
}

/** Period-scoped usage summary — per-dimension used/limit/remaining. */
export function useQuotaSummary() {
  return useQuery<TenantUsageSummaryDto>({
    queryKey: billingKeys.usageSummary(),
    queryFn: () => tenantBillingApi.getUsageSummary(),
    staleTime: 30_000,
  })
}

/** Published add-on product catalog. */
export function useAddOnProducts() {
  return useQuery<TenantAddOnProductDto[]>({
    queryKey: billingKeys.addOnProducts(),
    queryFn: () => tenantBillingApi.listAddOnProducts(),
    staleTime: 5 * 60_000,
  })
}

/** Active/pending add-on purchases for the current tenant. */
export function useAddOnPurchases() {
  return useQuery<TenantAddOnPurchaseDto[]>({
    queryKey: billingKeys.addOnPurchases(),
    queryFn: () => tenantBillingApi.listAddOnPurchases(),
    staleTime: 60_000,
  })
}

/** Public subscription plan catalog (shared across billing tabs). */
export function usePublicSubscriptionPlans() {
  return useQuery<DisplaySubscriptionPlan[]>({
    queryKey: [...billingKeys.all, "publicPlans"],
    queryFn: () =>
      fetch("/api/public-subscription-plans").then(async (res) => {
        if (!res.ok) throw new Error("Unable to load subscription plans")
        const payload = (await res.json()) as PublicSubscriptionPlan[]
        return payload
          .map(toDisplayPlan)
          .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name))
      }),
    staleTime: 10 * 60_000,
  })
}

/** Single public plan by id (Plan 30 D2: detail query instead of list+find).
 * Goes through the generic API proxy straight to the public detail endpoint. */
export function usePublicSubscriptionPlan(planId?: string | null) {
  return useQuery<DisplaySubscriptionPlan | null>({
    queryKey: [...billingKeys.all, "publicPlan", planId || "none"],
    queryFn: async () => {
      if (!planId) return null
      const res = await fetch(
        `/api/proxy/public/subscription-plans/${encodeURIComponent(planId)}`,
      )
      if (res.status === 404) return null
      if (!res.ok) throw new Error("Unable to load subscription plan")
      return toDisplayPlan(await res.json())
    },
    enabled: Boolean(planId),
    staleTime: 10 * 60_000,
  })
}

/** Allowed providers + active-period status for the current tenant. */
export function useAllowedProviders() {
  return useQuery({
    queryKey: billingKeys.allowedProviders(),
    queryFn: () => tenantAllowedProvidersApi.allowed(),
    staleTime: 5 * 60_000,
  })
}

/** Public billing accounts catalog (Plan 31: live module, not constants).
 * 10-minute cache — the upstream endpoint is throttled. */
export function useBillingAccounts() {
  return useQuery({
    queryKey: billingKeys.billingAccounts(),
    queryFn: () => tenantBillingApi.listPublicBillingAccounts(),
    staleTime: 10 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Subscription gate — single source of truth for subscription state
// ---------------------------------------------------------------------------

export type SubscriptionGateDimensionView = {
  used: number
  limit: number | null
  remaining: number | null
  percent: number | null
  blocked: boolean
  unlimited: boolean
  canConsume: boolean
}

export type SubscriptionGate = {
  quota: Record<QuotaDimension, SubscriptionGateDimensionView>
  hasActivePeriod: boolean
  allowedProviders: string[]
  isProviderAllowed: (provider: string) => boolean
  isLoading: boolean
}

/**
 * Comprehensive subscription state hook. Returns quota dimensions with
 * `canConsume` flags, active-period status, and allowed providers. Any
 * component that needs to gate UI on subscription state should use this.
 */
export function useSubscriptionGate(): SubscriptionGate {
  const quotaView = useQuotaView()
  const providersQuery = useAllowedProviders()

  const hasActivePeriod = providersQuery.data?.hasActivePeriod ?? false
  const allowedProviders = providersQuery.data?.allowedProviders ?? []

  const isProviderAllowed = (provider: string) =>
    allowedProviders.length === 0 || allowedProviders.includes(provider)

  const isLoading = !quotaView || providersQuery.isLoading

  const quota = useMemo(() => {
    if (!quotaView) {
      const empty = {} as Record<QuotaDimension, SubscriptionGateDimensionView>
      for (const dim of QUOTA_DIMENSIONS) {
        empty[dim] = {
          used: 0,
          limit: null,
          remaining: null,
          percent: null,
          blocked: false,
          unlimited: false,
          canConsume: false,
        }
      }
      return empty
    }
    const result = {} as Record<QuotaDimension, SubscriptionGateDimensionView>
    for (const dim of QUOTA_DIMENSIONS) {
      const view = quotaView[dim]
      result[dim] = {
        ...view,
        // Plan 53: unlimited dimensions are consumable whenever a period is
        // active and the dimension is not blocked.
        canConsume:
          hasActivePeriod &&
          !view.blocked &&
          (view.unlimited || (view.remaining ?? 0) > 0),
      }
    }
    return result
  }, [quotaView, hasActivePeriod])

  return {
    quota,
    hasActivePeriod,
    allowedProviders,
    isProviderAllowed,
    isLoading,
  }
}

// ---------------------------------------------------------------------------
// Workspace warnings — derived soft warnings from subscription state
// ---------------------------------------------------------------------------

const WARN_AT = 80
const CRITICAL_AT = 95

const WARNING_DIMENSIONS: QuotaDimension[] = ["inbound_messages", "outbound_messages"]

const QUOTA_DIMENSION_LABELS: Record<QuotaDimension, string> = {
  inbound_messages: "Inbound messages",
  outbound_messages: "Outbound messages",
  channel_slots: "channel",
  storage_gb: "storage",
  team_members: "team member",
}

// ---------------------------------------------------------------------------
// Warning types — grouped usage card + separate subscription expiry
// ---------------------------------------------------------------------------

export type QuotaUsageDimensionRow = {
  dimension: QuotaDimension
  label: string
  used: number
  limit: number
  percent: number
  severity: "warning" | "critical"
  blocked: boolean
}

export type QuotaUsageWarning = {
  id: string
  type: "quota_usage"
  severity: "warning" | "critical"
  rows: QuotaUsageDimensionRow[]
  ctaLabel: string
  ctaHref: string
}

export type SubscriptionExpiryWarning = {
  id: string
  type: "subscription_expiry"
  severity: "warning" | "critical"
  message: string
  ctaLabel: string
  ctaHref: string
}

export type WorkspaceWarning = QuotaUsageWarning | SubscriptionExpiryWarning

/**
 * Derives workspace-wide soft warnings from the current subscription state.
 * Quota dimensions are grouped into a single usage warning object with one
 * row per dimension that has a warning/critical/blocked state. The group's
 * overall severity is the highest severity among its rows.
 *
 * Subscription-period expiry warnings (≤7 days warning, ≤2 days critical)
 * remain as a separate object.
 */
export function useWorkspaceWarnings(): WorkspaceWarning[] {
  const gate = useSubscriptionGate()
  const periodsQuery = useSubscriptionPeriods()

  return useMemo(() => {
    const warnings: WorkspaceWarning[] = []

    // ── Quota usage — group all dimension rows into one warning ──────────
    const rows: QuotaUsageDimensionRow[] = []

    for (const dim of WARNING_DIMENSIONS) {
      const view = gate.quota[dim]
      if (!view || view.unlimited) continue

      if (view.blocked || (view.percent !== null && view.percent >= CRITICAL_AT)) {
        rows.push({
          dimension: dim,
          label: QUOTA_DIMENSION_LABELS[dim],
          used: view.used,
          limit: view.limit ?? 0,
          percent: view.percent ?? 100,
          severity: "critical",
          blocked: view.blocked,
        })
      } else if (view.percent !== null && view.percent >= WARN_AT) {
        rows.push({
          dimension: dim,
          label: QUOTA_DIMENSION_LABELS[dim],
          used: view.used,
          limit: view.limit ?? 0,
          percent: view.percent,
          severity: "warning",
          blocked: false,
        })
      }
    }

    if (rows.length > 0) {
      const hasBlocked = rows.some((r) => r.blocked)
      const groupSeverity: "warning" | "critical" =
        rows.some((r) => r.severity === "critical") ? "critical" : "warning"

      warnings.push({
        id: `quota-usage-${groupSeverity}`,
        type: "quota_usage",
        severity: groupSeverity,
        rows,
        ctaLabel: hasBlocked ? "Upgrade plan" : "Upgrade plan",
        ctaHref: "/workspace/billing",
      })
    }

    // ── Subscription expiry — separate, unchanged ────────────────────────
    const periodEnd = periodsQuery.data?.entitlement?.periodEndAt
    const daysLeft = daysUntil(periodEnd)
    if (daysLeft !== null && daysLeft <= 7) {
      const severity = daysLeft <= 2 ? "critical" : "warning"
      warnings.push({
        id: `subscription-expiring-${severity}`,
        type: "subscription_expiry",
        severity,
        message: `Your subscription ${daysLeft < 0 ? "has expired" : `renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}.`,
        ctaLabel: "Manage subscription",
        ctaHref: "/workspace/billing",
      })
    }

    return warnings
  }, [gate.quota, periodsQuery.data?.entitlement?.periodEndAt])
}

// ---------------------------------------------------------------------------
// Mutations — precise invalidation, no broad refetch
// ---------------------------------------------------------------------------

export function useSubmitPaymentProof() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      recordId,
      data,
    }: {
      recordId: string
      data: SubmitTenantPaymentProofInput
    }) => tenantBillingApi.submitPaymentProof(recordId, data),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.overview() })
    },
  })
}

export function useCreateAddOnPurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      productId,
      idempotencyKey,
    }: {
      productId: string
      idempotencyKey: string
    }) => tenantBillingApi.createAddOnPurchase(productId, idempotencyKey),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.addOnPurchases() })
    },
  })
}

export function useCancelPlanChangeRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: string) =>
      tenantBillingApi.cancelPlanChangeRequest(requestId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.overview() })
    },
  })
}

export function useCancelUpgradeRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (revisionId: string) =>
      tenantBillingApi.cancelUpgradeRevision(revisionId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.overview() })
      void qc.invalidateQueries({ queryKey: billingKeys.periods() })
    },
  })
}

export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (recordId: string) =>
      tenantBillingApi.cancelSubscriptionBillingRecord(recordId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.overview() })
      void qc.invalidateQueries({ queryKey: billingKeys.periods() })
    },
  })
}

// ---------------------------------------------------------------------------
// Derived quota view — merges usage-summary + periods into a unified shape
// ---------------------------------------------------------------------------

const QUOTA_DIMENSIONS = [
  "inbound_messages",
  "outbound_messages",
  "channel_slots",
  "storage_gb",
  "team_members",
] as const

export type QuotaDimension = (typeof QUOTA_DIMENSIONS)[number]

export type QuotaDimensionView = {
  used: number
  limit: number | null
  remaining: number | null
  percent: number | null
  blocked: boolean
  unlimited: boolean
  /** Raw storage bytes for adaptive display; set only for storage_gb. */
  usedBytes?: number | null
}

export type QuotaView = Record<QuotaDimension, QuotaDimensionView>

/**
 * Pure derived helper — combines the period-scoped usage summary (message
 * ledger) with subscription periods (channel/team/storage counts +
 * entitlement quota state) into a single per-dimension view.
 */
export function buildQuotaView(
  summary: TenantUsageSummaryDto | undefined,
  periods: TenantSubscriptionPeriodsResponseDto | undefined,
): QuotaView | null {
  if (!summary || !periods) return null

  const entitlement = periods.entitlement
  const periodUsage = periods.periodUsage

  const result = {} as Record<QuotaDimension, QuotaDimensionView>

  for (const dim of QUOTA_DIMENSIONS) {
    const limit = summary.effectiveLimits[dim] ?? null

    let used: number
    let storageUsedBytes: number | null = null
    switch (dim) {
      case "inbound_messages":
        used = summary.inboundMessages.used
        break
      case "outbound_messages":
        used = summary.outboundMessages.used
        break
      case "channel_slots":
        used = periodUsage?.activeChannels ?? 0
        break
      case "team_members":
        used = periodUsage?.activeTeamMembers ?? 0
        break
      case "storage_gb":
        storageUsedBytes =
          periodUsage?.storage.usedBytes != null
            ? Number(periodUsage.storage.usedBytes)
            : null
        used =
          storageUsedBytes !== null &&
          periodUsage?.storage.effectiveCapacityGb != null
            ? Math.round(
                (storageUsedBytes /
                  (periodUsage.storage.effectiveCapacityGb *
                    1024 *
                    1024 *
                    1024)) *
                  100,
              ) / 100
            : 0
        break
    }

    const unlimited = limit === null
    const remaining = unlimited ? null : Math.max(limit - used, 0)
    const percent =
      !unlimited && limit > 0 ? Math.round((used / limit) * 100) : null
    const blocked =
      entitlement?.quotaState[dim]?.blocked ?? (!unlimited && limit === 0)

    result[dim] = { used, limit, remaining, percent, blocked, unlimited }
    if (dim === "storage_gb") result[dim].usedBytes = storageUsedBytes
  }

  return result
}

/**
 * Convenience hook — fetches usage summary + periods, returns a merged
 * per-dimension quota view. Returns null while either source is loading.
 */
export function useQuotaView(): QuotaView | null {
  const summary = useQuotaSummary()
  const periods = useSubscriptionPeriods()

  return useMemo(
    () => buildQuotaView(summary.data, periods.data),
    [summary.data, periods.data],
  )
}
