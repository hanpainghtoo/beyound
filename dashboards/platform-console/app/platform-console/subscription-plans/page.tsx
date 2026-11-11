"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertCircle, ChevronDown, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
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

type SortKey = "name" | "monthlyPrice" | "maxAgents" | "maxChannels" | "status" | "updatedAt"
type PlanFormState = {
  name: string
  planType: "business" | "trial"
  trialDurationDays: string
  description: string
  monthlyPrice: string
  maxAgents: string
  maxAgentsUnlimited: boolean
  maxChannels: string
  maxChannelsUnlimited: boolean
  inboundMessageLimit: string
  inboundMessageLimitUnlimited: boolean
  outboundMessageLimit: string
  outboundMessageLimitUnlimited: boolean
  allowedProviders: string[]
  storageLimitGb: string
  storageLimitGbUnlimited: boolean
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
  maxAgents: "5",
  maxAgentsUnlimited: false,
  maxChannels: "1",
  maxChannelsUnlimited: false,
  inboundMessageLimit: "0",
  inboundMessageLimitUnlimited: false,
  outboundMessageLimit: "0",
  outboundMessageLimitUnlimited: false,
  allowedProviders: ["messenger"],
  storageLimitGb: "0",
  storageLimitGbUnlimited: false,
  status: "active",
  publicVisible: "true",
  publicDisplayOrder: "",
  publicEyebrow: "",
  publicSummary: "",
  publicTargetCustomer: "",
  publicRecommended: "false",
  publicRecommendationLabel: "",
  publicSelfServe: "false",
  publicCurrencyCode: "MMK",
  publicBillingInterval: "monthly",
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
    maxAgents: plan.maxAgents === null || plan.maxAgents === undefined ? "" : String(plan.maxAgents),
    maxAgentsUnlimited: plan.maxAgents === null,
    maxChannels: plan.maxChannels === null || plan.maxChannels === undefined ? "" : String(plan.maxChannels),
    maxChannelsUnlimited: plan.maxChannels === null,
    inboundMessageLimit: plan.inboundMessageLimit === null || plan.inboundMessageLimit === undefined ? "" : String(plan.inboundMessageLimit),
    inboundMessageLimitUnlimited: plan.inboundMessageLimit === null,
    outboundMessageLimit: plan.outboundMessageLimit === null || plan.outboundMessageLimit === undefined ? "" : String(plan.outboundMessageLimit),
    outboundMessageLimitUnlimited: plan.outboundMessageLimit === null,
    allowedProviders:
      Array.isArray(plan.allowedProviders) && plan.allowedProviders.length > 0
        ? [...plan.allowedProviders]
        : ["messenger"],
    storageLimitGb: plan.storageLimitGb === null || plan.storageLimitGb === undefined ? "" : String(plan.storageLimitGb),
  storageLimitGbUnlimited: plan.storageLimitGb === null,
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
    // Plan 53: explicit Unlimited toggles win over the number inputs; message
    // limits keep the legacy empty-means-unlimited convention as well.
    maxAgents: form.maxAgentsUnlimited ? null : Number(form.maxAgents),
    maxChannels: form.maxChannelsUnlimited ? null : Number(form.maxChannels),
    inboundMessageLimit: form.inboundMessageLimitUnlimited || form.inboundMessageLimit.trim() === "" ? null : Number(form.inboundMessageLimit),
    outboundMessageLimit: form.outboundMessageLimitUnlimited || form.outboundMessageLimit.trim() === "" ? null : Number(form.outboundMessageLimit),
    allowedProviders: [...form.allowedProviders],
    storageLimitGb: form.storageLimitGbUnlimited ? null : Number(form.storageLimitGb),
    status: form.status,
    features: {
      ...features,
      public: publicMeta,
    },
  }
}

type PlanFieldSection = "basics" | "quotas" | "providers" | "landing" | "flags"

