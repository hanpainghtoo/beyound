"use client"

import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/components/providers/i18n-provider"
import { cn } from "@/lib/utils"
import type { AgentOrderDto } from "@/lib/api"
import { useOrderStatusLabels } from "./order-status-labels"

const statusBadgeClass = (value: string): string => {
  const v = value.toLowerCase()
  if (v.includes("deliver")) return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
  if (v.includes("cancel")) return "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30"
  if (v.includes("pending")) return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"
  if (v.includes("paid")) return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
  if (v.includes("unpaid")) return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
}

export function OrdersList({ orders, selectedId, onSelect }: { orders: AgentOrderDto[]; selectedId?: string; onSelect: (order: AgentOrderDto) => void }) {
  const { t } = useI18n()
  const statusLabels = useOrderStatusLabels()

  if (!orders.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-950">
        {t("workspace.ordersPage.noMatch")}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const isSelected = selectedId === order.id
        const orderStatus = statusLabels.orderStatus(order.status)
        const paymentStatus = statusLabels.paymentStatus(order.paymentStatus)
        const deliveryStatus = order.deliveryStatus ? statusLabels.deliveryStatus(order.deliveryStatus) : null
        return (
          <button
            key={order.id}
            type="button"
            onClick={() => onSelect(order)}
            className={cn(
              "w-full rounded-xl border bg-white p-3 text-left transition hover:border-indigo-300 dark:bg-slate-950",
              isSelected
                ? "border-indigo-500 ring-1 ring-indigo-500/30 dark:border-indigo-400"
                : "border-slate-200 dark:border-slate-800",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold text-slate-900 dark:text-slate-50">{order.orderNumber}</span>
              <Badge variant="outline" className={cn("shrink-0 text-[10px]", statusBadgeClass(orderStatus))}>{orderStatus}</Badge>
            </div>
            <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
              {order.customer?.fullName || t("workspace.ordersPage.customerFallback")}
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0 text-[10px]", statusBadgeClass(paymentStatus))}>{paymentStatus}</span>
              {deliveryStatus ? (
                <>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{deliveryStatus}</span>
                </>
              ) : null}
            </p>
          </button>
        )
      })}
    </div>
  )
}