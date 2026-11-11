"use client"

import { useEffect, useState } from "react"
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
import { getApiErrorMessage, type AgentOrderDto, type AgentDeliveryDto } from "@/lib/api"
import { useUpdateDelivery } from "@/lib/queries/deliveries"

export function EditDeliveryDialog({
  order,
  open,
  onOpenChange,
  onSaved,
}: {
  order: AgentOrderDto
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (delivery: AgentDeliveryDto) => void | Promise<void>
}) {
  const { t } = useI18n()
  const updateDelivery = useUpdateDelivery()
  const [assignee, setAssignee] = useState("")
  const [phone, setPhone] = useState("")
  const [deliveryDate, setDeliveryDate] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setAssignee(order.deliveryAssigneeName || "")
    setPhone(order.deliveryAssigneePhone || "")
    setDeliveryDate(order.deliveryDate ? String(order.deliveryDate).slice(0, 10) : "")
    setError(null)
    setSaving(false)
  }, [open, order.id, order.deliveryAssigneeName, order.deliveryAssigneePhone, order.deliveryDate])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const delivery = await updateDelivery.mutateAsync({
        id: order.id,
        data: {
          // Empty strings are sent so clearing an assignment actually clears
          // it instead of silently leaving the old value in place.
          deliveryAssigneeName: assignee.trim(),
          deliveryAssigneePhone: phone.trim(),
          deliveryDate: deliveryDate || undefined,
        },
      })
      await onSaved(delivery)
      toast.success(t("workspace.ordersPage.deliveryUpdated"))
      onOpenChange(false)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t("workspace.ordersPage.updateDeliveryFailed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspace.ordersPage.editDeliveryInfo")}</DialogTitle>
          <DialogDescription>{t("workspace.ordersPage.editDeliveryDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delivery-assignee">{t("workspace.deliveries.assignee")}</Label>
            <Input
              id="delivery-assignee"
              value={assignee}
              onChange={(event) => { setAssignee(event.target.value); setError(null) }}
              placeholder={t("workspace.deliveries.assignee")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delivery-phone">{t("workspace.deliveries.phone")}</Label>
            <Input
              id="delivery-phone"
              value={phone}
              onChange={(event) => { setPhone(event.target.value); setError(null) }}
              placeholder={t("workspace.deliveries.phone")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delivery-date">{t("workspace.deliveries.date")}</Label>
            <Input
              id="delivery-date"
              type="date"
              value={deliveryDate}
              onChange={(event) => { setDeliveryDate(event.target.value); setError(null) }}
            />
          </div>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? t("workspace.ordersPage.saving") : t("workspace.ordersPage.saveDeliveryInfo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
