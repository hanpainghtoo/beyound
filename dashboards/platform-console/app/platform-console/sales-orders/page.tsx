 "use client"

import { useEffect, useMemo, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { BusinessBadge, FoundationNote } from "@/components/business-ops-foundation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getPlatformOrders, type PlatformOrderDto } from "@/lib/api"

const formatMoney = (value: number | string, currency = "MMK") => `${currency} ${Number(value || 0).toLocaleString()}`

export default function Page() {
  const [orders, setOrders] = useState<PlatformOrderDto[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [channelFilter, setChannelFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError("")
      try {
        const response = await getPlatformOrders({
          search,
          status: statusFilter,
          paymentStatus: paymentFilter,
          channelType: channelFilter,
          dateFrom,
          dateTo,
          limit: 100,
        })
        setOrders(response.data)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load platform orders.")
        setOrders([])
      } finally {
        setLoading(false)
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [channelFilter, dateFrom, dateTo, paymentFilter, search, statusFilter])

  const channels = useMemo(
    () => Array.from(new Set(orders.map((order) => order.channel?.channelType).filter(Boolean))) as string[],
    [orders],
  )

  const stats = useMemo(() => ({
    total: orders.length,
    inProgress: orders.filter((order) => !["delivered", "cancelled", "returned"].includes(order.status)).length,
    codPending: orders.filter((order) => order.paymentStatus === "cod_pending").length,
    delivered: orders.filter((order) => order.status === "delivered").length,
  }), [orders])

  return (
    <>
      <ConsoleHeader
        eyebrow="Business Operations"
        title="Sales & Orders"
        description="Platform-level order visibility by merchant, order status, payment/COD status, channel, and date."
      />
      <ConsolePage>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Orders shown" value={loading ? "…" : stats.total} note="Live platform order records" tone="blue" />
          <ConsoleStatCard label="In progress" value={loading ? "…" : stats.inProgress} note="Active order flow" tone="cyan" />
          <ConsoleStatCard label="COD pending" value={loading ? "…" : stats.codPending} note="Collection still open" tone="amber" />
          <ConsoleStatCard label="Delivered" value={loading ? "…" : stats.delivered} note="Completed order records" tone="emerald" />
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-2 xl:grid-cols-6">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, order, or customer" className="border-white/10 bg-slate-950/40 text-white" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Order status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All order statuses</SelectItem><SelectItem value="new">New</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem><SelectItem value="packed">Packed</SelectItem><SelectItem value="out_for_delivery">Out for delivery</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="returned">Returned</SelectItem></SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Payment status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All payment statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="partially_paid">Partially paid</SelectItem><SelectItem value="paid">Paid</SelectItem><SelectItem value="cod_pending">COD pending</SelectItem><SelectItem value="cod_collected">COD collected</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="refunded">Refunded</SelectItem></SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {channels.map((channel) => <SelectItem key={channel} value={channel}>{channel.replaceAll("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input aria-label="Created from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="border-white/10 bg-slate-950/40 text-white" />
          <Input aria-label="Created to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="border-white/10 bg-slate-950/40 text-white" />
        </div>

        <ConsoleSection title="Order visibility" description="Read-only foundation for platform admins to find merchant orders.">
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table className="min-w-[1120px]">
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Order ID</TableHead>
                  <TableHead className="text-slate-300">Merchant</TableHead>
                  <TableHead className="text-slate-300">Customer</TableHead>
                  <TableHead className="text-slate-300">Channel</TableHead>
                  <TableHead className="text-slate-300">Amount</TableHead>
                  <TableHead className="text-slate-300">Payment/COD</TableHead>
                  <TableHead className="text-slate-300">Delivery</TableHead>
                  <TableHead className="text-slate-300">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-slate-400">Loading platform orders…</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-rose-200">{error}</TableCell></TableRow> : orders.length === 0 ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-slate-400">No orders match the current platform filters.</TableCell></TableRow> : orders.map((order) => (
                  <TableRow key={order.id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="font-medium text-white">{order.orderNumber}</TableCell>
                    <TableCell className="text-slate-300">{order.tenant.companyName}</TableCell>
                    <TableCell className="text-slate-300">{order.customer?.fullName || "Customer not linked"}</TableCell>
                    <TableCell className="text-slate-300">{order.channel?.displayName || order.channel?.channelName || order.channel?.channelType || "Unknown"}</TableCell>
                    <TableCell className="text-slate-300">{formatMoney(order.totalAmount)}</TableCell>
                    <TableCell><BusinessBadge value={order.paymentStatus} /></TableCell>
                    <TableCell><BusinessBadge value={order.status} /></TableCell>
                    <TableCell className="text-slate-300">{order.deliveryZone || order.trackingNumber || order.deliveryAssigneeName || "Not assigned"}</TableCell>
                    <TableCell className="text-slate-300">{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>

        <FoundationNote title="Read-only platform visibility" description="This page now uses the platform-admin orders API. Merchant-side order editing remains outside the platform console." />
      </ConsolePage>
    </>
  )
}
