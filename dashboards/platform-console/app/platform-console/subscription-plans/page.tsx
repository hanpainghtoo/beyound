"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getStoredSession,
  getSubscriptionPlans,
  PlatformApiError,
  updateSubscriptionPlan,
  type SubscriptionPlanDto,
} from "@/lib/api"

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Subscription plans could not be loaded."
const formatMoney = (value: number | string) => `MMK ${Number(value || 0).toLocaleString()} / month`
const formatNumber = (value: number | string) => Number(value || 0).toLocaleString()
const formatLimit = (value: number | null | undefined) => (value === null || value === undefined ? "Unlimited" : formatNumber(value))
const featuresFor = (plan: SubscriptionPlanDto) =>
  Object.entries(plan.features || {})
    .filter(([key, value]) => key !== "public" && Boolean(value))
    .map(([key]) => key.replaceAll("_", " "))

function publicMetaFor(plan: SubscriptionPlanDto) {
  const features = plan.features && typeof plan.features === "object" ? plan.features : {}
  const publicMeta = "public" in features && features.public && typeof features.public === "object" ? features.public as Record<string, unknown> : {}
  return publicMeta
}

const canManagePlans = (role?: string) => role === "super_admin" || role === "ops_admin"

const PROVIDER_OPTIONS = [
  { value: "messenger", label: "MESSENGER" },
  { value: "telegram", label: "TELEGRAM" },
  { value: "viber", label: "VIBER" },
  { value: "tiktok", label: "TIKTOK" },
] as const

const PROVIDER_LABELS: Record<string, string> = {
  messenger: "MESSENGER",
  telegram: "TELEGRAM",
  viber: "VIBER",
  tiktok: "TIKTOK",
}

type SortKey = "name" | "monthlyPrice" | "maxCsrs" | "maxChannels" | "status" | "updatedAt"
type PlanFormState = {
  name: string
  planType: "business" | "trial"
  trialDurationDays: string
  description: string
  monthlyPrice: string
  maxCsrs: string
  maxChannels: string
  inboundMessageLimit: string
  outboundMessageLimit: string
  allowedProviders: string[]
  apiLimit: string
  storageLimitGb: string
  status: "active" | "inactive" | "archived"
  publicVisible: "true" | "false"
  publicDisplayOrder: string
  publicEyebrow: string
  publicSummary: string
  publicTargetCustomer: string
  publicRecommended: "true" | "false"
  publicRecommendationLabel: string
  publicSelfServe: "true" | "false"
  publicCurrencyCode: string
  publicBillingInterval: "monthly" | "one_time" | "custom" | ""
  publicMonthlyPriceLabel: string
  publicSetupFeeMmk: string
  publicSetupFeeLabel: string
  publicSetupFeeStartsFrom: "true" | "false"
  publicIncludedUsersLabel: string
  publicIncludedChannelsLabel: string
  publicCtaLabel: string
  publicCtaHref: string
  publicAvailability: "enabled" | "contact-only"
  publicFeatureListText: string
  featureFlagsText: string
}

const emptyForm: PlanFormState = {
  name: "",
  planType: "business",
  trialDurationDays: "30",
  description: "",
  monthlyPrice: "0",
  maxCsrs: "5",
  maxChannels: "1",
  inboundMessageLimit: "0",
  outboundMessageLimit: "0",
  allowedProviders: ["messenger"],
  apiLimit: "0",
  storageLimitGb: "0",
  status: "active",
  publicVisible: "true",
  publicDisplayOrder: "",
  publicEyebrow: "",
  publicSummary: "",
  publicTargetCustomer: "",
  publicRecommended: "false",
  publicRecommendationLabel: "",
  publicSelfServe: "false",
  publicCurrencyCode: "",
  publicBillingInterval: "",
  publicMonthlyPriceLabel: "",
  publicSetupFeeMmk: "",
  publicSetupFeeLabel: "",
  publicSetupFeeStartsFrom: "false",
  publicIncludedUsersLabel: "",
  publicIncludedChannelsLabel: "",
  publicCtaLabel: "",
  publicCtaHref: "",
  publicAvailability: "enabled",
  publicFeatureListText: "",
  featureFlagsText: "{}",
}

