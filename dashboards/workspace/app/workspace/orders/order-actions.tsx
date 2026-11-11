"use client"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/providers/i18n-provider"
import type { AgentOrderDto, DeliveryStatus, OrderStatus } from "@/lib/api"
import { useOrderStatusLabels } from "./order-status-labels"

export function OrderActions({ order, reason, onReasonChange, onOrder, onDelivery, canDeliver }: { order: AgentOrderDto; reason: string; onReasonChange: (value: string) => void; onOrder: (status: OrderStatus) => void; onDelivery: (status: DeliveryStatus) => void; canDeliver: boolean }) {
  const { t } = useI18n()
  const statusLabels = useOrderStatusLabels()
  const validDelivery: Record<DeliveryStatus, DeliveryStatus[]> = { packed: ["out_for_delivery"], out_for_delivery: ["delivered", "failed_delivery"], delivered: ["returned"], failed_delivery: ["out_for_delivery", "returned"], returned: [] }
  const ask = (status: string) => { const needsReason = status === "cancelled" || status === "rejected" || status === "unpaid" || status === "failed_delivery" || status === "returned"; const label = statusLabels.orderStatus(status) !== "—" ? statusLabels.orderStatus(status) : statusLabels.paymentStatus(status) !== "—" ? statusLabels.paymentStatus(status) : statusLabels.deliveryStatus(status); const nextReason = needsReason ? window.prompt(t("workspace.ordersPage.askReason", { status: label }), reason) : reason; if (needsReason && !nextReason?.trim()) return; if (nextReason !== null && nextReason !== undefined) onReasonChange(nextReason); if (window.confirm(t("workspace.ordersPage.askConfirm", { status: label }))) { if (status === "cancelled" || status === "rejected") onOrder(status as OrderStatus); else onDelivery(status as DeliveryStatus) } }
  return <div className="space-y-4">{order.status === "confirmed" && canDeliver && <section><p className="mb-2 text-sm font-semibold">{t("workspace.ordersPage.sectionDelivery")}</p><div className="flex flex-wrap gap-2">{(validDelivery[order.deliveryStatus] ?? []).map((status) => <Button key={status} size="sm" variant="outline" onClick={() => ask(status)}>{statusLabels.deliveryStatus(status)}</Button>)}</div></section>}</div>
}
