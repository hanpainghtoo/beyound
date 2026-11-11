"use client"

import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, MailCheck, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InvoiceDocument } from "@/components/invoice-document"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage } from "@/components/workspace"
import {
  agentMediaApi,
  getApiErrorMessage,
  type TenantBillingRecordDto,
} from "@/lib/api"
import { useBillingOverview } from "@/lib/queries/billing"
import { useI18n } from "@/components/providers/i18n-provider"

// Plan 29: standalone printable invoice page. Read-only; data comes from the
// billing-overview cache (no new fetching). Proof submission stays in the
// history modal — this page carries Print + receipt viewing only, so the
// submission form is never duplicated.
export default function InvoicePage() {
  const { t } = useI18n()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const billingQuery = useBillingOverview()
  const [message, setMessage] = useState("")
  // Plan 30: one-shot "just submitted" banner. Shown once on arrival from
  // the request-payment page, then stripped via replace so refresh or
  // revisit never reshows it.
  const [showJustRequested, setShowJustRequested] = useState(false)
  useEffect(() => {
    if (searchParams.get("justRequested") === "true") {
      setShowJustRequested(true)
      router.replace(`/workspace/billing/invoice/${id}`)
    }
  }, [id, router, searchParams])

  const billing = billingQuery.data ?? null
  const record: TenantBillingRecordDto | null =
    billing?.records.find((item) => item.id === id) || null

  const viewReceipt = async () => {
    const mediaFileId = record?.metadata?.paymentProof?.mediaFileId
    if (!mediaFileId) return
    try {
      const receipt = await agentMediaApi.download(
        mediaFileId,
        "billing-payment-proof",
      )
      window.open(receipt.download.url, "_blank", "noopener,noreferrer")
    } catch (requestError) {
      setMessage(getApiErrorMessage(requestError, t("workspace.invoice.unableOpenReceipt")))
    }
  }

  return (
    <>
      <WorkspaceHeader
        navKey="billing"
        eyebrow={t("workspace.invoice.eyebrow")}
        title={t("workspace.invoice.title")}
        description={t("workspace.invoice.description")}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/workspace/billing?tab=billing-history">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                {t("workspace.invoice.backToHistory")}
              </Link>
            </Button>
            {record ? (
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                {t("workspace.invoice.printInvoice")}
              </Button>
            ) : null}
          </>
        }
      />

      <WorkspacePage containerClassName="max-w-3xl">
        <div className="space-y-6">
          {showJustRequested ? (
            <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">{t("workspace.invoice.sentTitle")}</p>
                <p className="mt-1">
                  {t("workspace.invoice.sentBody", {
                    target: billing?.tenant.companyName
                      ? t("workspace.invoice.sentTargetCompany", { company: billing.tenant.companyName })
                      : t("workspace.invoice.sentTargetFallback"),
                  })}
                </p>
              </div>
            </div>
          ) : null}
          {message ? (
            <div className="no-print rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">
              {message}
            </div>
          ) : null}

          {billingQuery.isLoading && !billing ? (
            <p className="py-16 text-center text-sm text-slate-500">
              {t("workspace.invoice.loading")}
            </p>
          ) : !record ? (
            <div className="rounded-[22px] border border-dashed border-indigo-300 bg-indigo-50/40 p-10 text-center text-sm text-slate-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {t("workspace.invoice.notFoundTitle")}
              </p>
              <p className="mt-1">
                {t("workspace.invoice.notFoundDescription")}
              </p>
            </div>
          ) : (
            <InvoiceDocument
              record={record}
              companyName={billing?.tenant.companyName}
              onViewReceipt={viewReceipt}
            />
          )}
        </div>
      </WorkspacePage>
    </>
  )
}