function formFromPlan(plan: SubscriptionPlanDto): PlanFormState {
  const publicMeta = publicMetaFor(plan)
  const features = plan.features && typeof plan.features === "object" ? { ...plan.features } as Record<string, unknown> : {}
  delete features.public

  return {
    name: plan.name,
    planType: plan.planType === "trial" ? "trial" : "business",
    trialDurationDays: String(Number(plan.durationDays || 30)),
    description: plan.description || "",
    monthlyPrice: String(Number(plan.monthlyPrice || 0)),
    maxCsrs: String(plan.maxCsrs),
    maxChannels: String(plan.maxChannels),
    inboundMessageLimit: plan.inboundMessageLimit === null || plan.inboundMessageLimit === undefined ? "" : String(plan.inboundMessageLimit),
    outboundMessageLimit: plan.outboundMessageLimit === null || plan.outboundMessageLimit === undefined ? "" : String(plan.outboundMessageLimit),
    allowedProviders:
      Array.isArray(plan.allowedProviders) && plan.allowedProviders.length > 0
        ? [...plan.allowedProviders]
        : ["messenger"],
    apiLimit: plan.apiLimit === null || plan.apiLimit === undefined ? "" : String(plan.apiLimit),
    storageLimitGb: String(plan.storageLimitGb),
    status: (plan.status as PlanFormState["status"]) || "active",
    publicVisible: publicMeta.visible === false ? "false" : "true",
    publicDisplayOrder: typeof publicMeta.displayOrder === "number" ? String(publicMeta.displayOrder) : "",
    publicEyebrow: typeof publicMeta.eyebrow === "string" ? publicMeta.eyebrow : "",
    publicSummary: typeof publicMeta.summary === "string" ? publicMeta.summary : "",
    publicTargetCustomer: typeof publicMeta.targetCustomer === "string" ? publicMeta.targetCustomer : "",
    publicRecommended: publicMeta.recommended === true ? "true" : "false",
    publicRecommendationLabel: typeof publicMeta.recommendationLabel === "string" ? publicMeta.recommendationLabel : "",
    publicSelfServe: publicMeta.selfServe === true ? "true" : "false",
    publicCurrencyCode: typeof publicMeta.currencyCode === "string" ? publicMeta.currencyCode : "",
    publicBillingInterval:
      publicMeta.billingInterval === "monthly" || publicMeta.billingInterval === "one_time" || publicMeta.billingInterval === "custom"
        ? publicMeta.billingInterval
        : "",
    publicMonthlyPriceLabel: typeof publicMeta.monthlyPriceLabel === "string" ? publicMeta.monthlyPriceLabel : "",
    publicSetupFeeMmk: typeof publicMeta.setupFeeMmk === "number" ? String(publicMeta.setupFeeMmk) : "",
    publicSetupFeeLabel: typeof publicMeta.setupFeeLabel === "string" ? publicMeta.setupFeeLabel : "",
    publicSetupFeeStartsFrom: publicMeta.setupFeeStartsFrom === true ? "true" : "false",
    publicIncludedUsersLabel: typeof publicMeta.includedUsersLabel === "string" ? publicMeta.includedUsersLabel : "",
    publicIncludedChannelsLabel: typeof publicMeta.includedChannelsLabel === "string" ? publicMeta.includedChannelsLabel : "",
    publicCtaLabel: typeof publicMeta.ctaLabel === "string" ? publicMeta.ctaLabel : "",
    publicCtaHref: typeof publicMeta.ctaHref === "string" ? publicMeta.ctaHref : "",
    publicAvailability: publicMeta.availability === "contact-only" ? "contact-only" : "enabled",
    publicFeatureListText: Array.isArray(publicMeta.featureList) ? publicMeta.featureList.filter((item): item is string => typeof item === "string").join("\n") : "",
    featureFlagsText: JSON.stringify(features, null, 2),
  }
}

