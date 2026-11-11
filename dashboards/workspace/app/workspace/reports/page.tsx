"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMemo } from "react"
import { useTheme } from "next-themes"
import {
  ArrowRight,
  DollarSign,
  Package,
  Radio,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts"

import { WorkspaceCard, WorkspacePage } from "@/components/workspace"
import { useFormatters } from "@/lib/formatters"
import { useI18n } from "@/components/providers/i18n-provider"
import { WorkspaceHeader } from "@/components/workspace-header"
import { ReportClient, StatCard, DataTable } from "./_components/report-client"
import {
  reportsApi,
  type ReportPeriod,
  type RevenueReport,
  type TeamPerformanceReport,
  type CustomerReport,
  type ProductReport,
  type ChannelReport,
  type ReportDateRange,
} from "@/lib/api"

type ReportLink = {
  key: string
  title: string
  description: string
  icon: LucideIcon
  iconClass: string
  iconBackground: string
}

function getReportTabs(t: (key: string) => string): ReportLink[] {
  return [
  {
    key: "revenue",
    title: t("workspace.reports.revenueTabTitle"),
    description: t("workspace.reports.revenueTabDescription"),
    icon: DollarSign,
    iconClass: "text-emerald-600 dark:text-emerald-300",
    iconBackground: "bg-emerald-50 dark:bg-emerald-500/15",
  },
  {
    key: "team-performance",
    title: t("workspace.reports.teamTabTitle"),
    description: t("workspace.reports.teamTabDescription"),
    icon: UsersRound,
    iconClass: "text-blue-600 dark:text-blue-300",
    iconBackground: "bg-blue-50 dark:bg-blue-500/15",
  },
  {
    key: "customers",
    title: t("workspace.reports.customersTabTitle"),
    description: t("workspace.reports.customersTabDescription"),
    icon: UsersRound,
    iconClass: "text-sky-600 dark:text-sky-300",
    iconBackground: "bg-sky-50 dark:bg-sky-500/15",
  },
  {
    key: "products",
    title: t("workspace.reports.productsTabTitle"),
    description: t("workspace.reports.productsTabDescription"),
    icon: Package,
    iconClass: "text-amber-600 dark:text-amber-300",
    iconBackground: "bg-amber-50 dark:bg-amber-500/15",
  },
  {
    key: "channels",
    title: t("workspace.reports.channelsTabTitle"),
    description: t("workspace.reports.channelsTabDescription"),
    icon: Radio,
    iconClass: "text-cyan-600 dark:text-cyan-300",
    iconBackground: "bg-cyan-50 dark:bg-cyan-500/15",
  },
  ]
}

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]
const PIE_COLORS_COLD = ["#06b6d4", "#f59e0b", "#ef4444"]

function useChartColors() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  return {
    grid: isDark ? "hsl(240 3.7% 15.9%)" : "hsl(220 13% 91%)",
    tick: isDark ? "hsl(240 5% 64.9%)" : "hsl(220 8.9% 46.1%)",
    tooltipBg: isDark ? "hsl(240 10% 12%)" : "hsl(0 0% 100%)",
    tooltipBorder: isDark ? "hsl(240 3.7% 25%)" : "hsl(220 13% 91%)",
    tooltipText: isDark ? "hsl(240 5% 90%)" : "hsl(224 71% 4%)",
    legendText: isDark ? "hsl(240 5% 75%)" : "hsl(220 8.9% 46.1%)",
  }
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-xl border p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">{title}</h3>
      {children}
    </div>
  )
}

function CustomTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string; formatter?: (value: number, name: string) => string | number }) {
  const c = useChartColors()
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm shadow-lg"
      style={{ backgroundColor: c.tooltipBg, borderColor: c.tooltipBorder, color: c.tooltipText }}
    >
      {label && <p className="font-medium mb-1" style={{ color: c.tooltipText }}>{label}</p>}
      {payload.map((item: { name?: string; value?: number; color?: string }, i: number) => (
        <p key={i} style={{ color: item.color || c.tooltipText }}>
          {item.name}: {formatter && item.value !== undefined ? formatter(item.value, item.name || "") : item.value?.toLocaleString?.() ?? item.value}
        </p>
      ))}
    </div>
  )
}

