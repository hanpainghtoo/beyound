"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  Banknote,
  Building2,
  Eye,
  FileText,
  History,
  Loader2,
  Receipt,
  Smartphone,
  Upload,
  WalletCards,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WorkspaceEmptyState } from "@/components/workspace"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  agentMediaApi,
  getApiErrorMessage,
  isDeadInvoiceRecord,
  tenantBillingApi,
  type TenantBillingProofDto,
  type TenantBillingRecordDto,
} from "@/lib/api"
import { useBillingOverview, useCancelInvoice, billingKeys } from "@/lib/queries/billing"
import { usePaymentMethodGroups } from "@/lib/billing-payment-accounts"
import { getPublicRuntimeConfig } from "@/lib/public-runtime-config"

const YANGON_TIME_ZONE = "Asia/Yangon"

type PaymentMethod = TenantBillingProofDto["paymentMethod"]

// Plan 30 Task 7: file-only modal. Everything except the receipt file is
// frozen — resolved from the existing proof, else the request-page selections
// stored on record metadata, else record-level defaults.
function frozenProofInput(record: TenantBillingRecordDto) {
  const proof = record.metadata?.paymentProof
  const metadata = (record.metadata || {}) as Record<string, unknown>
  const method =
    proof?.paymentMethod ||
    (typeof metadata.selectedPaymentMethod === "string"
      ? (metadata.selectedPaymentMethod as PaymentMethod)
      : null)
  return {
    method,
    paidDate:
      proof?.paidDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    transactionReference: proof?.transactionReference || null,
    note:
      proof?.note ||
      (typeof metadata.requestNote === "string" ? metadata.requestNote : null),
  }
}

const formatMoney = (value: number | string, currency = "MMK") =>
  `${currency} ${Number(value || 0).toLocaleString()}`

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

const titleCase = (value: string | null | undefined) =>
  value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not recorded"

function paymentMethods() {
  const config = getPublicRuntimeConfig()
  return [
    {
      value: "bank_transfer" as const,
      label: "Bank transfer",
      detail: config.billingBankAccount || "Request account details from billing support",
      icon: Building2,
    },
    {
      value: "kbzpay" as const,
      label: "KBZPay",
      detail: config.billingKbzpayNumber || "Request the verified KBZPay number",
      icon: Smartphone,
    },
    {
      value: "wavepay" as const,
      label: "WavePay",
      detail: config.billingWavepayNumber || "Request the verified WavePay number",
      icon: WalletCards,
    },
    {
      value: "cash" as const,
      label: "Cash / manual payment",
      detail: "Arrange collection or office payment with the billing team",
      icon: Banknote,
    },
  ]
}

function invoiceName(record: TenantBillingRecordDto, t: (key: string, values?: Record<string, string | number>) => string) {
  return (
    record.subscriptionPlan?.name ||
    (typeof record.metadata?.selectedPlanName === "string"
      ? record.metadata.selectedPlanName
      : typeof record.metadata?.productName === "string"
        ? record.metadata.productName
        : t("workspace.billing.billingItem"))
  )
}

function proofStatus(record: TenantBillingRecordDto) {
  const proof = record.metadata?.paymentProof
  // Plan 25: review axis only. Plan 56: `cancelled` = tenant-withdrawn,
  // `reject` = admin decision.
  if (record.reviewStatus === "confirm" || proof?.status === "confirmed") return "Paid"
  if (record.reviewStatus === "cancelled") return "Cancelled"
  if (record.reviewStatus === "reject" || proof?.status === "rejected") return "Rejected"
  if (proof?.status === "pending_review" || proof?.status === "proof_submitted") return "Proof submitted"
  if (proof?.status === "under_review") return "Under review"
  if (Number(record.amountDue || 0) <= Number(record.amountPaid || 0)) return "Awaiting confirmation"
  return "Unpaid"
}

function billingStatusKey(status: string): string {
  const words = status.trim().split(/\s+/)
  if (words.length <= 1) return words[0].toLowerCase()
  return words[0].toLowerCase() + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("")
}

function statusClass(status: string) {
  if (status === "Paid") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
  if (status === "Cancelled") return "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-400/30 dark:bg-slate-500/10 dark:text-slate-300"
  if (status === "Rejected") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200"
  if (status === "Proof submitted" || status === "Under review") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200"
  return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200"
}

