"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Shield } from "lucide-react"
import { z } from "zod"

import { PlatformConsoleStateMessage } from "@/components/platform-console-release-state"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getPlatformRateLimits } from "@/lib/api"

const PlatformRateLimitSchema = z.object({
  id: z.string().nullable(),
  tenantId: z.string(),
  tenant: z.object({
    id: z.string(),
    tenantCode: z.string(),
    companyName: z.string(),
    status: z.string(),
  }),
  source: z.enum(["persisted", "default"]),
  messagesPerMinute: z.number(),
  apiRequestsPerMinute: z.number(),
  webhookEventsPerMinute: z.number(),
  throttlingMode: z.string(),
  graceLimitPercentage: z.number(),
  updatedAt: z.string().nullable(),
})

type PlatformRateLimit = z.infer<typeof PlatformRateLimitSchema>

function modeBadge(mode: string) {
  if (mode === "hard_limit") return "border-rose-400/30 bg-rose-500/10 text-rose-200"
  if (mode === "grace_limit") return "border-amber-400/30 bg-amber-500/10 text-amber-200"
  return "border-sky-400/30 bg-sky-500/10 text-sky-200"
}

export default function RateLimitingPage() {
  const [rateLimits, setRateLimits] = useState<PlatformRateLimit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const response = await getPlatformRateLimits()
      setRateLimits(z.array(PlatformRateLimitSchema).parse(response))
    } catch (requestError) {
      setRateLimits([])
      setError(requestError instanceof Error ? requestError.message : "Live rate-limit configuration could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const persistedCount = rateLimits.filter((limit) => limit.source === "persisted").length
  const hardLimitCount = rateLimits.filter((limit) => limit.throttlingMode === "hard_limit").length
  const graceLimitCount = rateLimits.filter((limit) => limit.throttlingMode === "grace_limit").length
  const defaultCount = rateLimits.filter((limit) => limit.source === "default").length
  const sortedLimits = useMemo(
    () => [...rateLimits].sort((first, second) => first.tenant.companyName.localeCompare(second.tenant.companyName)),
    [rateLimits],
  )

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Rate Limiting"
        description="Read-only effective tenant rate-limit settings derived from the authoritative backend configuration source."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <ConsolePage>
        {error ? <PlatformConsoleStateMessage title="Rate-limit data unavailable" message={error} destructive /> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Tenants shown" value={loading ? "..." : rateLimits.length} note="Live effective rate-limit entries" tone="blue" />
          <ConsoleStatCard label="Persisted overrides" value={loading ? "..." : persistedCount} note="Saved tenant-specific records" tone="emerald" />
          <ConsoleStatCard label="Default inheritance" value={loading ? "..." : defaultCount} note="No tenant override record yet" tone="cyan" />
          <ConsoleStatCard label="Hard-limit mode" value={loading ? "..." : hardLimitCount} note="Strictly enforced throttling" tone="rose" />
        </div>

        <ConsoleSection title="Release posture" description="Global editing is intentionally unavailable until a dedicated platform configuration workflow exists.">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">Read-only by design</p>
            <p className="mt-2 leading-6">This page no longer presents editable fixture rules. It shows actual tenant-effective limits from persisted `tenant_rate_limits` records, or backend default values when a tenant has no override record.</p>
          </div>
        </ConsoleSection>

        <ConsoleSection title="Effective tenant rate limits" description="Every row reflects current backend enforcement settings for that tenant.">
          {loading ? (
            <p className="text-sm text-slate-400">Loading live rate-limit settings...</p>
          ) : error ? (
            <p className="text-sm text-rose-200">Rate-limit rows are unavailable because the API request failed.</p>
          ) : sortedLimits.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">No tenant records were returned for rate-limit visibility.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <Table>
                <TableHeader className="bg-slate-950/70">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-slate-300">Tenant</TableHead>
                    <TableHead className="text-slate-300">Source</TableHead>
                    <TableHead className="text-slate-300">Messages / min</TableHead>
                    <TableHead className="text-slate-300">API requests / min</TableHead>
                    <TableHead className="text-slate-300">Webhooks / min</TableHead>
                    <TableHead className="text-slate-300">Mode</TableHead>
                    <TableHead className="text-slate-300">Grace</TableHead>
                    <TableHead className="text-slate-300">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-white/[0.03]">
                  {sortedLimits.map((limit) => (
                    <TableRow key={limit.tenantId} className="border-white/10 hover:bg-white/5">
                      <TableCell className="font-medium text-white">
                        <div>
                          <p>{limit.tenant.companyName}</p>
                          <p className="text-xs text-slate-500">{limit.tenant.tenantCode}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{limit.source}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">{limit.messagesPerMinute.toLocaleString()}</TableCell>
                      <TableCell className="text-slate-300">{limit.apiRequestsPerMinute.toLocaleString()}</TableCell>
                      <TableCell className="text-slate-300">{limit.webhookEventsPerMinute.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={modeBadge(limit.throttlingMode)}>
                          {limit.throttlingMode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">{limit.graceLimitPercentage}%</TableCell>
                      <TableCell className="text-slate-300">{limit.updatedAt ? new Date(limit.updatedAt).toLocaleString() : "Using backend default"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ConsoleSection>

        <ConsoleSection title="Mode summary" description="Current distribution of backend throttling behavior across tenants.">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Soft warning</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{rateLimits.filter((limit) => limit.throttlingMode === "soft_warning").length}</p>
                </div>
                <Shield className="h-7 w-7 text-sky-300" />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-sm text-slate-400">Grace limit</p>
              <p className="mt-2 text-3xl font-semibold text-white">{graceLimitCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-sm text-slate-400">Hard limit</p>
              <p className="mt-2 text-3xl font-semibold text-white">{hardLimitCount}</p>
            </div>
          </div>
        </ConsoleSection>
      </ConsolePage>
    </>
  )
}