function RevenueContent({ data }: { data: RevenueReport }) {
  const { t } = useI18n()
  const { currency: formatCurrency, shortNumber: formatShort } = useFormatters()
  const c = useChartColors()
  const summary = data.summary || { totalRevenue: 0, totalPaid: 0, returnedRevenue: 0, totalOrders: 0, avgOrderValue: 0 }
  const byChannel = data.byChannel || []
  const byAgent = data.byAgent || []
  const byProduct = data.byProduct || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("workspace.reports.totalRevenue")} value={formatCurrency(summary.totalRevenue)} />
        <StatCard label={t("workspace.reports.totalPaid")} value={formatCurrency(summary.totalPaid)} />
        <StatCard label="Returned revenue" value={formatCurrency(summary.returnedRevenue)} />
        <StatCard label={t("workspace.reports.totalOrders")} value={summary.totalOrders} />
        <StatCard label={t("workspace.reports.avgOrderValue")} value={formatCurrency(summary.avgOrderValue)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t("workspace.reports.revenueBySocialMedia")}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={byChannel}
                dataKey="revenue"
                nameKey="channelName"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ channelName, percent }: { channelName?: string; percent?: number }) => `${channelName || t("workspace.reports.directFallback")} ${((percent || 0) * 100).toFixed(0)}%`}
              >
                {byChannel.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomTooltip formatter={(v: number) => formatCurrency(v)} />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("workspace.reports.revenueByAgent")}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byAgent} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis type="number" tickFormatter={formatShort} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis dataKey="agentName" type="category" width={100} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <RechartsTooltip content={<CustomTooltip formatter={(v: number) => formatCurrency(v)} />} />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title={t("workspace.reports.revenueByProduct")}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={byProduct.slice(0, 10)} margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis dataKey="productName" stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
            <YAxis tickFormatter={formatShort} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
            <RechartsTooltip content={<CustomTooltip formatter={(v: number) => formatCurrency(v)} />} />
            <Legend wrapperStyle={{ color: c.legendText }} />
            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name={t("workspace.reports.revenueSeries")} />
            <Bar dataKey="totalSold" fill="#f59e0b" radius={[4, 4, 0, 0]} name={t("workspace.reports.unitsSoldSeries")} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DataTable
          columns={[t("workspace.reports.socialMediaTypeCol"), t("workspace.reports.revenueCol"), t("workspace.reports.ordersCol")]}
          rows={byChannel.map((ch) => [ch.channelName || t("workspace.reports.directFallback"), formatCurrency(ch.revenue), ch.orderCount])}
        />
        <DataTable
          columns={[t("workspace.reports.agentCol"), t("workspace.reports.revenueCol"), t("workspace.reports.ordersCol")]}
          rows={byAgent.map((a) => [a.agentName || t("workspace.reports.unknownFallback"), formatCurrency(a.revenue), a.orderCount])}
        />
      </div>
      <DataTable
        columns={[t("workspace.reports.productCol"), t("workspace.reports.revenueCol"), t("workspace.reports.soldCol"), t("workspace.reports.ordersCol")]}
        rows={byProduct.map((p) => [p.productName, formatCurrency(p.revenue), p.totalSold, p.orderCount])}
      />
    </div>
  )
}