type PlanFieldKey =
  | "name"
  | "trialDurationDays"
  | "monthlyPrice"
  | "maxAgents"
  | "maxChannels"
  | "inboundMessageLimit"
  | "outboundMessageLimit"
  | "storageLimitGb"
  | "allowedProviders"
  | "publicDisplayOrder"
  | "publicCurrencyCode"
  | "publicBillingInterval"
  | "publicSetupFeeMmk"
  | "featureFlagsText"

export type PlanFieldError = {
  field: PlanFieldKey
  section: PlanFieldSection
  message: string
}

function validateForm(form: PlanFormState): PlanFieldError | null {
  if (!form.name.trim()) return { field: "name", section: "basics", message: "Plan name is required." }
  if (form.planType === "trial") {
    const duration = Number(form.trialDurationDays)
    if (!Number.isInteger(duration) || duration <= 0) {
      return { field: "trialDurationDays", section: "basics", message: "Trial duration must be a positive whole number of days." }
    }
  }
  if (form.monthlyPrice.trim() === "") {
    return { field: "monthlyPrice", section: "basics", message: "Price per month is required." }
  }
  // Plan 53: capacity numbers are required only when their Unlimited toggle
  // is off; an enabled toggle stores null instead of a number.
  const toggledNumeric: Array<{ on: boolean; value: string; field: PlanFieldKey; label: string }> = [
    { on: !form.maxAgentsUnlimited, value: form.maxAgents, field: "maxAgents", label: "Max team members" },
    { on: !form.maxChannelsUnlimited, value: form.maxChannels, field: "maxChannels", label: "Max channels" },
    { on: !form.storageLimitGbUnlimited, value: form.storageLimitGb, field: "storageLimitGb", label: "Storage limit" },
  ]
  for (const item of toggledNumeric) {
    if (item.on && item.value.trim() === "") {
      return { field: item.field, section: "quotas", message: `${item.label} is required unless Unlimited is on.` }
    }
  }
  const requiredValues: Array<{ value: number; field: PlanFieldKey; section: PlanFieldSection }> = [
    { value: Number(form.monthlyPrice), field: "monthlyPrice", section: "basics" },
    ...toggledNumeric.filter((item) => item.on).map((item) => ({ value: Number(item.value), field: item.field, section: "quotas" as PlanFieldSection })),
  ]
  for (const item of requiredValues) {
    if (Number.isNaN(item.value) || item.value < 0) {
      return { field: item.field, section: item.section, message: "Numeric fields must be zero or greater." }
    }
  }
  const optionalLimits: Array<{ raw: string; field: PlanFieldKey }> = [
    { raw: form.inboundMessageLimitUnlimited ? "" : form.inboundMessageLimit, field: "inboundMessageLimit" },
    { raw: form.outboundMessageLimitUnlimited ? "" : form.outboundMessageLimit, field: "outboundMessageLimit" },
  ]
  for (const item of optionalLimits) {
    const parsed = item.raw.trim() === "" ? null : Number(item.raw)
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      return { field: item.field, section: "quotas", message: "Message limits must be zero or greater, or left empty for unlimited." }
    }
  }
  if (form.allowedProviders.length === 0) return { field: "allowedProviders", section: "providers", message: "At least one provider must stay enabled." }
  if (form.publicDisplayOrder.trim() && (Number.isNaN(Number(form.publicDisplayOrder)) || Number(form.publicDisplayOrder) < 0)) return { field: "publicDisplayOrder", section: "landing", message: "Public display order must be zero or greater." }
  if (form.publicSetupFeeMmk.trim() && (Number.isNaN(Number(form.publicSetupFeeMmk)) || Number(form.publicSetupFeeMmk) < 0)) return { field: "publicSetupFeeMmk", section: "landing", message: "Public setup fee must be zero or greater." }
  if (!form.publicMonthlyPriceLabel.trim() && Number(form.monthlyPrice) > 0) {
    if (!form.publicCurrencyCode.trim()) return { field: "publicCurrencyCode", section: "landing", message: "Currency code is required for a priced plan without a price-label override." }
    if (!form.publicBillingInterval) return { field: "publicBillingInterval", section: "landing", message: "Billing interval is required for a priced plan without a price-label override." }
  }
  try {
    const parsed = JSON.parse(form.featureFlagsText || "{}")
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { field: "featureFlagsText", section: "flags", message: "Features JSON must be an object." }
  } catch {
    return { field: "featureFlagsText", section: "flags", message: "Additional feature flags must be valid JSON." }
  }
  return null
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
  const [fieldError, setFieldError] = useState<PlanFieldError | null>(null)
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
    setFieldError(null)
    setCreateOpen(true)
  }

  const openEdit = (plan: SubscriptionPlanDto) => {
    setSelectedPlan(plan)
    setForm(formFromPlan(plan))
    setSaveError("")
    setFieldError(null)
    setEditOpen(true)
  }

  const openDelete = (plan: SubscriptionPlanDto) => {
    setSelectedPlan(plan)
    setDeleteError("")
    setDeleteOpen(true)
  }

  const submitCreate = async () => {
    const validationError = validateForm(form)
    if (validationError) {
      setFieldError(validationError)
      setSaveError("")
      return
    }

    setSaving(true)
    setSaveError("")
    setFieldError(null)
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
    const validationError = validateForm(form)
    if (validationError) {
      setFieldError(validationError)
      setSaveError("")
      return
    }

    setSaving(true)
    setSaveError("")
    setFieldError(null)
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
                  <SelectItem value="maxAgents">Seats</SelectItem>
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
                        ["Seats", formatLimit(plan.maxAgents)],
                        ["Inbound / month", formatLimit(plan.inboundMessageLimit)],
                        ["Outbound / month", formatLimit(plan.outboundMessageLimit)],
                        ["Channels", formatLimit(plan.maxChannels)],
                        ["Storage", plan.storageLimitGb === null || plan.storageLimitGb === undefined ? "Unlimited" : `${formatNumber(plan.storageLimitGb)} GB`],
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
        onChange={(next) => {
          setForm(next)
          setFieldError(null)
        }}
        error={saveError}
        fieldError={fieldError}
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
        onChange={(next) => {
          setForm(next)
          setFieldError(null)
        }}
        error={saveError}
        fieldError={fieldError}
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
  fieldError,
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
  fieldError: PlanFieldError | null
  onSubmit: () => void
  saving: boolean
  submitLabel: string
}) {
  const [landingOpen, setLandingOpen] = useState(false)
  const [flagsOpen, setFlagsOpen] = useState(false)
  const wasOpen = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setLandingOpen(landingSetCount(form) > 0)
      try {
        setFlagsOpen(Object.keys(JSON.parse(form.featureFlagsText || "{}")).length > 0)
      } catch {
        setFlagsOpen(true)
      }
    }
    wasOpen.current = open
  }, [open, form])
  // Validation errors expand their section and scroll the field into view so
  // a failure inside a collapsed advanced block is never silent.
  useEffect(() => {
    if (!fieldError) return
    if (fieldError.section === "landing") setLandingOpen(true)
    if (fieldError.section === "flags") setFlagsOpen(true)
    requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector(`#plan-field-${fieldError.field}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [fieldError])
  const landingCount = landingSetCount(form)
  const jsonOk = flagsValid(form.featureFlagsText)
  const err = (field: PlanFieldKey) => (fieldError?.field === field ? fieldError.message : undefined)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} className="max-h-[90vh] max-w-3xl overflow-y-auto border-white/10 bg-[#0b1727] text-white">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-slate-300">{description}</DialogDescription>
        </DialogHeader>
        {error ? <StateMessage title="Save failed" message={error} destructive /> : null}
        <PlanSummary form={form} />
        <p className="text-sm font-medium text-white">Basics</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="plan-field-name" label="Plan name" required error={err("name")}>
            <Input value={form.name} placeholder="e.g. Business Growth" onChange={(event) => onChange({ ...form, name: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
          <Field label="Status" required>
            <Select value={form.status} onValueChange={(value) => onChange({ ...form, status: value as PlanFormState["status"] })}>
              <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="inactive">inactive</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Plan type" required>
            <Select value={form.planType} onValueChange={(value) => onChange({ ...form, planType: value as "business" | "trial" })}>
              <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="business">Business (monthly)</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {form.planType === "trial" ? (
            <Field id="plan-field-trialDurationDays" label="Trial duration (days)" required error={err("trialDurationDays")}>
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
          <Field id="plan-field-monthlyPrice" label="Price per month (MMK)" required hint="Full monthly price charged on every invoice. 0 with contact-only availability means custom proposal." error={err("monthlyPrice")}>
            <Input type="number" min="0" value={form.monthlyPrice} placeholder="e.g. 500000" onChange={(event) => onChange({ ...form, monthlyPrice: event.target.value })} className="border-white/10 bg-slate-950/40" />
          </Field>
        </div>
        <p className="text-sm font-medium text-white">Quotas & unlimited</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <QuotaField
            id="plan-field-maxAgents"
            label="Max team members"
            value={form.maxAgents}
            unlimited={form.maxAgentsUnlimited}
            onValue={(value) => onChange({ ...form, maxAgents: value })}
            onUnlimited={(value) => onChange({ ...form, maxAgentsUnlimited: value })}
            help="Active workspace users. No seat top-up exists yet."
            placeholder="e.g. 5"
            error={err("maxAgents")}
          />
          <QuotaField
            id="plan-field-maxChannels"
            label="Max channels"
            value={form.maxChannels}
            unlimited={form.maxChannelsUnlimited}
            onValue={(value) => onChange({ ...form, maxChannels: value })}
            onUnlimited={(value) => onChange({ ...form, maxChannelsUnlimited: value })}
            help="Connected channels. Channel top-ups stack on top."
            placeholder="e.g. 2"
            error={err("maxChannels")}
          />
          <QuotaField
            id="plan-field-inboundMessageLimit"
            label="Inbound message limit (per month)"
            value={form.inboundMessageLimit}
            unlimited={form.inboundMessageLimitUnlimited}
            onValue={(value) => onChange({ ...form, inboundMessageLimit: value })}
            onUnlimited={(value) => onChange({ ...form, inboundMessageLimitUnlimited: value })}
            help="Monthly inbound quota. Message top-ups stack on top."
            placeholder="e.g. 16000"
            error={err("inboundMessageLimit")}
          />
          <QuotaField
            id="plan-field-outboundMessageLimit"
            label="Outbound message limit (per month)"
            value={form.outboundMessageLimit}
            unlimited={form.outboundMessageLimitUnlimited}
            onValue={(value) => onChange({ ...form, outboundMessageLimit: value })}
            onUnlimited={(value) => onChange({ ...form, outboundMessageLimitUnlimited: value })}
            help="Monthly outbound quota. Message top-ups stack on top."
            placeholder="e.g. 4000"
            error={err("outboundMessageLimit")}
          />
          <QuotaField
            id="plan-field-storageLimitGb"
            label="Storage limit (GB)"
            value={form.storageLimitGb}
            unlimited={form.storageLimitGbUnlimited}
            onValue={(value) => onChange({ ...form, storageLimitGb: value })}
            onUnlimited={(value) => onChange({ ...form, storageLimitGbUnlimited: value })}
            help="Storage capacity in GB. Storage top-ups stack on top."
            placeholder="e.g. 10"
            error={err("storageLimitGb")}
          />
        </div>
        <p className="text-sm text-slate-400">
          Limits are monthly. Flip <span className="text-slate-200">Unlimited</span> for unlimited, or leave a message limit empty for unlimited; enter <span className="text-slate-200">0</span> to block that dimension entirely.
        </p>
        <Field id="plan-field-allowedProviders" label="Allowed providers" required error={err("allowedProviders")}>
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
        <Field label="Description" optional>
          <Textarea value={form.description} placeholder="e.g. For growing teams that need one organized workflow." onChange={(event) => onChange({ ...form, description: event.target.value })} className="min-h-24 border-white/10 bg-slate-950/40" />
        </Field>
        <Collapsible open={landingOpen} onOpenChange={setLandingOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-left transition-colors hover:bg-sky-500/20">
            <CollapseTrigger
              open={landingOpen}
              title="Landing page wiring"
              subtitle={landingOpen ? "Tap to hide pricing-card fields" : "Tap to show pricing-card fields"}
              badge={landingCount === 0 ? "Not set" : `${landingCount} set`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-4 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-sky-100/60">Visibility & ordering</p>
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
            <Field id="plan-field-publicDisplayOrder" label="Display order" optional hint="Lower numbers appear first on the pricing page." error={err("publicDisplayOrder")}>
              <Input type="number" min="0" value={form.publicDisplayOrder} placeholder="e.g. 2" onChange={(event) => onChange({ ...form, publicDisplayOrder: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Eyebrow" optional>
              <Input value={form.publicEyebrow} placeholder="e.g. Most popular" onChange={(event) => onChange({ ...form, publicEyebrow: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Target customer" optional>
              <Input value={form.publicTargetCustomer} placeholder="e.g. Growing commerce teams" onChange={(event) => onChange({ ...form, publicTargetCustomer: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Self-serve registration" hint="Yes lets merchants buy this plan without talking to sales.">
              <Select value={form.publicSelfServe} onValueChange={(value) => onChange({ ...form, publicSelfServe: value as "true" | "false" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Availability" hint="Published = buyable now. Contact only = talk-to-sales card (also blocks self-serve purchase).">
              <Select value={form.publicAvailability} onValueChange={(value) => onChange({ ...form, publicAvailability: value as "enabled" | "contact-only" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Published</SelectItem>
                  <SelectItem value="contact-only">Contact only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-sky-100/60">Card copy</p>
          <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recommended" hint="Yes pins this card as the highlighted choice.">
              <Select value={form.publicRecommended} onValueChange={(value) => onChange({ ...form, publicRecommended: value as "true" | "false" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Recommendation badge" optional hint="Small tag shown when Recommended is Yes.">
              <Input value={form.publicRecommendationLabel} placeholder="e.g. Most popular" onChange={(event) => onChange({ ...form, publicRecommendationLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
          <Field label="Public summary" optional hint="One or two sentences under the plan name.">
            <Textarea value={form.publicSummary} placeholder="e.g. For growing shops that need one organized workflow." onChange={(event) => onChange({ ...form, publicSummary: event.target.value })} className="min-h-24 border-white/10 bg-slate-950/40 sm:col-span-2" />
          </Field>
            <Field label="CTA label" optional>
              <Input value={form.publicCtaLabel} placeholder="e.g. Choose Growth" onChange={(event) => onChange({ ...form, publicCtaLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="CTA href" optional hint="Where the button goes.">
              <Input value={form.publicCtaHref} placeholder="e.g. /contact?intent=sales" onChange={(event) => onChange({ ...form, publicCtaHref: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-sky-100/60">Pricing display</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly price label override" optional hint="Replaces the auto price text, e.g. for contact-only plans.">
              <Input value={form.publicMonthlyPriceLabel} placeholder="e.g. Custom proposal" onChange={(event) => onChange({ ...form, publicMonthlyPriceLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field id="plan-field-publicCurrencyCode" label="Public currency code" optional hint="Required when a priced plan has no price-label override." error={err("publicCurrencyCode")}>
              <Input value={form.publicCurrencyCode} onChange={(event) => onChange({ ...form, publicCurrencyCode: event.target.value.toUpperCase() })} className="border-white/10 bg-slate-950/40" placeholder="MMK" />
            </Field>
            <Field id="plan-field-publicBillingInterval" label="Public billing interval" optional hint="Required when a priced plan has no price-label override." error={err("publicBillingInterval")}>
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
            <Field id="plan-field-publicSetupFeeMmk" label="Setup fee amount (MMK)" optional hint="Blank = no setup fee." error={err("publicSetupFeeMmk")}>
              <Input type="number" min="0" value={form.publicSetupFeeMmk} placeholder="e.g. 1000000" onChange={(event) => onChange({ ...form, publicSetupFeeMmk: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Setup fee label" optional hint="Short label next to the fee, e.g. what it covers.">
              <Input value={form.publicSetupFeeLabel} placeholder="e.g. Setup and onboarding" onChange={(event) => onChange({ ...form, publicSetupFeeLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Setup fee starts from" hint="Yes shows the fee as a starting price.">
              <Select value={form.publicSetupFeeStartsFrom} onValueChange={(value) => onChange({ ...form, publicSetupFeeStartsFrom: value as "true" | "false" })}>
                <SelectTrigger className="border-white/10 bg-slate-950/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Included users label" optional hint="Overrides the auto seat text.">
              <Input value={form.publicIncludedUsersLabel} placeholder="e.g. Up to 5 team members" onChange={(event) => onChange({ ...form, publicIncludedUsersLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
            <Field label="Included channels label" optional hint="Overrides the auto channel text.">
              <Input value={form.publicIncludedChannelsLabel} placeholder="e.g. Up to 2 supported channels" onChange={(event) => onChange({ ...form, publicIncludedChannelsLabel: event.target.value })} className="border-white/10 bg-slate-950/40" />
            </Field>
          </div>
          <Field label="Landing page feature bullets" optional hint="One line per bullet. Shows as pricing-card checkmarks.">
            <Textarea value={form.publicFeatureListText} onChange={(event) => onChange({ ...form, publicFeatureListText: event.target.value })} className="min-h-32 border-white/10 bg-slate-950/40" placeholder={"One line per bullet, e.g.\nUnified team inbox\nOrder management"} />
          </Field>
        </div>
          </CollapsibleContent>
        </Collapsible>
        <Collapsible open={flagsOpen} onOpenChange={setFlagsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-left transition-colors hover:bg-white/10">
            <CollapseTrigger
              open={flagsOpen}
              title="Additional feature flags"
              subtitle={flagsOpen ? "Tap to hide JSON editor" : "Tap to show JSON editor"}
              badge={jsonOk ? "Valid JSON" : "Invalid JSON"}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <Field id="plan-field-featureFlagsText" label="Additional feature flags JSON" hint="Internal capability flags. Must stay a JSON object or saving is blocked." error={err("featureFlagsText")}>
              <Textarea value={form.featureFlagsText} onChange={(event) => onChange({ ...form, featureFlagsText: event.target.value })} className="min-h-52 font-mono text-xs border-white/10 bg-slate-950/40" placeholder={'{\n  "inbox": true,\n  "orders": true\n}'} />
            </Field>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/10 bg-white/5"
                onClick={() => {
                  try {
                    onChange({ ...form, featureFlagsText: JSON.stringify(JSON.parse(form.featureFlagsText || "{}"), null, 2) })
                  } catch {
                    /* invalid JSON stays for the user to fix; validator blocks save */
                  }
                }}
              >
                Format JSON
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/10 bg-white/5"
                onClick={() => onChange({ ...form, featureFlagsText: "{}" })}
              >
                Reset
              </Button>
              <span className={`text-xs ${jsonOk ? "text-emerald-300" : "text-rose-300"}`}>
                {jsonOk ? "Valid JSON" : "Invalid JSON — fix before saving"}
              </span>
            </div>
          </CollapsibleContent>
        </Collapsible>
        <DialogFooter className="sticky bottom-0 bg-[#0b1727] pt-2">
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

function Field({ id, label, children, required = false, optional = false, hint, error }: { id?: string; label: string; children: ReactNode; required?: boolean; optional?: boolean; hint?: string; error?: string }) {
  return (
    <div id={id} className="scroll-mt-4 space-y-2">
      <Label className={`text-slate-300 ${error ? "text-rose-200" : ""}`}>
        {label}
        {required ? <span className="ml-1 text-rose-300">*</span> : null}
        {optional ? <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">Optional</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose-300">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

function landingSetCount(form: PlanFormState) {
  // Currency MMK + monthly interval are new-form defaults, not deliberate
  // choices, so they never count toward the badge.
  const values = [
    form.publicVisible === "false",
    form.publicDisplayOrder.trim(),
    form.publicEyebrow.trim(),
    form.publicSummary.trim(),
    form.publicTargetCustomer.trim(),
    form.publicRecommended === "true",
    form.publicRecommendationLabel.trim(),
    form.publicSelfServe === "true",
    form.publicAvailability === "contact-only",
    form.publicCtaLabel.trim(),
    form.publicCtaHref.trim(),
    form.publicMonthlyPriceLabel.trim(),
    form.publicCurrencyCode.trim() && form.publicCurrencyCode.trim().toUpperCase() !== "MMK",
    form.publicBillingInterval && form.publicBillingInterval !== "monthly",
    form.publicSetupFeeMmk.trim(),
    form.publicSetupFeeLabel.trim(),
    form.publicIncludedUsersLabel.trim(),
    form.publicIncludedChannelsLabel.trim(),
    form.publicFeatureListText.trim(),
  ]
  return values.filter(Boolean).length
}

function flagsValid(text: string) {
  try {
    const parsed = JSON.parse(text || "{}")
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

function CollapseTrigger({
  open,
  title,
  subtitle,
  badge,
}: {
  open: boolean
  title: string
  subtitle: string
  badge: string
}) {
  return (
    <span className="flex w-full items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">
          {title} <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">Advanced</span>
        </span>
        <span className="mt-1 block truncate text-sm text-sky-100/80">{subtitle}</span>
      </span>
      <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-300">{badge}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`} />
    </span>
  )
}

