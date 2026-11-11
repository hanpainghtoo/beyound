"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PanelRightClose, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage } from "@/components/workspace"
import { CreateOrderDialog } from "@/components/orders/create-order-dialog"
import { agentOrdersApi, getApiErrorMessage, getStoredSession, type AgentOrderDto, type DeliveryStatus, type OrderStatus, type PaymentStatus } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  useOrdersList,
  useUpdateOrderDeliveryStatus,
  useUpdateOrderStatus,
} from "@/lib/queries/orders"
import { workspaceDeliveryRoles, workspacePaymentRoles } from "@/lib/roles"
import { useOrdersPaneStore } from "@/lib/stores/orders-pane-store"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { OrdersList } from "./orders-list"
import { OrderDetailPanel } from "./order-detail-panel"

const orderStatuses: OrderStatus[] = ["pending", "confirmed", "rejected", "cancelled"]
const deliveryStatuses: DeliveryStatus[] = ["packed", "out_for_delivery", "delivered", "failed_delivery", "returned"]
const proofValues = ["true", "false"] as const

/** Delivery values reuse the reviewed `workspace.deliveries.state.*` strings. */
function deliveryValueLabels(t: (key: string) => string): Record<string, string> {
  return Object.fromEntries(deliveryStatuses.map((value) => [value, t(`workspace.deliveries.state.${value}`)]))
}

