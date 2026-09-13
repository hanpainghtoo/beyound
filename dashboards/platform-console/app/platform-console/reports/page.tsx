"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Download, RefreshCw } from "lucide-react"

import { BusinessBadge } from "@/components/business-ops-foundation"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getPlatformConversations,
  getPlatformDeliveries,
  getPlatformOrderPaymentSummary,
  getPlatformOrders,
  getPlatformProducts,
  getPlatformTenants,
  type PaginatedResult,
  type PlatformConversationDto,
  type PlatformDeliveryDto,
  type PlatformOrderDto,
  type PlatformOrderPaymentSummaryDto,
  type PlatformProductDto,
  type PlatformTenantDto,
} from "@/lib/api"

type ReportView = "payments" | "conversations" | "orders" | "deliveries" | "merchants" | "products"

type ReportTable = {
  columns: string[]
  rows: string[][]
}

type ReportKpi = {
  label: string
  value: string | number
  note: string
  tone: "blue" | "cyan" | "emerald" | "amber" | "rose" | "slate"
}

type ReportDataset = {
  title: string
  description: string
  kpis: ReportKpi[]
  table: ReportTable
}

const reportViews: Array<{ value: ReportView; label: string }> = [
  { value: "payments", label: "Payment/COD" },
  { value: "conversations", label: "Conversations" },
  { value: "orders", label: "Sales & Orders" },
  { value: "deliveries", label: "Deliveries" },
  { value: "merchants", label: "Merchants" },
  { value: "products", label: "Products" },
]

const formatMoney = (value: number | string, currency = "MMK") => `${currency} ${Number(value || 0).toLocaleString()}`
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "Not recorded"
const humanize = (value?: string | null) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not recorded"
const inPeriod = (value: string, days: number) => new Date(value).getTime() >= Date.now() - days * 86_400_000
const dateInputForDays = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

async function loadAllPages<T>(fetchPage: (page: number) => Promise<PaginatedResult<T>>) {
  let page = 1
  let rows: T[] = []
  while (true) {
    const result = await fetchPage(page)
    rows = rows.concat(result.data)
    if (!result.hasNext) break
    page += 1
  }
  return rows
}

