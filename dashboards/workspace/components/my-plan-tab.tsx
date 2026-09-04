"use client"

import { useMemo } from "react"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Database,
  Download,
  MessageCircle,
  PackagePlus,
  Send,
  Users,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  getApiErrorMessage,
  type TenantAddOnPurchaseDto,
  type TenantBillingOverviewDto,
  type TenantSubscriptionPeriodDto,
} from "@/lib/api"
import {
  useBillingOverview,
  useSubscriptionPeriods,
  useAddOnPurchases,
  usePublicSubscriptionPlans,
  useQuotaView,
  resolveCurrentPlanId,
} from "@/lib/queries/billing"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"
import { cn } from "@/lib/utils"

const YANGON_TIME_ZONE = "Asia/Yangon"

type Dimension =
  | "inbound_messages"
  | "outbound_messages"
  | "api_requests"
  | "channel_slots"
  | "storage_gb"
  | "team_members"

type SourceLimitMap = Record<Dimension, number | null | undefined>

const dimensions: Array<{
  key: Dimension
  label: string
  icon: typeof Download
  unit: string
}> = [
  { key: "inbound_messages", label: "Inbound Message", icon: Download, unit: "" },
  { key: "outbound_messages", label: "Outbound Message", icon: Send, unit: "" },
  { key: "api_requests", label: "API", icon: Zap, unit: "" },
  { key: "channel_slots", label: "Channel", icon: MessageCircle, unit: "" },
  { key: "storage_gb", label: "Storage", icon: Database, unit: "GB" },
  { key: "team_members", label: "Users", icon: Users, unit: "" },
]

const componentLabels: Record<string, string> = {
  inbound_messages: "Inbound messages",
  outbound_messages: "Outbound messages",
  api_requests: "API requests",
  channel_slots: "Channels",
  storage_gb: "Storage",
}

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: YANGON_TIME_ZONE,
      })
    : "Not scheduled"

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: YANGON_TIME_ZONE,
      })
    : "Not recorded"

const formatMoney = (value: number | string, currency = "MMK") =>
  `${currency} ${Number(value || 0).toLocaleString()}`

const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

const daysUntil = (value?: string | null) => {
  if (!value) return null
  const target = new Date(value).getTime()
  if (Number.isNaN(target)) return null
  return Math.ceil((target - Date.now()) / 86_400_000)
}

function paymentStatusClasses(status: string) {
  if (["paid", "waived"].includes(status)) return statusClasses("active")
  if (["failed", "refunded", "rejected"].includes(status)) return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200"
  return statusClasses("pending")
}

const emptyLimits = (): SourceLimitMap => ({
  inbound_messages: null,
  outbound_messages: null,
  api_requests: null,
  channel_slots: null,
  storage_gb: null,
  team_members: null,
})

function planForId(plans: DisplaySubscriptionPlan[], planId?: string | null) {
  return planId ? plans.find((plan) => plan.id === planId) || null : null
}

function periodForPlan(
  periods: TenantSubscriptionPeriodDto[],
  periodId?: string | null,
) {
  return (
    (periodId
      ? periods.find(
          (period) =>
            period.id === periodId &&
            period.periodStatus !== "cancelled" &&
            period.periodStatus !== "expired",
        )
      : null) ||
    periods.find(
      (period) =>
        period.periodType === "paid" && period.periodStatus === "active",
    ) ||
    periods.find((period) => period.periodType === "trial" && period.periodStatus === "active") ||
    null
  )
}

function statusClasses(status: "active" | "queued" | "pending" | "muted") {
  if (status === "active") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-200"
  }
  if (status === "queued") {
    return "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200"
  }
  if (status === "pending") {
    return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200"
  }
  return "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
}