export default function OrdersPage() {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const showDetailPane = useOrdersPaneStore((state) => state.showDetailPane)
  const setShowDetailPane = useOrdersPaneStore((state) => state.setShowDetailPane)
  const role = getStoredSession()?.user.role || "agent"
  const canPay = (workspacePaymentRoles as readonly string[]).includes(role)
  const canDeliver = (workspaceDeliveryRoles as readonly string[]).includes(role)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [status, setStatus] = useState<OrderStatus | "all">("all")
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "all">("all")
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | "all">("all")
  const [proof, setProof] = useState<"true" | "false" | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  // Selection lives in the URL so a refresh, a deep link, and the browser Back
  // button all land on the same order instead of resetting to an empty pane.
  const selectedId = searchParams.get("order")
  const [selected, setSelected] = useState<AgentOrderDto | null>(null)
  const [detail, setDetail] = useState<AgentOrderDto | null>(null)
  const [items, setItems] = useState<import("@/lib/api").AgentOrderItemDto[]>([])
  const [reason, setReason] = useState("")
  const [creating, setCreating] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 250); return () => window.clearTimeout(timer) }, [search])
  const query = useOrdersList({ search: debouncedSearch, status, paymentStatus, deliveryStatus, proofSubmitted: proof, page, limit: pageSize })
  // Every order write goes through the shared mutations so the list, the
  // inbox customer list, and the bulk scan all invalidate together.
  const updateOrderStatus = useUpdateOrderStatus()
  const updateDeliveryStatus = useUpdateOrderDeliveryStatus()
  const orders = useMemo(() => query.data?.data || [], [query.data?.data])
  // A deep link has no row snapshot yet, so fall back to the fetched detail.
  const selectedOrder = detail || (selectedId ? orders.find((order) => order.id === selectedId) || selected : null)

  const selectOrder = (order: AgentOrderDto) => {
    setSelected(order); setDetail(null); setItems([]); setReason("")
    // Picking a row always reveals the pane — the persisted toggle may have
    // been left off, and a selection that doesn't visibly open the detail
    // reads as a dead click.
    setShowDetailPane(true)
    const params = new URLSearchParams(searchParams.toString())
    params.set("order", order.id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Landing on /workspace/orders without a ?order= deep link auto-selects an
  // order so the detail pane is populated on entry. Preference order: an unpaid
  // pending/confirmed order (the payment block with the proof upload renders
  // there), then any pending/confirmed order (status actions render), then the
  // first row as a last resort so the pane is never empty when the list isn't.
  // The ref guard makes this run once per mount: pressing Back to a param-less
  // list URL is respected instead of being overridden by another forced
  // selection.
  const autoSelected = useRef(false)
  useEffect(() => {
    if (autoSelected.current || selectedId || query.isLoading || !orders.length) return
    autoSelected.current = true
    const actionable = (candidate: AgentOrderDto) => ["pending", "confirmed"].includes(candidate.status)
    const order = orders.find((candidate) => actionable(candidate) && candidate.paymentStatus === "unpaid") ?? orders.find(actionable) ?? orders[0]
    setSelected(order)
    setShowDetailPane(true)
    const params = new URLSearchParams(searchParams.toString())
    params.set("order", order.id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [orders, selectedId, query.isLoading, pathname, router, searchParams, setShowDetailPane])

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(null); return }
    // A deep link (?order=) always reveals the detail pane, even when the
    // persisted toggle was left collapsed. Only runs when the id changes, so
    // the manual hide button still works.
    setShowDetailPane(true)
    let active = true
    setDetailLoading(true); setDetailError(null); setReason("")
    void Promise.all([agentOrdersApi.get(selectedId), agentOrdersApi.items(selectedId)]).then(([order, orderItems]) => { if (active) { setDetail(order); setItems(orderItems) } }).catch(() => { if (active) { setDetail(null); setItems([]); setDetailError(t("workspace.ordersPage.detailsFailed")) } }).finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [selectedId, t, setShowDetailPane])
  const transitionOrder = async (next: OrderStatus, reasonOverride?: string): Promise<boolean> => {
    if (!selectedOrder) return false
    const r = (reasonOverride ?? reason).trim()
    if ((next === "cancelled" || next === "rejected") && !r) { toast.error(t("workspace.ordersPage.reasonRequired")); return false }
    try {
      const updated = await updateOrderStatus.mutateAsync({ id: selectedOrder.id, status: next, reason: r || undefined })
      setDetail(updated)
      const updatedItems = await agentOrdersApi.items(selectedOrder.id)
      setItems(updatedItems)
      toast.success(t("workspace.ordersPage.orderUpdated"))
      return true
    } catch (error) { toast.error(getApiErrorMessage(error, t("workspace.ordersPage.updateOrderFailed"))); return false }
  }
  const transitionDelivery = async (next: DeliveryStatus, reasonOverride?: string): Promise<boolean> => {
    if (!selectedOrder || selectedOrder.status !== "confirmed" || !canDeliver) return false
    const r = (reasonOverride ?? reason).trim()
    if ((next === "failed_delivery" || next === "returned") && !r) { toast.error(t("workspace.ordersPage.reasonRequired")); return false }
    try {
      const updated = await updateDeliveryStatus.mutateAsync({ id: selectedOrder.id, status: next, reason: r || undefined })
      setDetail(updated)
      const updatedItems = await agentOrdersApi.items(selectedOrder.id)
      setItems(updatedItems)
      toast.success(t("workspace.ordersPage.deliveryUpdated"))
      return true
    } catch (error) { toast.error(getApiErrorMessage(error, t("workspace.ordersPage.updateDeliveryFailed"))); return false }
  }

  return (
    <>
      <WorkspaceHeader
        navKey="orders"
        title={t("workspace.ordersPage.title")}
        description={t("workspace.ordersPage.description")}
        actions={<Button variant="outline" onClick={() => setCreating(true)}>{t("workspace.ordersPage.createOrder")}</Button>}
      />
      <WorkspacePage>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div className="space-y-1">
            <Label>{t("workspace.ordersPage.search")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                className="h-9 w-full min-w-[14rem] pl-9"
                value={search}
                placeholder={t("workspace.orders.searchPlaceholder")}
                onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              />
            </div>
          </div>
          <Filter label={t("workspace.ordersPage.filterOrder")} value={status} values={orderStatuses} valueLabels={Object.fromEntries(orderStatuses.map((value) => [value, t(`workspace.ordersPage.orderStatus.${value}`)]))} allLabel={t("workspace.ordersPage.all")} onChange={(value) => { setStatus(value as OrderStatus | "all"); setPage(1) }} />
          <Filter label={t("workspace.ordersPage.filterPayment")} value={paymentStatus} values={["unpaid", "partially_paid", "paid"]} valueLabels={{ unpaid: t("workspace.ordersPage.unpaid"), partially_paid: t("workspace.orders.paymentPartiallyPaid"), paid: t("workspace.ordersPage.paid") }} allLabel={t("workspace.ordersPage.all")} onChange={(value) => { setPaymentStatus(value as PaymentStatus | "all"); setPage(1) }} />
          <Filter label={t("workspace.ordersPage.filterDelivery")} value={deliveryStatus} values={deliveryStatuses} valueLabels={deliveryValueLabels(t)} allLabel={t("workspace.ordersPage.all")} onChange={(value) => { setDeliveryStatus(value as DeliveryStatus | "all"); setPage(1) }} />
          <Filter label={t("workspace.ordersPage.filterProof")} value={proof || "all"} values={proofValues} valueLabels={{ true: t("workspace.ordersPage.proofSubmitted"), false: t("workspace.ordersPage.proofNotSubmitted") }} allLabel={t("workspace.ordersPage.all")} onChange={(value) => { setProof(value === "all" ? undefined : value as "true" | "false"); setPage(1) }} />
          {/* Page size mirrors the products list control; shrinking the page
              invalidates the current offset, so snap back to page 1. */}
          <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1) }}>
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="8">{t("workspace.ordersPage.perPage", { count: 8 })}</SelectItem>
              <SelectItem value="15">{t("workspace.ordersPage.perPage", { count: 15 })}</SelectItem>
              <SelectItem value="25">{t("workspace.ordersPage.perPage", { count: 25 })}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Pane visibility drives the grid. With the detail open the list is a
            fixed rail and the detail absorbs the remaining width; with it closed
            the list takes everything. The detail stays mounted when hidden so
            scroll position, reason text and proof selection survive the toggle. */}
        <div className={cn("grid gap-6", showDetailPane && selectedOrder ? "lg:grid-cols-[22rem_minmax(0,1fr)]" : "grid-cols-1")}>
          <div className="min-w-0 space-y-3">
            {query.isLoading ? <p>{t("workspace.ordersPage.loading")}</p> : query.isError ? <p className="text-destructive">{t("workspace.ordersPage.loadFailed")}</p> : orders.length ? <OrdersList orders={orders} selectedId={selectedOrder?.id} onSelect={selectOrder} /> : <p className="text-muted-foreground">{t("workspace.ordersPage.empty")}</p>}
            <div className="flex items-center justify-between">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("workspace.ordersPage.previous")}</Button>
              <span className="text-sm text-muted-foreground">{t("workspace.ordersPage.pageOf", { page, total: query.data?.totalPages || 1 })}</span>
              <Button variant="outline" disabled={!query.data?.hasNext} onClick={() => setPage((value) => value + 1)}>{t("workspace.ordersPage.next")}</Button>
            </div>
          </div>
          {selectedOrder && (
            <div className={cn("min-w-0", showDetailPane ? "block" : "hidden")}>
              <div className="flex items-center justify-end">
                <Button
                  size="icon"
                  variant="outline"
                  aria-pressed={showDetailPane}
                  aria-label={showDetailPane ? t("workspace.ordersPage.hideDetails") : t("workspace.ordersPage.showDetails")}
                  title={showDetailPane ? t("workspace.ordersPage.hideDetails") : t("workspace.ordersPage.showDetails")}
                  onClick={() => setShowDetailPane(!showDetailPane)}
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
              {detailLoading ? <p>{t("workspace.ordersPage.loadingDetails")}</p> : detailError ? <p className="text-destructive">{detailError}</p> : <OrderDetailPanel order={selectedOrder} items={items} canEdit={(["owner", "admin", "supervisor", "agent"] as string[]).includes(role)} onUpdated={async (updatedOrder, updatedItems) => { try { const fresh = await agentOrdersApi.get(updatedOrder.id); setDetail(fresh); } catch { setDetail(updatedOrder) } setItems(updatedItems) }} reason={reason} onReasonChange={setReason} onOrder={transitionOrder} onDelivery={transitionDelivery} onRefreshOrder={async () => { if (!selectedId) return; const fresh = await agentOrdersApi.get(selectedId); setDetail(fresh); const updatedItems = await agentOrdersApi.items(selectedId); setItems(updatedItems); }} canPay={canPay} canDeliver={canDeliver} />}
            </div>
          )}
        </div>
        <CreateOrderDialog open={creating} onOpenChange={setCreating} mode="manual" onCreated={() => setCreating(false)} />
      </WorkspacePage>
    </>
  )
}

function Filter({ label, value, values, valueLabels, allLabel, onChange }: { label: string; value: string; values: readonly string[]; valueLabels?: Record<string, string>; allLabel: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 min-w-[11rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {values.map((item) => <SelectItem key={item} value={item}>{valueLabels?.[item] || item.replaceAll("_", " ")}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
