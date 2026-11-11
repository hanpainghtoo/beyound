"use client"

import { cn } from "@/lib/utils"
import type { TenantBillingRecordDto } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"

const YANGON_TIME_ZONE = "Asia/Yangon"

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
    : "—"

function itemName(record: TenantBillingRecordDto, t: (key: string) => string) {
  return (
    record.subscriptionPlan?.name ||
    (typeof record.metadata?.selectedPlanName === "string"
      ? record.metadata.selectedPlanName
      : typeof record.metadata?.productName === "string"
        ? record.metadata.productName
        : t("workspace.invoiceDocument.billingItem"))
  )
}

type DocStatus = { label: string; tone: "emerald" | "amber" | "rose" | "slate" }

function docStatus(record: TenantBillingRecordDto, t: (key: string) => string): DocStatus {
  const proof = record.metadata?.paymentProof
  if (record.reviewStatus === "confirm" || proof?.status === "confirmed")
    return { label: t("workspace.invoiceDocument.statusPaid"), tone: "emerald" }
  if (record.reviewStatus === "cancelled" || proof?.status === "cancelled")
    return { label: t("workspace.invoiceDocument.statusCancelled"), tone: "slate" }
  if (record.reviewStatus === "reject" || proof?.status === "rejected")
    return { label: t("workspace.invoiceDocument.statusRejected"), tone: "rose" }
  return { label: t("workspace.invoiceDocument.statusPending"), tone: "amber" }
}

const toneClasses: Record<DocStatus["tone"], string> = {
  emerald:
    "border-emerald-500 text-emerald-700 dark:border-emerald-400/60 dark:text-emerald-300",
  amber:
    "border-amber-500 text-amber-700 dark:border-amber-400/60 dark:text-amber-300",
  rose: "border-rose-500 text-rose-700 dark:border-rose-400/60 dark:text-rose-300",
  slate:
    "border-slate-500 text-slate-600 dark:border-slate-400/60 dark:text-slate-300",
}

// Plan 29: real-world style invoice document. Read-only, printable
// (see `.invoice-doc` print rules in globals.css). Missing optional fields
// hide their row entirely — never placeholders or broken states.
export function InvoiceDocument({
  record,
  companyName,
  onViewReceipt,
}: {
  record: TenantBillingRecordDto
  companyName?: string | null
  onViewReceipt?: () => void
}) {
  const { t } = useI18n()
  const proof = record.metadata?.paymentProof
  const status = docStatus(record, t)
  const outstanding = Math.max(
    Number(record.amountDue || 0) - Number(record.amountPaid || 0),
    0,
  )
  const paid = Number(record.amountPaid || 0)
  const invoiceDate =
    (record as { issueDate?: string | null }).issueDate || record.createdAt

  return (
    <div className="invoice-doc overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-4 p-6 sm:p-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t("workspace.invoiceDocument.invoice")}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
            {record.invoiceNo || t("workspace.invoiceDocument.pendingNumber")}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t("workspace.invoiceDocument.billedTo", { name: companyName || t("workspace.invoiceDocument.thisWorkspace") })}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t("workspace.invoiceDocument.issuedLine", {
              date: formatDate(invoiceDate),
              start: formatDate(record.billingPeriodStart),
              end: formatDate(record.billingPeriodEnd),
            })}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 -rotate-12 rounded-md border-2 px-3 py-1 text-sm font-bold uppercase tracking-[0.2em]",
            toneClasses[status.tone],
          )}
        >
          {status.label}
        </span>
      </div>
      <span className="sr-only">{t("workspace.invoiceDocument.statusAria", { label: status.label })}</span>

      {proof?.status === "rejected" ? (
        <div className="mx-6 mb-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 sm:mx-8 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
          <p className="font-semibold">{t("workspace.invoiceDocument.paymentRejected")}</p>
          <p className="mt-1">
            {proof.rejectionReason || t("workspace.invoiceDocument.proofRejectedFallback")}
          </p>
        </div>
      ) : null}

      <div className="px-6 pb-2 sm:px-8">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t("workspace.invoiceDocument.lineItems")}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("workspace.invoiceDocument.descriptionCol")}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("workspace.invoiceDocument.periodCol")}
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                {t("workspace.invoiceDocument.amountCol")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-slate-800 dark:text-slate-200">
              <td className="py-3 pr-4 font-medium">{itemName(record, t)}</td>
              <td className="whitespace-nowrap py-3 pr-4">
                {formatDate(record.billingPeriodStart)} –{" "}
                {formatDate(record.billingPeriodEnd)}
              </td>
              <td className="whitespace-nowrap py-3 text-right">
                {formatMoney(record.amountDue, record.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end px-6 pb-2 sm:px-8">
        <table className="text-sm">
          <caption className="sr-only">{t("workspace.invoiceDocument.invoiceTotals")}</caption>
          <tbody>
            <tr className="text-slate-600 dark:text-slate-300">
              <th scope="row" className="py-1 pr-6 text-right font-normal">
                {t("workspace.invoiceDocument.subtotal")}
              </th>
              <td className="py-1 text-right">
                {formatMoney(record.amountDue, record.currency)}
              </td>
            </tr>
            {paid > 0 ? (
              <tr className="text-slate-600 dark:text-slate-300">
                <th scope="row" className="py-1 pr-6 text-right font-normal">
                  {t("workspace.invoiceDocument.paidAmount")}
                </th>
                <td className="py-1 text-right">
                  {formatMoney(record.amountPaid, record.currency)}
                </td>
              </tr>
            ) : null}
            <tr className="text-slate-950 dark:text-slate-50">
              <th
                scope="row"
                className="border-t border-slate-200 py-2 pr-6 text-right text-base font-bold dark:border-slate-700"
              >
                {t("workspace.invoiceDocument.amountDue")}
              </th>
              <td className="border-t border-slate-200 py-2 text-right text-base font-bold dark:border-slate-700">
                {formatMoney(outstanding, record.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-1.5 border-t border-slate-200 px-6 py-4 text-sm text-slate-600 sm:px-8 dark:border-slate-700 dark:text-slate-300">
        <p>
          {t("workspace.invoiceDocument.methodLabel")}{" "}
          <strong className="text-slate-900 dark:text-slate-100">
            {proof?.paymentMethod
              ? proof.paymentMethod.replaceAll("_", " ")
              : t("workspace.invoiceDocument.notRecorded")}
          </strong>
        </p>
        {proof?.paidDate ? (
          <p>
            {t("workspace.invoiceDocument.paidDateLabel")}{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {formatDate(proof.paidDate)}
            </strong>
          </p>
        ) : null}
        {proof?.transactionReference ? (
          <p>
            {t("workspace.invoiceDocument.referenceLabel")}{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {proof.transactionReference}
            </strong>
          </p>
        ) : null}
        {record.paidAt ? (
          <p>
            {t("workspace.invoiceDocument.confirmedLabel")}{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {formatDate(record.paidAt)}
            </strong>
          </p>
        ) : null}
        {proof?.mediaFileId && onViewReceipt ? (
          <p className="no-print">
            <button
              type="button"
              onClick={onViewReceipt}
              className="font-semibold text-sky-600 underline-offset-2 hover:underline dark:text-sky-300"
            >
              {t("workspace.invoiceDocument.viewReceipt")}{proofFileLabel(proof.fileName)}
            </button>
          </p>
        ) : null}
        {record.notes ? <p className="pt-1">{t("workspace.invoiceDocument.noteLabel")} {record.notes}</p> : null}
      </div>
    </div>
  )
}

function proofFileLabel(fileName?: string | null) {
  return fileName ? ` (${fileName})` : ""
}
