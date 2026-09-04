"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, Banknote, Building2, ClipboardList, MessageSquareText, RefreshCw, ShieldAlert, Truck } from "lucide-react"
import { z } from "zod"

import { BusinessBadge } from "@/components/business-ops-foundation"
import { PlatformConsoleStateMessage } from "@/components/platform-console-release-state"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { Button } from "@/components/ui/button"
import {
  getPlatformBillingRecords,
  getPlatformConversations,
  getPlatformDashboardStats,
  getPlatformOrders,
  getPlatformTenants,
  getPlatformUsageWarnings,
} from "@/lib/api"

const DashboardStatsSchema = z.object({
  totalTenants: z.number(),
  activeTenants: z.number(),
  pendingTenants: z.number(),
  suspendedTenants: z.number(),
  totalUsers: z.number(),
  activeUsers: z.number(),
  monthlyMessageVolume: z.number(),
  connectedChannels: z.number(),
  totalRevenue: z.number(),
  monthlyRevenue: z.number(),
})

const TenantSchema = z.object({
  id: z.string(),
  tenantCode: z.string(),
  companyName: z.string(),
  status: z.string(),
  updatedAt: z.string(),
})

const BillingRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  paymentStatus: z.string(),
  amountDue: z.union([z.number(), z.string()]),
  amountPaid: z.union([z.number(), z.string()]),
  currency: z.string(),
  dueDate: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  tenant: z.object({
    id: z.string(),
    tenantCode: z.string(),
    companyName: z.string(),
    status: z.string(),
  }).nullable().optional(),
})

const UsageSummarySchema = z.object({
  tenant: z.object({
    id: z.string(),
    tenantCode: z.string(),
    companyName: z.string(),
    status: z.string(),
  }),
  warnings: z.array(z.object({
    metric: z.string(),
    severity: z.string(),
    percentUsed: z.number(),
  })),
})

const PaginatedTotalSchema = z.object({
  total: z.number(),
})

type OverviewData = {
  stats: z.infer<typeof DashboardStatsSchema>
  tenants: z.infer<typeof TenantSchema>[]
  billing: z.infer<typeof BillingRecordSchema>[]
  usageWarnings: z.infer<typeof UsageSummarySchema>[]
  conversationTotal: number
  orderTotal: number
}

type ActionItem =
  | { kind: "tenant"; id: string; label: string; detail: string; badge: string; href: string }
  | { kind: "billing"; id: string; label: string; detail: string; badge: string; href: string }
  | { kind: "usage"; id: string; label: string; detail: string; badge: string; href: string }

const money = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)