// Plan 28 Item 2: the table Status column shows the invoice axis only
// (raw reviewStatus). Payment state is read from the action button.
function invoiceStatus(record: TenantBillingRecordDto) {
  if (record.reviewStatus === "confirm") return "Confirmed"
  if (record.reviewStatus === "cancelled") return "Cancelled"
  if (record.reviewStatus === "reject") return "Rejected"
  return "In review"
}

function invoiceStatusClass(status: string) {
  if (status === "Confirmed") return statusClass("Paid")
  if (status === "Cancelled") return statusClass("Cancelled")
  if (status === "Rejected") return statusClass("Rejected")
  return statusClass("Unpaid")
}

// One action button per row: label + tone derive from payment state.
// Plan 54: cancellable open invoices get a Cancel request action so the
// month frees up without waiting on the billing team.
function rowAction(record: TenantBillingRecordDto): {
  label: string
  variant: "default" | "destructive" | "outline"
} {
  if (isDeadInvoiceRecord(record)) return { label: "View status", variant: "outline" }
  if (proofIsSettled(record)) return { label: "View receipt", variant: "outline" }
  const proof = record.metadata?.paymentProof
  if (proof?.status === "rejected") return { label: "Re-submit", variant: "destructive" }
  if (proofIsPending(proof)) return { label: "View status", variant: "outline" }
  const outstanding = Number(record.amountDue || 0) - Number(record.amountPaid || 0)
  if (outstanding > 0) return { label: "Submit proof", variant: "default" }
  return { label: "View status", variant: "outline" }
}

function invoiceIsCancellable(record: TenantBillingRecordDto) {
  if (record.reviewStatus !== "in_review") return false
  if (record.metadata?.paymentProof?.status === "pending_review") return false
  return true
}

function proofIsPending(proof?: TenantBillingProofDto) {
  return ["pending_review", "proof_submitted", "under_review"].includes(proof?.status || "")
}

function proofIsSettled(record: TenantBillingRecordDto) {
  return record.reviewStatus === "confirm" || record.metadata?.paymentProof?.status === "confirmed"
}

function InvoiceField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white/75 p-3 dark:border-indigo-400/20 dark:bg-slate-950/40">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950 dark:text-slate-50">{value}</p>
    </div>
  )
}

