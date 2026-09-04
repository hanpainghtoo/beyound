"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Database,
  Download,
  MessageCircle,
  Send,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getApiErrorMessage,
  tenantBillingApi,
  type TenantAddOnProductDto,
  type SubscriptionPurchaseStartOption,
} from "@/lib/api"
import {
  useBillingOverview,
  useSubscriptionPeriods,
  useAddOnProducts,
  usePublicSubscriptionPlans,
  billingKeys,
  resolveCurrentPlanId,
} from "@/lib/queries/billing"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"
import { cn } from "@/lib/utils"
import { upgradeStatusLabel } from "@/lib/upgrade-status"

const YANGON_TIME_ZONE = "Asia/Yangon"

const formatMoney = (value: number | string, currency = "MMK") =>
  `${currency} ${Number(value || 0).toLocaleString()}`

const currentYangonMonth = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: YANGON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  return year && month ? `${year}-${month}` : ""
}

const monthKeyFromInstant = (value?: string | null) => {
  if (!value) return ""
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: YANGON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(value))
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  return year && month ? `${year}-${month}` : ""
}

const monthLabel = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number)
  if (!year || !monthNumber) return "the selected month"
  const name = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(
    new Date(Date.UTC(2000, monthNumber - 1, 1)),
  )
  return `${name} ${year}`
}

const nextMonthKey = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number)
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7)
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

const limitLabel = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "Unlimited"
  if (value === 0) return "Blocked"
  return value.toLocaleString()
}

const componentLabel: Record<string, string> = {
  inbound_messages: "Inbound messages",
  outbound_messages: "Outbound messages",
  api_requests: "API requests",
  channel_slots: "Channels",
  storage_gb: "Storage",
}

const componentIcon: Record<string, typeof Download> = {
  inbound_messages: Download,
  outbound_messages: Send,
  api_requests: Zap,
  channel_slots: MessageCircle,
  storage_gb: Database,
}

function planPrice(plan: DisplaySubscriptionPlan) {
  if (plan.availability === "contact-only") return "Custom proposal"
  const currency = plan.public?.currencyCode || "MMK"
  return `${currency} ${Number(plan.monthlyPrice || 0).toLocaleString()}`
}

type PlanCardProps = {
  plan: DisplaySubscriptionPlan
  currentPlanId?: string | null
  pendingMonth?: string
  pendingPlanName?: string | null
  mode:
    | "contact"
    | "pending-target"
    | "pending-other"
    | "trial"
    | "scheduled"
    | "trial-awaiting"
    | "paid"
    | "first"
    | "blocked"
  nextMonth: string
  currentMonth: string
  currentPlanPrice: number
  upgradeAvailable: boolean
  scheduledStartAt?: string | null
  scheduledPaymentStatus?: string | null
  pendingPlanId?: string | null
  purchasing: boolean
  onPurchase: (planId: string, startOption: SubscriptionPurchaseStartOption) => void
  onContinuePayment: () => void
  revisionStatus?: string | null
}

