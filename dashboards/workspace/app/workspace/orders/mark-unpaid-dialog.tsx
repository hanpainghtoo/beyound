"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  getApiErrorMessage,
  type AgentOrderDto,
} from "@/lib/api"
import { useMarkOrderUnpaid } from "@/lib/queries/orders"
import { useOrderStatusLabels } from "./order-status-labels"

function newSubmissionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `unpaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function MarkUnpaidDialog({
  order,
  open,
  onOpenChange,
  onSubmitted,
}: {
  order: AgentOrderDto
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: (order: AgentOrderDto) => void
}) {
  const { t } = useI18n()
  const statusLabels = useOrderStatusLabels()
  const markUnpaid = useMarkOrderUnpaid()
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKeyRef = useRef(newSubmissionKey())

  useEffect(() => {
    if (!open) return
    setReason("")
    setError(null)
    setSubmitting(false)
    idempotencyKeyRef.current = newSubmissionKey()
  }, [open, order.id])

  const confirm = async () => {
    if (!reason.trim()) {
      setError(t("workspace.ordersPage.reasonRequired"))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await markUnpaid.mutateAsync({
        id: order.id,
        reason: reason.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      })
      onSubmitted(updated)
      toast.success(t("workspace.ordersPage.markUnpaidRecorded"))
      onOpenChange(false)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t("workspace.ordersPage.markUnpaidFailed")))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspace.ordersPage.markUnpaid")}</DialogTitle>
          <DialogDescription>{t("workspace.ordersPage.markUnpaidDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("workspace.ordersPage.currentStatus")}
            </p>
            <p className="mt-1 text-sm font-semibold">{statusLabels.paymentStatus(order.paymentStatus)}</p>
          </div>
          <span className="text-slate-400">→</span>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("workspace.ordersPage.newStatus")}
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-300">{t("workspace.ordersPage.unpaid")}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mark-unpaid-reason">
            {t("workspace.ordersPage.markUnpaidReason")}
            <span className="ml-1 text-red-500">*</span>
          </Label>
          <Textarea
            id="mark-unpaid-reason"
            value={reason}
            onChange={(event) => { setReason(event.target.value); setError(null) }}
            maxLength={500}
            className="min-h-[90px]"
            placeholder={t("workspace.ordersPage.markUnpaidReasonPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("workspace.ordersPage.markUnpaidHistoryNote")}</p>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void confirm()} disabled={submitting || !reason.trim()}>
            {submitting ? t("workspace.ordersPage.saving") : t("workspace.ordersPage.markUnpaid")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
