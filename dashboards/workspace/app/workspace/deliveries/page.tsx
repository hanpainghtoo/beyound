"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowLeft, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MapPin, PackageCheck, RefreshCw, Search as SearchIcon, Truck } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WorkspacePage, WorkspaceSplitView, WorkspaceStatCard } from "@/components/workspace"
import { csrOrdersApi, getApiErrorMessage, getStoredSession, type CsrOrderDto } from "@/lib/api"
import { workspaceDeliveryRoles, type WorkspaceRole } from "@/lib/roles"

type DeliveryStatus = "all" | "preparing" | "packed" | "out_for_delivery" | "delivered" | "failed_delivery" | "returned" | "cancelled"
type SortKey = "createdAt" | "orderNumber" | "deliveryAssigneeName" | "deliveryZone" | "trackingNumber" | "status"

const deliveryStatuses = new Set(["preparing", "packed", "out_for_delivery", "delivered", "cod_collected", "failed_delivery", "returned"])
const statusTone: Record<string, string> = {
  preparing: "status-pill status-packed",
  packed: "status-pill status-packed",
  out_for_delivery: "status-pill status-out-for-delivery",
  delivered: "status-pill status-delivered",
  failed_delivery: "status-pill status-returned",
  returned: "status-pill status-returned",
  cancelled: "status-pill status-cancelled",
  cod_collected: "status-pill status-cod-collected",
}

const deliveryStatusOf = (order: CsrOrderDto): Exclude<DeliveryStatus, "all"> => {
  if (order.status === "cod_collected") return "delivered"
  if (["preparing", "packed", "out_for_delivery", "delivered", "failed_delivery", "returned", "cancelled"].includes(order.status)) {
    return order.status as Exclude<DeliveryStatus, "all">
  }
  return "preparing"
}

const hasDeliveryFields = (order: CsrOrderDto) =>
  Boolean(
    order.deliveryAssigneeName ||
      order.deliveryAssigneePhone ||
      order.deliveryZone ||
      order.trackingNumber,
  )

const isDeliveryOrder = (order: CsrOrderDto) =>
  deliveryStatuses.has(order.status) ||
  hasDeliveryFields(order) ||
  (order.status === "cancelled" &&
    order.statusHistory?.some((event) =>
      ["preparing", "packed", "out_for_delivery", "delivered", "failed_delivery", "returned"].includes(String(event.previousStatus || event.status || "")),
    ))

const latestFailureReason = (order: CsrOrderDto) => {
  const history = [...(order.statusHistory || [])].reverse()
  const issue = history.find((event) => ["failed_delivery", "returned", "cancelled"].includes(String(event.status || "")))
  return issue?.note ? String(issue.note) : null
}

