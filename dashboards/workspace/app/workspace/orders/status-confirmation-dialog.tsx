"use client"

import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type StatusConfirmationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  currentLabel: string
  proposedLabel: string
  currentHint?: string
  proposedHint?: string
  reason?: string
  onReasonChange?: (value: string) => void
  reasonRequired?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  confirmLabel: string
  cancelLabel: string
  pendingLabel?: string
  loading?: boolean
  error?: string | null
  onConfirm: () => void | Promise<void>
}

/**
 * Shared confirmation surface for order and delivery status changes. Both
 * selectors stage a value here first, so no status is written until the user
 * confirms. The same component also collects the mandatory audit reason for
 * cancellation, rejection, failed delivery, and returned outcomes.
 */
export function StatusConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  currentLabel,
  proposedLabel,
  currentHint,
  proposedHint,
  reason,
  onReasonChange,
  reasonRequired,
  reasonLabel,
  reasonPlaceholder,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  loading,
  error,
  onConfirm,
}: StatusConfirmationDialogProps) {
  const showReason = Boolean(onReasonChange)
  const missingReason = Boolean(reasonRequired) && !reason?.trim()

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="min-w-0 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {currentHint || "Current"}
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-700 dark:text-slate-200">
              {currentLabel}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <div className="min-w-0 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {proposedHint || "New"}
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-indigo-600 dark:text-indigo-300">
              {proposedLabel}
            </p>
          </div>
        </div>

        {showReason ? (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="status-confirm-reason">
              {reasonLabel}
              {reasonRequired ? <span className="ml-1 text-red-500">*</span> : null}
            </label>
            <Textarea
              id="status-confirm-reason"
              maxLength={500}
              value={reason ?? ""}
              onChange={(event) => onReasonChange?.(event.target.value)}
              placeholder={reasonPlaceholder}
              className="min-h-[80px]"
            />
          </div>
        ) : null}

        {error ? (
          <p className={cn("rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300")}>
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button onClick={() => void onConfirm()} disabled={loading || missingReason}>
            {loading ? pendingLabel || confirmLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
