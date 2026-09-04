"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  Banknote,
  Building2,
  Eye,
  FileCheck2,
  History,
  Loader2,
  Receipt,
  Smartphone,
  Upload,
  WalletCards,
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
import { Textarea } from "@/components/ui/textarea"
import { WorkspaceEmptyState } from "@/components/workspace"
import {
  csrMediaApi,
  getApiErrorMessage,
  tenantBillingApi,
  type TenantBillingProofDto,
  type TenantBillingRecordDto,
} from "@/lib/api"
import { useBillingOverview, billingKeys } from "@/lib/queries/billing"
import { getPublicRuntimeConfig } from "@/lib/public-runtime-config"

const YANGON_TIME_ZONE = "Asia/Yangon"

type PaymentMethod = TenantBillingProofDto["paymentMethod"]

type ProofForm = {
  paymentMethod: PaymentMethod
  paidAmount: string
  paidDate: string
  transactionReference: string
  note: string
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

const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

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

function invoiceName(record: TenantBillingRecordDto) {
  return (
    record.subscriptionPlan?.name ||
    (typeof record.metadata?.selectedPlanName === "string"
      ? record.metadata.selectedPlanName
      : typeof record.metadata?.productName === "string"
        ? record.metadata.productName
        : "Billing item")
  )
}

function proofStatus(record: TenantBillingRecordDto) {
  const proof = record.metadata?.paymentProof
  if (record.paymentStatus === "paid" || record.paymentStatus === "waived" || proof?.status === "approved") return "Paid"
  if (proof?.status === "pending_review" || proof?.status === "proof_submitted") return "Proof submitted"
  if (proof?.status === "under_review") return "Under review"
  if (proof?.status === "rejected") return "Rejected"
  if (record.paymentStatus === "overdue") return "Overdue"
  if (record.paymentStatus === "partially_paid") return "Partially paid"
  if (Number(record.amountDue || 0) <= Number(record.amountPaid || 0)) return "Awaiting confirmation"
  return "Unpaid"
}

function statusClass(status: string) {
  if (status === "Paid") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
  if (status === "Rejected" || status === "Overdue") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200"
  if (status === "Proof submitted" || status === "Under review") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200"
  return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200"
}

function proofIsPending(proof?: TenantBillingProofDto) {
  return ["pending_review", "proof_submitted", "under_review"].includes(proof?.status || "")
}

function proofIsSettled(record: TenantBillingRecordDto) {
  return ["paid", "waived"].includes(record.paymentStatus) || record.metadata?.paymentProof?.status === "approved"
}

function proofHasViewableReceipt(record: TenantBillingRecordDto) {
  const proof = record.metadata?.paymentProof
  return Boolean(proof?.mediaFileId && (proofIsSettled(record) || proof.status === "rejected"))
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
  const billingQuery = useBillingOverview()
  const queryClient = useQueryClient()

  const billing = billingQuery.data ?? null
  const isLoading = billingQuery.isLoading
  const error = billingQuery.error
    ? getApiErrorMessage(billingQuery.error, "Billing history could not be loaded.")
    : ""

  const [message, setMessage] = useState("")
  const [selectedInvoice, setSelectedInvoice] = useState<TenantBillingRecordDto | null>(null)
  const [proofInvoice, setProofInvoice] = useState<TenantBillingRecordDto | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [proofForm, setProofForm] = useState<ProofForm>({
    paymentMethod: "bank_transfer",
    paidAmount: "",
    paidDate: new Date().toISOString().slice(0, 10),
    transactionReference: "",
    note: "",
  })

  const records = useMemo(
    () => [...(billing?.records || [])].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [billing?.records],
  )
  const methods = paymentMethods()

  const openProof = (record: TenantBillingRecordDto) => {
    const proof = record.metadata?.paymentProof
    const amount = Math.max(0, Number(record.amountDue || 0) - Number(record.amountPaid || 0))
    setProofInvoice(record)
    setProofFile(null)
    setProofForm({
      paymentMethod: proof?.paymentMethod || "bank_transfer",
      paidAmount: String(proof?.paidAmount || amount || record.amountDue || ""),
      paidDate: proof?.paidDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      transactionReference: proof?.transactionReference || "",
      note: proof?.note || "",
    })
  }

  const viewReceipt = async (record: TenantBillingRecordDto) => {
    const mediaFileId = record.metadata?.paymentProof?.mediaFileId
    if (!mediaFileId) return
    try {
      const receipt = await csrMediaApi.download(mediaFileId, "billing-payment-proof")
      window.open(receipt.download.url, "_blank", "noopener,noreferrer")
    } catch (requestError) {
      setMessage(getApiErrorMessage(requestError, "Unable to open receipt."))
    }
  }

  const submitProof = async () => {
    if (!proofInvoice || !proofFile) {
      setMessage("Select a receipt or payment screenshot before submitting.")
      return
    }
    if (proofIsPending(proofInvoice.metadata?.paymentProof)) {
      setMessage("This payment proof is already pending operator review.")
      return
    }
    const paidAmount = Number(proofForm.paidAmount)
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      setMessage("Enter a valid paid amount.")
      return
    }

    setIsSubmitting(true)
    setMessage("")
    try {
      const upload = await csrMediaApi.upload(proofFile, "billing-payment-proof")
      await tenantBillingApi.submitPaymentProof(proofInvoice.id, {
        paymentMethod: proofForm.paymentMethod,
        paidAmount,
        paidDate: proofForm.paidDate,
        transactionReference: proofForm.transactionReference || undefined,
        mediaFileId: upload.file.id,
        fileName: proofFile.name,
        mediaScanStatus: "clean",
        note: proofForm.note || undefined,
      })
      setMessage("Payment proof submitted. The ZayOS billing team will review it before confirming payment.")
      setProofFile(null)
      await queryClient.invalidateQueries({ queryKey: billingKeys.overview() })
    } catch (requestError) {
      setMessage(getApiErrorMessage(requestError, "Unable to submit payment proof."))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading && !billing) {
    return <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-500" />Loading billing history...</div>
  }

  if (error && !billing) {
    return <WorkspaceEmptyState icon={AlertCircle} title="Billing history is unavailable" description={error} action={<Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: billingKeys.overview() })}>Try again</Button>} />
  }

  return (
    <div className="space-y-12" data-testid="billing-v2-history">
      {message ? <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">{message}</div> : null}

      <V2Section title="Billing History" description="All invoices and payment status changes for this workspace." action={<Badge variant="secondary">{records.length} invoices</Badge>}>
        {records.length === 0 ? <WorkspaceEmptyState icon={History} title="No invoices yet." description="Issued invoices and payment confirmations will appear here." /> : <div className="overflow-x-auto rounded-[22px] border border-indigo-200 dark:border-indigo-500/30"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-indigo-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-indigo-500/10 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold">Invoice</th><th className="px-4 py-3 font-semibold">Plan / item</th><th className="px-4 py-3 font-semibold">Period</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Due date</th><th className="px-4 py-3 font-semibold">Confirmed</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-indigo-100 dark:divide-indigo-500/20">{records.map((record) => { const status = proofStatus(record); const proof = record.metadata?.paymentProof; const canSubmit = Number(record.amountDue || 0) - Number(record.amountPaid || 0) > 0 && !proofIsPending(proof) && !proofIsSettled(record); return <tr key={record.id} className="bg-white dark:bg-slate-950"><td className="px-4 py-4 font-semibold text-slate-950 dark:text-white">{record.invoiceNumber || "Pending number"}<p className="mt-1 text-xs font-normal text-slate-500">{formatDate(record.createdAt)}</p></td><td className="px-4 py-4 text-slate-700 dark:text-slate-200">{invoiceName(record)}</td><td className="px-4 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatDate(record.billingPeriodStart)} – {formatDate(record.billingPeriodEnd)}</td><td className="px-4 py-4 whitespace-nowrap font-semibold text-sky-600 dark:text-sky-300">{formatMoney(record.amountDue, record.currency)}</td><td className="px-4 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatDate(record.dueDate)}</td><td className="px-4 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatDate(record.paidAt)}</td><td className="px-4 py-4"><Badge className={statusClass(status)}>{status}</Badge></td><td className="px-4 py-4"><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setSelectedInvoice(record)}><Eye className="mr-1.5 h-3.5 w-3.5" />View</Button>{canSubmit ? <Button variant="outline" size="sm" className="border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300" onClick={() => openProof(record)}><Upload className="mr-1.5 h-3.5 w-3.5" />Proof</Button> : null}{proofIsPending(proof) ? <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" onClick={() => openProof(record)}><FileCheck2 className="mr-1.5 h-3.5 w-3.5" />Submitted</Button> : null}{proofHasViewableReceipt(record) ? <Button variant="outline" size="sm" onClick={() => void viewReceipt(record)}><Receipt className="mr-1.5 h-3.5 w-3.5" />Receipt</Button> : null}</div></td></tr> })}</tbody></table></div>}
      </V2Section>


      <Dialog open={Boolean(selectedInvoice)} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedInvoice?.invoiceNumber || "Invoice details"}</DialogTitle><DialogDescription>Invoice details for {billing?.tenant.companyName || "this workspace"}.</DialogDescription></DialogHeader>
          {selectedInvoice ? <div className="grid gap-3 sm:grid-cols-2"><InvoiceField label="Plan / item" value={invoiceName(selectedInvoice)} /><InvoiceField label="Billing period" value={`${formatDate(selectedInvoice.billingPeriodStart)} – ${formatDate(selectedInvoice.billingPeriodEnd)}`} /><InvoiceField label="Amount due" value={formatMoney(selectedInvoice.amountDue, selectedInvoice.currency)} /><InvoiceField label="Amount confirmed" value={formatMoney(selectedInvoice.amountPaid, selectedInvoice.currency)} /><InvoiceField label="Payment status" value={proofStatus(selectedInvoice)} /><InvoiceField label="Due date" value={formatDate(selectedInvoice.dueDate)} /><InvoiceField label="Confirmed date" value={formatDate(selectedInvoice.paidAt)} />{selectedInvoice.notes ? <div className="sm:col-span-2"><InvoiceField label="Notes" value={selectedInvoice.notes} /></div> : null}</div> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(proofInvoice)} onOpenChange={(open) => !open && !isSubmitting && setProofInvoice(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{proofInvoice?.metadata?.paymentProof ? "Submitted payment proof" : "Submit payment proof"}</DialogTitle><DialogDescription>{proofInvoice?.invoiceNumber || "Invoice number pending"} · {proofInvoice ? `${formatDate(proofInvoice.billingPeriodStart)} – ${formatDate(proofInvoice.billingPeriodEnd)}` : ""}</DialogDescription></DialogHeader>
          {proofInvoice ? <ProofDialogContent invoice={proofInvoice} methods={methods} form={proofForm} setForm={setProofForm} file={proofFile} setFile={setProofFile} isSubmitting={isSubmitting} onSubmit={() => void submitProof()} onViewReceipt={() => void viewReceipt(proofInvoice)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProofDialogContent({
  invoice,
  methods,
  form,
  setForm,
  file,
  setFile,
  isSubmitting,
  onSubmit,
  onViewReceipt,
}: {
  invoice: TenantBillingRecordDto
  methods: ReturnType<typeof paymentMethods>
  form: ProofForm
  setForm: (form: ProofForm) => void
  file: File | null
  setFile: (file: File | null) => void
  isSubmitting: boolean
  onSubmit: () => void
  onViewReceipt: () => void
}) {
  const proof = invoice.metadata?.paymentProof
  const pending = proofIsPending(proof)
  const settled = proofIsSettled(invoice)
  if (pending || settled) {
    return <div className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"><p className="font-semibold">{settled ? "Payment confirmed" : "Payment proof is pending operator review"}</p><p className="mt-1">{settled ? "This invoice has been settled." : "You cannot submit another proof while the current proof is under review."}</p></div>{proof ? <div className="grid gap-3 sm:grid-cols-2"><InvoiceField label="Status" value={proofStatus(invoice)} /><InvoiceField label="Submitted amount" value={formatMoney(proof.paidAmount, invoice.currency)} /><InvoiceField label="Payment method" value={titleCase(proof.paymentMethod)} /><InvoiceField label="Paid date" value={formatDate(proof.paidDate)} /><InvoiceField label="Submitted" value={formatDateTime(proof.submittedAt)} /><InvoiceField label="Receipt" value={proof.fileName} /></div> : null}{proof?.mediaFileId ? <div className="flex justify-end"><Button variant="outline" onClick={onViewReceipt}>View submitted receipt</Button></div> : null}</div>
  }
  return <div className="space-y-4">{proof?.status === "rejected" ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100"><p className="font-semibold">Previous proof was rejected</p><p className="mt-1">{proof.rejectionReason || "Please submit a corrected proof for this invoice."}</p></div> : null}<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Payment method</Label><Select value={form.paymentMethod} onValueChange={(value) => setForm({ ...form, paymentMethod: value as PaymentMethod })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{methods.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Paid amount (MMK)</Label><Input inputMode="numeric" value={form.paidAmount} onChange={(event) => setForm({ ...form, paidAmount: event.target.value })} /></div><div className="space-y-2"><Label>Paid date</Label><Input type="date" value={form.paidDate} onChange={(event) => setForm({ ...form, paidDate: event.target.value })} /></div><div className="space-y-2"><Label>Transaction / reference ID</Label><Input value={form.transactionReference} onChange={(event) => setForm({ ...form, transactionReference: event.target.value })} placeholder="Optional" /></div><div className="space-y-2 sm:col-span-2"><Label>Receipt or payment screenshot</Label><Input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div><div className="space-y-2 sm:col-span-2"><Label>Note</Label><Textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional note for the billing team" /></div></div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Payment remains unconfirmed until reviewed.</p><Button onClick={onSubmit} disabled={isSubmitting || !file}>{isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : "Submit for review"}</Button></div></div>
}