function parseForm(form: PlanFormState) {
  const features = form.featureFlagsText.trim() ? JSON.parse(form.featureFlagsText) : {}
  const featureList = form.publicFeatureListText
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
  const publicMeta: Record<string, unknown> = {
    visible: form.publicVisible === "true",
    recommended: form.publicRecommended === "true",
    selfServe: form.publicSelfServe === "true",
    setupFeeStartsFrom: form.publicSetupFeeStartsFrom === "true",
    availability: form.publicAvailability,
  }

  if (form.publicDisplayOrder.trim()) publicMeta.displayOrder = Number(form.publicDisplayOrder)
  if (form.publicEyebrow.trim()) publicMeta.eyebrow = form.publicEyebrow.trim()
  if (form.publicSummary.trim()) publicMeta.summary = form.publicSummary.trim()
  if (form.publicTargetCustomer.trim()) publicMeta.targetCustomer = form.publicTargetCustomer.trim()
  if (form.publicRecommendationLabel.trim()) publicMeta.recommendationLabel = form.publicRecommendationLabel.trim()
  if (form.publicCurrencyCode.trim()) publicMeta.currencyCode = form.publicCurrencyCode.trim().toUpperCase()
  if (form.publicBillingInterval) publicMeta.billingInterval = form.publicBillingInterval
  if (form.publicMonthlyPriceLabel.trim()) publicMeta.monthlyPriceLabel = form.publicMonthlyPriceLabel.trim()
  if (form.publicSetupFeeMmk.trim()) publicMeta.setupFeeMmk = Number(form.publicSetupFeeMmk)
  if (form.publicSetupFeeLabel.trim()) publicMeta.setupFeeLabel = form.publicSetupFeeLabel.trim()
  if (form.publicIncludedUsersLabel.trim()) publicMeta.includedUsersLabel = form.publicIncludedUsersLabel.trim()
  if (form.publicIncludedChannelsLabel.trim()) publicMeta.includedChannelsLabel = form.publicIncludedChannelsLabel.trim()
  if (form.publicCtaLabel.trim()) publicMeta.ctaLabel = form.publicCtaLabel.trim()
  if (form.publicCtaHref.trim()) publicMeta.ctaHref = form.publicCtaHref.trim()
  if (featureList.length > 0) publicMeta.featureList = featureList

  return {
    name: form.name.trim(),
    planType: form.planType,
    durationDays:
      form.planType === "trial" ? Number(form.trialDurationDays) : undefined,
    // Trial plans are locked server-side to the accepted trial constraints;
    // business plans keep the normal catalog defaults.
    requestable: form.planType !== "trial",
    renewable: form.planType !== "trial",
    topUpAllowed: form.planType !== "trial",
    autoApprove: form.planType === "trial",
    description: form.description.trim() || undefined,
    monthlyPrice: Number(form.monthlyPrice),
    maxCsrs: Number(form.maxCsrs),
    maxChannels: Number(form.maxChannels),
    inboundMessageLimit: form.inboundMessageLimit.trim() === "" ? null : Number(form.inboundMessageLimit),
    outboundMessageLimit: form.outboundMessageLimit.trim() === "" ? null : Number(form.outboundMessageLimit),
    allowedProviders: [...form.allowedProviders],
    apiLimit: form.apiLimit.trim() === "" ? null : Number(form.apiLimit),
    storageLimitGb: Number(form.storageLimitGb),
    status: form.status,
    features: {
      ...features,
      public: publicMeta,
    },
  }
}

