"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { WorkspaceHeader } from "@/components/workspace-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkspacePage, WorkspaceSplitView, WorkspaceStatCard } from "@/components/workspace"
import { AlertCircle, ArrowLeft, ArrowRight, Banknote, CheckCircle2, Clock, CreditCard, MessageSquareText, Package, RefreshCw, Search as SearchIcon, ShoppingBag, Truck } from "lucide-react"
import { csrCustomersApi, csrOrdersApi, getApiErrorMessage, getStoredSession, tenantChannelsApi, type CsrChannelDto, type CsrCustomerDto, type CsrOrderDto, type CsrOrderItemDto } from "@/lib/api"
import { workspaceDeliveryRoles, workspacePaymentRoles, type WorkspaceRole } from "@/lib/roles"
import { ManualOrderDialog } from "./manual-order-dialog"
import { OrderDetailsDialog } from "./order-details-dialog"

const statusStyles: Record<CsrOrderDto["status"], string> = {
  new: "status-pill status-new",
  confirmed: "status-pill status-confirmed",
  preparing: "status-pill status-packed",
  packed: "status-pill status-packed",
  out_for_delivery: "status-pill status-out-for-delivery",
  delivered: "status-pill status-delivered",
  failed_delivery: "status-pill status-returned",
  cod_collected: "status-pill status-cod-collected",
  cancelled: "status-pill status-cancelled",
  returned: "status-pill status-returned",
}

const paymentStyles: Record<CsrOrderDto["paymentStatus"], string> = {
  pending: "status-pill status-pending",
  partially_paid: "status-pill status-partially-paid",
  paid: "status-pill status-paid",
  failed: "status-pill status-failed",
  refunded: "status-pill status-refunded",
  cod_pending: "status-pill status-cod-pending",
  cod_collected: "status-pill status-cod-collected",
}