function V2Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50 sm:text-3xl">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 sm:text-base">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function BillingHistoryTab() {
  const { t } = useI18n()
  const billingQuery = useBillingOverview()
  const queryClient = useQueryClient()

  const billing = billingQuery.data ?? null
  const isLoading = billingQuery.isLoading
  const error = billingQuery.error
    ? getApiErrorMessage(billingQuery.error, t("workspace.billing.errors.loadHistory"))
    : ""

  const [message, setMessage] = useState("")
  const [selectedInvoice, setSelectedInvoice] = useState<TenantBillingRecordDto | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<TenantBillingRecordDto | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const cancelInvoice = useCancelInvoice()
  // Fallback method selector, shown only when the record carries no recorded
  // method (request page always records one; legacy rows are DB-reset away).
  const [fallbackMethod, setFallbackMethod] = useState<PaymentMethod>("bank_transfer")

  const records = useMemo(
    () => [...(billing?.records || [])].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [billing?.records],
  )
  const methods = paymentMethods()

  const openInvoice = (record: TenantBillingRecordDto) => {
    setSelectedInvoice(record)
    setProofFile(null)
    setFallbackMethod("bank_transfer")
  }

  const viewReceipt = async (record: TenantBillingRecordDto) => {
    const mediaFileId = record.metadata?.paymentProof?.mediaFileId
    if (!mediaFileId) return
    try {
      const receipt = await agentMediaApi.download(mediaFileId, "billing-payment-proof")
      window.open(receipt.download.url, "_blank", "noopener,noreferrer")
    } catch (requestError) {
      setMessage(getApiErrorMessage(requestError, t("workspace.billing.errors.openReceipt")))
    }
  }

  const submitProof = async () => {    if (!selectedInvoice || !proofFile) {
      setMessage(t("workspace.billing.errors.selectReceipt"))
      return
    }
    if (proofIsPending(selectedInvoice.metadata?.paymentProof)) {
      setMessage(t("workspace.billing.errors.proofPending"))
      return
    }
    // Plan 29 Task 6: full outstanding only — the payable amount is the
    // plan price due, shown statically, never edited.
    const paidAmount = Math.max(0, Number(selectedInvoice.amountDue || 0) - Number(selectedInvoice.amountPaid || 0))
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      setMessage(t("workspace.billing.errors.noOutstandingBalance"))
      return
    }

    setIsSubmitting(true)
    setMessage("")
    try {
      const upload = await agentMediaApi.upload(proofFile, "billing-payment-proof")
      const frozen = frozenProofInput(selectedInvoice)
      await tenantBillingApi.submitPaymentProof(selectedInvoice.id, {
        paymentMethod: frozen.method || fallbackMethod,
        paidAmount,
        paidDate: frozen.paidDate,
        transactionReference: frozen.transactionReference || undefined,
        mediaFileId: upload.file.id,
        fileName: proofFile.name,
        mediaScanStatus: "clean",
        note: frozen.note || undefined,
      })
      setMessage(t("workspace.billing.success.proofSubmitted"))
      setProofFile(null)
      await queryClient.invalidateQueries({ queryKey: billingKeys.overview() })
      setSelectedInvoice(null)
    } catch (requestError) {
      setMessage(getApiErrorMessage(requestError, t("workspace.billing.errors.submitProof")))
    } finally {
      setIsSubmitting(false)
    }
  }

  const cancelInvoiceRequest = async () => {
    if (!cancelTarget) return
    setIsCancelling(true)
    setMessage("")
    try {
      await cancelInvoice.mutateAsync(cancelTarget.id)
      setMessage(t("workspace.billing.success.invoiceCancelled"))
      setCancelTarget(null)
      await queryClient.invalidateQueries({ queryKey: billingKeys.overview() })
    } catch (requestError) {
      setMessage(getApiErrorMessage(requestError, t("workspace.billing.errors.cancelInvoice")))
    } finally {
      setIsCancelling(false)
    }
  }

  if (isLoading && !billing) {
    return <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-500" />{t("workspace.billing.loadingHistory")}</div>
  }

  if (error && !billing) {
    return <WorkspaceEmptyState icon={AlertCircle} title={t("workspace.billing.errors.unavailable")} description={error} action={<Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: billingKeys.overview() })}>{t("common.tryAgain")}</Button>} />
  }

  return (
    <div className="space-y-12" data-testid="billing-v2-history">
      {message ? <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">{message}</div> : null}

      <V2Section title={t("workspace.billing.history.title")} description={t("workspace.billing.history.description")} action={<Badge variant="secondary">{records.length} invoices</Badge>}>
        {records.length === 0 ? <WorkspaceEmptyState icon={History} title={t("workspace.billing.noInvoicesYet")} description={t("workspace.billing.invoicesAppearHere")} /> : <div className="overflow-x-auto rounded-[22px] border border-indigo-200 dark:border-indigo-500/30"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-indigo-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-indigo-500/10 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold">{t("workspace.billing.columns.invoice")}</th><th className="px-4 py-3 font-semibold">{t("workspace.billing.columns.planItem")}</th><th className="px-4 py-3 font-semibold">{t("workspace.billing.columns.period")}</th><th className="px-4 py-3 font-semibold">{t("workspace.billing.columns.amount")}</th><th className="px-4 py-3 font-semibold">{t("workspace.billing.columns.confirmed")}</th><th className="px-4 py-3 font-semibold">{t("workspace.billing.columns.status")}</th><th className="px-4 py-3 text-right font-semibold">{t("workspace.billing.columns.actions")}</th></tr></thead><tbody className="divide-y divide-indigo-100 dark:divide-indigo-500/20">{records.map((record) => { const invoiceState = invoiceStatus(record); return <tr key={record.id} className="bg-white dark:bg-slate-950"><td className="px-4 py-4 font-semibold text-slate-950 dark:text-white">{record.invoiceNo || t("workspace.billing.pendingNumber")}<p className="mt-1 text-xs font-normal text-slate-500">{formatDate(record.createdAt)}</p></td><td className="px-4 py-4 text-slate-700 dark:text-slate-200">{invoiceName(record, t)}</td><td className="px-4 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatDate(record.billingPeriodStart)} – {formatDate(record.billingPeriodEnd)}</td><td className="px-4 py-4 whitespace-nowrap font-semibold text-sky-600 dark:text-sky-300">{formatMoney(record.amountDue, record.currency)}</td><td className="px-4 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatDate(record.paidAt)}</td><td className="px-4 py-4"><Badge className={invoiceStatusClass(invoiceState)}>{invoiceState}</Badge></td><td className="px-4 py-4"><div className="flex flex-wrap justify-end gap-2">{(() => { const action = rowAction(record); const Icon = action.label === "View receipt" ? Receipt : action.label === "View status" ? Eye : Upload; return <Button variant={action.variant} size="sm" onClick={() => openInvoice(record)}><Icon className="mr-1.5 h-3.5 w-3.5" />{action.label}</Button> })()}<Button variant="outline" size="sm" asChild><Link href={`/workspace/billing/invoice/${record.id}`}><FileText className="mr-1.5 h-3.5 w-3.5" />Invoice</Link></Button>{invoiceIsCancellable(record) ? <Button size="sm" variant="outline" className="text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10" onClick={() => setCancelTarget(record)}><XCircle className="mr-1.5 h-3.5 w-3.5" />Cancel request</Button> : null}</div></td></tr> })}</tbody></table></div>}
      </V2Section>


      <Dialog open={Boolean(selectedInvoice)} onOpenChange={(open) => !open && !isSubmitting && setSelectedInvoice(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedInvoice?.invoiceNo || t("workspace.billing.invoiceDetails")}</DialogTitle><DialogDescription>{selectedInvoice ? `${formatDate(selectedInvoice.billingPeriodStart)} – ${formatDate(selectedInvoice.billingPeriodEnd)} · ${billing?.tenant.companyName || t("workspace.billing.thisWorkspace")}` : ""}</DialogDescription></DialogHeader>
          {selectedInvoice ? <InvoiceModalContent invoice={selectedInvoice} methods={methods} file={proofFile} setFile={setProofFile} isSubmitting={isSubmitting} onSubmit={() => void submitProof()} onViewReceipt={() => void viewReceipt(selectedInvoice)} fallbackMethod={fallbackMethod} setFallbackMethod={setFallbackMethod} t={t} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && !isCancelling && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("workspace.billing.cancelInvoiceRequest")}</DialogTitle>
            <DialogDescription>
              {cancelTarget?.invoiceNo || t("workspace.billing.thisInvoice")} will be marked cancelled and the billing month freed for a new request. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={isCancelling}>
              {t("workspace.billing.keepInvoice")}
            </Button>
            <Button variant="destructive" onClick={() => void cancelInvoiceRequest()} disabled={isCancelling}>
              {isCancelling ? t("workspace.billing.cancelling") : t("workspace.billing.cancelInvoice")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Plan 28 Item 2: one invoice = one modal. Fixed header (invoice fields +
// both status badges) + body switched on payment state. The pending/form
// branches live in ProofDialogContent, reused unchanged.
function InvoiceModalContent({
  invoice,
  methods,
  file,
  setFile,
  isSubmitting,
  onSubmit,
  onViewReceipt,
  fallbackMethod,
  setFallbackMethod,
  t,
}: {
  invoice: TenantBillingRecordDto
  methods: ReturnType<typeof paymentMethods>
  file: File | null
  setFile: (file: File | null) => void
  isSubmitting: boolean
  onSubmit: () => void
  onViewReceipt: () => void
  fallbackMethod: PaymentMethod
  setFallbackMethod: (method: PaymentMethod) => void
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const journey = proofStatus(invoice)
  const invoiceState = invoiceStatus(invoice)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge className={invoiceStatusClass(invoiceState)}>{t("workspace.billing.invoiceLabel")}: {t(`workspace.billing.status.${billingStatusKey(invoiceState)}`)}</Badge>
        <Badge className={statusClass(journey)}>{t("workspace.billing.paymentLabel")}: {t(`workspace.billing.status.${billingStatusKey(journey)}`)}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <InvoiceField label={t("workspace.billing.fields.planItem")} value={invoiceName(invoice, t)} />
        <InvoiceField label={t("workspace.billing.fields.billingPeriod")} value={`${formatDate(invoice.billingPeriodStart)} – ${formatDate(invoice.billingPeriodEnd)}`} />
        <InvoiceField label={t("workspace.billing.fields.amountDue")} value={formatMoney(invoice.amountDue, invoice.currency)} />
        <InvoiceField label={t("workspace.billing.fields.amountConfirmed")} value={formatMoney(invoice.amountPaid, invoice.currency)} />
        <InvoiceField label={t("workspace.billing.fields.confirmedDate")} value={formatDate(invoice.paidAt)} />
        {invoice.notes ? <div className="sm:col-span-2"><InvoiceField label={t("workspace.billing.fields.notes")} value={invoice.notes} /></div> : null}
      </div>
      <InvoiceModalBody invoice={invoice} methods={methods} file={file} setFile={setFile} isSubmitting={isSubmitting} onSubmit={onSubmit} onViewReceipt={onViewReceipt} fallbackMethod={fallbackMethod} setFallbackMethod={setFallbackMethod} t={t} />
    </div>
  )
}

function InvoiceModalBody({
  invoice,
  methods,
  file,
  setFile,
  isSubmitting,
  onSubmit,
  onViewReceipt,
  fallbackMethod,
  setFallbackMethod,
  t,
}: {
  invoice: TenantBillingRecordDto
  methods: ReturnType<typeof paymentMethods>
  file: File | null
  setFile: (file: File | null) => void
  isSubmitting: boolean
  onSubmit: () => void
  onViewReceipt: () => void
  fallbackMethod: PaymentMethod
  setFallbackMethod: (method: PaymentMethod) => void
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  if (invoice.reviewStatus === "cancelled") {
    return <div className="space-y-4"><div className="rounded-xl border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700 dark:border-slate-400/30 dark:bg-slate-500/10 dark:text-slate-200"><p className="font-semibold">{t("workspace.billing.invoiceCancelled")}</p><p className="mt-1">{t("workspace.billing.invoiceCancelledDescription")}</p></div></div>
  }
  if (invoice.reviewStatus === "reject") {
    return <div className="space-y-4"><div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100"><p className="font-semibold">{t("workspace.billing.invoiceRejected")}</p><p className="mt-1">{t("workspace.billing.invoiceRejectedDescription")}</p></div></div>
  }
  if (proofIsSettled(invoice)) {
    return <div className="space-y-4"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"><p className="font-semibold">{t("workspace.billing.paymentConfirmed")}</p><p className="mt-1">{t("workspace.billing.paymentConfirmedAt", { date: formatDate(invoice.paidAt), amount: formatMoney(invoice.amountPaid, invoice.currency) })}.</p></div>{invoice.metadata?.paymentProof?.mediaFileId ? <div className="flex justify-end"><Button variant="outline" onClick={onViewReceipt}>{t("workspace.billing.viewReceipt")}</Button></div> : null}</div>
  }
  if (proofStatus(invoice) === "Awaiting confirmation") {
    return <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200"><p className="font-semibold">{t("workspace.billing.fullyPaidAwaitingConfirmation")}</p><p className="mt-1">{t("workspace.billing.billingTeamWillConfirm")}</p></div>
  }
  return <ProofDialogContent invoice={invoice} methods={methods} file={file} setFile={setFile} isSubmitting={isSubmitting} onSubmit={onSubmit} onViewReceipt={onViewReceipt} fallbackMethod={fallbackMethod} setFallbackMethod={setFallbackMethod} t={t} />
}

function PayToBox({ invoice, t }: { invoice: TenantBillingRecordDto; t: (key: string, values?: Record<string, string | number>) => string }) {
  // Plan 31: live list first (ids + QR), hardcoded fallback inside the hook.
  const { groups } = usePaymentMethodGroups()
  const accounts = groups.flatMap((group) => group.accounts)
  const metadata = (invoice.metadata as Record<string, unknown> | undefined) || {}
  const storedId = typeof metadata.selectedPaymentAccountId === "string" ? metadata.selectedPaymentAccountId : null
  const stored = typeof metadata.selectedPaymentAccount === "string" ? metadata.selectedPaymentAccount : null
  const activeAccount =
    accounts.find((account) => storedId && account.id === storedId) ||
    accounts.find((account) => stored && `${account.label}: ${account.detail}` === stored) ||
    null
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-400/30 dark:bg-indigo-500/10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
        {t("workspace.billing.payTo")}
      </p>
      <div className="mt-2 space-y-2">
        {accounts.map((account) => {
          const active = activeAccount?.id === account.id
          return (
            <div
              key={account.id}
              className={active ? "rounded-lg border border-indigo-400 bg-white/80 p-2.5 dark:border-indigo-300/60 dark:bg-slate-950/60" : "p-1"}
            >
              <div className="flex items-center gap-2">
                {account.iconUrl ? (
                  <img
                    src={account.iconUrl}
                    alt=""
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 rounded object-contain"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {account.label}
                    {active ? ` · ${t("workspace.billing.selected")}` : ""}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{account.detail}</p>
                </div>
              </div>
              {active && account.qrUrl ? (
                <img src={account.qrUrl} alt={t("workspace.billing.paymentQR", { label: account.label })} className="mt-2 h-28 w-28 rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProofDialogContent({
  invoice,
  methods,
  file,
  setFile,
  isSubmitting,
  onSubmit,
  onViewReceipt,
  fallbackMethod,
  setFallbackMethod,
  t,
}: {
  invoice: TenantBillingRecordDto
  methods: ReturnType<typeof paymentMethods>
  file: File | null
  setFile: (file: File | null) => void
  isSubmitting: boolean
  onSubmit: () => void
  onViewReceipt: () => void
  fallbackMethod: PaymentMethod
  setFallbackMethod: (method: PaymentMethod) => void
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const proof = invoice.metadata?.paymentProof
  const pending = proofIsPending(proof)
  const settled = proofIsSettled(invoice)
  // Plan 30 Task 7: file-only modal — everything except the receipt file is
  // frozen (existing proof → request-page selections → record defaults).
  const frozen = frozenProofInput(invoice)
  if (pending || settled) {
    return <div className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"><p className="font-semibold">{settled ? t("workspace.billing.paymentConfirmed") : t("workspace.billing.proofPendingReview")}</p><p className="mt-1">{settled ? t("workspace.billing.invoiceSettled") : t("workspace.billing.cannotSubmitAnotherProof")}</p></div>{proof ? <div className="grid gap-3 sm:grid-cols-2"><InvoiceField label={t("workspace.billing.fields.status")} value={t(`workspace.billing.status.${billingStatusKey(proofStatus(invoice))}`)} /><InvoiceField label={t("workspace.billing.fields.submittedAmount")} value={formatMoney(proof.paidAmount, invoice.currency)} /><InvoiceField label={t("workspace.billing.fields.paymentMethod")} value={titleCase(proof.paymentMethod)} /><InvoiceField label={t("workspace.billing.fields.paidDate")} value={formatDate(proof.paidDate)} /><InvoiceField label={t("workspace.billing.fields.submitted")} value={formatDateTime(proof.submittedAt)} /><InvoiceField label={t("workspace.billing.fields.receipt")} value={proof.fileName} /></div> : null}{proof?.mediaFileId ? <div className="flex justify-end"><Button variant="outline" onClick={onViewReceipt}>{t("workspace.billing.viewSubmittedReceipt")}</Button></div> : null}</div>
  }
  return <div className="space-y-4">{proof?.status === "rejected" ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100"><p className="font-semibold">{t("workspace.billing.previousProofRejected")}</p><p className="mt-1">{proof.rejectionReason || t("workspace.billing.submitCorrectedProof")}</p></div> : null}<PayToBox invoice={invoice} t={t} /><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t("workspace.billing.fields.paymentMethod")}</Label>{frozen.method ? <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">{methods.find((method) => method.value === frozen.method)?.label || titleCase(frozen.method)}</p> : <><Select value={fallbackMethod} onValueChange={(value) => setFallbackMethod(value as PaymentMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{methods.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">t("workspace.billing.noPaymentMethodRecorded")</p></>}</div><div className="space-y-2"><Label>{t("workspace.billing.fields.amountToPay")}</Label><p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">{formatMoney(Math.max(0, Number(invoice.amountDue || 0) - Number(invoice.amountPaid || 0)), invoice.currency)}</p><p className="text-xs text-slate-500">t("workspace.billing.fullOutstandingPlanPrice")</p></div><div className="space-y-2"><Label>{t("workspace.billing.fields.paidDate")}</Label><p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">{formatDate(frozen.paidDate)}</p></div>{frozen.transactionReference ? <div className="space-y-2"><Label>Transaction / reference ID</Label><p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">{frozen.transactionReference}</p></div> : null}<div className="space-y-2 sm:col-span-2"><Label>Receipt or payment screenshot</Label><Input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>{frozen.note ? <div className="space-y-2 sm:col-span-2"><Label>Note</Label><p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{frozen.note}</p></div> : null}</div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Payment remains unconfirmed until reviewed.</p><Button onClick={onSubmit} disabled={isSubmitting || !file}>{isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : "Submit for review"}</Button></div></div>
}