function UsageCard({
  label,
  icon: Icon,
  used,
  limit,
  unit,
  preview,
}: {
  label: string
  icon: typeof Download
  used: number
  limit: number | null
  unit: string
  preview: boolean
}) {
  const blocked = limit === 0
  const percent = limit === null ? null : Math.min(100, Math.max(0, (used / Math.max(limit, 1)) * 100))
  const usedDisplay = unit === "GB" ? `${used.toLocaleString(undefined, { maximumFractionDigits: 2 })}GB` : used.toLocaleString()
  const limitDisplay = limit === null ? "Unlimited" : unit === "GB" ? `${limit.toLocaleString()}GB` : limit.toLocaleString()
  const remaining = limit === null ? null : Math.max(limit - used, 0)
  const remainingDisplay = remaining === null ? "Unlimited remaining" : `${remaining.toLocaleString()}${unit === "GB" ? "GB" : ""} remaining`

  return (
    <article className="rounded-[20px] border border-indigo-300/90 bg-white p-5 shadow-[0_7px_20px_rgba(79,70,229,0.07)] dark:border-indigo-500/40 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-white">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-base font-bold text-slate-950 dark:text-slate-50">{label}</h3>
        </div>
        <Badge className={cn("shrink-0 border text-[11px]", preview ? statusClasses("pending") : blocked ? statusClasses("muted") : "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200")}>
          {preview ? "Preview" : blocked ? "Blocked" : percent === null ? "∞" : `${Math.round(percent)}%`}
        </Badge>
      </div>

      <p className="mt-5 text-xl font-bold text-indigo-600 dark:text-indigo-300">
        {usedDisplay}
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400"> / {limitDisplay} total</span>
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-indigo-100 dark:bg-slate-800">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500", preview && "opacity-45")}
          style={{ width: `${percent === null ? 0 : percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{remainingDisplay}</p>
      {preview ? (
        <p className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300">This limit is not usable until Platform Admin activates the paid period.</p>
      ) : null}
    </article>
  )
}

function LimitTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-white/70 px-3 py-3 dark:border-indigo-400/30 dark:bg-slate-950/40">
      <p className="text-xs text-indigo-500 dark:text-indigo-300">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">{value}</p>
    </div>
  )
}

function LimitSourceTile({
  label,
  base,
  carryover,
  topUp,
  unit = "",
}: {
  label: string
  base: number | null | undefined
  carryover: number | null | undefined
  topUp: number | null | undefined
  unit?: string
}) {
  return (
    <article className="rounded-xl border border-indigo-200 bg-white/70 px-3 py-3 dark:border-indigo-400/30 dark:bg-slate-950/40">
      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{label}</p>
      <div className="mt-2 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-slate-500 dark:text-slate-400">Base Limit</p>
          <p className="font-bold text-slate-900 dark:text-slate-50">{formatLimit(base ?? null, unit)}</p>
        </div>
        {carryover !== null && carryover !== undefined && carryover > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-slate-500 dark:text-slate-400">Carried Over</p>
            <p className="font-bold text-slate-900 dark:text-slate-50">{formatCarryover(carryover, unit)}</p>
          </div>
        ) : null}
        {topUp !== null && topUp !== undefined && topUp > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-slate-500 dark:text-slate-400">Add On</p>
            <p className="font-bold text-slate-900 dark:text-slate-50">{formatTopUp(topUp, unit)}</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function MainPlanCard({
  billing,
  plan,
  period,
  baseLimits,
  carryover,
  topUpLimits,
  awaitingActivation,
  trialActive,
  pendingPlanName,
  hasActivePlan,
}: {
  billing: TenantBillingOverviewDto
  plan: DisplaySubscriptionPlan | null
  period: TenantSubscriptionPeriodDto | null
  baseLimits: SourceLimitMap
  carryover: SourceLimitMap
  topUpLimits: SourceLimitMap
  awaitingActivation: boolean
  trialActive: boolean
  pendingPlanName: string | null
  hasActivePlan: boolean
}) {
  const statusLabel = trialActive
    ? "Trial active"
    : awaitingActivation
      ? "Awaiting activation"
      : period?.periodStatus === "active"
        ? "Active"
        : "No active plan"
  const statusTone = trialActive ? "queued" : awaitingActivation ? "pending" : period?.periodStatus === "active" ? "active" : "muted"
  const planName = hasActivePlan
    ? plan?.name || (trialActive ? "Trial Plan" : billing.plan?.name) || "Plan details unavailable"
    : "No active plan"
  const price = plan?.monthlyPrice ?? (trialActive ? null : billing.plan?.monthlyPrice)

  const b2bUpgradePending = Boolean(
    billing?.upgrade?.kind === "upgrade" && billing.upgrade?.upgradeStatus === "pending_approval",
  )
  const b2bUpgradeName = b2bUpgradePending ? billing.upgrade?.targetPlanName ?? null : null

  return (
    <section aria-labelledby="billing-v2-main-plan" className="rounded-[24px] border border-indigo-400 bg-gradient-to-br from-indigo-100 via-indigo-50 to-cyan-100 p-5 shadow-[0_10px_28px_rgba(79,70,229,0.1)] dark:border-indigo-400/50 dark:from-indigo-500/20 dark:via-indigo-500/10 dark:to-cyan-500/15 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">Current Subscription</p>
          <h3 id="billing-v2-main-plan" className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">{planName}</h3>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
            <span>Starts at {formatDate(period?.monthStartAt || period?.periodStartAt || billing.usage.periodStart)}</span>
            <span>Ends at {formatDate(period?.monthEndAt || period?.periodEndAt || billing.usage.periodEnd)}</span>
            {period?.activatedAt ? <span>Activated {formatDateTime(period.activatedAt)}</span> : null}
          </div>
        </div>
        <div className="flex items-start justify-between gap-4 lg:flex-col lg:items-end">
          <div className="flex flex-wrap justify-end gap-2">
            <Badge className={cn("border", statusClasses(statusTone))}>{statusLabel}</Badge>
            {trialActive && awaitingActivation ? <Badge className={cn("border", statusClasses("pending"))}>Awaiting activation</Badge> : null}
          </div>
          {price !== undefined && price !== null ? (
            <p className="text-xl font-bold text-sky-500 dark:text-sky-300">{formatMoney(price, plan?.public?.currencyCode || billing.plan?.currency || "MMK")}<span className="text-sm font-semibold text-slate-900 dark:text-slate-100">/month</span></p>
          ) : null}
        </div>
      </div>
      {pendingPlanName ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          Business upgrade: <strong>{pendingPlanName}</strong> · payment confirmed and awaiting Platform Admin activation. Trial access remains active.
        </p>
      ) : b2bUpgradeName ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          Plan upgrade: <strong>{b2bUpgradeName}</strong> · payment confirmed and awaiting Platform Admin approval. Your current plan remains active until approval.
        </p>
      ) : null}

      {hasActivePlan ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="billing-v2-limit-sources">
          <LimitSourceTile label="Inbound Messages" base={baseLimits.inbound_messages} carryover={carryover.inbound_messages} topUp={topUpLimits.inbound_messages} />
          <LimitSourceTile label="Outbound Messages" base={baseLimits.outbound_messages} carryover={carryover.outbound_messages} topUp={topUpLimits.outbound_messages} />
          <LimitSourceTile label="API Requests" base={baseLimits.api_requests} carryover={carryover.api_requests} topUp={topUpLimits.api_requests} />
          <LimitSourceTile label="Channels" base={baseLimits.channel_slots} carryover={carryover.channel_slots} topUp={topUpLimits.channel_slots} />
          <LimitSourceTile label="Storage" base={baseLimits.storage_gb} carryover={carryover.storage_gb} topUp={topUpLimits.storage_gb} unit="GB" />
          <LimitSourceTile label="Users" base={baseLimits.team_members} carryover={carryover.team_members} topUp={topUpLimits.team_members} />
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 p-5 text-sm text-slate-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-300">
          No subscription limits are available yet. Choose a plan from Packages to start this month.
        </p>
      )}
    </section>
  )
}

function formatLimit(value: number | null, unit = "") {
  if (value === null) return "Unlimited"
  if (value === 0) return "Blocked"
  return `${value.toLocaleString()}${unit}`
}

function formatCarryover(value: number | null | undefined, unit = "") {
  return `${Number(value || 0).toLocaleString()}${unit}`
}

function formatTopUp(value: number | null | undefined, unit = "") {
  return `${Number(value || 0).toLocaleString()}${unit}`
}

function AddOnPurchaseCard({ purchase }: { purchase: TenantAddOnPurchaseDto }) {
  const active = purchase.purchaseStatus === "active"
  const status = active ? "active" : purchase.purchaseStatus === "pending" ? "pending" : "muted"
  const remainingDays = daysUntil(purchase.expiresAt)
  return (
    <article className="rounded-[20px] border border-indigo-300/90 bg-white p-5 shadow-[0_7px_20px_rgba(79,70,229,0.07)] dark:border-indigo-500/40 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-950 dark:text-slate-50">{purchase.productName || purchase.productCode || "Add-on package"}</h3>
          <p className="mt-2 text-sm text-sky-500 dark:text-sky-300">
            {purchase.components.map((component) => `${component.quantity.toLocaleString()} ${component.unit} ${componentLabels[component.componentType] || component.componentType}`).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Badge className={cn("border", statusClasses(status))}>{titleCase(purchase.purchaseStatus)}</Badge>
          <Badge className={cn("border", paymentStatusClasses(purchase.paymentStatus))}>{titleCase(purchase.paymentStatus)}</Badge>
        </div>
      </div>
      <div className="mt-5 space-y-2 border-t border-indigo-100 pt-4 text-sm text-slate-600 dark:border-indigo-400/20 dark:text-slate-300">
        <p>Purchased: <strong className="text-slate-900 dark:text-slate-100">{formatDate(purchase.createdAt)}</strong></p>
        <p>Ends at: <strong className="text-slate-900 dark:text-slate-100">{formatDate(purchase.expiresAt)}</strong></p>
        <p>Price: <strong className="text-slate-900 dark:text-slate-100">{formatMoney(purchase.purchasePrice, purchase.currency)}</strong></p>
        {remainingDays !== null && remainingDays <= 3 ? (
          <p className={cn("text-xs font-medium", remainingDays < 0 ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300")}>
            {remainingDays < 0 ? "Expired; capacity is no longer available." : remainingDays === 0 ? "Expires at the end of today in Yangon." : `Expires in ${remainingDays} day${remainingDays === 1 ? "" : "s"} in Yangon.`}
          </p>
        ) : null}
      </div>
    </article>
  )
}

function UpcomingPlanCard({
  period,
  plan,
}: {
  period: TenantSubscriptionPeriodDto
  plan: DisplaySubscriptionPlan | null
}) {
  const awaitingApproval = period.paymentStatus === "paid" && (period.adminActivationStatus || "approved") === "pending"
  const status = awaitingApproval ? "pending" : period.paymentStatus === "paid" ? "queued" : "muted"
  const planName = plan?.name || "Plan details unavailable"
  return (
    <article className="rounded-[24px] border border-indigo-300/90 bg-gradient-to-br from-white to-indigo-50/60 p-5 shadow-[0_7px_20px_rgba(79,70,229,0.06)] dark:border-indigo-500/40 dark:from-slate-950 dark:to-indigo-500/10 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">Upcoming Plan</p>
          <h3 className="mt-2 text-xl font-bold text-slate-950 dark:text-slate-50">{planName}</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {formatDate(period.monthStartAt || period.periodStartAt)} – {formatDate(period.monthEndAt || period.periodEndAt)}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <Badge className={cn("border", statusClasses(status))}>{awaitingApproval ? "Awaiting approval" : titleCase(period.paymentStatus)}</Badge>
          {plan ? <p className="text-lg font-bold text-sky-500 dark:text-sky-300">{formatMoney(plan.monthlyPrice, plan.public?.currencyCode || "MMK")}<span className="text-sm text-slate-900 dark:text-slate-100">/month</span></p> : null}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <LimitTile label="Inbound" value={formatLimit(plan?.inboundMessageLimit ?? null)} />
        <LimitTile label="Outbound" value={formatLimit(plan?.outboundMessageLimit ?? null)} />
        <LimitTile label="API" value={formatLimit(plan?.apiLimit ?? null)} />
        <LimitTile label="Channel" value={formatLimit(plan?.maxChannels ?? null)} />
        <LimitTile label="Storage" value={formatLimit(plan?.storageLimitGb ?? null, "GB")} />
        <LimitTile label="Users" value={formatLimit(plan?.maxCsrs ?? null)} />
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
        This period remains queued and does not activate early when the current quota is exhausted.
      </p>
    </article>
  )
}

export function MyPlanTab() {
  const billingQuery = useBillingOverview()
  const periodsQuery = useSubscriptionPeriods()
  const purchasesQuery = useAddOnPurchases()
  const plansQuery = usePublicSubscriptionPlans()
  const quotaView = useQuotaView()

  const billing = billingQuery.data
  const periodData = periodsQuery.data
  const purchases = useMemo(() => purchasesQuery.data ?? [], [purchasesQuery.data])
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  const isLoading =
    billingQuery.isLoading || periodsQuery.isLoading || plansQuery.isLoading
  const error =
    billingQuery.error || periodsQuery.error || plansQuery.error
      ? getApiErrorMessage(
          billingQuery.error || periodsQuery.error || plansQuery.error,
          "Your plan information could not be loaded.",
        )
      : ""

  const activePeriod = useMemo(
    () => periodForPlan(periodData?.periods || [], billing?.currentPeriod?.id || periodData?.activePeriodId),
    [billing?.currentPeriod?.id, periodData?.activePeriodId, periodData?.periods],
  )
  const trialAuthoritative = Boolean(
    periodData?.entitlement?.periodType === "trial" &&
      periodData.entitlement.periodStatus === "active",
  )
  const currentPlanId = resolveCurrentPlanId(
    periodData?.entitlement,
    activePeriod,
    billing?.plan?.id,
  )
  const currentPlan = planForId(plans, currentPlanId)
  const awaitingActivation = Boolean(
    (billing?.currentPeriod?.adminActivationStatus || activePeriod?.adminActivationStatus) === "pending",
  )
  const trialActive = Boolean(
    trialAuthoritative || billing?.trial?.periodStatus === "active",
  )
  const pendingPlanName =
    trialAuthoritative && awaitingActivation && billing?.plan && billing.plan.id !== currentPlanId
      ? billing.plan.name
      : null
  const displayPeriod = trialAuthoritative
    ? periodData?.periods.find(
        (period) => period.periodType === "trial" && period.periodStatus === "active",
      ) || activePeriod
    : activePeriod
  const hasActivePlan = Boolean(
    periodData?.entitlement && (
      trialActive ||
      awaitingActivation ||
      displayPeriod?.periodStatus === "active"
    ),
  )
  const trialUsageActive = Boolean(
    trialActive ||
      (periodData?.entitlement?.periodType === "trial" &&
        periodData.entitlement.periodStatus === "active"),
  )
  const periodUsage = periodData?.periodUsage
  const baseLimits = useMemo<SourceLimitMap>(() => {
    if (!periodData?.entitlement) return emptyLimits()
    const fallback: SourceLimitMap = {
      inbound_messages: currentPlan?.inboundMessageLimit ?? null,
      outbound_messages: currentPlan?.outboundMessageLimit ?? null,
      api_requests: currentPlan?.apiLimit ?? billing?.plan?.apiLimit ?? null,
      channel_slots: currentPlan?.maxChannels ?? billing?.plan?.maxChannels ?? null,
      storage_gb: currentPlan?.storageLimitGb ?? billing?.plan?.storageLimitGb ?? null,
      team_members: currentPlan?.maxCsrs ?? billing?.plan?.maxCsrs ?? null,
    }
    const source = periodData?.entitlement?.baseLimits
    if (!source) return fallback
    for (const dimension of dimensions) {
      if (Object.prototype.hasOwnProperty.call(source, dimension.key)) {
        fallback[dimension.key] = source[dimension.key]
      }
    }
    return fallback
  }, [billing?.plan, currentPlan, periodData?.entitlement?.baseLimits])
  const carryover = useMemo<SourceLimitMap>(() => {
    const source = periodData?.entitlement?.carryover || {}
    const keyMap: Record<string, string> = {
      inbound_messages: "inboundMessages",
      outbound_messages: "outboundMessages",
      api_requests: "apiRequests",
    }
    return dimensions.reduce<SourceLimitMap>((result, dimension) => {
      const backendKey = keyMap[dimension.key] ?? dimension.key
      result[dimension.key] = source[backendKey]
      return result
    }, emptyLimits())
  }, [periodData?.entitlement?.carryover])
  const topUpLimits = useMemo<SourceLimitMap>(() => {
    const source = periodData?.entitlement?.activeTopUpComponentTotals || {}
    return dimensions.reduce<SourceLimitMap>((result, dimension) => {
      result[dimension.key] = source[dimension.key] ?? 0
      return result
    }, emptyLimits())
  }, [periodData?.entitlement?.activeTopUpComponentTotals])
  const usagePreview = awaitingActivation && !periodData?.entitlement
  const upcomingPeriods = useMemo(
    () =>
      (periodData?.periods || [])
        .filter((period) => period.periodType === "paid" && period.periodStatus === "upcoming")
        .sort((left, right) => left.sequenceNumber - right.sequenceNumber),
    [periodData?.periods],
  )
  const visiblePurchases = useMemo(
    () =>
      purchases
        .filter((purchase) => ["active", "pending"].includes(purchase.purchaseStatus))
        .sort((left, right) => {
          if (left.purchaseStatus !== right.purchaseStatus) return left.purchaseStatus === "active" ? -1 : 1
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        }),
    [purchases],
  )

  if (isLoading) return <PlanFeedback message="Loading your plan..." />
  if (error && !billing) return <PlanFeedback message={error} error />

  return (
    <div className="space-y-12">
      {error ? <PlanFeedback message={error} error /> : null}

      {hasActivePlan ? (
      <section aria-labelledby="billing-v2-current-period-usage" data-testid="billing-v2-current-period-usage">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="billing-v2-current-period-usage" className="text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Current Period Usage</h2>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
              {formatDate(periodUsage?.periodStart || displayPeriod?.monthStartAt || displayPeriod?.periodStartAt || billing?.usage.periodStart)} – {formatDate(periodUsage?.periodEnd || displayPeriod?.monthEndAt || displayPeriod?.periodEndAt || billing?.usage.periodEnd)}
            </p>
          </div>
          <Badge className={cn("w-fit border", trialActive ? statusClasses("queued") : awaitingActivation ? statusClasses("pending") : periodData?.entitlement ? statusClasses("active") : statusClasses("muted"))}>
            {trialUsageActive ? "Trial usage" : awaitingActivation ? "Awaiting activation" : periodData?.entitlement ? "Active period" : "No active usage period"}
          </Badge>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {quotaView ? dimensions.map((dimension) => (
            <UsageCard
              key={dimension.key}
              label={dimension.label}
              icon={dimension.icon}
              used={quotaView[dimension.key].used}
              limit={quotaView[dimension.key].limit}
              unit={dimension.unit}
              preview={usagePreview}
            />
          )) : null}
        </div>
        {trialUsageActive && awaitingActivation ? (
          <p className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">The paid period is awaiting Platform Admin activation. Your active trial remains the authoritative usage and limit source until it ends.</p>
        ) : null}
        {periodUsage?.usageSource === "not_attributed" ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">Existing usage events are readable but are not attributed to this subscription period.</p>
        ) : null}
        {periodUsage?.storage.overStorageLimit ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">Storage is over the active capacity. Reads and deletion remain available; new uploads are blocked.</p>
        ) : null}
      </section>
      ) : null}

      <section aria-labelledby="billing-v2-main-plan-section" data-testid="billing-v2-main-plan-section">
        <h2 id="billing-v2-main-plan-section" className="mb-6 text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Main Plan</h2>
        {billing ? <MainPlanCard billing={billing} plan={currentPlan} period={displayPeriod} baseLimits={baseLimits} carryover={carryover} topUpLimits={topUpLimits} awaitingActivation={awaitingActivation} trialActive={trialActive} pendingPlanName={pendingPlanName} hasActivePlan={hasActivePlan} /> : null}
      </section>

      <section aria-labelledby="billing-v2-addon-packages" data-testid="billing-v2-addon-packages">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 id="billing-v2-addon-packages" className="text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Add On Packages</h2>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-300">Active-period add-ons attached to this workspace.</p>
          </div>
          <Badge variant="secondary">{visiblePurchases.length} packages</Badge>
        </div>
        {visiblePurchases.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-indigo-300 bg-indigo-50/40 p-10 text-center text-sm text-slate-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-300">
            <PackagePlus className="mx-auto mb-3 h-7 w-7 text-indigo-500" />
            <p className="font-semibold text-slate-900 dark:text-slate-100">No add-on packages yet.</p>
            <p className="mt-1">Browse Packages to add capacity to your active plan.</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visiblePurchases.map((purchase) => <AddOnPurchaseCard key={purchase.id} purchase={purchase} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="billing-v2-upcoming-plans" data-testid="billing-v2-upcoming-plans">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 id="billing-v2-upcoming-plans" className="text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Upcoming Plans</h2>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-300">Future paid periods remain queued and do not activate early.</p>
          </div>
          <Badge variant="secondary">{upcomingPeriods.length} queued</Badge>
        </div>
        {upcomingPeriods.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-indigo-300 bg-indigo-50/40 p-10 text-center text-sm text-slate-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-300">
            <CalendarClock className="mx-auto mb-3 h-7 w-7 text-indigo-500" />
            No prepaid future month is currently queued.
          </div>
        ) : (
          <div className="space-y-5">
            {upcomingPeriods.map((period) => (
              <UpcomingPlanCard key={period.id} period={period} plan={planForId(plans, period.planId)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PlanFeedback({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <div className={cn("rounded-[22px] border p-8 text-center text-sm", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200" : "border-indigo-200 bg-gradient-to-r from-indigo-50 to-cyan-50 text-slate-600 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-cyan-500/10 dark:text-slate-300")}>
      {error ? <AlertCircle className="mx-auto mb-3 h-6 w-6" /> : <CheckCircle2 className="mx-auto mb-3 h-6 w-6" />}
      {message}
    </div>
  )
}
