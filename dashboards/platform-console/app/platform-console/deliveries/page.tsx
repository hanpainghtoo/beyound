"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { BusinessBadge, FoundationNote } from "@/components/business-ops-foundation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getPlatformDeliveries, type PlatformDeliveryDto } from "@/lib/api"

const formatMoney = (value: number | string, currency = "MMK") => `${currency} ${Number(value || 0).toLocaleString()}`
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "Not scheduled"

export default function Page() {
  const [deliveries, setDeliveries] = useState<PlatformDeliveryDto[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError("")
      try {
        const response = await getPlatformDeliveries({
          search,
          status: statusFilter,
          paymentStatus: paymentFilter,
          limit: 100,
        })
        setDeliveries(response.data)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load platform deliveries.")
        setDeliveries([])
      } finally {
        setLoading(false)
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [search, statusFilter, paymentFilter])

  const problemDeliveries = useMemo(
    () => deliveries.filter((delivery) => ["returned", "cancelled"].includes(delivery.status)),
    [deliveries],
  )

  const stats = useMemo(
    () => ({
      total: deliveries.length,
      inTransit: deliveries.filter((delivery) => delivery.status === "out_for_delivery").length,
      codPending: deliveries.filter((delivery) => delivery.paymentStatus === "cod_pending").length,
      problems: problemDeliveries.length,
    }),
    [deliveries, problemDeliveries],
  )

  return (
    <>
      <ConsoleHeader
        eyebrow="Business Operations"
        title="Deliveries"
        description="Platform-level delivery visibility by merchant, delivery status, COD state, and assigned delivery context."
      />
      <ConsolePage>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Deliveries shown" value={loading ? "…" : stats.total} note="Live order-derived delivery rows" tone="blue" />
          <ConsoleStatCard label="Out for delivery" value={loading ? "…" : stats.inTransit} note="Currently on the road" tone="cyan" />
          <ConsoleStatCard label="COD pending" value={loading ? "…" : stats.codPending} note="Collection still open" tone="amber" />
          <ConsoleStatCard label="Problems" value={loading ? "…" : stats.problems} note="Returned or cancelled" tone="rose" />
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-3">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, tracking, customer, or zone" className="border-white/10 bg-slate-950/40 text-white" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Delivery status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All delivery statuses</SelectItem><SelectItem value="packed">Packed</SelectItem><SelectItem value="out_for_delivery">Out for delivery</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="returned">Returned</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="COD/payment state" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All COD/payment states</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="partially_paid">Partially paid</SelectItem><SelectItem value="paid">Paid</SelectItem><SelectItem value="cod_pending">COD pending</SelectItem><SelectItem value="cod_collected">COD collected</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="refunded">Refunded</SelectItem></SelectContent>
          </Select>
        </div>

        <ConsoleSection title="Problem deliveries" description="Returned or cancelled deliveries are highlighted for platform support follow-up.">
          {loading ? (
            <p className="text-sm text-slate-400">Loading problem deliveries…</p>
          ) : error ? (
            <p className="text-sm text-rose-200">{error}</p>
          ) : problemDeliveries.length === 0 ? (
            <FoundationNote title="No problem deliveries" description="No returned or cancelled delivery records match the current filters." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {problemDeliveries.slice(0, 6).map((delivery) => (
                <div key={delivery.id} className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4">
                  <p className="inline-flex items-center gap-2 font-medium text-white">
                    <AlertTriangle className="h-4 w-4 text-rose-200" />
                    {delivery.trackingNumber || delivery.orderNumber}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">{delivery.tenant.companyName} · {delivery.customer?.fullName || "Customer not linked"}</p>
                  <p className="mt-1 text-xs text-slate-400">{delivery.deliveryZone || "No zone"} · {delivery.deliveryAssigneeName || "No assignee"} · {delivery.status.replaceAll("_", " ")}</p>
                </div>
              ))}
            </div>
          )}
        </ConsoleSection>

        <ConsoleSection title="Delivery visibility" description="Read-only platform view derived from live order delivery fields and statuses.">
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table>
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Tracking / order</TableHead>
                  <TableHead className="text-slate-300">Merchant</TableHead>
                  <TableHead className="text-slate-300">Customer</TableHead>
                  <TableHead className="text-slate-300">Assignee</TableHead>
                  <TableHead className="text-slate-300">Delivery status</TableHead>
                  <TableHead className="text-slate-300">COD status</TableHead>
                  <TableHead className="text-slate-300">Due date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-slate-400">Loading platform deliveries…</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-rose-200">{error}</TableCell></TableRow> : deliveries.length === 0 ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-slate-400">No delivery rows match the current platform filters.</TableCell></TableRow> : deliveries.map((delivery) => (
                  <TableRow key={delivery.id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="font-medium text-white">{delivery.trackingNumber || delivery.orderNumber}</TableCell>
                    <TableCell className="text-slate-300">{delivery.tenant.companyName}</TableCell>
                    <TableCell className="text-slate-300">{delivery.customer?.fullName || "Customer not linked"}</TableCell>
                    <TableCell className="text-slate-300">{delivery.deliveryAssigneeName || delivery.deliveryZone || "Not assigned"}</TableCell>
                    <TableCell><BusinessBadge value={delivery.status} /></TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <BusinessBadge value={delivery.paymentStatus} />
                        {delivery.paymentStatus === "cod_pending" ? (
                          <p className="text-xs text-slate-400">{formatMoney(delivery.balanceDue || delivery.codAmount)}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">{formatDate(delivery.deliveryDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>

        <FoundationNote title="Order-derived delivery model" description="The platform console now reads real merchant delivery state from the order lifecycle API surface. Dedicated delayed or failed delivery records still depend on future delivery-specific backend modeling." />
      </ConsolePage>
    </>
  )
}