function validateForm(form: PlanFormState) {
  if (!form.name.trim()) return "Plan name is required."
  if (form.planType === "trial") {
    const duration = Number(form.trialDurationDays)
    if (!Number.isInteger(duration) || duration <= 0) {
      return "Trial duration must be a positive whole number of days."
    }
  }
  const requiredNumeric = [form.monthlyPrice, form.maxCsrs, form.maxChannels, form.storageLimitGb]
  if (requiredNumeric.some((value) => value.trim() === "")) {
    return "All required numeric fields must be filled."
  }
  const requiredValues = requiredNumeric.map(Number)
  if (requiredValues.some((value) => Number.isNaN(value) || value < 0)) return "Numeric fields must be zero or greater."
  const optionalLimits = [form.inboundMessageLimit, form.outboundMessageLimit, form.apiLimit]
  const parsedLimits = optionalLimits.map((value) => (value.trim() === "" ? null : Number(value)))
  if (parsedLimits.some((value) => value !== null && (Number.isNaN(value) || value < 0))) {
    return "Message and API limits must be zero or greater, or left empty for unlimited."
  }
  if (form.allowedProviders.length === 0) return "At least one provider must be enabled."
  if (form.publicDisplayOrder.trim() && (Number.isNaN(Number(form.publicDisplayOrder)) || Number(form.publicDisplayOrder) < 0)) return "Public display order must be zero or greater."
  if (form.publicSetupFeeMmk.trim() && (Number.isNaN(Number(form.publicSetupFeeMmk)) || Number(form.publicSetupFeeMmk) < 0)) return "Public setup fee must be zero or greater."
  if (!form.publicMonthlyPriceLabel.trim() && Number(form.monthlyPrice) > 0) {
    if (!form.publicCurrencyCode.trim()) return "Public currency code is required when a plan publishes a numeric price."
    if (!form.publicBillingInterval) return "Public billing interval is required when a plan publishes a numeric price."
  }
  try {
    const parsed = JSON.parse(form.featureFlagsText || "{}")
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return "Features JSON must be an object."
  } catch {
    return "Additional feature flags must be valid JSON."
  }
  return ""
}

