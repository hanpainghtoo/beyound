"use client"

import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage } from "@/components/workspace"
import {
  usePaymentMethodGroups,
  walletMethodIcon,
  type PaymentAccount,
} from "@/lib/billing-payment-accounts"
import {
  agentMediaApi,
  getApiErrorMessage,
  tenantBillingApi,
} from "@/lib/api"
import { usePublicSubscriptionPlans, useAddOnProducts, usePublicSubscriptionPlan, billingKeys } from "@/lib/queries/billing"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/providers/i18n-provider"

const formatMoney = (value: number | string, currency = "MMK") =>
  `${currency} ${Number(value || 0).toLocaleString()}`

const limitLabel = (t: (key: string) => string, value: number | null | undefined) => {
  if (value === null || value === undefined) return t("workspace.requestPayment.unlimited")
  if (value === 0) return t("workspace.requestPayment.blocked")
  return value.toLocaleString()
}

// Plan 30: two-screen workspace payment flow (screen 1). Existing tenants
// requesting a plan skip company/personal collection — tenant and user exist.
// Submit creates the invoice (method/account/note persisted to metadata),
// auto-submits proof when a receipt was picked, then routes to the invoice
// page with a one-shot justRequested flag.
export default function RequestPaymentPage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const planId = searchParams.get("planId")
  const startOption = searchParams.get("startOption") || "current_month"
  // Plan 30 add-on parity: ?productId= selects a top-up instead of a plan.
  const productId = searchParams.get("productId")

  const plansQuery = usePublicSubscriptionPlans()
  const productsQuery = useAddOnProducts()
  const queryClient = useQueryClient()
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  // Plan 30 D3: detail query instead of list+find (API best standard).
  const planQuery = usePublicSubscriptionPlan(planId)
  const plan = planQuery.data ?? (plans.find((item) => item.id === planId) || null)
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data])
  const product = products.find((item) => item.id === productId) || null
  const isAddOn = productId !== null

  const groups = usePaymentMethodGroups()
  const methodGroups = groups.groups
  const accountsLoading = groups.isLoading
  const accountsAvailable = methodGroups.some((group) => group.accounts.length > 0)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null)
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null)
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState("")
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleProofFileChange = (file: File | null) => {
    if (file && !file.type.startsWith("image/")) {
      toast.error(t("workspace.requestPayment.chooseImage"))
      return
    }

    setProofFile(file)
    if (!file) {
      setPreviewUrl(null)
      return
    }

    // Match the subscription flow's reliable local preview behavior. A data
    // URL remains valid for the lifetime of the image element and does not
    // depend on browser-specific blob URL handling.
    setPreviewUrl(null)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPreviewUrl(reader.result)
      }
    }
    reader.onerror = () => {
      setPreviewUrl(null)
      toast.error("Unable to preview this image. Please choose it again.")
    }
    reader.readAsDataURL(file)
  }

  const clearProofFile = () => {
    handleProofFileChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const outstanding = plan
    ? Number(plan.monthlyPrice || 0)
    : product
      ? Number(product.price || 0)
      : 0
  // Contact-only plans are sold through sales, never self-serve (mirrors
  // the Packages PlanCard contact mode + the backend purchase guard).
  const isContactOnly = !isAddOn && plan?.availability === "contact-only"

  const copyAccountDetail = async (text: string, accountId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAccountId(accountId)
      setTimeout(() => setCopiedAccountId(null), 2000)
    } catch {
      setCopiedAccountId(null)
      toast.error("Couldn't copy account details. Please try again.")
    }
  }

  const downloadQr = (qrUrl: string, name: string) => {
    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = qrUrl
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          window.open(qrUrl, "_blank", "noopener,noreferrer")
          return
        }
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement("a")
            anchor.href = url
            anchor.download = `${name}-payment-qr.png`
            anchor.click()
            URL.revokeObjectURL(url)
          } else {
            window.open(qrUrl, "_blank", "noopener,noreferrer")
          }
        }, "image/png")
      }
      img.onerror = () => window.open(qrUrl, "_blank", "noopener,noreferrer")
    } catch {
      window.open(qrUrl, "_blank", "noopener,noreferrer")
    }
  }

  const submit = async () => {
    if (!plan && !product) return
    if (!selectedAccount) {
      toast.error(t("workspace.requestPayment.selectPaymentMethod"))
      return
    }
    // F1: full price only — static display, never edited.
    const amount = outstanding
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("workspace.requestPayment.noPayableAmount"))
      return
    }
    setIsSubmitting(true)
    try {
      const extras = {
        paymentMethod: selectedAccount.method,
        paymentAccount: `${selectedAccount.label}: ${selectedAccount.detail}`,
        // Live module ids are real uuids (no hardcoded fallback exists).
        paymentAccountId: selectedAccount.id,
        note: note.trim() || undefined,
      }
      // Resolves to the created invoice id in both modes.
      let billingRecordId: string | null = null
      if (plan) {
        const result = await tenantBillingApi.createSubscriptionPurchaseRequest(
          startOption as "current_month" | "next_month" | "after_trial",
          `workspace-request-payment-${plan.id}-${startOption}-${crypto.randomUUID()}`,
          plan.id,
          extras,
        )
        billingRecordId = result.billingRecord.id
      } else if (product) {
        const purchase = await tenantBillingApi.createAddOnPurchase(
          product.id,
          `workspace-request-payment-addon-${product.id}-${crypto.randomUUID()}`,
          extras,
        )
        billingRecordId = purchase.billingRecordId || null
      }
      if (!billingRecordId) {
        throw new Error(t("workspace.requestPayment.invoiceNoRecord"))
      }
      if (proofFile) {
        const upload = await agentMediaApi.upload(proofFile, "billing-payment-proof")
        await tenantBillingApi.submitPaymentProof(billingRecordId, {
          paymentMethod: selectedAccount.method,
          paidAmount: amount,
          paidDate,
          transactionReference: undefined,
          mediaFileId: upload.file.id,
          fileName: proofFile.name,
          mediaScanStatus: "clean",
          note: note.trim() || undefined,
        })
      }
      // F2: refresh the overview cache and confirm the fresh record
      // resolves before navigating — otherwise the invoice page shows
      // "not found" from stale data.
      await queryClient.invalidateQueries({ queryKey: billingKeys.all })
      const refreshed = await queryClient.fetchQuery({
        queryKey: billingKeys.overview(),
        queryFn: () => tenantBillingApi.get(),
      })
      const created = refreshed.records.find(
        (item) => item.id === billingRecordId,
      )
      if (!created) {
        throw new Error(t("workspace.requestPayment.invoiceNotVisible"))
      }
      router.push(
        `/workspace/billing/invoice/${billingRecordId}?justRequested=true`,
      )
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.requestPayment.requestFailed")))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        navKey="billing"
        eyebrow={t("workspace.requestPayment.eyebrow")}
        title={t("workspace.requestPayment.title")}
        description={t("workspace.requestPayment.description")}
        actions={
          /* Deterministic href, not router.back(): this page is also reachable
             from the public /pricing page, so going back would eject the user
             out of the workspace, and a refresh left no history to return to. */
          <Button variant="outline" size="sm" asChild>
            <Link href="/workspace/billing?tab=packages">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {t("workspace.requestPayment.back")}
            </Link>
          </Button>
        }
      />

      <WorkspacePage containerClassName="max-w-6xl">
        {plansQuery.isLoading || planQuery.isLoading || productsQuery.isLoading ? (
          <p className="py-16 text-center text-sm text-slate-500">{t("workspace.requestPayment.loading")}</p>
        ) : !plan && !product ? (
          <div className="rounded-[22px] border border-dashed border-indigo-300 bg-indigo-50/40 p-10 text-center text-sm text-slate-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{isAddOn ? t("workspace.requestPayment.addOnNotFound") : t("workspace.requestPayment.planNotFound")}</p>
            <p className="mt-1">{t("workspace.requestPayment.chooseFromPackages", { item: isAddOn ? t("workspace.requestPayment.addOnItem") : t("workspace.requestPayment.planItem") })}</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            {isContactOnly ? (
              <section className="space-y-4 rounded-[22px] border border-indigo-200 bg-white p-8 text-center shadow-[0_10px_28px_rgba(79,70,229,0.08)] sm:p-10 dark:border-indigo-500/30 dark:bg-slate-950">
                <h2 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                  {t("workspace.requestPayment.talkToSales")}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
                  {t("workspace.requestPayment.tailoredPlan", { name: plan?.name })}
                </p>
                <Button
                  asChild
                  className="mt-6 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600"
                >
                  <a href={plan?.ctaHref || "/contact"}>
                    {plan?.ctaLabel || t("workspace.requestPayment.contactSales")}
                  </a>
                </Button>
              </section>
            ) : (
            <section className="space-y-6 rounded-[22px] border border-indigo-200 bg-white p-5 shadow-[0_10px_28px_rgba(79,70,229,0.08)] sm:p-6 dark:border-indigo-500/30 dark:bg-slate-950">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t("workspace.requestPayment.description")}
              </p>

              <div className="space-y-3">
                <Label>{t("workspace.requestPayment.paymentMethodRequired")}</Label>
                {!accountsLoading && !accountsAvailable ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <p className="font-semibold">{t("workspace.requestPayment.accountsUnavailable")}</p>
                    <p className="mt-1">{t("workspace.requestPayment.accountsUnavailableDetail")}</p>
                  </div>
                ) : (
                methodGroups.map((group) => {
                  const expanded = expandedGroup === group.value
                  const GroupIcon = group.accounts[0] ? walletMethodIcon(group.accounts[0].method) : group.icon
                  return (
                    <div
                      key={group.value}
                      className={cn(
                        "overflow-hidden rounded-2xl border transition-colors",
                        selectedAccount && group.accounts.some((account) => account.id === selectedAccount.id)
                          ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-400/50 dark:bg-indigo-500/10"
                          : "border-slate-200 dark:border-slate-700",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedGroup(expanded ? null : group.value)}
                        className="flex w-full items-center gap-3 p-4 text-left"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/15">
                          <GroupIcon className="h-5 w-5 text-indigo-500" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-slate-900 dark:text-slate-100">
                            {group.label}
                          </span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            {t("workspace.requestPayment.optionsAvailable", { count: group.accounts.length, plural: group.accounts.length === 1 ? "" : "s" })}
                          </span>
                        </span>
                        <ChevronDown
                          className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", expanded && "rotate-180")}
                        />
                      </button>
                      {expanded ? (
                        <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-700">
                          {group.accounts.map((account) => {
                            const selected = selectedAccount?.id === account.id
                            const AccountIcon = walletMethodIcon(account.method)
                            const numberLabel = account.method === "bank_transfer" ? t("workspace.requestPayment.accountNo") : t("workspace.requestPayment.phoneNo")
                            return (
                              <button
                                key={account.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAccount(account)
                                }}
                                className={cn(
                                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                                  selected
                                    ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/15"
                                    : "border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-500/50",
                                )}
                              >
                                <span
                                  role="radio"
                                  aria-checked={selected}
                                  aria-label={`${account.label} ${selected ? t("workspace.requestPayment.selected") : t("workspace.requestPayment.notSelected")}`}
                                  className={cn(
                                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                                    selected ? "border-indigo-600" : "border-slate-300 dark:border-slate-600",
                                  )}
                                >
                                  {selected ? <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" /> : null}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    {account.iconUrl ? (
                                      <img
                                        src={account.iconUrl}
                                        alt=""
                                        aria-hidden="true"
                                        className="h-5 w-5 shrink-0 rounded object-contain"
                                      />
                                    ) : (
                                      <AccountIcon className="h-4 w-4 shrink-0 text-indigo-500" />
                                    )}
                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      {account.label}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <span>
                                      {numberLabel}:{" "}
                                      <span className="font-medium text-slate-700 dark:text-slate-200">
                                        {account.detail}
                                      </span>
                                    </span>
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      aria-label={t("workspace.requestPayment.copyNumberAria", { label: account.label })}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void copyAccountDetail(account.detail, account.id)
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.stopPropagation()
                                          void copyAccountDetail(account.detail, account.id)
                                        }
                                      }}
                                      className="text-slate-400 transition-colors hover:text-indigo-600"
                                    >
                                      {copiedAccountId === account.id ? (
                                        <Check className="h-3 w-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </span>
                                  </span>
                                </span>
                                {account.qrUrl ? (
                                  <span className="flex shrink-0 flex-col items-center gap-1 self-center">
                                    <img
                                      src={account.qrUrl}
                                      alt={t("workspace.requestPayment.paymentQrAlt", { label: account.label })}
                                      className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700"
                                    />
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        downloadQr(account.qrUrl as string, account.label)
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.stopPropagation()
                                          downloadQr(account.qrUrl as string, account.label)
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-300"
                                    >
                                      <Download className="h-3 w-3" />
                                      {t("workspace.requestPayment.downloadQr")}
                                    </span>
                                  </span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("workspace.requestPayment.amountToPay")}</Label>
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
                    {formatMoney(outstanding, (plan?.public?.currencyCode || product?.currency) || "MMK")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("workspace.requestPayment.fullPriceNote")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-paid-date">{t("workspace.requestPayment.paidDate")}</Label>
                  <Input
                    id="request-paid-date"
                    type="date"
                    value={paidDate}
                    onChange={(event) => setPaidDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("workspace.requestPayment.paymentProofOptional")}</Label>
                <div
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setIsDragging(false)
                    const file = event.dataTransfer.files?.[0]
                    if (file) handleProofFileChange(file)
                  }}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-center transition-colors",
                    proofFile ? "p-0" : "p-8",
                    isDragging
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                      : proofFile
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-400/40 dark:bg-emerald-500/10"
                        : "border-slate-300 dark:border-slate-600",
                  )}
                >
                  {proofFile && previewUrl ? (
                    <div className="relative w-full overflow-hidden rounded-xl">
                      <img
                        src={previewUrl}
                        alt={t("workspace.requestPayment.receiptPreviewAlt")}
                        className="max-h-[400px] w-full object-contain"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-left">
                            <p className="truncate text-sm font-medium text-white">{proofFile.name}</p>
                            <p className="text-xs text-white/70">
                              {(proofFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => clearProofFile()}
                            className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/30"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                  <>
                  <Upload className="h-8 w-8 text-indigo-500" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t("workspace.requestPayment.dropReceiptHere")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("workspace.requestPayment.supportsFormats")}</p>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                      {t("workspace.requestPayment.chooseFile")}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) handleProofFileChange(file)
                      }}
                    />
                  </label>
                  </>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("workspace.requestPayment.skipProofNote")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="request-note">{t("workspace.requestPayment.noteOptional")}</Label>
                <Textarea
                  id="request-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t("workspace.requestPayment.notePlaceholder")}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => void submit()}
                  disabled={isSubmitting || !selectedAccount || (!accountsLoading && !accountsAvailable)}
                  className="bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("workspace.requestPayment.submitting")}
                    </>
                  ) : (
                    t("workspace.requestPayment.submitRequest")
                  )}
                </Button>
              </div>
            </section>
            )}

            <aside className="h-fit rounded-[22px] border border-indigo-300/90 bg-white p-5 shadow-[0_8px_22px_rgba(79,70,229,0.06)] lg:sticky lg:top-6 dark:border-indigo-500/40 dark:bg-slate-950">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
                {product ? t("workspace.requestPayment.selectedAddOn") : t("workspace.requestPayment.selectedPlan")}
              </p>
              {product ? (
                <>
                  <h3 className="mt-2 text-xl font-bold text-sky-500 dark:text-sky-300">{product.name}</h3>
                  <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-slate-50">
                    {formatMoney(product.price, product.currency || "MMK")}
                    <span className="text-base font-semibold">{t("workspace.requestPayment.oneTimeTopUp")}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("workspace.requestPayment.activeMonthBoost")}</p>
                  {product.description ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{product.description}</p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-indigo-100 pt-4 text-sm dark:border-indigo-500/20">
                    {product.components.map((component) => (
                      <PlanLimit
                        key={component.id}
                        label={component.componentType.replaceAll("_", " ")}
                        value={`${component.quantity.toLocaleString()} ${component.unit || ""}`.trim()}
                      />
                    ))}
                  </div>
                </>
              ) : plan ? (
                <>
                  <h3 className="mt-2 text-xl font-bold text-sky-500 dark:text-sky-300">{plan.name}</h3>
                  <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-slate-50">
                    {formatMoney(plan.monthlyPrice, plan.public?.currencyCode || "MMK")}
                    <span className="text-base font-semibold">{t("workspace.requestPayment.perMonth")}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("workspace.requestPayment.monthlySubscription")}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{plan.summary}</p>
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-indigo-100 pt-4 text-sm dark:border-indigo-500/20">
                    <PlanLimit label={t("workspace.requestPayment.inbound")} value={limitLabel(t, plan.inboundMessageLimit)} />
                    <PlanLimit label={t("workspace.requestPayment.outbound")} value={limitLabel(t, plan.outboundMessageLimit)} />
                    <PlanLimit label={t("workspace.requestPayment.channels")} value={limitLabel(t, plan.maxChannels)} />
                    <PlanLimit
                      label={t("workspace.requestPayment.storage")}
                      value={plan.storageLimitGb == null ? t("workspace.requestPayment.unlimited") : `${plan.storageLimitGb.toLocaleString()} GB`}
                    />
                    <PlanLimit label={t("workspace.requestPayment.seats")} value={limitLabel(t, plan.maxAgents)} />
                  </div>
                </>
              ) : null}
            </aside>
          </div>
        )}
      </WorkspacePage>
    </>
  )
}

function PlanLimit({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}
