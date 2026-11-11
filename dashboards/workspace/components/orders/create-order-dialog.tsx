"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Minus, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getApiErrorMessage, type AgentOrderDto } from "@/lib/api"
import { toast } from "sonner"
import { useCustomerOptions } from "@/lib/queries/customers"
import { useCreateOrder } from "@/lib/queries/orders"
import { useProductOptions } from "@/lib/queries/products"
import { useI18n } from "@/components/providers/i18n-provider"

export type CreateOrderMode = "manual" | "conversation"

type OrderLine = {
  productId: string
  quantity: string
  unitPrice: string
  priceOverridden: boolean
}

/** Payment method options, shared by the create and edit dialogs. */
const paymentMethodLabelKeys = {
  cod: "workspace.ordersSettings.fields.cashOnDelivery",
  bank_transfer: "workspace.ordersSettings.fields.bankTransfer",
  online: "workspace.ordersSettings.fields.onlinePayment",
} as const

const PAYMENT_METHODS = ["cod", "bank_transfer", "online"] as const

type CreateOrderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: CreateOrderMode
  /** Conversation mode: locked customer the order belongs to. */
  customerId?: string
  /** Conversation mode: source conversation linked to the order. */
  conversationId?: string
  /** Conversation mode: display name for the locked customer chip. */
  lockedCustomerName?: string
  onCreated: (order: AgentOrderDto) => void | Promise<void>
}