export default function DeliveriesPage() {
  const sessionRole = ((getStoredSession()?.user.role as WorkspaceRole | undefined) || "csr")
  const canManageDeliveries = (workspaceDeliveryRoles as readonly string[]).includes(sessionRole)
  const [orders, setOrders] = useState<CsrOrderDto[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "details">("list")
  const [filter, setFilter] = useState<DeliveryStatus>("all")
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [nextStatus, setNextStatus] = useState<CsrOrderDto["status"]>("packed")
  const [note, setNote] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const load = () => {
    setIsLoading(true)
    setError("")
    setSuccess("")
    csrOrdersApi.list()
      .then((data) => {
        const deliveries = data.filter(isDeliveryOrder)
        setOrders(deliveries)
        setSelectedId((current) =>
          current && deliveries.some((order) => order.id === current) ? current : deliveries[0]?.id || null,
        )
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Unable to load deliveries")))
      .finally(() => setIsLoading(false))
  }

  useEffect(load, [])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return orders.filter((order) => (filter === "all" || deliveryStatusOf(order) === filter) && `${order.orderNumber} ${order.customer?.fullName || ""} ${order.deliveryAssigneeName || ""} ${order.deliveryAssigneePhone || ""} ${order.deliveryZone || ""} ${order.trackingNumber || ""} ${deliveryStatusOf(order)}`.toLowerCase().includes(normalizedQuery))
  }, [orders, filter, query])

  const sorted = useMemo(() => {
    return [...filtered].sort((first, second) => {
      const firstValue = sortKey === "createdAt" ? new Date(first.createdAt).getTime() : String(first[sortKey] || "").toLowerCase()
      const secondValue = sortKey === "createdAt" ? new Date(second.createdAt).getTime() : String(second[sortKey] || "").toLowerCase()
      if (firstValue < secondValue) return sortDirection === "asc" ? -1 : 1
      if (firstValue > secondValue) return sortDirection === "asc" ? 1 : -1
      return 0
    })
  }, [filtered, sortDirection, sortKey])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize)
  const selected = filtered.find((order) => order.id === selectedId) || filtered[0] || null

  useEffect(() => {
    setPage(1)
  }, [filter, query, pageSize])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDirection(key === "createdAt" ? "desc" : "asc")
  }

  useEffect(() => {
    if (!selected) return
    setNextStatus(deliveryStatusOf(selected))
    setNote("")
  }, [selected])

  const save = async () => {
    if (!selected || !canManageDeliveries) return
    setIsSaving(true)
    setError("")
    setSuccess("")
    try {
      await csrOrdersApi.updateLifecycle(selected.id, { status: nextStatus, note })
      const [persistedOrders, persistedSelectedOrder] = await Promise.all([
        csrOrdersApi.list(),
        csrOrdersApi.get(selected.id),
      ])
      const deliveries = persistedOrders.filter(isDeliveryOrder)
      const selectedIsStillDelivery = isDeliveryOrder(persistedSelectedOrder)
      setOrders([
        ...deliveries.map((order) =>
          order.id === persistedSelectedOrder.id ? persistedSelectedOrder : order,
        ),
        ...(selectedIsStillDelivery && !deliveries.some((order) => order.id === persistedSelectedOrder.id)
          ? [persistedSelectedOrder]
          : []),
      ])
      setSelectedId(selectedIsStillDelivery ? persistedSelectedOrder.id : deliveries[0]?.id || null)
      setNote("")
      setSuccess(`Delivery status for ${persistedSelectedOrder.orderNumber} was updated successfully.`)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to update delivery"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Daily Work"
        title="Deliveries"
        description="Track fulfilment using explicit preparing, in-transit, delivered, and failed delivery states recorded on orders."
        actions={<Button variant="outline" size="sm" onClick={load} disabled={isLoading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}
      />
      <WorkspacePage>
        {error ? <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"><AlertCircle className="h-4 w-4" />{error}</div> : null}
        {success ? <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{success}</div> : null}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <WorkspaceStatCard label="Delivery records" value={orders.length} icon={Truck} tone="indigo" />
          <WorkspaceStatCard label="Preparing" value={orders.filter((order) => ["preparing", "packed"].includes(order.status)).length} icon={PackageCheck} tone="violet" />
          <WorkspaceStatCard label="Out for delivery" value={orders.filter((order) => order.status === "out_for_delivery").length} icon={Clock3} tone="blue" />
          <WorkspaceStatCard label="Delivery issues" value={orders.filter((order) => ["failed_delivery", "returned", "cancelled"].includes(order.status)).length} icon={AlertCircle} tone="rose" />
        </div>

        <WorkspaceSplitView className="min-h-0 xl:h-[calc(100svh-13rem)] xl:min-h-[680px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className={`${mobileView === "list" ? "flex" : "hidden"} min-w-0 flex-col overflow-hidden xl:flex`}>
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="relative w-full flex-1 md:min-w-[240px]"><SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input aria-label="Search deliveries" placeholder="Search order, assignee, zone, tracking…" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
              <Select value={filter} onValueChange={(value) => setFilter(value as DeliveryStatus)}><SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All delivery states</SelectItem><SelectItem value="preparing">Preparing</SelectItem><SelectItem value="packed">Packed (Legacy)</SelectItem><SelectItem value="out_for_delivery">Out for delivery</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="failed_delivery">Failed delivery</SelectItem><SelectItem value="returned">Returned</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="8">8 / page</SelectItem><SelectItem value="15">15 / page</SelectItem><SelectItem value="25">25 / page</SelectItem></SelectContent></Select>
            </div>
            <div className="min-h-0 flex-1 overflow-auto max-xl:hidden">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/95"><tr><SortableHead label="Order" active={sortKey === "orderNumber"} onClick={() => toggleSort("orderNumber")} className="px-5" /><th className="px-4 py-3 font-semibold">Customer</th><SortableHead label="Assignee" active={sortKey === "deliveryAssigneeName"} onClick={() => toggleSort("deliveryAssigneeName")} /><SortableHead label="Zone" active={sortKey === "deliveryZone"} onClick={() => toggleSort("deliveryZone")} /><SortableHead label="Tracking" active={sortKey === "trackingNumber"} onClick={() => toggleSort("trackingNumber")} /><SortableHead label="Status" active={sortKey === "status"} onClick={() => toggleSort("status")} /></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading ? <tr><td colSpan={6} className="p-10 text-center text-slate-500">Loading delivery work…</td></tr> : error ? <tr><td colSpan={6} className="p-10 text-center text-slate-500">Deliveries are unavailable right now.</td></tr> : orders.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-slate-500">No deliveries yet. Orders marked for delivery will appear here.</td></tr> : sorted.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-slate-500">No deliveries match your search or status filter.</td></tr> : paginated.map((order) => (
                    <tr key={order.id} onClick={() => setSelectedId(order.id)} className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-900/80 ${selected?.id === order.id ? "bg-indigo-50/80 shadow-[inset_3px_0_0_#4f46e5] dark:bg-indigo-500/10" : ""}`}>
                      <td className="px-5 py-4"><p className="font-semibold text-slate-900 dark:text-slate-50">{order.orderNumber}</p><p className="text-xs text-slate-500 dark:text-slate-400">{new Date(order.createdAt).toLocaleDateString()}</p></td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{order.customer?.fullName || "Customer not linked"}</td>
                      <td className="px-4 py-4"><p className="text-slate-900 dark:text-slate-50">{order.deliveryAssigneeName || "Not assigned"}</p><p className="text-xs text-slate-500 dark:text-slate-400">{order.deliveryAssigneePhone || "No phone"}</p></td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{order.deliveryZone || "—"}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{order.trackingNumber || "—"}</td><td className="px-4 py-4"><DeliveryBadge status={order.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 xl:hidden">
              {paginated.map((order) => (
                <button key={order.id} type="button" onClick={() => { setSelectedId(order.id); setMobileView("details") }} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950 dark:text-slate-50">{order.orderNumber}</p><p className="mt-1 text-sm text-slate-500">{order.customer?.fullName || "Customer not linked"}</p></div><DeliveryBadge status={order.status} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500"><span>Driver: {order.deliveryAssigneeName || "Unassigned"}</span><span>Zone: {order.deliveryZone || "Not recorded"}</span><span className="col-span-2">Created {new Date(order.createdAt).toLocaleString()}</span></div>
                </button>
              ))}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <span>{sorted.length === 0 ? "No delivery records" : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" />Previous</Button>
                <span className="text-xs font-medium">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Next<ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </section>

          <aside className={`${mobileView === "details" ? "block" : "hidden"} border-t border-slate-200/80 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-900/80 xl:block xl:border-l xl:border-t-0 xl:p-5`}>
              <Button variant="ghost" size="sm" className="mb-4 xl:hidden" onClick={() => setMobileView("list")}><ArrowLeft className="mr-2 h-4 w-4" />Deliveries</Button>
              {selected ? (
                <div className="space-y-5">
                  <div>
                    <DeliveryBadge status={selected.status} />
                    <h2 className="mt-3 text-xl font-bold text-slate-950">{selected.orderNumber}</h2>
                    <p className="text-sm text-slate-500">Order-derived delivery record</p>
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><Detail icon={Truck} label="Assignee" value={selected.deliveryAssigneeName || "Not assigned"} /><Detail icon={MapPin} label="Delivery zone" value={selected.deliveryZone || "Not recorded"} /><Detail icon={PackageCheck} label="Tracking" value={selected.trackingNumber || "Not recorded"} /></div>
                  {latestFailureReason(selected) ? <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"><strong>Latest issue:</strong> {latestFailureReason(selected)}</div> : null}
                  <div className="space-y-3">
                    <div className="space-y-2"><Label htmlFor="delivery-status">Update lifecycle status</Label><Select value={nextStatus} disabled={!canManageDeliveries} onValueChange={(value) => setNextStatus(value as CsrOrderDto["status"])}><SelectTrigger id="delivery-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="preparing">Preparing</SelectItem><SelectItem value="packed">Packed (Legacy)</SelectItem><SelectItem value="out_for_delivery">Out for delivery</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="failed_delivery">Failed delivery</SelectItem><SelectItem value="returned">Returned</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label htmlFor="delivery-note">Transition note</Label><Input id="delivery-note" disabled={!canManageDeliveries} value={note} onChange={(event) => setNote(event.target.value)} placeholder={["failed_delivery", "returned", "cancelled"].includes(nextStatus) ? "Required reason for failed, returned, or cancelled delivery" : "Optional history note"} /></div>
                    {!canManageDeliveries ? <p className="text-sm text-slate-500 dark:text-slate-400">Only delivery specialists and workspace managers can change delivery-stage progress here.</p> : null}
                    <Button className="w-full" onClick={save} disabled={isSaving || !canManageDeliveries}>{isSaving ? "Saving…" : "Save delivery status"}</Button>
                  </div>
                </div>
              ) : <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">{isLoading ? "Loading delivery work…" : error ? "Delivery details are unavailable right now." : orders.length === 0 ? "No deliveries yet. Orders marked for delivery will appear here." : "Select a delivery record to view details."}</div>}
            </aside>
        </WorkspaceSplitView>
      </WorkspacePage>
    </>
  )
}

function DeliveryBadge({ status }: { status: CsrOrderDto["status"] }) {
  const deliveryStatus = status === "cod_collected"
    ? "delivered"
    : ["preparing", "packed", "out_for_delivery", "delivered", "failed_delivery", "returned", "cancelled"].includes(status)
      ? status
      : "preparing"
  return <Badge className={statusTone[deliveryStatus] || "status-pill status-muted"}>{deliveryStatus.replaceAll("_", " ")}</Badge>
}
function Detail({ icon: Icon, label, value }: { icon: typeof Truck; label: string; value: string }) { return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 text-indigo-600" /><div><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="text-sm font-medium text-slate-900 dark:text-slate-50">{value}</p></div></div> }
function SortableHead({ label, active, onClick, className = "px-4" }: { label: string; active: boolean; onClick: () => void; className?: string }) {
  return <th className={`${className} py-3`}><button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 font-semibold ${active ? "text-indigo-700 dark:text-indigo-200" : ""}`}>{label}<ArrowUpDown className="h-3.5 w-3.5" /></button></th>
}