function quotaSummary(value: string, unlimited: boolean, emptyAs = "—") {
  if (unlimited) return "Unlimited"
  if (value.trim() === "") return emptyAs
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return "—"
  return parsed === 0 ? "Blocked" : parsed.toLocaleString()
}

function PlanSummary({ form }: { form: PlanFormState }) {
  const price = form.monthlyPrice.trim() === "" || Number.isNaN(Number(form.monthlyPrice))
    ? "—"
    : `MMK ${Number(form.monthlyPrice).toLocaleString()} / mo`
  return (
    <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
      {price} · {quotaSummary(form.inboundMessageLimit, form.inboundMessageLimitUnlimited, "Unlimited")} in /{" "}
      {quotaSummary(form.outboundMessageLimit, form.outboundMessageLimitUnlimited, "Unlimited")} out ·{" "}
      {quotaSummary(form.maxChannels, form.maxChannelsUnlimited)} ch ·{" "}
      {quotaSummary(form.storageLimitGb, form.storageLimitGbUnlimited)} GB ·{" "}
      {quotaSummary(form.maxAgents, form.maxAgentsUnlimited)} seats
    </div>
  )
}

function QuotaField({
  id,
  label,
  value,
  unlimited,
  onValue,
  onUnlimited,
  help,
  placeholder,
  error,
}: {
  id?: string
  label: string
  value: string
  unlimited: boolean
  onValue: (value: string) => void
  onUnlimited: (value: boolean) => void
  help: string
  placeholder: string
  error?: string
}) {
  return (
    <div id={id} className={`scroll-mt-4 space-y-2 rounded-2xl border bg-slate-950/40 p-3 ${error ? "border-rose-400/60" : "border-white/10"}`}>
      <div className="flex items-center justify-between gap-2">
        <Label className={`text-slate-300 ${error ? "text-rose-200" : ""}`}>
          {label}
          <span className="ml-1 text-rose-300">*</span>
        </Label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
          <Switch checked={unlimited} onCheckedChange={onUnlimited} aria-label={`${label} unlimited`} />
          Unlimited
        </label>
      </div>
      <Input
        type="number"
        min="0"
        value={value}
        disabled={unlimited}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        onChange={(event) => onValue(event.target.value)}
        className={`border-white/10 bg-slate-950/60 disabled:opacity-40 ${error ? "border-rose-400/60 ring-1 ring-rose-400/40" : ""}`}
      />
      {error ? (
        <p className="text-xs font-medium text-rose-300">{error}</p>
      ) : (
        <p className="text-xs text-slate-500">{help}</p>
      )}
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
