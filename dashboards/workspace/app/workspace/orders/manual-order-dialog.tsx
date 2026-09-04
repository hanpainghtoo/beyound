"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  csrCustomersApi,
  csrOrdersApi,
  csrProductsApi,
  getApiErrorMessage,
  type CsrCustomerDto,
  type CsrOrderDto,
  type CsrProductDto,
} from "@/lib/api"

type Line = { productId: string; quantity: string; unitPrice: string }
const emptyLine = (): Line => ({ productId: "", quantity: "1", unitPrice: "" })

export function ManualOrderDialog({ onCreated }: { onCreated: (order: CsrOrderDto) => void }) {
  const [open, setOpen] = useState(false)
  const [customers, setCustomers] = useState<CsrCustomerDto[]>([])
  const [products, setProducts] = useState<CsrProductDto[]>([])
  const [customerId, setCustomerId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online" | "bank_transfer">("cod")
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [shippingFee, setShippingFee] = useState("0")
  const [discountAmount, setDiscountAmount] = useState("0")
  const [paidAmount, setPaidAmount] = useState("0")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    Promise.all([csrCustomersApi.list(), csrProductsApi.list()])
      .then(([customerRows, productRows]) => {
        setCustomers(customerRows.filter((customer) => customer.status === "active"))
        setProducts(productRows.filter((product) => product.status === "active"))
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Failed to load order options")))
      .finally(() => setLoading(false))
  }, [open])

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0),
    [lines],
  )
  const total = Math.max(subtotal + Number(shippingFee || 0) - Number(discountAmount || 0), 0)

  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)))
  }

  const selectProduct = (index: number, productId: string) => {
    const product = products.find((item) => item.id === productId)
    updateLine(index, { productId, unitPrice: String(product?.price || 0) })
  }

  const reset = () => {
    setCustomerId("")
    setPaymentMethod("cod")
    setLines([emptyLine()])
    setShippingFee("0")
    setDiscountAmount("0")
    setPaidAmount("0")
    setNotes("")
    setError(null)
  }

  const submit = async () => {
    if (isSubmittingRef.current) return
    setError(null)
    if (!customerId) return setError("Select a customer.")
    if (lines.some((line) => !line.productId || Number(line.quantity) < 1 || Number(line.unitPrice) < 0)) {
      return setError("Each item needs a product, quantity of at least 1, and a valid price.")
    }
    if ([shippingFee, discountAmount, paidAmount].some((value) => Number(value) < 0 || !Number.isFinite(Number(value)))) {
      return setError("Payment amounts must be valid non-negative numbers.")
    }
    if (Number(paidAmount) > total) return setError("Paid amount cannot exceed the order total.")

    isSubmittingRef.current = true
    setSaving(true)
    try {
      const order = await csrOrdersApi.create({
        customerId,
        paymentMethod,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
        shippingFee: Number(shippingFee),
        discountAmount: Number(discountAmount),
        paidAmount: Number(paidAmount),
        notes: notes.trim() || undefined,
      })
      onCreated(order)
      setOpen(false)
      reset()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Failed to create order"))
    } finally {
      isSubmittingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />New order</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create manual order</DialogTitle>
          <DialogDescription>Create an order for an existing customer without requiring a conversation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId} disabled={loading}>
                <SelectTrigger><SelectValue placeholder={loading ? "Loading..." : "Select customer"} /></SelectTrigger>
                <SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.fullName || customer.email || customer.phone || "Unnamed customer"}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cod">Cash on delivery</SelectItem><SelectItem value="bank_transfer">Bank transfer</SelectItem><SelectItem value="online">Online payment</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between"><Label>Order items</Label><Button type="button" size="sm" variant="outline" onClick={() => setLines([...lines, emptyLine()])}><Plus className="mr-1 h-4 w-4" />Add item</Button></div>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_90px_130px_36px]">
                <Select value={line.productId} onValueChange={(value) => selectProduct(index, value)} disabled={loading}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input aria-label={`Item ${index + 1} quantity`} type="number" min="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                <Input aria-label={`Item ${index + 1} price`} type="number" min="0" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} />
                <Button type="button" size="icon" variant="ghost" title="Remove item" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Amount label="Shipping fee" value={shippingFee} onChange={setShippingFee} />
            <Amount label="Discount" value={discountAmount} onChange={setDiscountAmount} />
            <Amount label="Paid amount" value={paidAmount} onChange={setPaidAmount} />
          </div>
          <div className="space-y-2"><Label htmlFor="manual-order-notes">Notes</Label><Input id="manual-order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional internal note" /></div>
          <div className="flex items-center justify-between border-t pt-4"><div><p className="text-sm text-muted-foreground">Order total</p><p className="text-xl font-semibold">{total.toLocaleString()} MMK</p></div><Button onClick={submit} disabled={loading || saving}>{saving ? "Creating..." : "Create order"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Amount({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} /></div>
}
