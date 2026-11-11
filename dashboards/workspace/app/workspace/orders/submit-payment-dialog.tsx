"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Paperclip } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  agentMediaApi,
  getApiErrorMessage,
  type AgentOrderDto,
} from "@/lib/api"
import { useSubmitOrderPayment } from "@/lib/queries/orders"

const MAX_PROOF_BYTES = 10 * 1024 * 1024

function newSubmissionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function SubmitPaymentDialog({
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
  const submitPayment = useSubmitOrderPayment()
  const [amount, setAmount] = useState("")
  const [proof, setProof] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const proofInputRef = useRef<HTMLInputElement | null>(null)
  const idempotencyKeyRef = useRef(newSubmissionKey())
  const uploadedProofRef = useRef<{ file: File; fileId: string } | null>(null)

  const total = Number(order.totalAmount || 0)
  const paid = Number(order.paidAmount || 0)
  const remaining = useMemo(() => {
    const explicit = Number(order.remainingAmount)
    if (Number.isFinite(explicit)) return Math.max(explicit, 0)
    return Math.max(Math.round((total - paid) * 100) / 100, 0)
  }, [order.remainingAmount, paid, total])

  useEffect(() => {
    if (!open) return
    setAmount("")
    setProof(null)
    setError(null)
    setSubmitting(false)
    uploadedProofRef.current = null
    idempotencyKeyRef.current = newSubmissionKey()
  }, [open, order.id])

  const chooseProof = (file: File | null) => {
    setError(null)
    uploadedProofRef.current = null
    if (!file) {
      setProof(null)
      return
    }
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      setProof(null)
      setError(t("workspace.ordersPage.paymentProofTypeError"))
      return
    }
    if (file.size > MAX_PROOF_BYTES) {
      setProof(null)
      setError(t("workspace.ordersPage.paymentProofSizeError"))
      return
    }
    setProof(file)
  }

  const confirm = async () => {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("workspace.ordersPage.paymentAmountInvalid"))
      return
    }
    if (Math.round(value * 100) / 100 > remaining) {
      setError(t("workspace.ordersPage.paymentAmountExceeds", { amount: remaining.toLocaleString() }))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      let proofFileId: string | undefined
      if (proof) {
        if (uploadedProofRef.current?.file === proof) {
          proofFileId = uploadedProofRef.current.fileId
        } else {
          const uploaded = await agentMediaApi.upload(proof, "order-payment-proof")
          proofFileId = uploaded.file.id
          uploadedProofRef.current = { file: proof, fileId: proofFileId }
        }
      }
      const updated = await submitPayment.mutateAsync({
        id: order.id,
        amount: Math.round(value * 100) / 100,
        proofFileId,
        idempotencyKey: idempotencyKeyRef.current,
      })
      onSubmitted(updated)
      toast.success(t("workspace.ordersPage.paymentSubmitted"))
      onOpenChange(false)
    } catch (requestError) {
      // Stay open and keep the user's input so a failed upload or rejected
      // payment never looks like a successful submission.
      setError(getApiErrorMessage(requestError, t("workspace.ordersPage.submitPaymentFailed")))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspace.ordersPage.submitPayment")}</DialogTitle>
          <DialogDescription>
            {t("workspace.ordersPage.submitPaymentDescription", {
              total: total.toLocaleString(),
              remaining: remaining.toLocaleString(),
              currency: order.currency,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("workspace.ordersPage.labelTotal")}</span>
              <span className="tabular-nums">{total.toLocaleString()} {order.currency}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("workspace.ordersPage.labelPaid")}</span>
              <span className="tabular-nums">{paid.toLocaleString()} {order.currency}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-200 pt-1 font-semibold dark:border-slate-700">
              <span>{t("workspace.ordersPage.remainingBalance")}</span>
              <span className="tabular-nums">{remaining.toLocaleString()} {order.currency}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="submit-payment-amount">{t("workspace.ordersPage.paymentAmount")}</Label>
            <Input
              id="submit-payment-amount"
              type="number"
              min="0.01"
              max={remaining}
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => { setAmount(event.target.value); setError(null) }}
              placeholder={remaining.toLocaleString()}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("workspace.ordersPage.paymentProof")}</Label>
            <input
              ref={proofInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(event) => chooseProof(event.target.files?.[0] || null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => proofInputRef.current?.click()}
            >
              <Paperclip className="mr-2 h-4 w-4" />
              {proof ? proof.name : t("workspace.ordersPage.chooseProof")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("workspace.ordersPage.paymentProofHint")}</p>
            {proof?.type.startsWith("image/") ? (
              <img
                src={URL.createObjectURL(proof)}
                alt={proof.name}
                className="h-24 w-24 rounded-md border object-cover"
              />
            ) : null}
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void confirm()} disabled={submitting || remaining <= 0}>
            {submitting ? t("workspace.ordersPage.submittingPayment") : t("workspace.ordersPage.submitPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