const formatCurrency = (amount: number | string, currency: string) => {
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${amount} ${currency}`

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))

const humanize = (value: string) => {
  if (value === "failed_delivery") return "Failed Delivery"
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const orderStageNote = (order: CsrOrderDto) => {
  if (order.paymentStatus === "cod_pending") return "COD waiting review"
  if (order.status === "failed_delivery") return "Delivery failed and needs follow-up"
  if (order.status === "preparing" || order.status === "packed") return "Preparing for dispatch"
  if (order.paymentStatus === "pending") return "Waiting payment confirmation"
  if (order.status === "out_for_delivery") return "Delivery in progress"
  if (order.status === "confirmed") return "Ready for packing"
  return "Active order"
}

const orderNextAction = (order: CsrOrderDto) => {
  if (order.status === "failed_delivery") return "Contact the customer and record whether delivery will retry or return."
  if (["pending", "partially_paid"].includes(order.paymentStatus)) return "Confirm payment or switch the order to COD before fulfilment."
  if (order.paymentStatus === "cod_pending" && order.status === "delivered") return "Confirm COD collection to close the payment loop."
  if (order.status === "new") return "Confirm customer and item details, then start preparation."
  if (["confirmed", "preparing"].includes(order.status)) return "Finish packing and prepare the delivery handoff."
  if (order.status === "packed") return "Assign delivery details and move the order out for delivery."
  if (order.status === "out_for_delivery") return "Monitor delivery and record the final outcome."
  if (["delivered", "cod_collected"].includes(order.status)) return "Follow up with the customer and capture repeat-order context."
  return "Review the latest status and choose the next valid lifecycle step."
}

const isDeliveryStarted = (order: CsrOrderDto) =>
  ["preparing", "packed", "out_for_delivery", "delivered", "failed_delivery", "returned", "cancelled", "cod_collected"].includes(order.status) ||
  Boolean(order.deliveryAssigneeName || order.deliveryAssigneePhone || order.deliveryZone || order.trackingNumber)

const latestDeliveryIssueNote = (order: CsrOrderDto) => {
  const history = [...(order.statusHistory || [])].reverse()
  const issue = history.find((event) => ["failed_delivery", "returned", "cancelled"].includes(String(event.status || "")))
  return issue?.note ? String(issue.note) : null
}


export default function OrdersPage() {
  const sessionRole = ((getStoredSession()?.user.role as WorkspaceRole | undefined) || "csr")
  const canManagePayments = (workspacePaymentRoles as readonly string[]).includes(sessionRole)
  const canManageRestrictedLifecycle = (workspaceDeliveryRoles as readonly string[]).includes(sessionRole)
  const canChangeStatus = canManageRestrictedLifecycle || sessionRole === "csr"
  const canEditOrderDetails = ["owner", "admin", "supervisor", "csr"].includes(sessionRole)
  const isDeliverySpecialist = sessionRole === "delivery"
  const availableStatusOptions: Array<{ value: CsrOrderDto["status"]; label: string; disabled?: boolean }> = [
    { value: "new", label: "New", disabled: !canChangeStatus || isDeliverySpecialist },
    { value: "confirmed", label: "Confirmed", disabled: !canChangeStatus || isDeliverySpecialist },
    { value: "preparing", label: "Preparing", disabled: !canChangeStatus },
    { value: "packed", label: "Packed (Legacy)", disabled: !canChangeStatus },
    { value: "out_for_delivery", label: "Out for delivery", disabled: !canChangeStatus },
    { value: "delivered", label: "Delivered", disabled: !canChangeStatus },
    { value: "failed_delivery", label: "Failed delivery", disabled: !canChangeStatus },
    { value: "cod_collected", label: "COD collected", disabled: !canChangeStatus },
    { value: "cancelled", label: "Cancelled", disabled: !canChangeStatus },
    { value: "returned", label: "Returned", disabled: !canChangeStatus },
  ]
  const [orders, setOrders] = useState<CsrOrderDto[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "details">("list")
  const [selectedOrderItems, setSelectedOrderItems] = useState<CsrOrderItemDto[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"all" | CsrOrderDto["paymentStatus"]>("all")
  const [customerFilter, setCustomerFilter] = useState("all")
  const [channelFilter, setChannelFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [customers, setCustomers] = useState<CsrCustomerDto[]>([])
  const [channels, setChannels] = useState<CsrChannelDto[]>([])
  const [lifecycleDraft, setLifecycleDraft] = useState({
    status: "new" as CsrOrderDto["status"],
    paymentStatus: "pending" as CsrOrderDto["paymentStatus"],
    paidAmount: "0",
    deliveryAssigneeName: "",
    deliveryAssigneePhone: "",
    deliveryZone: "",
    trackingNumber: "",
    note: "",
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingLifecycle, setIsSavingLifecycle] = useState(false)
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<CsrOrderDto | null>(null)
  const selectedOrderSummary = orders.find((order) => order.id === selectedOrderId) || orders[0] || null
  const selectedOrder = (selectedOrderDetail && selectedOrderDetail.id === selectedOrderSummary?.id) ? selectedOrderDetail : selectedOrderSummary
  const selectedOrderNextAction = selectedOrder ? orderNextAction(selectedOrder) : "Select an order to see its next action."

  const filteredOrders = orders

  const stats = useMemo(() => {
    const paidAmount = orders.reduce((sum, order) => sum + Number(order.paidAmount || (order.paymentStatus === "paid" || order.paymentStatus === "cod_collected" ? order.totalAmount : 0)), 0)

    return {
      total: orders.length,
      pending: orders.filter((order) => order.status === "new").length,
      delivered: orders.filter((order) => order.status === "delivered").length,
      paidAmount,
      currency: orders[0]?.currency || "MMK",
    }
  }, [orders])

  const loadOrders = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const orderDtos = await csrOrdersApi.list({
        search: searchQuery.trim() || undefined,
        status: statusFilter as CsrOrderDto["status"] | "all",
        paymentStatus: paymentStatusFilter,
        customerId: customerFilter !== "all" ? customerFilter : undefined,
        channelId: channelFilter !== "all" ? channelFilter : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      setOrders(orderDtos)
      setSelectedOrderId((currentId) =>
        currentId && orderDtos.some((order) => order.id === currentId) ? currentId : orderDtos[0]?.id || null,
      )
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to load orders"))
    } finally {
      setIsLoading(false)
    }
  }, [channelFilter, customerFilter, dateFrom, dateTo, paymentStatusFilter, searchQuery, statusFilter])

  useEffect(() => {
    void Promise.all([csrCustomersApi.list(), tenantChannelsApi.list()])
      .then(([customerRows, channelRows]) => {
        setCustomers(customerRows)
        setChannels(channelRows)
      })
      .catch(() => {
        setCustomers([])
        setChannels([])
      })
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadOrders()
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [loadOrders])

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrderDetail(null)
      return
    }

    let isMounted = true
    void csrOrdersApi.get(selectedOrderId)
      .then((detail) => {
        if (isMounted) {
          setSelectedOrderDetail(detail)
        }
      })
      .catch(() => {
        // Fallback silently to summary if full detail fetch fails
      })

    return () => {
      isMounted = false
    }
  }, [selectedOrderId])

  useEffect(() => {
    if (!selectedOrder) return
    const timeout = window.setTimeout(() => {
      setLifecycleDraft({
        status: selectedOrder.status,
        paymentStatus: selectedOrder.paymentStatus,
        paidAmount: String(selectedOrder.paidAmount || (selectedOrder.paymentStatus === "paid" || selectedOrder.paymentStatus === "cod_collected" ? selectedOrder.totalAmount : 0)),
        deliveryAssigneeName: selectedOrder.deliveryAssigneeName || "",
        deliveryAssigneePhone: selectedOrder.deliveryAssigneePhone || "",
        deliveryZone: selectedOrder.deliveryZone || "",
        trackingNumber: selectedOrder.trackingNumber || "",
        note: "",
      })
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [selectedOrder])

  useEffect(() => {
    if (!selectedOrder) {
      setSelectedOrderItems([])
      return
    }

    const timeout = window.setTimeout(async () => {
      setIsLoadingItems(true)
      try {
        const items = await csrOrdersApi.items(selectedOrder.id)
        setSelectedOrderItems(items)
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error, "Failed to load order items"))
      } finally {
        setIsLoadingItems(false)
      }
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [selectedOrder?.id])

  const saveLifecycle = async () => {
    if (!selectedOrder) return

    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const trimmedNote = lifecycleDraft.note.trim()
      if (["cancelled", "returned", "failed_delivery"].includes(lifecycleDraft.status) && !trimmedNote) {
        throw new Error("A delivery or cancellation reason is required")
      }

      setIsSavingLifecycle(true)
      const paidAmount = Number(lifecycleDraft.paidAmount || 0)
      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        throw new Error("Paid amount must be a valid non-negative number")
      }

      const payload: Parameters<typeof csrOrdersApi.updateLifecycle>[1] = {
        ...(lifecycleDraft.status !== selectedOrder.status ? { status: lifecycleDraft.status } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      }

      if (canManagePayments) {
        Object.assign(payload, {
          ...(lifecycleDraft.paymentStatus !== selectedOrder.paymentStatus
            ? { paymentStatus: lifecycleDraft.paymentStatus }
            : {}),
          ...(paidAmount !== Number(selectedOrder.paidAmount || 0) ? { paidAmount } : {}),
        })
      }

      if (canManageRestrictedLifecycle) {
        Object.assign(payload, {
          ...(lifecycleDraft.deliveryAssigneeName !== (selectedOrder.deliveryAssigneeName || "")
            ? { deliveryAssigneeName: lifecycleDraft.deliveryAssigneeName }
            : {}),
          ...(lifecycleDraft.deliveryAssigneePhone !== (selectedOrder.deliveryAssigneePhone || "")
            ? { deliveryAssigneePhone: lifecycleDraft.deliveryAssigneePhone }
            : {}),
          ...(lifecycleDraft.deliveryZone !== (selectedOrder.deliveryZone || "")
            ? { deliveryZone: lifecycleDraft.deliveryZone }
            : {}),
          ...(lifecycleDraft.trackingNumber !== (selectedOrder.trackingNumber || "")
            ? { trackingNumber: lifecycleDraft.trackingNumber }
            : {}),
        })
      }

      if (!canManageRestrictedLifecycle && payload.status) {
        if (canChangeStatus) {
          await csrOrdersApi.updateStatus(selectedOrder.id, payload.status, payload.note)
        }
        delete payload.status
      }

      if (Object.keys(payload).length > 0) {
        await csrOrdersApi.updateLifecycle(selectedOrder.id, payload)
      }
      const [persistedOrders, persistedSelectedOrder] = await Promise.all([
        csrOrdersApi.list(),
        csrOrdersApi.get(selectedOrder.id),
      ])
      const selectedIsInList = persistedOrders.some((order) => order.id === persistedSelectedOrder.id)
      setOrders([
        ...persistedOrders.map((order) =>
          order.id === persistedSelectedOrder.id ? persistedSelectedOrder : order,
        ),
        ...(selectedIsInList ? [] : [persistedSelectedOrder]),
      ])
      setSelectedOrderId(persistedSelectedOrder.id)
      setSuccessMessage(`Order ${persistedSelectedOrder.orderNumber} was updated successfully.`)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to update order lifecycle"))
    } finally {
      setIsSavingLifecycle(false)
    }
  }

  const createDelivery = async () => {
    if (!selectedOrder) return

    const hasDeliveryContext = [
      lifecycleDraft.deliveryAssigneeName,
      lifecycleDraft.deliveryAssigneePhone,
      lifecycleDraft.deliveryZone,
      lifecycleDraft.trackingNumber,
    ].some((value) => value.trim().length > 0)

    if (!hasDeliveryContext) {
      setErrorMessage("Add at least one delivery assignment, zone, phone, or tracking detail before creating the delivery.")
      return
    }

    setIsSavingLifecycle(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      await csrOrdersApi.updateLifecycle(selectedOrder.id, {
        status: "preparing",
        deliveryAssigneeName: lifecycleDraft.deliveryAssigneeName || undefined,
        deliveryAssigneePhone: lifecycleDraft.deliveryAssigneePhone || undefined,
        deliveryZone: lifecycleDraft.deliveryZone || undefined,
        trackingNumber: lifecycleDraft.trackingNumber || undefined,
        note: lifecycleDraft.note.trim() || "Delivery created from order",
        metadata: {
          deliveryCreatedAt: new Date().toISOString(),
          source: "orders_delivery_tab",
        },
      })
      const [persistedOrders, persistedSelectedOrder] = await Promise.all([
        csrOrdersApi.list(),
        csrOrdersApi.get(selectedOrder.id),
      ])
      setOrders(persistedOrders)
      setSelectedOrderId(persistedSelectedOrder.id)
      setSuccessMessage(`Delivery for ${persistedSelectedOrder.orderNumber} was created and moved to Preparing.`)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to create delivery"))
    } finally {
      setIsSavingLifecycle(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Daily Work"
        title="Orders"
        description="Create, review, and update customer orders."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void loadOrders()} disabled={isLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            {canEditOrderDetails && (
              <ManualOrderDialog onCreated={(order) => {
                setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)])
                setSelectedOrderId(order.id)
                setSuccessMessage(`Order ${order.orderNumber} was created successfully.`)
              }} />
            )}
          </div>
        }
      />
      <WorkspacePage containerClassName="max-w-[1500px]">
        {errorMessage && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            {successMessage}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <WorkspaceStatCard label="Total Orders" value={stats.total} icon={ShoppingBag} tone="indigo" />
          <WorkspaceStatCard label="Pending" value={stats.pending} icon={Clock} tone="amber" />
          <WorkspaceStatCard label="Delivered" value={stats.delivered} icon={Package} tone="emerald" />
          <WorkspaceStatCard label="Paid amount" value={formatCurrency(stats.paidAmount, stats.currency)} icon={Banknote} tone="blue" />
        </div>

        <WorkspaceSplitView className="min-h-0 md:min-h-[620px] xl:h-[calc(100svh-16rem)] xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.4fr)]">
        <div className={`${mobileView === "list" ? "flex" : "hidden"} min-h-0 w-full flex-col overflow-hidden border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950 xl:flex xl:border-b-0 xl:border-r`}>
          <div className="shrink-0 space-y-3 border-b border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-slate-500" />
              <Input
                placeholder="Search orders..."
                className="pl-10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="min-w-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="packed">Packed</SelectItem>
                  <SelectItem value="out_for_delivery">Out for delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed_delivery">Failed delivery</SelectItem>
                  <SelectItem value="cod_collected">COD collected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>

              <Select value={paymentStatusFilter} onValueChange={(value) => setPaymentStatusFilter(value as "all" | CsrOrderDto["paymentStatus"])}>
                <SelectTrigger className="min-w-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  <SelectValue placeholder="Payment status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partially_paid">Partially paid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="cod_pending">COD pending</SelectItem>
                  <SelectItem value="cod_collected">COD collected</SelectItem>
                </SelectContent>
              </Select>

              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="min-w-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.displayName || channel.channelName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="min-w-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.fullName || customer.email || customer.phone || "Customer"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">From</span>
                  <Input className="min-w-0 flex-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">To</span>
                  <Input className="min-w-0 flex-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2 p-4">
              {isLoading ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  Loading orders...
                </div>
              ) : errorMessage ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  Orders are unavailable right now.
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  No orders yet. Create a manual order or start one from a conversation.
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  No orders match your search or status filter.
                </div>
              ) : (
                filteredOrders.map((order) => (
                  <button
                    key={order.id}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      selectedOrder?.id === order.id
                        ? "border-indigo-200 bg-gradient-to-r from-indigo-50 to-cyan-50 shadow-sm ring-1 ring-indigo-100 dark:border-indigo-500/30 dark:from-indigo-950/70 dark:to-cyan-950/40 dark:ring-indigo-400/20"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-900/70"
                    }`}
                    onClick={() => { setSelectedOrderId(order.id); setMobileView("details") }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900 dark:text-slate-100">{order.orderNumber}</p>
                        <p className="mt-1 truncate text-sm text-gray-700 dark:text-slate-300">
                          {order.customer?.fullName || "Customer not linked"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{formatDate(order.createdAt)}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-gray-900 dark:text-slate-100">
                        {formatCurrency(order.totalAmount, order.currency)}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className={statusStyles[order.status]}>{humanize(order.status)}</Badge>
                      <Badge className={paymentStyles[order.paymentStatus]}>{humanize(order.paymentStatus)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{orderStageNote(order)}</p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className={`${mobileView === "details" ? "block" : "hidden"} min-h-0 min-w-0 flex-1 overflow-auto px-3 pb-3 pt-0 xl:block xl:px-5 xl:pb-5 xl:pt-0`}>
          <Button variant="ghost" size="sm" className="mt-3 mb-3 xl:hidden" onClick={() => setMobileView("list")}><ArrowLeft className="mr-2 h-4 w-4" />Orders</Button>
          {selectedOrder ? (
            <Tabs defaultValue="summary" className="space-y-4">
              <div className="sticky top-0 z-10 -mx-3 flex flex-col gap-3 border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-start sm:justify-between xl:-mx-5 xl:px-5 xl:py-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{selectedOrder.orderNumber}</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Created {formatDate(selectedOrder.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {canEditOrderDetails && (
                    <OrderDetailsDialog
                      order={selectedOrder}
                      items={selectedOrderItems}
                      canEdit={canEditOrderDetails}
                      onUpdated={(updatedOrder, updatedItems) => {
                        setOrders((current) => current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)))
                        setSelectedOrderId(updatedOrder.id)
                        setSelectedOrderItems(updatedItems)
                        setSuccessMessage(`Order ${updatedOrder.orderNumber} was updated successfully.`)
                      }}
                    />
                  )}
                  <Badge className={statusStyles[selectedOrder.status]}>{humanize(selectedOrder.status)}</Badge>
                  <Badge className={paymentStyles[selectedOrder.paymentStatus]}>{humanize(selectedOrder.paymentStatus)}</Badge>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 md:grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    <MessageSquareText className="h-4 w-4" /> Source conversation
                  </p>
                  {selectedOrder.conversationId ? (
                    <Link href={`/workspace/inbox?conversation=${selectedOrder.conversationId}`} className="mt-2 inline-flex max-w-full items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                      <span>View conversation</span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </Link>
                  ) : (
                    <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Manual order, no conversation linked</p>
                  )}
                </div>
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    <Banknote className="h-4 w-4" /> COD and payment
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {humanize(selectedOrder.paymentStatus)} · {formatCurrency(selectedOrder.codAmount || selectedOrder.balanceDue || 0, selectedOrder.currency)}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    <Truck className="h-4 w-4" /> Delivery handoff
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {humanize(selectedOrder.status)} · {selectedOrder.deliveryAssigneeName || "Unassigned"}
                  </p>
                </div>
                <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-500/10">
                  <p className="text-xs font-semibold uppercase text-indigo-700 dark:text-indigo-200">Next action</p>
                  <p className="mt-2 text-sm leading-5 text-slate-800 dark:text-slate-100">{selectedOrderNextAction}</p>
                </div>
              </div>

              <TabsList className="dark:bg-slate-900/80">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="payment">Payment</TabsTrigger>
                <TabsTrigger value="delivery">Delivery</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-4">
                <Card className="workspace-card border-indigo-200/70 bg-indigo-50/40 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                  <CardHeader>
                    <CardTitle>Update order workflow</CardTitle>
                    <CardDescription>Fast controls for fulfillment, payment, and delivery details.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="order-status">Status</Label>
                        <Select
                          value={lifecycleDraft.status}
                          onValueChange={(value) =>
                            setLifecycleDraft({ ...lifecycleDraft, status: value as CsrOrderDto["status"] })
                          }
                        >
                          <SelectTrigger id="order-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableStatusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment-status">Payment Status</Label>
                        <Select
                          value={lifecycleDraft.paymentStatus}
                          disabled={!canManagePayments}
                          onValueChange={(value) =>
                            setLifecycleDraft({ ...lifecycleDraft, paymentStatus: value as CsrOrderDto["paymentStatus"] })
                          }
                        >
                          <SelectTrigger id="payment-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="partially_paid">Partially paid</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="cod_pending">COD pending</SelectItem>
                            <SelectItem value="cod_collected">COD collected</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="refunded">Refunded</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="paid-amount">Paid Amount</Label>
                        <Input
                          id="paid-amount"
                          type="number"
                          disabled={!canManagePayments}
                          value={lifecycleDraft.paidAmount}
                          onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, paidAmount: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="delivery-assignee">Delivery Assignee</Label>
                        <Input id="delivery-assignee" disabled={!canManageRestrictedLifecycle} value={lifecycleDraft.deliveryAssigneeName} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, deliveryAssigneeName: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="assignee-phone">Assignee Phone</Label>
                        <Input id="assignee-phone" disabled={!canManageRestrictedLifecycle} value={lifecycleDraft.deliveryAssigneePhone} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, deliveryAssigneePhone: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="delivery-zone">Delivery Zone</Label>
                        <Input id="delivery-zone" disabled={!canManageRestrictedLifecycle} value={lifecycleDraft.deliveryZone} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, deliveryZone: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tracking-number">Tracking</Label>
                        <Input id="tracking-number" disabled={!canManageRestrictedLifecycle} value={lifecycleDraft.trackingNumber} onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, trackingNumber: event.target.value })} />
                      </div>
                    </div>
                    {!canManageRestrictedLifecycle ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {sessionRole === "finance"
                          ? "Finance users can update payment fields here, but delivery and lifecycle changes stay locked."
                          : sessionRole === "delivery"
                            ? "Delivery users can update delivery fields and delivery-stage statuses here, but payment changes stay locked."
                            : "Staff can update order details, but status, delivery, cancellation, and payment changes require a specialist or workspace manager."}
                      </p>
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="transition-note">Transition Note</Label>
                        <Input
                          id="transition-note"
                          value={lifecycleDraft.note}
                          onChange={(event) => setLifecycleDraft({ ...lifecycleDraft, note: event.target.value })}
                          placeholder={
                            ["cancelled", "returned", "failed_delivery"].includes(lifecycleDraft.status)
                              ? "Required delivery failure or cancellation reason"
                              : "Optional note for status history"
                          }
                        />
                        {["cancelled", "returned", "failed_delivery"].includes(lifecycleDraft.status) ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Failed, returned, and cancelled delivery outcomes require a reason so the order history stays auditable.
                          </p>
                        ) : null}
                      </div>
                      <Button onClick={saveLifecycle} disabled={isSavingLifecycle} className="sm:min-w-40">
                        {isSavingLifecycle ? "Saving..." : "Save Lifecycle"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-2">
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle>Summary</CardTitle>
                    <CardDescription>Current order stage and order value</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Detail label="Order stage" value={selectedOrder.status} />
                      <Detail label="Payment status" value={selectedOrder.paymentStatus} />
                      <Detail label="Payment method" value={selectedOrder.paymentMethod ? humanize(selectedOrder.paymentMethod) : "Not selected"} />
                      <Detail label="Currency" value={selectedOrder.currency} />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <MoneyRow label="Subtotal" value={selectedOrder.subtotal} currency={selectedOrder.currency} />
                      <MoneyRow label="Tax" value={selectedOrder.taxAmount} currency={selectedOrder.currency} />
                      <MoneyRow label="Discount" value={selectedOrder.discountAmount} currency={selectedOrder.currency} />
                      <MoneyRow label="Shipping" value={selectedOrder.shippingFee} currency={selectedOrder.currency} />
                      <Separator />
                      <MoneyRow label="Total" value={selectedOrder.totalAmount} currency={selectedOrder.currency} strong />
                      <MoneyRow label="Paid" value={selectedOrder.paidAmount || 0} currency={selectedOrder.currency} />
                      <MoneyRow label="Balance due" value={selectedOrder.balanceDue || 0} currency={selectedOrder.currency} />
                    </div>
                  </CardContent>
                </Card>
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle>Customer</CardTitle>
                    <CardDescription>Commerce-facing customer and order contact context</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <Detail label="Customer" value={selectedOrder.customer?.fullName || "Customer not linked"} />
                    <Detail label="Conversation" value={selectedOrder.conversationId || "Not linked"} />
                    <Detail label="Last order" value={selectedOrder.orderNumber} />
                    <Detail label="Delivery zone" value={selectedOrder.deliveryZone || "Not selected"} />
                    <Detail label="Contact phone" value={selectedOrder.customer?.phone || "Not provided"} />
                  </CardContent>
                </Card>
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle>Items</CardTitle>
                    <CardDescription>Order contents and value summary</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isLoadingItems ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                        Loading order items...
                      </div>
                    ) : selectedOrderItems.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                        No item rows are available for this order.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedOrderItems.map((item) => (
                          <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.productName}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {item.productSku || "No SKU"} · Qty {item.quantity} · {formatCurrency(item.unitPrice, selectedOrder.currency)} each
                                </p>
                                {item.notes ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.notes}</p> : null}
                              </div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(item.totalPrice, selectedOrder.currency)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <MoneyRow label="Subtotal" value={selectedOrder.subtotal} currency={selectedOrder.currency} />
                    <MoneyRow label="Tax" value={selectedOrder.taxAmount} currency={selectedOrder.currency} />
                    <MoneyRow label="Discount" value={selectedOrder.discountAmount} currency={selectedOrder.currency} />
                    <MoneyRow label="Shipping" value={selectedOrder.shippingFee} currency={selectedOrder.currency} />
                  </CardContent>
                </Card>
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle>Payment</CardTitle>
                    <CardDescription>Money collected, due, or still to confirm</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <Detail label="Method" value={selectedOrder.paymentMethod || "Not selected"} />
                    <Detail label="Status" value={selectedOrder.paymentStatus} />
                    <Detail label="Paid amount" value={formatCurrency(selectedOrder.paidAmount || 0, selectedOrder.currency)} />
                    <Detail label="Balance due" value={formatCurrency(selectedOrder.balanceDue || 0, selectedOrder.currency)} />
                    <Detail label="COD amount" value={formatCurrency(selectedOrder.codAmount || 0, selectedOrder.currency)} />
                    <Detail label="Payment notes" value={selectedOrder.paymentNotes || "No payment note added"} />
                  </CardContent>
                </Card>
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle>Delivery</CardTitle>
                    <CardDescription>Who is handling delivery and where it is going</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <Detail label="Delivery stage" value={selectedOrder.status} />
                    <Detail label="Assignee" value={selectedOrder.deliveryAssigneeName || "Not assigned"} />
                    <Detail label="Assignee phone" value={selectedOrder.deliveryAssigneePhone || "Not provided"} />
                    <Detail label="Tracking" value={selectedOrder.trackingNumber || "Not provided"} />
                    <Detail label="Zone" value={selectedOrder.deliveryZone || "Not selected"} />
                    <Detail label="Failure reason" value={latestDeliveryIssueNote(selectedOrder) || "No issue recorded"} />
                  </CardContent>
                </Card>
                <Card className="workspace-card xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                    <CardDescription>Order stage changes and notes captured so far</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(selectedOrder.statusHistory || []).length === 0 ? (
                      <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600 dark:bg-slate-900/80 dark:text-slate-300">
                        No order timeline entries yet.
                      </p>
                    ) : (
                      selectedOrder.statusHistory?.map((event, index) => (
                        <div key={`${selectedOrder.id}-${index}`} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-gray-900 dark:text-slate-100">
                              {humanize(String(event.status || ""))}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                              {event.timestamp ? formatDate(String(event.timestamp)) : "No timestamp"}
                            </span>
                          </div>
                          {event.note ? <p className="mt-1 text-gray-600 dark:text-slate-300">{String(event.note)}</p> : null}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
                <Card className="workspace-card xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Notes</CardTitle>
                    <CardDescription>Internal notes captured when the order was created or updated</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700 dark:bg-slate-900/80 dark:text-slate-300">
                      {selectedOrder.notes || "No notes were added to this order."}
                    </p>
                  </CardContent>
                </Card>
                </div>
              </TabsContent>

              <TabsContent value="payment">
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Payment
                    </CardTitle>
                    <CardDescription>Payment status for this order</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3">
                    <Detail label="Method" value={selectedOrder.paymentMethod || "Not selected"} />
                    <Detail label="Status" value={selectedOrder.paymentStatus} />
                    <Detail label="COD amount" value={formatCurrency(selectedOrder.codAmount || 0, selectedOrder.currency)} />
                    <Detail label="Paid" value={formatCurrency(selectedOrder.paidAmount || 0, selectedOrder.currency)} />
                    <Detail label="Balance due" value={formatCurrency(selectedOrder.balanceDue || 0, selectedOrder.currency)} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="delivery">
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle>Delivery Assignment</CardTitle>
                    <CardDescription>Manual delivery tracking for local fulfillment, including explicit delivery creation and failed-delivery follow-up.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Detail label="Assignee" value={selectedOrder.deliveryAssigneeName || "Not assigned"} />
                      <Detail label="Phone" value={selectedOrder.deliveryAssigneePhone || "Not provided"} />
                      <Detail label="Zone" value={selectedOrder.deliveryZone || "Not selected"} />
                      <Detail label="Tracking" value={selectedOrder.trackingNumber || "Not provided"} />
                      <Detail label="Delivery stage" value={selectedOrder.status} />
                      <Detail label="Failure reason" value={latestDeliveryIssueNote(selectedOrder) || "No issue recorded"} />
                    </div>
                    {!isDeliveryStarted(selectedOrder) && canManageRestrictedLifecycle ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Create delivery from this order</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use the delivery fields from the Summary tab, then start the delivery in the explicit Preparing state.</p>
                        <Button className="mt-3" onClick={createDelivery} disabled={isSavingLifecycle}>
                          {isSavingLifecycle ? "Creating..." : "Create delivery"}
                        </Button>
                      </div>
                    ) : null}
                    {selectedOrder.status === "failed_delivery" ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                        COD was automatically cleared for this failed delivery until the team restarts it or changes the outcome.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history">
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle>Status History</CardTitle>
                    <CardDescription>Order status changes captured in the workspace</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(selectedOrder.statusHistory || []).length === 0 ? (
                      <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600 dark:bg-slate-900/80 dark:text-slate-300">
                        No lifecycle history yet.
                      </p>
                    ) : (
                      selectedOrder.statusHistory?.map((event, index) => (
                        <div key={`${selectedOrder.id}-${index}`} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium capitalize text-gray-900 dark:text-slate-100">
                              {humanize(String(event.status || ""))}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                              {event.timestamp ? formatDate(String(event.timestamp)) : "No timestamp"}
                            </span>
                          </div>
                          {event.note ? <p className="mt-1 text-gray-600 dark:text-slate-300">{String(event.note)}</p> : null}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notes">
                <Card className="workspace-card">
                  <CardHeader>
                    <CardTitle>Order Notes</CardTitle>
                    <CardDescription>Notes captured when the team member created the order</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700 dark:bg-slate-900/80 dark:text-slate-300">
                      {selectedOrder.notes || "No notes were added to this order."}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-gray-500 dark:text-slate-400">
              {isLoading ? "Loading orders..." : errorMessage ? "Order details are unavailable right now." : "No orders yet. Create a manual order to begin."}
            </div>
          )}
        </div>
        </WorkspaceSplitView>
      </WorkspacePage>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-sm font-medium text-gray-700 dark:text-slate-300">{label}</Label>
      <p className="mt-1 text-gray-900 dark:text-slate-100">{humanize(value)}</p>
    </div>
  )
}

function MoneyRow({
  label,
  value,
  currency,
  strong = false,
}: {
  label: string
  value: number | string
  currency: string
  strong?: boolean
}) {
  return (
    <div className={`flex items-center justify-between ${strong ? "text-lg font-semibold" : "text-sm"}`}>
      <span className="text-gray-600 dark:text-slate-300">{label}</span>
      <span className="text-gray-900 dark:text-slate-100">{formatCurrency(value, currency)}</span>
    </div>
  )
}