function TeamPerformanceContent({ data }: { data: TeamPerformanceReport }) {
  const { t } = useI18n()
  const { currency: formatCurrency, shortNumber: formatShort } = useFormatters()
  const c = useChartColors()
  const agents = data.agents || []
  const totalOrders = agents.reduce((s, a) => s + a.totalOrders, 0)
  const totalRevenue = agents.reduce((s, a) => s + a.totalRevenue, 0)
  const totalMessages = agents.reduce((s, a) => s + a.messagesSent, 0)

  const barData = agents.map((a) => ({
    name: a.name,
    orders: a.totalOrders,
    paid: a.paidOrders,
    messages: a.messagesSent,
    conversations: a.totalConversations,
  }))

  const scatterData = agents.map((a) => ({
    name: a.name,
    revenue: a.totalRevenue,
    messages: a.messagesSent,
  }))

  const radarData = agents.map((a) => ({
    name: a.name,
    orders: a.totalOrders > 0 ? Math.min((a.totalOrders / Math.max(...agents.map((x) => x.totalOrders), 1)) * 100, 100) : 0,
    messages: a.messagesSent > 0 ? Math.min((a.messagesSent / Math.max(...agents.map((x) => x.messagesSent), 1)) * 100, 100) : 0,
    conversations: a.totalConversations > 0 ? Math.min((a.totalConversations / Math.max(...agents.map((x) => x.totalConversations), 1)) * 100, 100) : 0,
    collected: a.totalCollected > 0 ? Math.min((a.totalCollected / Math.max(...agents.map((x) => x.totalCollected), 1)) * 100, 100) : 0,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("workspace.reports.totalAgentAgents")} value={agents.length} />
        <StatCard label={t("workspace.reports.totalOrders")} value={totalOrders} />
        <StatCard label={t("workspace.reports.totalRevenue")} value={formatCurrency(totalRevenue)} />
        <StatCard label={t("workspace.reports.totalMessages")} value={totalMessages} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t("workspace.reports.ordersVsPaidByAgent")}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="name" stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: c.legendText }} />
              <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} name={t("workspace.reports.ordersSeries")} />
              <Bar dataKey="paid" fill="#10b981" radius={[4, 4, 0, 0]} name={t("workspace.reports.paidSeries")} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("workspace.reports.revenueVsMessages")}>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis type="number" dataKey="messages" name={t("workspace.reports.messagesSeries")} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis type="number" dataKey="revenue" name={t("workspace.reports.revenueSeries")} tickFormatter={formatShort} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <RechartsTooltip
                content={
                  <CustomTooltip
                    formatter={(value: number, name: string) =>
                      name === t("workspace.reports.revenueSeries") ? formatCurrency(value) : value
                    }
                  />
                }
              />
              <Scatter data={scatterData} fill="#8b5cf6" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {agents.length > 0 && (
        <ChartCard title={t("workspace.reports.agentActivityProfile")}>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={c.grid} />
              <PolarAngleAxis dataKey="name" stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} stroke={c.tick} tick={{ fill: c.tick, fontSize: 10 }} />
              <Radar name={t("workspace.reports.ordersSeries")} dataKey="orders" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
              <Radar name={t("workspace.reports.messagesSeries")} dataKey="messages" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
              <Radar name={t("workspace.reports.conversationsSeries")} dataKey="conversations" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: c.legendText }} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <DataTable
        columns={[t("workspace.reports.agentCol"), t("workspace.reports.roleCol"), t("workspace.reports.ordersCol"), t("workspace.reports.paidCol"), t("workspace.reports.revenueCol"), t("workspace.reports.collectedCol"), t("workspace.reports.conversationsCol"), t("workspace.reports.messagesCol")]}
        rows={agents.map((a) => [a.name, a.role, a.totalOrders, a.paidOrders, formatCurrency(a.totalRevenue), formatCurrency(a.totalCollected), a.totalConversations, a.messagesSent])}
      />
    </div>
  )
}

function CustomerContent({ data }: { data: CustomerReport }) {
  const { t } = useI18n()
  const c = useChartColors()
  const totalCustomers = data.totalCustomers || 0
  const newCustomers = data.newCustomers || 0
  const segments = data.segments || { cold: 0, warm: 0, hot: 0 }
  const byChannel = data.byChannel || []
  const boughtRate = data.boughtRate || []

  const segmentData = [
    { name: t("workspace.reports.coldSegment"), value: segments.cold },
    { name: t("workspace.reports.warmSegment"), value: segments.warm },
    { name: t("workspace.reports.hotSegment"), value: segments.hot },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("workspace.reports.totalCustomers")} value={totalCustomers} />
        <StatCard label={t("workspace.reports.newCustomers")} value={newCustomers} />
        <StatCard label={t("workspace.reports.coldSegment")} value={segments.cold} />
        <StatCard label={t("workspace.reports.hotSegment")} value={segments.hot} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t("workspace.reports.customerSegments")}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={segmentData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
              >
                {segmentData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS_COLD[i % PIE_COLORS_COLD.length]} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("workspace.reports.customersByChannel")}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byChannel} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis type="number" stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis dataKey="channelName" type="category" width={100} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Bar dataKey="customerCount" fill="#06b6d4" radius={[0, 4, 4, 0]} name={t("workspace.reports.customersSeries")} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {boughtRate.length > 0 && (
        <ChartCard title={t("workspace.reports.customerBoughtRate")}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={boughtRate}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="label" stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Bar dataKey="customers" fill="#8b5cf6" radius={[4, 4, 0, 0]} name={t("workspace.reports.customersSeries")} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DataTable
          columns={[t("workspace.reports.segmentCol"), t("workspace.reports.countCol")]}
          rows={[[t("workspace.reports.coldSegment"), segments.cold], [t("workspace.reports.warmSegment"), segments.warm], [t("workspace.reports.hotSegment"), segments.hot]]}
        />
        <DataTable
          columns={[t("workspace.reports.channelCol"), t("workspace.reports.typeCol"), t("workspace.reports.customersSeries")]}
          rows={byChannel.map((ch) => [ch.channelName || t("workspace.reports.directFallback"), ch.channelType, ch.customerCount])}
        />
      </div>
    </div>
  )
}