export default function Page() {
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [role, setRole] = useState<string>()
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanDto | null>(null)
  const [form, setForm] = useState<PlanFormState>(emptyForm)
  const [saveError, setSaveError] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canManage = canManagePlans(role)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    setPermissionDenied(false)
    try {
      setPlans(await getSubscriptionPlans())
    } catch (requestError) {
      if (requestError instanceof PlatformApiError && requestError.status === 403) setPermissionDenied(true)
      setError(errorMessage(requestError))
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setRole(getStoredSession()?.user.role)
    void load()
  }, [load])

  const activePlans = useMemo(() => plans.filter((plan) => plan.status === "active").length, [plans])
  const messageCapacity = useMemo(() => plans.reduce((sum, plan) => sum + Number(plan.inboundMessageLimit ?? plan.messageLimit ?? 0), 0), [plans])
  const storageCapacity = useMemo(() => plans.reduce((sum, plan) => sum + Number(plan.storageLimitGb || 0), 0), [plans])

  const sortedPlans = useMemo(() => {
    const next = [...plans]
    next.sort((left, right) => {
      const factor = sortDirection === "asc" ? 1 : -1

      if (sortKey === "name" || sortKey === "status") {
        return left[sortKey].localeCompare(right[sortKey]) * factor
      }

      if (sortKey === "updatedAt") {
        return (new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()) * factor
      }

      return (Number(left[sortKey] || 0) - Number(right[sortKey] || 0)) * factor
    })
    return next
  }, [plans, sortDirection, sortKey])

  const openCreate = () => {
    setForm(emptyForm)
    setSaveError("")
    setCreateOpen(true)
  }

  const openEdit = (plan: SubscriptionPlanDto) => {
    setSelectedPlan(plan)
    setForm(formFromPlan(plan))
    setSaveError("")
    setEditOpen(true)
  }

  const openDelete = (plan: SubscriptionPlanDto) => {
    setSelectedPlan(plan)
    setDeleteError("")
    setDeleteOpen(true)
  }

  const submitCreate = async () => {
    const validationMessage = validateForm(form)
    if (validationMessage) {
      setSaveError(validationMessage)
      return
    }

    setSaving(true)
    setSaveError("")
    try {
      const created = await createSubscriptionPlan(parseForm(form))
      setPlans((current) => [created, ...current])
      setCreateOpen(false)
      setForm(emptyForm)
    } catch (requestError) {
      setSaveError(errorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  const submitEdit = async () => {
    if (!selectedPlan) return
    const validationMessage = validateForm(form)
    if (validationMessage) {
      setSaveError(validationMessage)
      return
    }

    setSaving(true)
    setSaveError("")
    try {
      const updated = await updateSubscriptionPlan(selectedPlan.id, parseForm(form))
      setPlans((current) => current.map((plan) => (plan.id === updated.id ? updated : plan)))
      setEditOpen(false)
      setSelectedPlan(null)
    } catch (requestError) {
      setSaveError(errorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!selectedPlan) return

    setDeleting(true)
    setDeleteError("")
    try {
      await deleteSubscriptionPlan(selectedPlan.id)
      setPlans((current) => current.filter((plan) => plan.id !== selectedPlan.id))
      setDeleteOpen(false)
      setSelectedPlan(null)
    } catch (requestError) {
      setDeleteError(errorMessage(requestError))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Plans & Entitlements"
        description="Review live subscription tiers, update plan details, sort operationally, and remove unused plans."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={openCreate} disabled={!canManage} className="bg-sky-500 text-slate-950 hover:bg-sky-400">
              <Plus className="mr-2 h-4 w-4" />
              Create plan
            </Button>
          </div>
        }
      />

      <ConsolePage>
        {error ? <StateMessage title={permissionDenied ? "Permission required" : "Plans unavailable"} message={error} destructive /> : null}
        {!canManage && !permissionDenied ? <StateMessage title="Read-only access" message="Your platform role can inspect plans, but only super and operations admins can create, update, or delete them." /> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <ConsoleStatCard label="Plans" value={loading ? "..." : plans.length} note="Live subscription records" tone="blue" />
          <ConsoleStatCard label="Active plans" value={loading ? "..." : activePlans} note="Available for merchants" tone="emerald" />
          <ConsoleStatCard label="Monthly inbound capacity" value={loading ? "..." : formatNumber(messageCapacity)} note={`${formatNumber(storageCapacity)} GB storage across plans`} tone="amber" />
        </div>

        <ConsoleSection
          title="Plan catalog"
          description="Sort plans by pricing, capacity, status, or recent updates."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                <SelectTrigger className="w-[180px] border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updatedAt">Last updated</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="monthlyPrice">Price per month</SelectItem>
                  <SelectItem value="maxCsrs">Seats</SelectItem>
                  <SelectItem value="maxChannels">Channels</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as "asc" | "desc")}>
                <SelectTrigger className="w-[140px] border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        >
          {loading ? <StatePanel message="Loading live subscription plans..." /> : error ? <StatePanel message="Subscription plans could not be loaded." /> : sortedPlans.length === 0 ? <StatePanel message="No subscription plans have been configured yet." /> : (
            <div className="grid gap-4 xl:grid-cols-2">
              {sortedPlans.map((plan) => {
                const features = featuresFor(plan)
                const publicMeta = publicMetaFor(plan)
                const publicFeatureList = Array.isArray(publicMeta.featureList)
                  ? publicMeta.featureList.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                  : []
                return (
                  <ConsoleSection
                    key={plan.id}
                    title={plan.name}
                    description={formatMoney(plan.monthlyPrice)}
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={plan.status === "active" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300"}>
                          {plan.status}
                        </Badge>
                        {plan.planType === "trial" ? (
                          <Badge variant="outline" className="border-amber-400/30 bg-amber-500/10 text-amber-100">
                            Trial · {plan.durationDays} days
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-100">
                            Monthly plan
                          </Badge>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openEdit(plan)} disabled={!canManage} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openDelete(plan)} disabled={!canManage} className="border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    }
                  >
                    {plan.description ? <p className="mb-4 text-sm text-slate-400">{plan.description}</p> : null}
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        ["Seats", formatNumber(plan.maxCsrs)],
                        ["Inbound / month", formatLimit(plan.inboundMessageLimit)],
                        ["Outbound / month", formatLimit(plan.outboundMessageLimit)],
                        ["Channels", formatNumber(plan.maxChannels)],
                        ["Storage", `${formatNumber(plan.storageLimitGb)} GB`],
                        ["API requests / month", formatLimit(plan.apiLimit)],
                        ["Updated", new Date(plan.updatedAt).toLocaleDateString()],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <p className="text-sm text-slate-400">{label}</p>
                          <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-white">Allowed providers</p>
                      <div className="flex flex-wrap gap-2">
                        {Array.isArray(plan.allowedProviders) && plan.allowedProviders.length > 0 ? plan.allowedProviders.map((provider) => (
                          <Badge key={provider} variant="outline" className="border-white/10 bg-white/5 text-slate-300">
                            {PROVIDER_LABELS[provider] || provider}
                          </Badge>
                        )) : (
                          <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-400">None configured</Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-white">Feature access</p>
                      <div className="flex flex-wrap gap-2">
                        {features.length === 0 ? <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-400">No feature flags recorded</Badge> : features.map((item) => (
                          <Badge key={item} variant="outline" className="border-white/10 bg-white/5 text-slate-300">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">Landing page profile</p>
                        <Badge variant="outline" className="border-sky-300/30 bg-sky-400/10 text-sky-100">
                          {publicMeta.visible === false ? "Hidden" : "Visible"}
                        </Badge>
                        <Badge variant="outline" className="border-sky-300/30 bg-sky-400/10 text-sky-100">
                          {publicMeta.availability === "contact-only" ? "Contact only" : "Published"}
                        </Badge>
                        {publicMeta.recommended === true ? (
                          <Badge variant="outline" className="border-indigo-300/30 bg-indigo-400/10 text-indigo-100">Recommended</Badge>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <p className="text-sm text-slate-400">Target customer</p>
                          <p className="mt-2 text-sm text-white">{typeof publicMeta.targetCustomer === "string" && publicMeta.targetCustomer.trim() ? publicMeta.targetCustomer : "Not set"}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <p className="text-sm text-slate-400">CTA</p>
                          <p className="mt-2 text-sm text-white">{typeof publicMeta.ctaLabel === "string" && publicMeta.ctaLabel.trim() ? publicMeta.ctaLabel : "Not set"}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-slate-400">Landing page bullets</p>
                        {publicFeatureList.length === 0 ? (
                          <p className="text-sm text-slate-500">No landing page feature bullets configured.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {publicFeatureList.map((item) => (
                              <Badge key={item} variant="outline" className="border-sky-300/20 bg-white/5 text-sky-50">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </ConsoleSection>
                )
              })}
            </div>
          )}
        </ConsoleSection>
      </ConsolePage>

      <PlanDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create subscription plan"
        description="Create a new plan record for platform assignment and merchant billing workflows."
        form={form}
        onChange={setForm}
        error={saveError}
        onSubmit={() => void submitCreate()}
        saving={saving}
        submitLabel="Create plan"
      />

      <PlanDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={selectedPlan ? `Edit ${selectedPlan.name}` : "Edit subscription plan"}
        description="Update plan pricing, limits, status, and stored feature metadata."
        form={form}
        onChange={setForm}
        error={saveError}
        onSubmit={() => void submitEdit()}
        saving={saving}
        submitLabel="Save changes"
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Delete subscription plan</DialogTitle>
            <DialogDescription className="text-slate-300">
              This removes the plan permanently. Plans assigned to merchants cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <StateMessage title="Delete failed" message={deleteError} destructive /> : null}
          <p className="text-sm text-slate-300">
            {selectedPlan ? `Delete "${selectedPlan.name}"?` : "Delete this plan?"}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} className="border-white/10 bg-white/5">
              Cancel
            </Button>
            <Button onClick={() => void confirmDelete()} disabled={deleting} className="bg-rose-500 text-white hover:bg-rose-400">
              {deleting ? "Deleting..." : "Delete plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PlanDialog({
  open,
  onOpenChange,
  title,
  description,
  form,
  onChange,
  error,
  onSubmit,
  saving,
  submitLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  form: PlanFormState
  onChange: (form: PlanFormState) => void
  error: string
  onSubmit: () => void
  saving: boolean
  submitLabel: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1727] text-white">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-slate-300">{description}</DialogDescription>
        </DialogHeader>
        {error ? <StateMessage title="Save failed" message={error} destructive /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan name">
            <Input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(value) => onChange({ ...form, status: value as PlanFormState["status"] })}>
              <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="inactive">inactive</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Plan type">
            <Select value={form.planType} onValueChange={(value) => onChange({ ...form, planType: value as "business" | "trial" })}>
              <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="business">Business (monthly)</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {form.planType === "trial" ? (
            <Field label="Trial duration (days)">
              <Input type="number" min="1" step="1" value={form.trialDurationDays} onChange={(event) => onChange({ ...form, trialDurationDays: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
          ) : null}
          {form.planType === "trial" ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100 sm:col-span-2">
              Trial plans are one-time and never renewable. They are hidden from
              the requestable catalog, cannot purchase top-ups, and auto-approve
              on activation. Duration is counted in whole days.
            </div>
          ) : null}
          <Field label="Price per month (MMK)">
            <Input type="number" min="0" value={form.monthlyPrice} onChange={(event) => onChange({ ...form, monthlyPrice: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
          <Field label="Max CSRs">
            <Input type="number" min="0" value={form.maxCsrs} onChange={(event) => onChange({ ...form, maxCsrs: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
          <Field label="Max channels">
            <Input type="number" min="0" value={form.maxChannels} onChange={(event) => onChange({ ...form, maxChannels: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
          <Field label="Inbound message limit (per month)">
            <Input type="number" min="0" value={form.inboundMessageLimit} onChange={(event) => onChange({ ...form, inboundMessageLimit: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
          <Field label="Outbound message limit (per month)">
            <Input type="number" min="0" value={form.outboundMessageLimit} onChange={(event) => onChange({ ...form, outboundMessageLimit: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
          <Field label="API requests limit (per month)">
            <Input type="number" min="0" value={form.apiLimit} onChange={(event) => onChange({ ...form, apiLimit: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
          <Field label="Storage limit (GB)">
            <Input type="number" min="0" value={form.storageLimitGb} onChange={(event) => onChange({ ...form, storageLimitGb: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
        </div>
        <p className="text-sm text-slate-400">
          Limits are monthly. Leave a message or API limit empty for <span className="text-slate-200">unlimited</span>; enter <span className="text-slate-200">0</span> to block that dimension entirely.
        </p>
        <Field label="Allowed providers">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROVIDER_OPTIONS.map((option) => {
              const enabled = form.allowedProviders.includes(option.value)
              const isOnlyProvider = enabled && form.allowedProviders.length === 1
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  disabled={isOnlyProvider}
                  onClick={() =>
                    onChange({
                      ...form,
                      allowedProviders: enabled
                        ? form.allowedProviders.filter((value) => value !== option.value)
                        : [...form.allowedProviders, option.value],
                    })
                  }
                  className={enabled ? "border-sky-400/40 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30" : "border-white/10 bg-slate-950/40 text-slate-400 hover:bg-white/10"}
                >
                  {option.label}
                </Button>
              )
            })}
          </div>
          <p className="mt-1 text-sm text-slate-400">Messenger is enabled by default. At least one provider must stay enabled; merchants can only connect channels from this list.</p>
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} className="min-h-24 border-white/10 bg-slate-950/40" />
        </Field>
        <div className="space-y-4 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
          <div>
            <p className="text-sm font-medium text-white">Landing page wiring</p>
            <p className="mt-1 text-sm text-sky-100/80">These fields control the public pricing cards shown on the marketing site.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Public visibility">
              <Select value={form.publicVisible} onValueChange={(value) => onChange({ ...form, publicVisible: value as "true" | "false" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Visible</SelectItem>
                  <SelectItem value="false">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Display order">
              <Input type="number" min="0" value={form.publicDisplayOrder} onChange={(event) => onChange({ ...form, publicDisplayOrder: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Eyebrow">
              <Input value={form.publicEyebrow} onChange={(event) => onChange({ ...form, publicEyebrow: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Target customer">
              <Input value={form.publicTargetCustomer} onChange={(event) => onChange({ ...form, publicTargetCustomer: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Recommended">
              <Select value={form.publicRecommended} onValueChange={(value) => onChange({ ...form, publicRecommended: value as "true" | "false" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Recommendation badge">
              <Input value={form.publicRecommendationLabel} onChange={(event) => onChange({ ...form, publicRecommendationLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Self-serve registration">
              <Select value={form.publicSelfServe} onValueChange={(value) => onChange({ ...form, publicSelfServe: value as "true" | "false" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Availability">
              <Select value={form.publicAvailability} onValueChange={(value) => onChange({ ...form, publicAvailability: value as "enabled" | "contact-only" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Published</SelectItem>
                  <SelectItem value="contact-only">Contact only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Public summary">
            <Textarea value={form.publicSummary} onChange={(event) => onChange({ ...form, publicSummary: event.target.value })} className="min-h-24 border-white/10 bg-slate-950/40" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CTA label">
              <Input value={form.publicCtaLabel} onChange={(event) => onChange({ ...form, publicCtaLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="CTA href">
              <Input value={form.publicCtaHref} onChange={(event) => onChange({ ...form, publicCtaHref: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Monthly price label override">
              <Input value={form.publicMonthlyPriceLabel} onChange={(event) => onChange({ ...form, publicMonthlyPriceLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Public currency code">
              <Input value={form.publicCurrencyCode} onChange={(event) => onChange({ ...form, publicCurrencyCode: event.target.value.toUpperCase() })} className="border-white/10 bg-slate-950/40" placeholder="MMK" />
            </Field>
            <Field label="Public billing interval">
              <Select value={form.publicBillingInterval || "none"} onValueChange={(value) => onChange({ ...form, publicBillingInterval: value === "none" ? "" : value as "monthly" | "one_time" | "custom" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue placeholder="Select interval" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No interval</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Setup fee amount (MMK)">
              <Input type="number" min="0" value={form.publicSetupFeeMmk} onChange={(event) => onChange({ ...form, publicSetupFeeMmk: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Setup fee label">
              <Input value={form.publicSetupFeeLabel} onChange={(event) => onChange({ ...form, publicSetupFeeLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Setup fee starts from">
              <Select value={form.publicSetupFeeStartsFrom} onValueChange={(value) => onChange({ ...form, publicSetupFeeStartsFrom: value as "true" | "false" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Included users label">
              <Input value={form.publicIncludedUsersLabel} onChange={(event) => onChange({ ...form, publicIncludedUsersLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Included channels label">
              <Input value={form.publicIncludedChannelsLabel} onChange={(event) => onChange({ ...form, publicIncludedChannelsLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
          </div>
          <Field label="Landing page feature bullets">
            <Textarea value={form.publicFeatureListText} onChange={(event) => onChange({ ...form, publicFeatureListText: event.target.value })} className="min-h-32 border-white/10 bg-slate-950/40" placeholder={"One line per bullet"} />
          </Field>
        </div>
        <Field label="Additional feature flags JSON">
          <Textarea value={form.featureFlagsText} onChange={(event) => onChange({ ...form, featureFlagsText: event.target.value })} className="min-h-52 font-mono text-xs border-white/10 bg-slate-950/40" />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 bg-white/5">
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving} className="bg-sky-500 text-slate-950 hover:bg-sky-400">
            {saving ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-slate-300">{label}</Label>
      {children}
    </div>
  )
}

function StatePanel({ message }: { message: string }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-10 text-center text-sm text-slate-400">{message}</div>
}

function StateMessage({ title, message, destructive = false }: { title: string; message: string; destructive?: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${destructive ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 opacity-80">{message}</p>
      </div>
    </div>
  )
}
