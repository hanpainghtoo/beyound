"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Plus, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  agentOrdersApi,
  getApiErrorMessage,
  type AgentOrderDto,
  type AgentOrderItemDto,
} from "@/lib/api"
import { toast } from "sonner"
import { useUpdateOrderDetails } from "@/lib/queries/orders"
import { useProductOptions } from "@/lib/queries/products"
import { useI18n } from "@/components/providers/i18n-provider"

type Line = { productId: string; quantity: string; unitPrice: string; notes: string }

/**
 * Payment method options. Reuses the tenant-settings labels so the dialog and
 * the settings screen can never drift apart on what COD or bank transfer mean.
 */
const paymentMethodLabelKeys = {
  cod: "workspace.ordersSettings.fields.cashOnDelivery",
  bank_transfer: "workspace.ordersSettings.fields.bankTransfer",
  online: "workspace.ordersSettings.fields.onlinePayment",
} as const

const PAYMENT_METHODS = ["cod", "bank_transfer", "online"] as const

export function OrderDetailsDialog({
  order,
  items,
  canEdit,
  onUpdated,
}: {
  order: AgentOrderDto
  items: AgentOrderItemDto[]
  canEdit: boolean
  onUpdated: (order: AgentOrderDto, items: AgentOrderItemDto[]) => void
}) {
  const { t } = useI18n()
  const updateOrderDetails = useUpdateOrderDetails()
  const [open, setOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online" | "bank_transfer">("cod")
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "1", unitPrice: "", notes: "" }])
  const [shippingFee, setShippingFee] = useState("0")
  const [discountAmount, setDiscountAmount] = useState("0")
  const [taxAmount, setTaxAmount] = useState("0")
  const [notes, setNotes] = useState("")
  const [shippingAddress, setShippingAddress] = useState("")
  const [saving, setSaving] = useState(false)
  const isSubmittingRef = useRef(false)
  const lastProductsToastRef = useRef<string | null>(null)

  // Product options — same cached entry as the manual-order dialog; stays
  // active-only to preserve the previous dialog behavior.
  const productsQuery = useProductOptions(false)
  const products = productsQuery.data ?? []
  const loading = productsQuery.isLoading && !productsQuery.data

  useEffect(() => {
    if (!open) {
      lastProductsToastRef.current = null
      return
    }
    if (productsQuery.error && !productsQuery.data) {
      const message = getApiErrorMessage(productsQuery.error, t("workspace.ordersPage.dialog.productsLoadFailed"))
      if (lastProductsToastRef.current !== message) {
        lastProductsToastRef.current = message
        toast.error(message)
      }
    }
  }, [open, productsQuery.error, productsQuery.data, t])

  // Reinitialize only when opening or switching orders; live object refreshes must not erase edits.
  useEffect(() => {
    if (!open) return
    setPaymentMethod(order.paymentMethod || "cod")
    setShippingFee(String(Number(order.shippingFee || 0)))
    setDiscountAmount(String(Number(order.discountAmount || 0)))
    setTaxAmount(String(Number(order.taxAmount || 0)))
    setNotes(order.notes || "")
    setShippingAddress(order.shippingAddress || "")
    setLines(
      items.length
        ? items.map((item) => ({
            productId: item.productId || "",
            quantity: String(item.quantity),
            unitPrice: String(Number(item.unitPrice || 0)),
            notes: item.notes || "",
          }))
        : [{ productId: "", quantity: "1", unitPrice: "", notes: "" }],
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id])

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0),
    [lines],
  )
  const total = Math.max(subtotal + Number(taxAmount || 0) + Number(shippingFee || 0) - Number(discountAmount || 0), 0)

  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)))
  }

  const selectProduct = (index: number, productId: string) => {
    const product = products.find((item) => item.id === productId)
    updateLine(index, { productId, unitPrice: String(product?.price || 0) })
  }

  const submit = async () => {
    if (isSubmittingRef.current) return
    if (!canEdit) {
      toast.error(t("workspace.ordersPage.dialog.errNoOrderAccess"))
      return
    }
    if (lines.length === 0 || lines.some((line) => !line.productId || Number(line.quantity) < 1 || Number(line.unitPrice) < 0)) {
      toast.error(t("workspace.ordersPage.dialog.errInvalidLines"))
      return
    }
    if ([shippingFee, discountAmount, taxAmount].some((value) => Number(value) < 0 || !Number.isFinite(Number(value)))) {
      toast.error(t("workspace.ordersPage.dialog.errInvalidOrderAmounts"))
      return
    }

    isSubmittingRef.current = true
    setSaving(true)
    try {
      const updatedOrder = await updateOrderDetails.mutateAsync({
        id: order.id,
        data: {
          paymentMethod,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            notes: line.notes.trim() || undefined,
          })),
          shippingFee: Number(shippingFee),
          discountAmount: Number(discountAmount),
          taxAmount: Number(taxAmount),
          notes: notes.trim() || undefined,
          shippingAddress: shippingAddress.trim() || undefined,
        },
      })
      const updatedItems = await agentOrdersApi.items(order.id)
      onUpdated(updatedOrder, updatedItems)
      setOpen(false)
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.ordersPage.dialog.detailsUpdateFailed")))
    } finally {
      isSubmittingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!canEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          {t("workspace.ordersPage.dialog.editTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("workspace.ordersPage.dialog.editTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.ordersPage.dialog.editDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("workspace.ordersPage.dialog.paymentMethod")}</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{t(paymentMethodLabelKeys[method])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("workspace.ordersPage.dialog.orderItems")}</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((current) => [...current, { productId: "", quantity: "1", unitPrice: "", notes: "" }])}>
                <Plus className="mr-1 h-4 w-4" />
                {t("workspace.ordersPage.dialog.addItem")}
              </Button>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_90px_130px_1fr_36px]">
                <Select value={line.productId} onValueChange={(value) => selectProduct(index, value)} disabled={loading}>
                  <SelectTrigger><SelectValue placeholder={t("workspace.ordersPage.dialog.selectProduct")} /></SelectTrigger>
                  <SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}{product.status !== "active" ? t("workspace.ordersPage.dialog.inactiveSuffix") : ""}</SelectItem>)}</SelectContent>
                </Select>
                <Input aria-label={t("workspace.ordersPage.dialog.ariaItemQty", { n: index + 1 })} type="number" min="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                <Input aria-label={t("workspace.ordersPage.dialog.ariaItemPrice", { n: index + 1 })} type="number" min="0" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} />
                <Input aria-label={t("workspace.ordersPage.dialog.ariaItemNote", { n: index + 1 })} value={line.notes} onChange={(event) => updateLine(index, { notes: event.target.value })} placeholder={t("workspace.ordersPage.dialog.optionalNote")} />
                <Button type="button" size="icon" variant="ghost" title={t("workspace.ordersPage.dialog.removeItem")} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Amount label={t("workspace.ordersPage.dialog.shippingFee")} value={shippingFee} onChange={setShippingFee} />
            <Amount label={t("workspace.ordersPage.dialog.discount")} value={discountAmount} onChange={setDiscountAmount} />
            <Amount label={t("workspace.ordersPage.dialog.tax")} value={taxAmount} onChange={setTaxAmount} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-details-shipping-address">{t("workspace.ordersPage.labelShippingAddress")}</Label>
            <textarea id="order-details-shipping-address" maxLength={500} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} placeholder={t("workspace.ordersPage.dialog.fullShippingAddressPlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-details-notes">{t("workspace.ordersPage.sectionNotes")}</Label>
            <Input id="order-details-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("workspace.ordersPage.dialog.optionalInternalNote")} />
          </div>
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("workspace.ordersPage.dialog.updatedTotal")}</p>
              <p className="text-xl font-semibold">{total.toLocaleString()} MMK</p>
            </div>
            <Button onClick={submit} disabled={loading || saving}>
              {saving ? t("workspace.ordersPage.dialog.saving") : t("workspace.ordersPage.dialog.saveOrder")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Amount({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} /></div>
}
