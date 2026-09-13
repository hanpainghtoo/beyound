"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, ExternalLink, RefreshCw, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { getPlatformUsageWarnings, PlatformApiError, type TenantUsageSummaryDto, type TenantUsageWarningDto } from "@/lib/api"

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Usage warnings could not be loaded."
const formatDate = (value: string) => new Date(value).toLocaleDateString()
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not recorded"
const formatLimit = (used: number, limit: number | null) => limit === null ? `${used.toLocaleString()} / Unlimited` : `${used.toLocaleString()} / ${limit.toLocaleString()}`
const warningText = (warning: TenantUsageWarningDto) => {
  const label = warning.metric === "providerMessages" ? "messages" : warning.metric
  return `${label} ${warning.percentUsed}%`
}
const warningClass = (severity: TenantUsageWarningDto["severity"]) => severity === "limit_reached"
  ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
  : "border-amber-400/30 bg-amber-500/10 text-amber-100"

export default function Page() {
  const [summaries, setSummaries] = useState<TenantUsageSummaryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [search, setSearch] = useState("")
  const [tenantStatus, setTenantStatus] = useState("all")
  const [warningFilter, setWarningFilter] = useState("all")
  const [planFilter, setPlanFilter] = useState("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    setPermissionDenied(false)
    try {
      setSummaries(await getPlatformUsageWarnings())
    } catch (requestError) {
      if (requestError instanceof PlatformApiError && requestError.status === 403) setPermissionDenied(true)
      setError(errorMessage(requestError))
      setSummaries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredSummaries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return summaries.filter((summary) => {
      const matchesSearch = !normalizedSearch
        || summary.tenant.companyName.toLowerCase().includes(normalizedSearch)
        || summary.tenant.tenantCode.toLowerCase().includes(normalizedSearch)
      const matchesStatus = tenantStatus === "all" || summary.tenant.status === tenantStatus
      const matchesPlan = planFilter === "all" || summary.subscriptionPlan?.id === planFilter
      const hasWarning = summary.warnings.length > 0
      const hasLimitReached = summary.warnings.some((warning) => warning.severity === "limit_reached")
      const matchesWarning = warningFilter === "all"
        || (warningFilter === "warning" && hasWarning)
        || (warningFilter === "limit_reached" && hasLimitReached)
        || (warningFilter === "healthy" && !hasWarning)

      return matchesSearch && matchesStatus && matchesPlan && matchesWarning
    })
  }, [planFilter, search, summaries, tenantStatus, warningFilter])

  const warningCount = useMemo(() => filteredSummaries.reduce((count, summary) => count + summary.warnings.length, 0), [filteredSummaries])
  const limitReachedCount = useMemo(() => filteredSummaries.filter((summary) => summary.warnings.some((warning) => warning.severity === "limit_reached")).length, [filteredSummaries])
  const activeTenantCount = filteredSummaries.filter((summary) => summary.tenant.status === "active").length
  const planOptions = useMemo(
    () => summaries.reduce<Array<{ id: string; name: string }>>((plans, summary) => {
      if (!summary.subscriptionPlan) return plans
      if (plans.some((plan) => plan.id === summary.subscriptionPlan?.id)) return plans
      return [...plans, { id: summary.subscriptionPlan.id, name: summary.subscriptionPlan.name }]
    }, []).sort((first, second) => first.name.localeCompare(second.name)),
    [summaries],
  )

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Usage & Capacity"
        description="Monitor tenant usage against plan and override limits for seats, channels, provider messages, and API requests."
        actions={<Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}
      />
      <ConsolePage>
        {error ? <StateMessage title={permissionDenied ? "Permission required" : "Usage data unavailable"} message={error} destructive /> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Tenants shown" value={loading ? "..." : filteredSummaries.length} note="Filtered live summaries" tone="blue" />
          <ConsoleStatCard label="Active tenants" value={loading ? "..." : activeTenantCount} note="Currently active" tone="emerald" />
          <ConsoleStatCard label="Warnings" value={loading ? "..." : warningCount} note="Near configured limits" tone="amber" />
          <ConsoleStatCard label="Limit reached" value={loading ? "..." : limitReachedCount} note="Needs operational follow-up" tone="rose" />
        </div>

        <ConsoleSection title="Filters" description="Narrow down merchants under pressure before taking billing or capacity actions.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant or code" className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-slate-500" />
            </div>
            <Select value={tenantStatus} onValueChange={setTenantStatus}>
              <SelectTrigger className="border-white/10 bg-white/5 text-white"><SelectValue placeholder="Tenant status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={warningFilter} onValueChange={setWarningFilter}>
              <SelectTrigger className="border-white/10 bg-white/5 text-white"><SelectValue placeholder="Warning state" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warning states</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
                <SelectItem value="warning">Any warning</SelectItem>
                <SelectItem value="limit_reached">Limit reached</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="border-white/10 bg-white/5 text-white"><SelectValue placeholder="Subscription plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                {planOptions.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </ConsoleSection>

        <ConsoleSection title="Usage pressure" description="Tenants are sorted by severity from the platform usage warning feed.">
          <div className="space-y-3">
            {loading ? <StatePanel message="Loading live tenant usage..." /> : error ? <StatePanel message="Usage summaries could not be loaded." /> : filteredSummaries.length === 0 ? <StatePanel message="No tenants matched the current filters." /> : filteredSummaries.map((summary) => (
              <div key={summary.tenant.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <Link href={`/platform-console/merchants/${summary.tenant.id}`} className="inline-flex items-center font-medium text-white hover:text-sky-200">
                      {summary.tenant.companyName}
                      <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{summary.tenant.status}</Badge>
                      <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{summary.subscriptionPlan?.name || "No plan"}</Badge>
                      <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{formatDate(summary.periodStart)} - {formatDate(summary.periodEnd)}</Badge>
                      <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">Refreshed {formatDateTime(summary.refreshedAt)}</Badge>
                      {summary.warnings.length === 0 ? <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">Healthy</Badge> : summary.warnings.map((warning) => <Badge key={`${summary.tenant.id}-${warning.metric}`} variant="outline" className={warningClass(warning.severity)}>{warningText(warning)}</Badge>)}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-400">Usage source: persisted tenant usage events. Latest recorded usage: {formatDateTime(summary.latestUsageEventAt)}.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <UsageCard label="Messages" metric={summary.metrics.providerMessages} />
                  <UsageCard label="Seats" metric={summary.metrics.csrs} />
                  <UsageCard label="Channels" metric={summary.metrics.channels} />
                  <UsageCard label="API usage" metric={summary.metrics.apiRequests} />
                </div>
              </div>
            ))}
          </div>
        </ConsoleSection>
      </ConsolePage>
    </>
  )
}

function UsageCard({ label, metric }: { label: string; metric: TenantUsageSummaryDto["metrics"]["csrs"] }) {
  const percent = metric.percentUsed ?? 0
  const tone = metric.limit !== null && metric.used >= metric.limit ? "bg-rose-400" : percent >= 80 ? "bg-amber-300" : "bg-emerald-300"
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-xs text-slate-500">{metric.unlimited ? "Unlimited" : `${percent}%`}</p>
      </div>
      <p className="mt-1 text-lg font-semibold text-white">{formatLimit(metric.used, metric.limit)}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${tone}`} style={{ width: `${metric.limit === null ? 0 : Math.min(percent, 100)}%` }} />
      </div>
    </div>
  )
}

function StatePanel({ message }: { message: string }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-10 text-center text-sm text-slate-400">{message}</div>
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