export default function Page() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const [statsResult, tenantsResult, billingResult, usageWarningsResult, conversationsResult, ordersResult] = await Promise.all([
        getPlatformDashboardStats(),
        getPlatformTenants({ limit: 100 }),
        getPlatformBillingRecords(),
        getPlatformUsageWarnings(),
        getPlatformConversations({ limit: 1 }),
        getPlatformOrders({ limit: 1 }),
      ])

      const stats = DashboardStatsSchema.parse(statsResult)
      const tenants = z.array(TenantSchema).parse(tenantsResult.data)
      const billing = z.array(BillingRecordSchema).parse(billingResult)
      const usageWarnings = z.array(UsageSummarySchema).parse(usageWarningsResult)
      const conversationTotal = PaginatedTotalSchema.parse(conversationsResult).total
      const orderTotal = PaginatedTotalSchema.parse(ordersResult).total

      setData({ stats, tenants, billing, usageWarnings, conversationTotal, orderTotal })
    } catch (requestError) {
      setData(null)
      setError(requestError instanceof Error ? requestError.message : "Live platform overview data could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const actionItems = useMemo<ActionItem[]>(() => {
    if (!data) return []

    const tenantItems = data.tenants
      .filter((tenant) => tenant.status !== "active")
      .map((tenant) => ({
        kind: "tenant" as const,
        id: `tenant-${tenant.id}`,
        label: tenant.companyName,
        detail: `Tenant status is ${tenant.status}. Review merchant access and onboarding state.`,
        badge: tenant.status,
        href: `/platform-console/merchants/${tenant.id}`,
      }))

    const billingItems = data.billing
      .filter((record) => ["unpaid", "partially_paid", "overdue"].includes(record.paymentStatus))
      .map((record) => ({
        kind: "billing" as const,
        id: `billing-${record.id}`,
        label: record.tenant?.companyName || record.tenantId,
        detail: `${record.invoiceNumber || "Billing record"} is ${record.paymentStatus}. Due ${record.dueDate ? new Date(record.dueDate).toLocaleDateString() : "date unavailable"}.`,
        badge: record.paymentStatus,
        href: `/platform-console/merchants/${record.tenantId}`,
      }))

    const usageItems = data.usageWarnings
      .filter((summary) => summary.warnings.length > 0)
      .map((summary) => ({
        kind: "usage" as const,
        id: `usage-${summary.tenant.id}`,
        label: summary.tenant.companyName,
        detail: summary.warnings.map((warning) => `${warning.metric} ${warning.percentUsed}% (${warning.severity.replaceAll("_", " ")})`).join(" · "),
        badge: summary.warnings.some((warning) => warning.severity === "limit_reached") ? "limit_reached" : "warning",
        href: `/platform-console/merchants/${summary.tenant.id}`,
      }))

    return [...tenantItems, ...billingItems, ...usageItems].slice(0, 8)
  }, [data])

  const openBillingCount = useMemo(
    () => data?.billing.filter((record) => ["unpaid", "partially_paid", "overdue"].includes(record.paymentStatus)).length ?? 0,
    [data],
  )
  const warningTenantCount = useMemo(
    () => data?.usageWarnings.filter((summary) => summary.warnings.length > 0).length ?? 0,
    [data],
  )

  return (
    <>
      <ConsoleHeader
        eyebrow="Business Operations"
        title="Overview"
        description="Live platform-level merchant, conversation, order, billing, usage, and access signals for production support."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button asChild variant="outline" className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
              <Link href="/platform-console/merchants">
                Review merchants
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />

      <ConsolePage>
        {error ? <PlatformConsoleStateMessage title="Overview unavailable" message={error} destructive /> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Merchants" value={loading ? "..." : data?.stats.totalTenants ?? "Unavailable"} note="Live tenant records" tone="blue" />
          <ConsoleStatCard label="Conversations" value={loading ? "..." : data?.conversationTotal.toLocaleString() ?? "Unavailable"} note="Platform-visible live threads" tone="cyan" />
          <ConsoleStatCard label="Orders" value={loading ? "..." : data?.orderTotal.toLocaleString() ?? "Unavailable"} note="Live order records" tone="emerald" />
          <ConsoleStatCard label="Action needed" value={loading ? "..." : actionItems.length} note="Live billing, status, or usage follow-up" tone="amber" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <ConsoleSection title="Operations summary" description="Only KPIs backed by current platform-admin APIs are surfaced here.">
            {loading ? (
              <p className="text-sm text-slate-400">Loading live overview metrics...</p>
            ) : !data ? (
              <PlatformConsoleStateMessage title="Live overview data missing" message="The platform overview could not be rendered because one or more required API responses failed validation." destructive />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Building2, label: "Active merchants", value: data.stats.activeTenants, note: "Currently active tenant workspaces" },
                  { icon: MessageSquareText, label: "Monthly messages", value: data.stats.monthlyMessageVolume.toLocaleString(), note: "Aggregated tenant analytics for the current month" },
                  { icon: ClipboardList, label: "Pending merchants", value: data.stats.pendingTenants, note: "Awaiting activation or review" },
                  { icon: Truck, label: "Connected channels", value: data.stats.connectedChannels, note: "Active channel connections across tenants" },
                  { icon: Banknote, label: "Open billing follow-up", value: openBillingCount, note: "Unpaid, partially paid, or overdue records" },
                  { icon: ShieldAlert, label: "Usage warnings", value: warningTenantCount, note: "Tenants near or beyond configured limits" },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-slate-400">{item.label}</p>
                          <p className="mt-2 text-3xl font-semibold text-white">{item.value}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-400">{item.note}</p>
                        </div>
                        <span className="rounded-xl bg-sky-500/15 p-2 text-sky-200">
                          <Icon className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ConsoleSection>

          <ConsoleSection title="Action-needed queue" description="Live items that currently need platform follow-up.">
            {loading ? (
              <p className="text-sm text-slate-400">Loading action items...</p>
            ) : error ? (
              <p className="text-sm text-rose-200">Action items are unavailable because the live overview request failed.</p>
            ) : actionItems.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">No current billing, usage, or tenant-status follow-up items were returned.</p>
            ) : (
              <div className="space-y-3">
                {actionItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 transition hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{item.label}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                      </div>
                      <BusinessBadge value={item.badge} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </ConsoleSection>
        </div>

        {data ? (
          <ConsoleSection title="Revenue signal" description="Order revenue totals returned by the platform dashboard statistics endpoint.">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-sm text-slate-400">Total paid order revenue</p>
                <p className="mt-2 text-3xl font-semibold text-white">MMK {money(data.stats.totalRevenue)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-sm text-slate-400">Current-month paid order revenue</p>
                <p className="mt-2 text-3xl font-semibold text-white">MMK {money(data.stats.monthlyRevenue)}</p>
              </div>
            </div>
          </ConsoleSection>
        ) : null}
      </ConsolePage>
    </>
  )
}
