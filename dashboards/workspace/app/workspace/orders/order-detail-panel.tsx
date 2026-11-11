"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { BarcodeValue } from "@/components/barcode"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronRight, MessageSquare, Truck } from "lucide-react"
import { ChannelMark } from "@/components/inbox/channel-icon"
import { tenantChannelsApi } from "@/lib/api"
import { useUpdateOrderDetails } from "@/lib/queries/orders"
import { OrderDetailsDialog } from "./order-details-dialog"
import { ProofViewer } from "./proof-viewer"
import { useI18n } from "@/components/providers/i18n-provider"
import type { AgentOrderDto, AgentOrderItemDto, AgentDeliveryDto, DeliveryStatus, OrderStatus } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useOrderStatusLabels } from "./order-status-labels"
import { StatusConfirmationDialog } from "./status-confirmation-dialog"
import { SubmitPaymentDialog } from "./submit-payment-dialog"
import { MarkUnpaidDialog } from "./mark-unpaid-dialog"
import { EditDeliveryDialog } from "./edit-delivery-dialog"
import { PaymentHistory } from "./payment-history"

const statusTone = (value: string): string => {
  const v = value.toLowerCase()
  if (v.includes("deliver") || v.includes("paid")) return "text-emerald-600 dark:text-emerald-400"
  if (v.includes("cancel") || v.includes("reject")) return "text-red-600 dark:text-red-400"
  if (v.includes("pending") || v.includes("unpaid")) return "text-amber-600 dark:text-amber-400"
  return "text-slate-600 dark:text-slate-300"
}

const ORDER_TRANSITIONS_CLIENT: Record<string, OrderStatus[]> = {
  pending: ["confirmed", "rejected", "cancelled"],
  rejected: ["pending", "cancelled"],
  confirmed: ["cancelled"],
  cancelled: [],
}

const DELIVERY_TRANSITIONS_CLIENT: Record<string, DeliveryStatus[]> = {
  packed: ["out_for_delivery"],
  out_for_delivery: ["delivered", "failed_delivery"],
  delivered: ["returned"],
  failed_delivery: ["out_for_delivery", "returned"],
  returned: [],
}

const actionableOrderStatuses = new Set(["pending", "confirmed"])

function DeliveryNavButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      aria-label="Open delivery"
      title="Open delivery"
      onClick={() => router.push("/workspace/deliveries?delivery=" + orderId)}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400"
    >
      <Truck className="h-3.5 w-3.5" />
    </button>
  )
}