function exportCsv(fileName: string, table: ReportTable) {
  const rows = [table.columns, ...table.rows]
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function toneForStatus(status: string): ReportKpi["tone"] {
  if (["active", "paid", "delivered", "resolved", "closed", "cod_collected"].includes(status)) return "emerald"
  if (["pending", "open", "out_for_delivery", "partially_paid", "cod_pending"].includes(status)) return "amber"
  if (["suspended", "cancelled", "returned", "failed_delivery", "overdue"].includes(status)) return "rose"
  return "blue"
}

export default function Page() {
  const [view, setView] = useState<ReportView>("payments")
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState("")
  const [channelFilter, setChannelFilter] = useState("all")
  const [conversationStatusFilter, setConversationStatusFilter] = useState("all")
  const [orderStatusFilter, setOrderStatusFilter] = useState("all")
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all")
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("all")
  const [productStatusFilter, setProductStatusFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tenants, setTenants] = useState<PlatformTenantDto[]>([])
  const [orders, setOrders] = useState<PlatformOrderDto[]>([])
  const [conversations, setConversations] = useState<PlatformConversationDto[]>([])
  const [deliveries, setDeliveries] = useState<PlatformDeliveryDto[]>([])
  const [products, setProducts] = useState<PlatformProductDto[]>([])
  const [paymentSummary, setPaymentSummary] = useState<PlatformOrderPaymentSummaryDto | null>(null)

  const dateFrom = dateInputForDays(days)
  const dateTo = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [tenantRows, orderRows, conversationRows, deliveryRows, productRows, paymentRows] = await Promise.all([
        loadAllPages((page) => getPlatformTenants({ search, page, limit: 100 })),
        loadAllPages((page) => getPlatformOrders({
          search,
          status: orderStatusFilter,
          paymentStatus: paymentStatusFilter,
          channelType: channelFilter,
          dateFrom,
          dateTo,
          page,
          limit: 100,
        })),
        loadAllPages((page) => getPlatformConversations({
          search,
          status: conversationStatusFilter,
          channelType: channelFilter,
          dateFrom,
          dateTo,
          page,
          limit: 100,
        })),
        loadAllPages((page) => getPlatformDeliveries({
          search,
          status: deliveryStatusFilter,
          paymentStatus: paymentStatusFilter,
          dateFrom,
          dateTo,
          page,
          limit: 100,
        })),
        loadAllPages((page) => getPlatformProducts({
          search,
          status: productStatusFilter,
          page,
          limit: 100,
        })),
        getPlatformOrderPaymentSummary(),
      ])

      setTenants(tenantRows)
      setOrders(orderRows)
      setConversations(conversationRows)
      setDeliveries(deliveryRows)
      setProducts(productRows)
      setPaymentSummary(paymentRows)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load platform reports.")
      setTenants([])
      setOrders([])
      setConversations([])
      setDeliveries([])
      setProducts([])
      setPaymentSummary(null)
    } finally {
      setLoading(false)
    }
  }, [channelFilter, conversationStatusFilter, dateFrom, dateTo, deliveryStatusFilter, orderStatusFilter, paymentStatusFilter, productStatusFilter, search])

  useEffect(() => {
    void load()
  }, [load])

  const channelOptions = useMemo(
    () => Array.from(new Set([
      ...orders.map((order) => order.channel?.channelType).filter(Boolean),
      ...conversations.map((conversation) => conversation.channel?.channelType).filter(Boolean),
    ])) as string[],
    [conversations, orders],
  )

  const datasets = useMemo<Record<ReportView, ReportDataset>>(() => {
    const conversationResponseTimes = conversations
      .filter((item) => item.lastCustomerMessageAt && item.lastCsrResponseAt)
      .map((item) => Math.max(0, new Date(item.lastCsrResponseAt!).getTime() - new Date(item.lastCustomerMessageAt!).getTime()))
    const averageResponseMinutes = conversationResponseTimes.length
      ? Math.round(conversationResponseTimes.reduce((sum, value) => sum + value, 0) / conversationResponseTimes.length / 60_000)
      : 0

    const grossSales = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
    const orderCurrency = orders[0]?.tenant ? "MMK" : "MMK"
    const deliveryIssues = deliveries.filter((delivery) => ["failed_delivery", "returned", "cancelled"].includes(delivery.status))
    const newMerchants = tenants.filter((tenant) => inPeriod(tenant.createdAt, days))

    return {
      payments: {
        title: "Payment/COD Report",
        description: "Cross-tenant payment, balance, and COD totals from live merchant orders.",
        kpis: paymentSummary ? [
          { label: "Orders", value: paymentSummary.totals.orderCount, note: "Across the current platform dataset", tone: "blue" },
          { label: "Paid amount", value: formatMoney(paymentSummary.totals.paidAmount), note: "Collected from merchant orders", tone: "emerald" },
          { label: "Balance due", value: formatMoney(paymentSummary.totals.balanceDue), note: "Still outstanding", tone: "rose" },
          { label: "COD pending", value: formatMoney(paymentSummary.statuses.cod_pending?.codAmount || 0), note: `${paymentSummary.statuses.cod_pending?.orderCount || 0} orders awaiting collection`, tone: "amber" },
        ] : [],
        table: {
          columns: ["Payment state", "Orders", "Total amount", "Paid", "Balance", "COD"],
          rows: paymentSummary
            ? Object.entries(paymentSummary.statuses).map(([status, stats]) => [
                humanize(status),
                String(stats.orderCount),
                formatMoney(stats.totalAmount),
                formatMoney(stats.paidAmount),
                formatMoney(stats.balanceDue),
                formatMoney(stats.codAmount),
              ])
            : [],
        },
      },
      conversations: {
        title: "Conversation Report",
        description: "Date-, merchant-, status-, and channel-filtered platform conversation visibility with export.",
        kpis: [
          { label: "Conversations", value: conversations.length, note: `Last ${days} days`, tone: "blue" },
          { label: "Open", value: conversations.filter((item) => item.status === "open").length, note: "Need follow-up", tone: "amber" },
          { label: "Resolved/closed", value: conversations.filter((item) => ["resolved", "closed"].includes(item.status)).length, note: "Completed threads", tone: "emerald" },
          { label: "Average CSR response", value: conversationResponseTimes.length ? `${averageResponseMinutes}m` : "N/A", note: "From recorded customer/CSR timestamps", tone: "cyan" },
        ],
        table: {
          columns: ["Created", "Merchant", "Customer", "Channel", "Status", "Messages", "Last activity"],
          rows: conversations.map((conversation) => [
            formatDate(conversation.createdAt),
            conversation.tenant.companyName,
            conversation.customer?.fullName || "Customer not linked",
            conversation.channel?.displayName || conversation.channel?.channelName || humanize(conversation.channel?.channelType),
            humanize(conversation.status),
            String(conversation.messageCount),
            formatDate(conversation.lastMessageAt || conversation.createdAt),
          ]),
        },
      },
      orders: {
        title: "Sales & Orders Report",
        description: "Live order counts, value, status, payment state, and originating channel by merchant.",
        kpis: [
          { label: "Orders", value: orders.length, note: `Last ${days} days`, tone: "blue" },
          { label: "Gross sales", value: formatMoney(grossSales, orderCurrency), note: "Across loaded merchant orders", tone: "emerald" },
          { label: "Delivered", value: orders.filter((order) => order.status === "delivered" || order.status === "cod_collected").length, note: "Completed orders", tone: "cyan" },
          { label: "COD pending", value: orders.filter((order) => order.paymentStatus === "cod_pending").length, note: "Awaiting collection", tone: "amber" },
        ],
        table: {
          columns: ["Created", "Merchant", "Order", "Customer", "Channel", "Amount", "Payment", "Status"],
          rows: orders.map((order) => [
            formatDate(order.createdAt),
            order.tenant.companyName,
            order.orderNumber,
            order.customer?.fullName || "Customer not linked",
            order.channel?.displayName || order.channel?.channelName || humanize(order.channel?.channelType),
            formatMoney(order.totalAmount),
            humanize(order.paymentStatus),
            humanize(order.status),
          ]),
        },
      },
      deliveries: {
        title: "Delivery Report",
        description: "Merchant delivery performance, active routes, failures, and COD-linked delivery state.",
        kpis: [
          { label: "Delivery rows", value: deliveries.length, note: `Last ${days} days`, tone: "blue" },
          { label: "Out for delivery", value: deliveries.filter((delivery) => delivery.status === "out_for_delivery").length, note: "Currently active", tone: "amber" },
          { label: "Delivered", value: deliveries.filter((delivery) => delivery.status === "delivered").length, note: "Completed", tone: "emerald" },
          { label: "Issues", value: deliveryIssues.length, note: "Failed, returned, or cancelled", tone: "rose" },
        ],
        table: {
          columns: ["Created", "Merchant", "Tracking/Order", "Customer", "Assignee", "Zone", "Delivery", "COD/Payment"],
          rows: deliveries.map((delivery) => [
            formatDate(delivery.createdAt),
            delivery.tenant.companyName,
            delivery.trackingNumber || delivery.orderNumber,
            delivery.customer?.fullName || "Customer not linked",
            delivery.deliveryAssigneeName || "Not assigned",
            delivery.deliveryZone || "Not recorded",
            humanize(delivery.status),
            humanize(delivery.paymentStatus),
          ]),
        },
      },
      merchants: {
        title: "Merchant Growth Report",
        description: "Platform merchant growth and account-state visibility from real tenant records.",
        kpis: [
          { label: "Merchants", value: tenants.length, note: "Visible tenant records", tone: "blue" },
          { label: "New in period", value: newMerchants.length, note: `Created in the last ${days} days`, tone: "emerald" },
          { label: "Active", value: tenants.filter((tenant) => tenant.status === "active").length, note: "Operating normally", tone: "cyan" },
          { label: "Suspended/Pending", value: tenants.filter((tenant) => ["suspended", "pending"].includes(tenant.status)).length, note: "Need platform follow-up", tone: "amber" },
        ],
        table: {
          columns: ["Created", "Merchant", "Code", "Status", "Contact", "Email"],
          rows: tenants.map((tenant) => [
            formatDate(tenant.createdAt),
            tenant.companyName,
            tenant.tenantCode,
            humanize(tenant.status),
            tenant.contactPerson || "Not recorded",
            tenant.contactEmail,
          ]),
        },
      },
      products: {
        title: "Product Report",
        description: "Cross-tenant catalog visibility with stock and activity state from live products.",
        kpis: [
          { label: "Products", value: products.length, note: "Visible catalog records", tone: "blue" },
          { label: "Active", value: products.filter((product) => product.status === "active").length, note: "Sellable products", tone: "emerald" },
          { label: "Low stock", value: products.filter((product) => product.isLowStock).length, note: "At or below threshold", tone: "amber" },
          { label: "Out of stock", value: products.filter((product) => product.status === "out_of_stock" || product.stockQuantity === 0).length, note: "Need replenishment", tone: "rose" },
        ],
        table: {
          columns: ["Updated", "Merchant", "Product", "SKU", "Price", "Stock", "Status"],
          rows: products.map((product) => [
            formatDate(product.updatedAt),
            product.tenant.companyName,
            product.name,
            product.sku || "No SKU",
            formatMoney(product.price),
            product.trackInventory ? String(product.stockQuantity) : "Not tracked",
            humanize(product.status),
          ]),
        },
      },
    }
  }, [conversations, deliveries, days, orders, paymentSummary, products, tenants])

  const current = datasets[view]
  const exportName = `platform-${view}-report-${dateTo}.csv`

  return (
    <>
      <ConsoleHeader
        eyebrow="Business Operations"
        title="Reports"
        description="Live platform reports across payments, conversations, orders, deliveries, merchants, and products."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => exportCsv(exportName, current.table)} disabled={current.table.rows.length === 0} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />
      <ConsolePage>
        {error ? <StateMessage title="Reports unavailable" message={error} destructive /> : null}

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-2 xl:grid-cols-5">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, customer, order, message, or product" className="border-white/10 bg-slate-950/40 text-white" />
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {channelOptions.map((channel) => <SelectItem key={channel} value={channel}>{humanize(channel)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Payment state" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partially_paid">Partially paid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="cod_pending">COD pending</SelectItem>
              <SelectItem value="cod_collected">COD collected</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={productStatusFilter} onValueChange={setProductStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Product status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="out_of_stock">Out of stock</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-3 xl:grid-cols-4">
          <Select value={conversationStatusFilter} onValueChange={setConversationStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Conversation status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All conversations</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Order status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All orders</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="preparing">Preparing</SelectItem>
              <SelectItem value="packed">Packed</SelectItem>
              <SelectItem value="out_for_delivery">Out for delivery</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="failed_delivery">Failed delivery</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deliveryStatusFilter} onValueChange={setDeliveryStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Delivery status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All deliveries</SelectItem>
              <SelectItem value="preparing">Preparing</SelectItem>
              <SelectItem value="packed">Packed</SelectItem>
              <SelectItem value="out_for_delivery">Out for delivery</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="failed_delivery">Failed delivery</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-2xl border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-400">
            Date window: {dateFrom} to {dateTo}
          </div>
        </div>

        <Tabs value={view} onValueChange={(value) => setView(value as ReportView)}>
          <TabsList className="h-auto flex-wrap gap-2 border border-white/10 bg-white/5 p-2">
            {reportViews.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {current.kpis.map((kpi) => (
            <ConsoleStatCard key={kpi.label} label={kpi.label} value={loading ? "…" : kpi.value} note={kpi.note} tone={kpi.tone} />
          ))}
        </div>

        <ConsoleSection
          title={current.title}
          description={current.description}
          action={<Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{current.table.rows.length} rows</Badge>}
        >
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table className="min-w-[960px]">
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  {current.table.columns.map((column) => <TableHead key={column} className="text-slate-300">{column}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? (
                  <TableRow><TableCell colSpan={current.table.columns.length || 1} className="py-12 text-center text-slate-400">Loading live platform report data...</TableCell></TableRow>
                ) : error ? (
                  <TableRow><TableCell colSpan={current.table.columns.length || 1} className="py-12 text-center text-rose-200">{error}</TableCell></TableRow>
                ) : current.table.rows.length === 0 ? (
                  <TableRow><TableCell colSpan={current.table.columns.length || 1} className="py-12 text-center text-slate-400">No report rows match the current filters.</TableCell></TableRow>
                ) : current.table.rows.map((row, rowIndex) => (
                  <TableRow key={`${row[0]}-${rowIndex}`} className="border-white/10 hover:bg-white/5">
                    {row.map((cell, cellIndex) => (
                      <TableCell key={`${cell}-${cellIndex}`} className={cellIndex === 0 ? "font-medium text-white" : "text-slate-300"}>
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>

        <ConsoleSection title="Status snapshot" description="Current state mix for the visible report rows.">
          <div className="flex flex-wrap gap-2">
            {view === "payments" && paymentSummary
              ? Object.keys(paymentSummary.statuses).map((status) => (
                  <div key={status} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <BusinessBadge value={status} />
                      <span className="text-sm text-slate-300">{paymentSummary.statuses[status].orderCount} rows</span>
                    </div>
                  </div>
                ))
              : current.table.rows.slice(0, 8).map((row) => {
                  const status = row[row.length - 1] || "Visible"
                  return (
                    <div key={`${status}-${row[0]}-${row[1]}`} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${toneForStatus(String(status).toLowerCase()) === "emerald" ? "bg-emerald-400" : toneForStatus(String(status).toLowerCase()) === "amber" ? "bg-amber-400" : toneForStatus(String(status).toLowerCase()) === "rose" ? "bg-rose-400" : "bg-sky-400"}`} />
                        <span className="text-sm text-slate-300">{status}</span>
                      </div>
                    </div>
                  )
                })}
          </div>
        </ConsoleSection>
      </ConsolePage>
    </>
  )
}

function StateMessage({ title, message, destructive = false }: { title: string; message: string; destructive?: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${destructive ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 opacity-80">{message}</p>
      </div>
    </div>
  )
}
