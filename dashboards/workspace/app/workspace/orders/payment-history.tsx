"use client"

import { useEffect, useState } from "react"
import { ChevronDown, FileText, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  agentMediaApi,
  type AgentOrderDto,
  type AgentOrderPaymentTransactionDto,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { useOrderStatusLabels } from "./order-status-labels"

type ProofState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error" }

function TransactionProof({ fileId, contentType }: { fileId: string; contentType?: string | null }) {
  const { t } = useI18n()
  const [state, setState] = useState<ProofState>({ status: "loading" })

  const load = () => {
    setState({ status: "loading" })
    void agentMediaApi
      .download(fileId, "order-payment-proof")
      .then((result) => setState({ status: "ready", url: result.download.url }))
      .catch(() => setState({ status: "error" }))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId])

  if (state.status === "loading") {
    return <div className="h-14 w-14 animate-pulse rounded-md border bg-muted" aria-label={t("workspace.orders.proofViewer.loadingProof")} />
  }
  if (state.status === "error") {
    return (
      <Button type="button" size="sm" variant="outline" onClick={load}>
        {t("common.retry")}
      </Button>
    )
  }
  return (
    <a href={state.url} target="_blank" rel="noreferrer" className="block shrink-0">
      {contentType === "application/pdf" ? (
        <span className="inline-flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-md border text-[10px]">
          <FileText className="h-4 w-4" />
          PDF
        </span>
      ) : (
        <img
          src={state.url}
          alt={t("workspace.orders.proofViewer.proofAlt")}
          className="h-14 w-14 rounded-md border object-cover"
        />
      )}
    </a>
  )
}

function transactionLabel(type: AgentOrderPaymentTransactionDto["type"], t: (key: string) => string) {
  switch (type) {
    case "reversal":
      return t("workspace.ordersPage.transactionReversal")
    case "status_change":
      return t("workspace.ordersPage.transactionStatusChange")
    default:
      return t("workspace.ordersPage.transactionPayment")
  }
}

export function PaymentHistory({ order }: { order: AgentOrderDto }) {
  const { t } = useI18n()
  const statusLabels = useOrderStatusLabels()
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false)
  const transactions = [...(order.paymentTransactions || [])].sort((a, b) => {
    const left = String(a.timestamp || a.createdAt || "")
    const right = String(b.timestamp || b.createdAt || "")
    return right.localeCompare(left)
  })

  return (
    <Collapsible open={paymentHistoryOpen} onOpenChange={setPaymentHistoryOpen} className="border border-slate-200 rounded-xl dark:border-slate-800">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", paymentHistoryOpen && "rotate-180")} aria-hidden="true" />
        {t("workspace.ordersPage.paymentHistory")}
        {transactions.length ? (
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {transactions.length}
          </span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        {!transactions.length ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-muted-foreground dark:border-slate-800">
            {t("workspace.ordersPage.noPayments")}
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {transactions.map((transaction) => {
              const isPayment = transaction.type === "payment"
              const isReversal = transaction.type === "reversal"
              const timestamp = transaction.timestamp || transaction.createdAt
              return (
                <li
                  key={transaction.id}
                  className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-800"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {transactionLabel(transaction.type, t)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0 text-[10px] font-medium",
                            isPayment && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
                            isReversal && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
                            !isPayment && !isReversal && "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          {transaction.type === "status_change"
                            ? t("workspace.ordersPage.noAmount")
                            : `${isReversal ? "−" : "+"}${Math.abs(Number(transaction.amount || 0)).toLocaleString()} ${order.currency}`}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {transaction.previousPaymentStatus
                          ? `${statusLabels.paymentStatus(transaction.previousPaymentStatus)} → ${statusLabels.paymentStatus(transaction.newPaymentStatus || order.paymentStatus)}`
                          : statusLabels.paymentStatus(transaction.newPaymentStatus || order.paymentStatus)}
                      </p>
                      {transaction.reason ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-slate-600 dark:text-slate-300">
                          {transaction.reason}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        {timestamp ? new Date(timestamp).toLocaleString() : "—"}
                        {transaction.actorName ? ` · ${transaction.actorName}` : ""}
                      </p>
                    </div>
                    {transaction.proofFileId ? (
                      <TransactionProof
                        fileId={transaction.proofFileId}
                        contentType={transaction.proofContentType}
                      />
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function PaymentProofBadge({ count }: { count: number }) {
  const { t } = useI18n()
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <ImageIcon className="h-3 w-3" />
      {t("workspace.orders.proofViewer.proofCount", { count })}
    </span>
  )
}