function ProductContent({ data }: { data: ProductReport }) {
  const { t } = useI18n()
  const { currency: formatCurrency, shortNumber: formatShort } = useFormatters()
  const c = useChartColors()
  const products = data.products || []
  const stockHealth = data.stockHealth || { total: 0, outOfStock: 0, lowStock: 0 }
  const totalSold = products.reduce((s, p) => s + p.totalSold, 0)
  const totalRevenue = products.reduce((s, p) => s + Number(p.totalRevenue), 0)

  const stockData = [
    { name: t("workspace.reports.outOfStock"), value: stockHealth.outOfStock },
    { name: t("workspace.reports.lowStock"), value: stockHealth.lowStock },
    { name: t("workspace.reports.healthySegment"), value: Math.max(stockHealth.total - stockHealth.outOfStock - stockHealth.lowStock, 0) },
  ].filter((d) => d.value > 0)

  const scatterData = products.map((p) => ({
    name: p.productName,
    sold: p.totalSold,
    revenue: Number(p.totalRevenue),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("workspace.reports.totalProductsSold")} value={totalSold} />
        <StatCard label={t("workspace.reports.totalRevenue")} value={formatCurrency(totalRevenue)} />
        <StatCard label={t("workspace.reports.outOfStock")} value={stockHealth.outOfStock} note={t("workspace.reports.totalProductsNote", { count: stockHealth.total })} />
        <StatCard label={t("workspace.reports.lowStock")} value={stockHealth.lowStock} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t("workspace.reports.topProductsByRevenue")}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={products.slice(0, 10)} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis type="number" tickFormatter={formatShort} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis dataKey="productName" type="category" width={120} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <RechartsTooltip content={<CustomTooltip formatter={(v: number) => formatCurrency(v)} />} />
              <Bar dataKey="totalRevenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("workspace.reports.stockHealth")}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stockData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
              >
                {stockData.map((_, i) => (
                  <Cell key={i} fill={["#ef4444", "#f59e0b", "#10b981"][i % 3]} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {scatterData.length > 0 && (
        <ChartCard title={t("workspace.reports.unitsSoldVsRevenue")}>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis type="number" dataKey="sold" name={t("workspace.reports.unitsSoldSeries")} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis type="number" dataKey="revenue" name={t("workspace.reports.revenueSeries")} tickFormatter={formatShort} stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <RechartsTooltip
                content={
                  <CustomTooltip
                    formatter={(value: number, name: string) =>
                      name === "Revenue" ? formatCurrency(value) : value
                    }
                  />
                }
              />
              <Scatter data={scatterData} fill="#8b5cf6" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <DataTable
        columns={[t("workspace.reports.productCol"), t("workspace.reports.soldCol"), t("workspace.reports.revenueCol"), t("workspace.reports.ordersCol"), t("workspace.reports.orderRateCol")]}
        rows={products.map((p) => [p.productName, p.totalSold, formatCurrency(Number(p.totalRevenue)), p.orderCount, p.orderRate])}
      />
    </div>
  )
}

function ChannelContent({ data }: { data: ChannelReport }) {
  const { t } = useI18n()
  const { currency: formatCurrency } = useFormatters()
  const c = useChartColors()
  const channels = data.channels || []
  const totalInbound = channels.reduce((s, ch) => s + ch.inbound, 0)
  const totalOutbound = channels.reduce((s, ch) => s + ch.outbound, 0)
  const totalCustomers = channels.reduce((s, ch) => s + ch.customers, 0)
  const totalRevenue = channels.reduce((s, ch) => s + ch.revenue, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("workspace.reports.inboundMessages")} value={totalInbound} />
        <StatCard label={t("workspace.reports.outboundMessages")} value={totalOutbound} />
        <StatCard label={t("workspace.reports.totalCustomers")} value={totalCustomers} />
        <StatCard label={t("workspace.reports.totalRevenue")} value={formatCurrency(totalRevenue)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t("workspace.reports.inboundVsOutboundMessages")}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={channels}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="channelName" stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: c.legendText }} />
              <Bar dataKey="inbound" stackId="a" fill="#3b82f6" name={t("workspace.reports.inboundSeries")} />
              <Bar dataKey="outbound" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} name={t("workspace.reports.outboundSeries")} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("workspace.reports.revenueByChannel")}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={channels}
                dataKey="revenue"
                nameKey="channelName"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ channelName, percent }: { channelName?: string; percent?: number }) => `${channelName} ${((percent || 0) * 100).toFixed(0)}%`}
              >
                {channels.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomTooltip formatter={(v: number) => formatCurrency(v)} />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title={t("workspace.reports.customersPerChannel")}>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={channels}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis dataKey="channelName" stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
            <YAxis stroke={c.tick} tick={{ fill: c.tick, fontSize: 12 }} />
            <RechartsTooltip content={<CustomTooltip />} />
            <Bar dataKey="customers" fill="#06b6d4" radius={[4, 4, 0, 0]} name={t("workspace.reports.customersSeries")} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <DataTable
        columns={[t("workspace.reports.channelCol"), t("workspace.reports.typeCol"), t("workspace.reports.inboundSeries"), t("workspace.reports.outboundSeries"), t("workspace.reports.customersSeries"), t("workspace.reports.revenueCol")]}
        rows={channels.map((ch) => [ch.channelName, ch.channelType, ch.inbound, ch.outbound, ch.customers, formatCurrency(ch.revenue)])}
      />
    </div>
  )
}