function PlanCard({
  plan,
  currentPlanId,
  pendingMonth,
  pendingPlanName,
  mode,
  nextMonth,
  currentMonth,
  currentPlanPrice,
  upgradeAvailable,
  scheduledStartAt,
  scheduledPaymentStatus,
  pendingPlanId,
  purchasing,
  onPurchase,
  onContinuePayment,
  revisionStatus,
}: PlanCardProps) {
  const current = plan.id === currentPlanId
  const higherThanCurrent = Number(plan.monthlyPrice || 0) > currentPlanPrice

  return (
    <article
      className={cn(
        "flex min-h-[420px] flex-col rounded-[22px] border p-5 shadow-[0_8px_22px_rgba(79,70,229,0.06)] transition-shadow hover:shadow-[0_12px_30px_rgba(79,70,229,0.12)]",
        current
          ? "border-indigo-400 bg-gradient-to-br from-indigo-50 via-indigo-50/70 to-cyan-50 dark:border-indigo-400/50 dark:from-indigo-500/15 dark:via-indigo-500/10 dark:to-cyan-500/10"
          : "border-indigo-300/90 bg-white dark:border-indigo-500/40 dark:bg-slate-950",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
            {plan.eyebrow}
          </p>
          <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
            {plan.name}
          </h3>
        </div>
        {current ? (
          <Badge className="shrink-0 border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-200">
            Current plan
          </Badge>
        ) : null}
      </div>

      <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-600 dark:text-slate-300">
        {plan.summary}
      </p>

      <div className="mt-4 border-b border-indigo-200/80 pb-4 dark:border-indigo-400/20">
        <p className="text-2xl font-bold text-sky-500 dark:text-sky-300">
          {planPrice(plan)}
          {plan.availability !== "contact-only" ? (
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">/month</span>
          ) : null}
        </p>
        {plan.availability !== "contact-only" ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {plan.public?.billingInterval === "monthly" ? "Monthly subscription" : plan.periodDurationLabel}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <LimitItem label="Inbound" value={limitLabel(plan.inboundMessageLimit)} />
        <LimitItem label="Outbound" value={limitLabel(plan.outboundMessageLimit)} />
        <LimitItem label="API" value={limitLabel(plan.apiLimit)} />
        <LimitItem label="Channels" value={limitLabel(plan.maxChannels)} />
        <LimitItem
          label="Storage"
          value={plan.storageLimitGb == null ? "Unlimited" : `${plan.storageLimitGb.toLocaleString()} GB`}
        />
        <LimitItem label="Users" value={limitLabel(plan.maxCsrs)} />
      </div>

      <div className="mt-auto pt-6">
        {mode === "contact" ? (
          <Button asChild className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600">
            <a href={plan.ctaHref}>{plan.ctaLabel || "Contact sales"}</a>
          </Button>
        ) : mode === "pending-target" ? (
          <div className="space-y-2">
            <Button className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600" onClick={onContinuePayment}>
              Continue payment{pendingMonth ? ` · ${monthLabel(pendingMonth)}` : ""}
            </Button>
            <p className="text-center text-xs text-amber-700 dark:text-amber-300">
              Payment is pending for {pendingPlanName || plan.name} only.
            </p>
          </div>
        ) : mode === "pending-other" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs leading-5 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
            Payment pending for {pendingPlanName || "another plan"}. Complete that request before starting another one.
          </div>
        ) : mode === "trial" ? (
          <div className="space-y-2">
            <Button className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600" onClick={() => onPurchase(plan.id, "current_month")} disabled={purchasing}>
              {purchasing ? "Requesting..." : `Upgrade this month · ${monthLabel(currentMonth)}`}
            </Button>
            <Button variant="outline" className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400/40 dark:text-indigo-200 dark:hover:bg-indigo-500/10" onClick={() => onPurchase(plan.id, "after_trial")} disabled={purchasing}>
              {purchasing ? "Scheduling..." : "Schedule after trial"}
            </Button>
          </div>
        ) : mode === "scheduled" ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">
            <p className="font-semibold">{scheduledPaymentStatus === "paid" || scheduledPaymentStatus === "waived" ? "Paid plan scheduled" : "After-trial request pending"}</p>
            <p className="mt-1 text-xs leading-5">
              Starts {formatDate(scheduledStartAt)}. Trial quota is not carried over.
            </p>
          </div>
        ) : mode === "trial-awaiting" ? (
          <div className={cn("rounded-xl border p-3 text-center text-xs leading-5", pendingPlanId === plan.id ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200" : "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200")}>
            <p className="font-semibold">{pendingPlanId === plan.id ? "Upgrade awaiting activation" : "Trial remains active"}</p>
            <p className="mt-1">{pendingPlanId === plan.id ? "Payment is confirmed. Platform Admin activation is still required." : "Trial limits and usage remain authoritative until the upgrade is activated."}</p>
          </div>
        ) : mode === "paid" ? (
          <div className="space-y-2">
            {upgradeAvailable && higherThanCurrent ? (
              <Button className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600" onClick={() => onPurchase(plan.id, "current_month")} disabled={purchasing}>
                {purchasing ? "Requesting..." : `Upgrade this month · ${monthLabel(currentMonth)}`}
              </Button>
            ) : null}
            <Button variant="outline" className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400/40 dark:text-indigo-200 dark:hover:bg-indigo-500/10" onClick={() => onPurchase(plan.id, "next_month")} disabled={purchasing}>
              {purchasing ? "Reserving..." : `Request next month · ${monthLabel(nextMonth)}`}
            </Button>
          </div>
        ) : mode === "first" ? (
          <Button className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600" onClick={() => onPurchase(plan.id, "current_month")} disabled={purchasing}>
            {purchasing ? "Reserving..." : `Request this month · ${monthLabel(currentMonth)}`}
          </Button>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs leading-5 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
            Payment is confirmed, but the current paid period is awaiting Platform Admin activation before another month can be reserved.
          </div>
        )}

        {current && mode === "paid" ? (
          <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
            Your current plan remains active while the next month is reviewed.
          </p>
        ) : null}
        {revisionStatus ? (
          <p className="mt-3 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
            {revisionStatus}
          </p>
        ) : null}
      </div>
    </article>
  )
}

function LimitItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}

function AddOnCard({
  product,
  canPurchase,
  disabledReason,
  purchasing,
  onPurchase,
}: {
  product: TenantAddOnProductDto
  canPurchase: boolean
  disabledReason: string
  purchasing: boolean
  onPurchase: () => void
}) {
  const Icon = componentIcon[product.components[0]?.componentType] || Zap

  return (
    <article className="flex min-h-[330px] flex-col rounded-[22px] border border-indigo-300/90 bg-white p-5 shadow-[0_8px_22px_rgba(79,70,229,0.06)] transition-shadow hover:shadow-[0_12px_30px_rgba(79,70,229,0.12)] dark:border-indigo-500/40 dark:bg-slate-950">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-xl font-bold text-slate-950 dark:text-slate-50">{product.name}</h3>
      <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-600 dark:text-slate-300">
        {product.description || "Additional capacity for your active subscription period."}
      </p>
      <div className="mt-4 space-y-2 border-t border-indigo-100 pt-4 dark:border-indigo-400/20">
        {product.components.map((component) => (
          <div key={component.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <Check className="h-4 w-4 shrink-0 text-indigo-500" />
            <span>
              <strong>{component.quantity.toLocaleString()} {component.unit}</strong>{" "}
              {componentLabel[component.componentType] || component.componentType}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-5">
        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-300">{formatMoney(product.price, product.currency)}</p>
        <Button className="mt-3 w-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600" onClick={onPurchase} disabled={!canPurchase || purchasing}>
          {purchasing ? "Requesting..." : canPurchase ? "Add to Plan" : disabledReason}
        </Button>
      </div>
    </article>
  )
}

export function PackagesTab() {
  const billingQuery = useBillingOverview()
  const periodsQuery = useSubscriptionPeriods()
  const productsQuery = useAddOnProducts()
  const plansQuery = usePublicSubscriptionPlans()

  const billing = billingQuery.data ?? null
  const periodData = periodsQuery.data ?? null
  const products = productsQuery.data ?? []
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  const isLoading =
    billingQuery.isLoading || periodsQuery.isLoading || plansQuery.isLoading
  const error =
    billingQuery.error || periodsQuery.error || plansQuery.error
      ? getApiErrorMessage(
          billingQuery.error || periodsQuery.error || plansQuery.error,
          "Packages could not be loaded.",
        )
      : ""
  const productsError = productsQuery.isError

  const [loadingProductId, setLoadingProductId] = useState<string | null>(null)
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [localError, setLocalError] = useState("")
  const queryClient = useQueryClient()

  const currentMonth = currentYangonMonth()
  const currentPlanId = resolveCurrentPlanId(
    periodData?.entitlement,
    undefined,
    billing?.plan?.id,
  )
  const currentPlanPrice = Number(
    plans.find((plan) => plan.id === currentPlanId)?.monthlyPrice ||
      billing?.plan?.monthlyPrice ||
      0,
  )
  const trialActive = Boolean(periodData?.entitlement && billing?.trial?.periodStatus === "active")
  const activePaidPeriod = useMemo(
    () =>
      periodData?.periods.find(
        (period) =>
          period.periodType === "paid" &&
          period.periodStatus === "active" &&
          period.paymentStatus === "paid",
      ) || null,
    [periodData],
  )
  const hasEntitlement = Boolean(periodData?.entitlement)
  const operationalPaidPeriod = Boolean(
    hasEntitlement &&
      activePaidPeriod &&
      (activePaidPeriod.adminActivationStatus || "approved") === "approved",
  )
  const currentPaidReservation = Boolean(
    periodData?.periods.some(
      (period) =>
        period.periodType === "paid" &&
        monthKeyFromInstant(period.monthStartAt) === currentMonth &&
        ["paid", "waived"].includes(period.paymentStatus),
    ),
  )
  const currentPaidAccess = Boolean(
    hasEntitlement && (activePaidPeriod || currentPaidReservation),
  )
  const trialPurchaseConfirmed = trialActive && currentPaidReservation
  const upgradeAvailable = Boolean(operationalPaidPeriod && !billing?.upgrade)

  const pendingSubscriptionRecord = useMemo(
    () =>
      billing?.records
        .filter(
          (record) =>
            record.metadata?.purchaseRequestType === "subscription_period" &&
            record.invoiceStatus !== "void" &&
            !["paid", "waived"].includes(record.paymentStatus),
        )
        .sort(
          (left, right) =>
            new Date(left.billingPeriodStart).getTime() - new Date(right.billingPeriodStart).getTime(),
        )[0] || null,
    [billing?.records],
  )
  const pendingPeriod = useMemo(
    () =>
      periodData?.periods.find(
        (period) =>
          period.periodType === "paid" &&
          ["pending_payment", "pending_activation", "upcoming"].includes(period.periodStatus) &&
          !["paid", "waived"].includes(period.paymentStatus),
      ) || null,
    [periodData?.periods],
  )
  const pendingTrialConversion = Boolean(
    billing?.upgrade?.kind === "trial_conversion" &&
      billing.upgrade.upgradeStatus !== "cancelled" &&
      !["approved", "rejected", "stale"].includes(billing.upgrade.upgradeStatus),
  )
  const afterTrialRecord = useMemo(
    () =>
      billing?.records.find(
        (record) =>
          record.metadata?.purchaseMode === "after_trial" &&
          record.invoiceStatus !== "void",
      ) || null,
    [billing?.records],
  )
  const pendingPlanId =
    typeof pendingSubscriptionRecord?.metadata?.selectedPlanId === "string"
      ? pendingSubscriptionRecord.metadata.selectedPlanId
      : pendingSubscriptionRecord?.subscriptionPlan?.id ||
        pendingPeriod?.planId ||
        (pendingTrialConversion || periodData?.entitlement?.periodType === "trial"
          ? billing?.upgrade?.targetPlanId
          : null) ||
        (typeof afterTrialRecord?.metadata?.selectedPlanId === "string"
          ? afterTrialRecord.metadata.selectedPlanId
          : null) ||
        null
  const pendingPlan = plans.find((plan) => plan.id === pendingPeriod?.planId) || null
  const pendingPlanName =
    typeof pendingSubscriptionRecord?.metadata?.selectedPlanName === "string"
      ? pendingSubscriptionRecord.metadata.selectedPlanName
      : pendingSubscriptionRecord?.subscriptionPlan?.name ||
        pendingPlan?.name ||
        (pendingTrialConversion || periodData?.entitlement?.periodType === "trial"
          ? billing?.upgrade?.targetPlanName
          : null) ||
        (typeof afterTrialRecord?.metadata?.selectedPlanName === "string"
          ? afterTrialRecord.metadata.selectedPlanName
          : null) ||
        null
  const pendingMonth = monthKeyFromInstant(
    pendingSubscriptionRecord?.billingPeriodStart || pendingPeriod?.monthStartAt,
  )
  const scheduledStartAt =
    typeof afterTrialRecord?.metadata?.scheduledStartAt === "string"
      ? afterTrialRecord.metadata.scheduledStartAt
      : billing?.trial?.periodEndAt || null
  const trialAuthoritative = Boolean(
    periodData?.entitlement?.periodType === "trial" &&
      periodData.entitlement.periodStatus === "active",
  )
  const unpaidAfterTrialRecord = Boolean(
    afterTrialRecord && !["paid", "waived"].includes(afterTrialRecord.paymentStatus),
  )
  const hasBlockingPaymentRequest = Boolean(
    pendingSubscriptionRecord || pendingPeriod || unpaidAfterTrialRecord || pendingTrialConversion,
  )
  const nextMonth = useMemo(() => {
    const latest = [...(periodData?.periods || [])]
      .filter((period) => period.periodStatus !== "cancelled")
      .sort((left, right) => right.sequenceNumber - left.sequenceNumber)[0]
    return latest?.monthEndAt ? monthKeyFromInstant(latest.monthEndAt) : nextMonthKey(currentMonth)
  }, [currentMonth, periodData?.periods])

  const sortedPlans = useMemo(
    () =>
      [...plans].sort((left, right) => {
        if (left.id === currentPlanId) return -1
        if (right.id === currentPlanId) return 1
        return left.displayOrder - right.displayOrder
      }),
    [currentPlanId, plans],
  )

  const handleSubscriptionPurchase = async (
    planId: string,
    startOption: SubscriptionPurchaseStartOption,
  ) => {
    if (loadingPlanId) return
    setLoadingPlanId(planId)
    setMessage("")
    setLocalError("")
    try {
      const result = await tenantBillingApi.createSubscriptionPurchaseRequest(
        startOption,
        `workspace-billing-v2-${planId}-${startOption}-${crypto.randomUUID()}`,
        planId,
      )
      const targetMonth = result.purchase.scheduledStartAt
        ? formatDate(result.purchase.scheduledStartAt)
        : monthLabel(monthKeyFromInstant(result.purchase.monthStartAt))
      setMessage(`${targetMonth} was reserved for ${formatMoney(result.purchase.amountDue, result.purchase.currency)}. Submit payment proof from Billing History.`)
      void queryClient.invalidateQueries({ queryKey: billingKeys.all })
    } catch (requestError) {
      setMessage("")
      setLocalError(getApiErrorMessage(requestError, "This subscription month could not be reserved."))
    } finally {
      setLoadingPlanId(null)
    }
  }

  const handleAddOnPurchase = async (product: TenantAddOnProductDto) => {
    if (loadingProductId) return
    setLoadingProductId(product.id)
    setMessage("")
    setLocalError("")
    try {
      await tenantBillingApi.createAddOnPurchase(product.id, `workspace-billing-v2-addon-${product.id}-${crypto.randomUUID()}`)
      setMessage(`${product.name} was requested for the active Yangon month. Payment remains pending until confirmation.`)
      void queryClient.invalidateQueries({ queryKey: billingKeys.all })
    } catch (requestError) {
      setMessage("")
      setLocalError(getApiErrorMessage(requestError, "This add-on package could not be requested."))
    } finally {
      setLoadingProductId(null)
    }
  }

  const handleContinuePayment = () => {
    window.location.assign("/workspace/billing?tab=billing-history")
  }

  if (isLoading) {
    return <PackagesFeedback message="Loading available packages..." />
  }

  if (error && !billing) {
    return <PackagesFeedback message={error} error />
  }

  return (
    <div className="space-y-12">
      {localError ? <Feedback message={localError} error /> : null}
      {!localError && error ? <Feedback message={error} error /> : null}
      {message ? <Feedback message={message} /> : null}
      {productsError ? (
        <Feedback
          message="Add-on catalog could not be loaded. Please try again later."
          error
        />
      ) : null}
      {trialAuthoritative && trialPurchaseConfirmed ? (
        <Feedback message="Your Trial Plan remains active. The business upgrade has been paid and is awaiting Platform Admin activation; trial usage and limits continue until approval." />
      ) : null}

      <section aria-labelledby="billing-v2-available-plans">
        <div className="mb-6">
          <h2 id="billing-v2-available-plans" className="text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Available Plans</h2>
          <p className="mt-2 max-w-4xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Browse every active plan in the catalog. Request an eligible plan for this month or the next sequential calendar month. All purchases use the full monthly price with no proration.
          </p>
        </div>
        {sortedPlans.length === 0 ? (
          <EmptyCatalog title="No active subscription plans are available right now." icon={Zap} />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sortedPlans.map((plan) => {
              let mode: PlanCardProps["mode"]
              if (plan.availability === "contact-only") mode = "contact"
              else if (hasBlockingPaymentRequest) mode = plan.id === pendingPlanId ? "pending-target" : "pending-other"
              else if (trialActive && afterTrialRecord && ["paid", "waived"].includes(afterTrialRecord.paymentStatus)) mode = "paid"
              else if (trialAuthoritative && trialPurchaseConfirmed) mode = "trial-awaiting"
              else if (trialActive && afterTrialRecord) mode = "scheduled"
              else if (trialActive) mode = "trial"
              else if (currentPaidAccess && activePaidPeriod && !operationalPaidPeriod) mode = "blocked"
              else if (currentPaidAccess) mode = "paid"
              else if (billing?.plan || billing?.tenant) mode = "first"
              else mode = "blocked"

              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentPlanId={currentPlanId}
                  pendingMonth={pendingMonth}
                  pendingPlanName={pendingPlanName}
                  mode={mode}
                  nextMonth={nextMonth}
                  currentMonth={currentMonth}
                  currentPlanPrice={currentPlanPrice}
                  upgradeAvailable={upgradeAvailable}
                  scheduledStartAt={scheduledStartAt}
                  scheduledPaymentStatus={afterTrialRecord?.paymentStatus}
                  pendingPlanId={pendingPlanId}
                  revisionStatus={
                    billing?.upgrade && billing.upgrade.targetPlanId === plan.id
                      ? upgradeStatusLabel(billing.upgrade.upgradeStatus)
                      : null
                  }
                  purchasing={loadingPlanId === plan.id}
                  onPurchase={handleSubscriptionPurchase}
                  onContinuePayment={handleContinuePayment}
                />
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="billing-v2-addon-plans">
        <div className="mb-6">
          <h2 id="billing-v2-addon-plans" className="text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Add On Packages</h2>
          <p className="mt-2 max-w-4xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Add capacity to your operational paid period. Add-ons apply only to the active Yangon month and require a confirmed main plan.
          </p>
        </div>
        {products.length === 0 ? (
          <EmptyCatalog title="No published add-on packages are available right now." icon={Database} />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <AddOnCard
                key={product.id}
                product={product}
                canPurchase={operationalPaidPeriod}
                disabledReason={
                  trialActive
                    ? "Not available on trial"
                    : activePaidPeriod && !operationalPaidPeriod
                      ? "Awaiting activation"
                      : "Requires active paid plan"
                }
                purchasing={loadingProductId === product.id}
                onPurchase={() => void handleAddOnPurchase(product)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Feedback({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-2xl border p-4 text-sm", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200")}>
      {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <p>{message}</p>
    </div>
  )
}

function PackagesFeedback({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <div className={cn("rounded-[22px] border p-8 text-center text-sm", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200" : "border-indigo-200 bg-gradient-to-r from-indigo-50 to-cyan-50 text-slate-600 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-cyan-500/10 dark:text-slate-300")}>
      {message}
    </div>
  )
}

function EmptyCatalog({ title, icon: Icon }: { title: string; icon: typeof Zap }) {
  return (
    <div className="rounded-[22px] border border-dashed border-indigo-300 bg-indigo-50/40 p-10 text-center text-sm text-slate-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-300">
      <Icon className="mx-auto mb-3 h-7 w-7 text-indigo-500" />
      {title}
    </div>
  )
}