export function OrderDetailPanel({
  order,
  items,
  canEdit,
  onUpdated,
  reason,
  onReasonChange,
  onOrder,
  onDelivery,
  onRefreshOrder,
  canPay,
  canDeliver,
}: {
  order: AgentOrderDto
  items: AgentOrderItemDto[]
  canEdit: boolean
  onUpdated: (order: AgentOrderDto, items: AgentOrderItemDto[]) => void
  reason: string
  onReasonChange: (value: string) => void
  onOrder: (status: OrderStatus, reason?: string) => Promise<boolean>
  onDelivery: (status: DeliveryStatus, reason?: string) => Promise<boolean>
  onRefreshOrder: () => void | Promise<void>
  canPay: boolean
  canDeliver: boolean
}) {
  const { t } = useI18n()
  const router = useRouter()
  const updateOrderDetails = useUpdateOrderDetails()
  const statusLabels = useOrderStatusLabels()
  const history = order.statusHistory ?? []
  const [channelType, setChannelType] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_PAGE_SIZE = 5
  const historyTotalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE))
  const pagedHistory = [...history]
    .reverse()
    .slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE)
  const [savingNote, setSavingNote] = useState(false)
  const reasonRef = useRef<HTMLTextAreaElement | null>(null)

  const [pendingOrderStatus, setPendingOrderStatus] = useState<OrderStatus | null>(null)
  const [orderReason, setOrderReason] = useState("")
  const [orderStatusSaving, setOrderStatusSaving] = useState(false)
  const [orderStatusError, setOrderStatusError] = useState<string | null>(null)

  const [pendingDeliveryStatus, setPendingDeliveryStatus] = useState<DeliveryStatus | null>(null)
  const [deliveryReason, setDeliveryReason] = useState("")
  const [deliveryStatusSaving, setDeliveryStatusSaving] = useState(false)
  const [deliveryStatusError, setDeliveryStatusError] = useState<string | null>(null)

  const [submitPaymentOpen, setSubmitPaymentOpen] = useState(false)
  const [markUnpaidOpen, setMarkUnpaidOpen] = useState(false)
  const [editDeliveryOpen, setEditDeliveryOpen] = useState(false)

  useEffect(() => {
    const el = reasonRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 48) + "px"
  }, [reason])

  useEffect(() => { setHistoryPage(1) }, [order.id])
  useEffect(() => {
    const channelId = order.customer?.channelId
    if (!channelId) { setChannelType(null); return }
    let cancelled = false
    void tenantChannelsApi.list().then((channels) => {
      if (cancelled) return
      const match = channels.find((c) => c.id === channelId)
      setChannelType(match?.channelType ?? null)
    }).catch(() => { if (!cancelled) setChannelType(null) })
    return () => { cancelled = true }
  }, [order.customer?.channelId])

  const handleSaveNote = async () => {
    if (!reason.trim()) return
    setSavingNote(true)
    try {
      const updated = await updateOrderDetails.mutateAsync({
        id: order.id,
        data: {
          items: items.map((item) => ({
            productId: item.productId || item.product?.id || "",
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice) || 0,
            notes: item.notes ?? undefined,
          })),
          notes: reason.trim(),
        },
      })
      onUpdated(updated, items)
    } catch {
      // ignore
    } finally {
      setSavingNote(false)
    }
  }

  const orderStatus = statusLabels.orderStatus(order.status)
  const paymentStatus = statusLabels.paymentStatus(order.paymentStatus)
  const deliveryStatus = statusLabels.deliveryStatus(order.deliveryStatus)
  const paidAmount = Number(order.paidAmount ?? 0)
  const totalAmount = Number(order.totalAmount ?? 0)
  const discount = Number(order.discountAmount ?? 0)
  const tax = Number(order.taxAmount ?? 0)
  const explicitRemaining = Number(order.remainingAmount)
  const remaining = Number.isFinite(explicitRemaining)
    ? Math.max(explicitRemaining, 0)
    : Math.max(Math.round((totalAmount - paidAmount) * 100) / 100, 0)
  const canChangePayment = actionableOrderStatuses.has(order.status)
  const legacyProofs = (order.attachments ?? []).some((item) => item.role === "payment_proof")

  const confirmOrderStatus = async () => {
    if (!pendingOrderStatus) return
    setOrderStatusSaving(true)
    setOrderStatusError(null)
    const ok = await onOrder(pendingOrderStatus, orderReason.trim() || undefined)
    setOrderStatusSaving(false)
    if (ok) {
      setPendingOrderStatus(null)
      setOrderReason("")
    } else {
      setOrderStatusError(t("workspace.ordersPage.updateOrderFailed"))
    }
  }

  const confirmDeliveryStatus = async () => {
    if (!pendingDeliveryStatus) return
    setDeliveryStatusSaving(true)
    setDeliveryStatusError(null)
    const ok = await onDelivery(pendingDeliveryStatus, deliveryReason.trim() || undefined)
    setDeliveryStatusSaving(false)
    if (ok) {
      setPendingDeliveryStatus(null)
      setDeliveryReason("")
    } else {
      setDeliveryStatusError(t("workspace.ordersPage.updateDeliveryFailed"))
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{order.orderNumber}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { if (order.customer?.id) router.push(`/workspace/customers?customer=${order.customer.id}`) }} className="truncate text-left text-2xl font-semibold text-slate-900 hover:text-indigo-600 dark:text-slate-50 dark:hover:text-indigo-300">
              {order.customer?.fullName || t("workspace.ordersPage.customerFallback")}
            </button>
            {channelType ? (
              <button type="button" aria-label="Open chat" onClick={() => {
                if (order.conversationId) router.push(`/workspace/inbox?conversation=${order.conversationId}`)
                else if (order.customer?.id) router.push(`/workspace/inbox?customer=${order.customer.id}`)
              }} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 transition hover:border-indigo-300 dark:border-slate-700">
                <ChannelMark channelType={channelType} className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" aria-label="Open chat" onClick={() => {
                if (order.conversationId) router.push(`/workspace/inbox?conversation=${order.conversationId}`)
                else if (order.customer?.id) router.push(`/workspace/inbox?customer=${order.customer.id}`)
              }} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400">
                <MessageSquare className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{order.customer?.phone || t("workspace.ordersPage.noCustomerPhone")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <OrderDetailsDialog order={order} items={items} canEdit={canEdit} onUpdated={onUpdated} />
        </div>
      </div>

      {/* Status overview with quick selects */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("workspace.ordersPage.filterOrder")}</span>
            <span className={cn("text-sm font-semibold", statusTone(orderStatus))}>{orderStatus}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("workspace.ordersPage.filterPayment")}</span>
            <span className={cn("text-sm font-semibold", statusTone(paymentStatus))}>{paymentStatus}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("workspace.ordersPage.filterDelivery")}</span>
            <div className="flex items-center gap-1">
              <span className={cn("text-sm font-semibold", statusTone(deliveryStatus))}>{deliveryStatus}</span>
              <DeliveryNavButton orderId={order.id} />
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          {/* Items */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("workspace.ordersPage.sectionItems")}</h3>
              <span className="text-xs text-slate-400">{items.length}</span>
            </div>
            {items.length ? (
              <ul className="space-y-3">
                {items.map((item) => {
                  const barcode = item.product?.barcode ?? null
                  return (
                    <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-900 dark:text-slate-50">{item.productName}</span>
                        {item.productSku ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">{item.productSku}</span>
                        ) : null}
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          {Number(item.unitPrice).toLocaleString()} × {item.quantity} = {Number(item.totalPrice).toLocaleString()} {order.currency}
                        </span>
                        {barcode ? <BarcodeValue value={barcode} className="mt-1.5 items-start" /> : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">×{item.quantity}</span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("workspace.ordersPage.noItems")}</p>
            )}
            {canEdit ? (
              <div className="mt-3">
                <Select value={order.status} onValueChange={(v) => {
                  const next = v as OrderStatus
                  if (next === order.status) return
                  setOrderReason("")
                  setOrderStatusError(null)
                  setPendingOrderStatus(next)
                }}>
                  <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["pending", "confirmed", "rejected", "cancelled"] as OrderStatus[]).map((s) => {
                      const valid = s === order.status || (ORDER_TRANSITIONS_CLIENT[order.status] || []).includes(s)
                      return (
                        <SelectItem key={s} value={s} disabled={!valid}>
                          {statusLabels.orderStatus(s)}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {/* Delivery */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("workspace.ordersPage.sectionDelivery")}</h3>
              <DeliveryNavButton orderId={order.id} />
            </div>
            <dl className="space-y-1.5 text-sm">
              <Row label={t("workspace.ordersPage.labelAssignee")} value={order.deliveryAssigneeName} />
              <Row label={t("workspace.ordersPage.labelPhone")} value={order.deliveryAssigneePhone} />
              <Row label={t("workspace.ordersPage.labelDate")} value={order.deliveryDate} />
              <Row label={t("workspace.ordersPage.labelShippingAddress")} value={order.shippingAddress} />
            </dl>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setEditDeliveryOpen(true)} disabled={!canEdit}>
              {t("workspace.ordersPage.editDeliveryInfo")}
            </Button>
            {canDeliver && order.status === "confirmed" ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t("workspace.ordersPage.deliveryStatus")}
                </p>
                <Select value={order.deliveryStatus} onValueChange={(value) => {
                  const next = value as DeliveryStatus
                  if (next === order.deliveryStatus) return
                  setDeliveryReason("")
                  setDeliveryStatusError(null)
                  setPendingDeliveryStatus(next)
                }}>
                  <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {([order.deliveryStatus, ...(DELIVERY_TRANSITIONS_CLIENT[order.deliveryStatus] || [])] as DeliveryStatus[]).map((status) => (
                      <SelectItem key={status} value={status} disabled={status === order.deliveryStatus}>
                        {statusLabels.deliveryStatus(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("workspace.ordersPage.sectionPayment")}</h3>
            <dl className="space-y-1.5 text-sm">
              {order.paymentMethod ? <Row label={t("workspace.ordersPage.labelMethod")} value={order.paymentMethod} /> : null}
              <Row label={t("workspace.ordersPage.filterPayment")} value={paymentStatus} />
              {discount > 0 ? <Row label="Discount" value={String(discount)} /> : null}
              {tax > 0 ? <Row label="Tax" value={String(tax)} /> : null}
              <Row label={`${t("workspace.ordersPage.labelTotal")} (${order.currency})`} value={String(totalAmount)} />
              <Row label={t("workspace.ordersPage.labelPaid")} value={String(paidAmount)} />
              <Row label={t("workspace.ordersPage.remainingBalance")} value={String(remaining)} />
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              {canPay && canChangePayment && remaining > 0 ? (
                <Button size="sm" onClick={() => setSubmitPaymentOpen(true)}>
                  {t("workspace.ordersPage.submitPayment")}
                </Button>
              ) : null}
              {canPay && canChangePayment && paidAmount > 0 ? (
                <Button size="sm" variant="outline" onClick={() => setMarkUnpaidOpen(true)}>
                  {t("workspace.ordersPage.markUnpaid")}
                </Button>
              ) : null}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <PaymentHistory order={order} />
            </div>

            {legacyProofs ? (
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("workspace.ordersPage.legacyProofs")}
                </p>
                <ProofViewer order={order} />
              </div>
            ) : null}
          </div>

          {/* Reason or note — a normal card in the right column, not a full-width strip */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("workspace.ordersPage.labelReasonOrNote")}</h3>
            <textarea ref={reasonRef} maxLength={500} value={reason} onChange={(event) => onReasonChange(event.target.value)} rows={1} className="w-full resize-none rounded-md border border-slate-200 bg-background px-3 py-2 text-sm leading-5 overflow-hidden dark:border-slate-800" style={{ minHeight: "2.25rem", maxHeight: "4.5rem" }} />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => void handleSaveNote()} disabled={savingNote || !reason.trim()}>
                {savingNote ? t("workspace.ordersPage.saving") : t("workspace.ordersPage.saveNote")}
              </Button>
            </div>
            {order.notes ? (
              <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                <p className="whitespace-pre-wrap">{order.notes}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Activity log table */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="rounded-xl border border-slate-200 dark:border-slate-800">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
          <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", historyOpen && "rotate-90")} aria-hidden="true" />
          {t("workspace.ordersPage.sectionStatusHistory")}
          {history.length ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Last updated by {history[history.length - 1]?.actorName || (history[history.length - 1]?.actorType === "customer" ? (history[history.length - 1]?.customerName || "Customer") : history[history.length - 1]?.actorType || "system")} · {statusLabels.orderStatus(String(history[history.length - 1]?.status || ""))}
            </span>
          ) : null}
          <span className="ml-auto text-xs font-normal text-muted-foreground">{history.length}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Previous stage</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Updated stage</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Updated by</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Date and time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pagedHistory.length ? pagedHistory.map((entry, index) => (
                  <tr key={`${String(entry.timestamp)}-${index}`}>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{String(entry.type || entry.field || "order").replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-3 py-2">
                      {entry.previousStatus ? <span className={cn("font-medium", statusTone(String(entry.previousStatus)))}>{statusLabels.orderStatus(String(entry.previousStatus))}</span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("font-medium", statusTone(String(entry.status || "")))}>{statusLabels.orderStatus(String(entry.status || ""))}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {entry.actorAvatarUrl ? <img src={entry.actorAvatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" /> : null}
                        <span>{entry.actorName || (entry.actorType === "customer" ? (entry.customerName || "Customer") : entry.actorType || "system")}</span>
                      </div>
                      {entry.messageText ? <p className="mt-0.5 text-slate-500 dark:text-slate-400">{entry.messageText}</p> : null}
                      {entry.products && entry.products.length ? (
                        <ul className="mt-0.5 text-slate-400">
                          {entry.products.map((p, i) => (
                            <li key={i}>{p.name || "Product"}{p.sku ? ` (${p.sku})` : ""}{p.quantity ? ` ×${p.quantity}` : ""}</li>
                          ))}
                        </ul>
                      ) : null}
                      {entry.reason ? <p className="mt-0.5 text-slate-400">{entry.reason}</p> : null}
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      {entry.timestamp ? new Date(String(entry.timestamp)).toLocaleString() : "—"}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">{t("workspace.ordersPage.noStatusHistory")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {history.length > HISTORY_PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
              <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>Previous</Button>
              <span className="text-muted-foreground">Page {historyPage} of {historyTotalPages}</span>
              <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}>Next</Button>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>

      <StatusConfirmationDialog
        open={pendingOrderStatus !== null}
        onOpenChange={(open) => { if (!open) { setPendingOrderStatus(null); setOrderReason(""); setOrderStatusError(null) } }}
        title={t("workspace.ordersPage.confirmOrderStatusTitle")}
        description={t("workspace.ordersPage.confirmOrderStatusDescription")}
        currentLabel={orderStatus}
        proposedLabel={pendingOrderStatus ? statusLabels.orderStatus(pendingOrderStatus) : ""}
        currentHint={t("workspace.ordersPage.currentStatus")}
        proposedHint={t("workspace.ordersPage.newStatus")}
        reason={orderReason}
        onReasonChange={setOrderReason}
        reasonRequired={pendingOrderStatus === "cancelled" || pendingOrderStatus === "rejected"}
        reasonLabel={t("workspace.ordersPage.askReason", { status: pendingOrderStatus ? statusLabels.orderStatus(pendingOrderStatus) : "" })}
        reasonPlaceholder={t("workspace.ordersPage.reasonPlaceholder")}
        confirmLabel={t("workspace.ordersPage.confirmChange")}
        cancelLabel={t("common.cancel")}
        pendingLabel={t("workspace.ordersPage.saving")}
        loading={orderStatusSaving}
        error={orderStatusError}
        onConfirm={confirmOrderStatus}
      />

      <StatusConfirmationDialog
        open={pendingDeliveryStatus !== null}
        onOpenChange={(open) => { if (!open) { setPendingDeliveryStatus(null); setDeliveryReason(""); setDeliveryStatusError(null) } }}
        title={t("workspace.ordersPage.confirmDeliveryStatusTitle")}
        description={t("workspace.ordersPage.confirmDeliveryStatusDescription")}
        currentLabel={deliveryStatus}
        proposedLabel={pendingDeliveryStatus ? statusLabels.deliveryStatus(pendingDeliveryStatus) : ""}
        currentHint={t("workspace.ordersPage.currentStatus")}
        proposedHint={t("workspace.ordersPage.newStatus")}
        reason={deliveryReason}
        onReasonChange={setDeliveryReason}
        reasonRequired={pendingDeliveryStatus === "failed_delivery" || pendingDeliveryStatus === "returned"}
        reasonLabel={t("workspace.ordersPage.askReason", { status: pendingDeliveryStatus ? statusLabels.deliveryStatus(pendingDeliveryStatus) : "" })}
        reasonPlaceholder={t("workspace.ordersPage.reasonPlaceholder")}
        confirmLabel={t("workspace.ordersPage.confirmChange")}
        cancelLabel={t("common.cancel")}
        pendingLabel={t("workspace.ordersPage.saving")}
        loading={deliveryStatusSaving}
        error={deliveryStatusError}
        onConfirm={confirmDeliveryStatus}
      />

      <SubmitPaymentDialog
        order={order}
        open={submitPaymentOpen}
        onOpenChange={setSubmitPaymentOpen}
        onSubmitted={(updated) => onUpdated(updated, items)}
      />

      <MarkUnpaidDialog
        order={order}
        open={markUnpaidOpen}
        onOpenChange={setMarkUnpaidOpen}
        onSubmitted={(updated) => onUpdated(updated, items)}
      />

      {editDeliveryOpen ? (
        <EditDeliveryDialog
          order={order}
          open={editDeliveryOpen}
          onOpenChange={setEditDeliveryOpen}
          onSaved={async (delivery: AgentDeliveryDto) => {
            onUpdated({
              ...order,
              deliveryAssigneeName: delivery.deliveryAssigneeName,
              deliveryAssigneePhone: delivery.deliveryAssigneePhone,
              deliveryDate: delivery.deliveryDate,
              deliveryStatus: delivery.status,
            }, items)
            await onRefreshOrder()
          }}
        />
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label?: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right">{value || "—"}</dd>
    </div>
  )
}