export default function ReportsPage() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get("tab") || ""
  const reportTabs = useMemo(() => getReportTabs(t), [t])
  const activeReport = reportTabs.find((r) => r.key === activeTab)

  return (
    <>
      <WorkspaceHeader
        eyebrow={t("workspace.reports.eyebrow")}
        title={t("workspace.reports.title")}
        description={t("workspace.reports.description")}
      />

      <WorkspacePage containerClassName="max-w-7xl">
        {activeReport ? (
          <ReportClient
            title={activeReport.title}
            description={activeReport.description}
            fetcher={getFetcher(activeTab)}
          >
            {(data) => renderReport(activeTab, data)}
          </ReportClient>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{t("workspace.reports.allReports")}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("workspace.reports.allReportsDescription")}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reportTabs.map((report) => {
                const Icon = report.icon
                return (
                  <WorkspaceCard key={report.key} className="group transition-colors hover:border-indigo-200 dark:hover:border-indigo-700">
                    <Link href={`/workspace/reports?tab=${report.key}`} className="flex min-h-[176px] flex-col p-5">
                      <div className="flex items-start justify-between gap-4">
                        <span className={`flex h-11 w-11 items-center justify-center rounded-md ${report.iconBackground}`}>
                          <Icon aria-hidden="true" className={`h-5 w-5 ${report.iconClass}`} strokeWidth={1.9} />
                        </span>
                        <ArrowRight aria-hidden="true" className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-300" />
                      </div>
                      <h3 className="mt-5 text-base font-semibold text-slate-950 dark:text-slate-50">{report.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{report.description}</p>
                    </Link>
                  </WorkspaceCard>
                )
              })}
            </div>
          </>
        )}
      </WorkspacePage>
    </>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFetcher(tab: string): (period: ReportPeriod, dateRange?: ReportDateRange) => Promise<any> {
  switch (tab) {
    case "revenue": return (period, dr) => reportsApi.revenue(period, dr)
    case "team-performance": return (period, dr) => reportsApi.teamPerformance(period, dr)
    case "customers": return (period, dr) => reportsApi.customers(period, dr)
    case "products": return (period, dr) => reportsApi.products(period, dr)
    case "channels": return (period, dr) => reportsApi.channels(period, dr)
    default: return (period, dr) => reportsApi.revenue(period, dr)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderReport(tab: string, data: any) {
  switch (tab) {
    case "revenue": return <RevenueContent data={data} />
    case "team-performance": return <TeamPerformanceContent data={data} />
    case "customers": return <CustomerContent data={data} />
    case "products": return <ProductContent data={data} />
    case "channels": return <ChannelContent data={data} />
    default: return null
  }
}