export function CreateOrderDialog({
  open,
  onOpenChange,
  mode,
  customerId: lockedCustomerId,
  conversationId,
  lockedCustomerName,
  onCreated,
}: CreateOrderDialogProps) {
  const { t } = useI18n()
  // Creation goes through the shared mutation so every cached order list
  // (main list, inbox customer list, bulk scan) invalidates together.
  const createOrder = useCreateOrder()
  const [manualCustomerId, setManualCustomerId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online" | "bank_transfer">("cod")
  const [draftProductId, setDraftProductId] = useState("")
  const [lines, setLines] = useState<OrderLine[]>([])
  const [shippingFee, setShippingFee] = useState("0")
  const [discountAmount, setDiscountAmount] = useState("0")
  const [shippingAddress, setShippingAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const isSubmittingRef = useRef(false)
  const lastOptionsToastRef = useRef<string | null>(null)

  const customerId = mode === "manual" ? manualCustomerId : lockedCustomerId || ""

  // Dropdown options — cached across every order surface via TanStack Query.
  const customersQuery = useCustomerOptions(true)
  const productsQuery = useProductOptions(true)
  const customers = customersQuery.data ?? []
  const products = productsQuery.data ?? []
  const loading = (customersQuery.isLoading && !customersQuery.data) || (productsQuery.isLoading && !productsQuery.data)

  // Reset the draft whenever the dialog closes so both entries start fresh.
  useEffect(() => {
    if (!open) {
      lastOptionsToastRef.current = null
      setManualCustomerId("")
      setPaymentMethod("cod")
      setDraftProductId("")
      setLines([])
      setShippingFee("0")
      setDiscountAmount("0")
      setShippingAddress("")
      setNotes("")
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const requestError = customersQuery.error || productsQuery.error
    if (requestError && !customersQuery.data && !productsQuery.data) {
      const message = getApiErrorMessage(requestError, t("workspace.ordersPage.dialog.optionsLoadFailed"))
      if (lastOptionsToastRef.current !== message) {
        lastOptionsToastRef.current = message
        toast.error(message)
      }
    }
  }, [open, customersQuery.error, productsQuery.error, customersQuery.data, productsQuery.data, t])

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0),
    [lines],
  )
  const total = Math.max(subtotal + Number(shippingFee || 0) - Number(discountAmount || 0), 0)

  const updateLine = (index: number, patch: Partial<OrderLine>) => {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)))
  }

  const addSelectedProduct = () => {
    if (!draftProductId) return
    const product = products.find((item) => item.id === draftProductId)

    // A product is always a single row. Adding one that is already in the
    // order bumps that row's quantity (on top of any manual edit) instead of
    // appending a duplicate.
    const existingIndex = lines.findIndex((line) => line.productId === draftProductId)

    if (existingIndex !== -1) {
      setLines((current) =>
        current.map((line, index) =>
          index === existingIndex
            ? { ...line, quantity: String(Math.max(1, Number(line.quantity || 0) + 1)) }
            : line,
        ),
      )
      toast.info(t("workspace.ordersPage.dialog.productAlreadyAdded"))
    } else {
      setLines((current) => [
        ...current,
        {
          productId: draftProductId,
          quantity: "1",
          unitPrice: String(product?.price ?? 0),
          priceOverridden: false,
        },
      ])
    }

    // Clear the picker so the next add starts from a fresh choice.
    setDraftProductId("")
  }

  const changeQuantity = (index: number, delta: number) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, quantity: String(Math.max(1, Number(line.quantity || 0) + delta)) }
          : line,
      ),
    )
  }

  const submit = async () => {
    if (isSubmittingRef.current) return
    if (mode === "manual" && !customerId) {
      toast.error(t("workspace.ordersPage.dialog.errSelectCustomer"))
      return
    }
    if (mode === "conversation" && (!customerId || !conversationId)) {
      toast.error(t("workspace.ordersPage.dialog.errSelectConversation"))
      return
    }
    if (lines.length === 0) {
      toast.error(t("workspace.ordersPage.dialog.errNoItems"))
      return
    }
    if (lines.some((line) => !line.productId || Number(line.quantity) < 1 || Number(line.unitPrice) < 0)) {
      toast.error(t("workspace.ordersPage.dialog.errInvalidLines"))
      return
    }
    if ([shippingFee, discountAmount].some((value) => Number(value) < 0 || !Number.isFinite(Number(value)))) {
      toast.error(t("workspace.ordersPage.dialog.errInvalidPayments"))
      return
    }
    if (!shippingAddress.trim() || shippingAddress.trim().length > 500) { toast.error(t("workspace.ordersPage.dialog.errInvalidAddress")); return }

    isSubmittingRef.current = true
    setSaving(true)
    try {
      const order = await createOrder.mutateAsync({
        customerId,
        ...(conversationId ? { conversationId } : {}),
        paymentMethod,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
        shippingFee: Number(shippingFee),
        discountAmount: Number(discountAmount),
        shippingAddress: shippingAddress.trim(),
        notes: notes.trim() || undefined,
      })
      await onCreated(order)
      onOpenChange(false)
      toast.success(t("workspace.ordersPage.dialog.created"))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.ordersPage.dialog.createFailed")))
    } finally {
      isSubmittingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("workspace.ordersPage.createOrder")}</DialogTitle>
          <DialogDescription>
            {mode === "manual"
              ? t("workspace.ordersPage.dialog.createDescriptionManual")
              : t("workspace.ordersPage.dialog.createDescriptionConversation")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "manual" ? (
              <div className="space-y-2">
                <Label>{t("workspace.ordersPage.dialog.customer")}</Label>
                <Select value={manualCustomerId} onValueChange={setManualCustomerId} disabled={loading}>
                  <SelectTrigger><SelectValue placeholder={loading ? t("common.loading") : t("workspace.ordersPage.dialog.selectCustomer")} /></SelectTrigger>
                  <SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.fullName || customer.email || customer.phone || t("workspace.ordersPage.dialog.unnamedCustomer")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{t("workspace.ordersPage.dialog.customer")}</Label>
                <p className="truncate rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                  {lockedCustomerName || t("workspace.ordersPage.dialog.conversationCustomer")}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("workspace.ordersPage.dialog.paymentMethod")}</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{t(paymentMethodLabelKeys[method])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t("workspace.ordersPage.dialog.orderItems")}</Label>
            <div className="flex gap-2">
              <Select value={draftProductId} onValueChange={setDraftProductId} disabled={loading}>
                <SelectTrigger className="flex-1"><SelectValue placeholder={t("workspace.ordersPage.dialog.selectProduct")} /></SelectTrigger>
                <SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addSelectedProduct} disabled={loading || !draftProductId}><Plus className="mr-1 h-4 w-4" />{t("workspace.ordersPage.dialog.addItem")}</Button>
            </div>
            {lines.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("workspace.ordersPage.dialog.noItemsYet")}
              </p>
            ) : lines.map((line, index) => {
              const lineTotal = Number(line.quantity || 0) * Number(line.unitPrice || 0)
              const productName = products.find((product) => product.id === line.productId)?.name ?? line.productId
              return (
                <div key={line.productId} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{productName}</p>
                    <Button type="button" size="icon" variant="ghost" title={t("workspace.ordersPage.dialog.removeItem")} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("workspace.ordersPage.dialog.qty")}</Label>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label={t("workspace.ordersPage.dialog.ariaDecreaseQty", { n: index + 1 })} onClick={() => changeQuantity(index, -1)}><Minus className="h-4 w-4" /></Button>
                        <Input aria-label={t("workspace.ordersPage.dialog.ariaItemQty", { n: index + 1 })} type="number" min="1" className="text-center" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label={t("workspace.ordersPage.dialog.ariaIncreaseQty", { n: index + 1 })} onClick={() => changeQuantity(index, 1)}><Plus className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("workspace.ordersPage.dialog.price")}</Label>
                      {line.priceOverridden ? (
                        <Input aria-label={t("workspace.ordersPage.dialog.ariaItemPrice", { n: index + 1 })} type="number" min="0" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value, priceOverridden: true })} />
                      ) : (
                        <Button type="button" variant="outline" className="w-full justify-between font-normal" aria-label={t("workspace.ordersPage.dialog.ariaItemPrice", { n: index + 1 })} onClick={() => updateLine(index, { priceOverridden: true })}>
                          <span>{Number(line.unitPrice || 0).toLocaleString()}</span>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1 pb-2 text-right">
                      <p className="text-xs text-muted-foreground">{t("workspace.ordersPage.labelTotal")}</p>
                      <p className="text-sm font-semibold">{lineTotal.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Amount label={t("workspace.ordersPage.dialog.shippingFee")} value={shippingFee} onChange={setShippingFee} />
            <Amount label={t("workspace.ordersPage.dialog.discount")} value={discountAmount} onChange={setDiscountAmount} />
          </div>
          <div className="space-y-2"><Label htmlFor="shipping-address">{t("workspace.ordersPage.labelShippingAddress")}</Label><textarea id="shipping-address" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" maxLength={500} value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} placeholder={t("workspace.ordersPage.dialog.fullAddressPlaceholder")} /></div>
          <div className="space-y-2"><Label htmlFor="create-order-notes">{t("workspace.ordersPage.sectionNotes")}</Label><Input id="create-order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("workspace.ordersPage.dialog.optionalInternalNote")} /></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("workspace.ordersPage.dialog.orderTotal")}</p>
              <p className="text-xl font-semibold">{total.toLocaleString()} MMK</p>
              <p className="text-xs text-muted-foreground">{t("workspace.ordersPage.dialog.subtotal")} {subtotal.toLocaleString()}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
              <Button onClick={submit} disabled={loading || saving}>{saving ? t("workspace.ordersPage.dialog.creating") : t("workspace.ordersPage.createOrder")}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Amount({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} /></div>
}
