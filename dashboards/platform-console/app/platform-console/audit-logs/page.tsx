"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, RefreshCw, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConsoleHeader, ConsolePage, ConsoleSection } from "@/components/platform-console-shell"
import { getPlatformAuditLogs, PlatformApiError, type PlatformAuditLogDto } from "@/lib/api"

const formatDateTime = (value: string) => new Date(value).toLocaleString("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Yangon",
})
const actorName = (event: PlatformAuditLogDto) => event.admin?.fullName || event.admin?.email || event.adminId || "System"
const scopeText = (event: PlatformAuditLogDto) => [event.resourceType, event.resourceId].filter(Boolean).join(" / ") || "Platform"
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Audit logs could not be loaded."

export default function Page() {
  const [logs, setLogs] = useState<PlatformAuditLogDto[]>([])
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    setPermissionDenied(false)
    try {
      const result = await getPlatformAuditLogs(search)
      setLogs(result.data)
      setTotal(result.total)
    } catch (requestError) {
      if (requestError instanceof PlatformApiError && requestError.status === 403) setPermissionDenied(true)
      setError(errorMessage(requestError))
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    void load()
  }, [load])

  const latestAction = useMemo(() => logs[0]?.action || "No recent action", [logs])

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Audit Logs"
        description="Persisted history of sensitive internal actions: tenant lifecycle, plan changes, payment confirmation, settings updates, and operator access."
        actions={<Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}
      />
      <ConsolePage>
        {error ? <StateMessage title={permissionDenied ? "Permission required" : "Audit logs unavailable"} message={error} destructive /> : null}
        <ConsoleSection
          title="Sensitive internal actions"
          description="All times shown in Myanmar Time. The table shows the latest 50 persisted platform audit events."
          action={<Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">{loading ? "Loading" : `${total} records`}</Badge>}
        >
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setSearch(query.trim()) }} placeholder="Search action or resource type" className="border-white/10 bg-slate-950/40 pl-9 text-white" />
            </div>
            <Button variant="outline" onClick={() => setSearch(query.trim())} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10">Search</Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table className="min-w-[980px]">
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Time</TableHead>
                  <TableHead className="text-slate-300">Actor</TableHead>
                  <TableHead className="text-slate-300">Sensitive action</TableHead>
                  <TableHead className="text-slate-300">Scope</TableHead>
                  <TableHead className="text-slate-300">Context</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? <TableRow><TableCell colSpan={5} className="py-12 text-center text-slate-400">Loading persisted audit logs...</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={5} className="py-12 text-center text-slate-400">Audit logs could not be loaded.</TableCell></TableRow> : logs.length === 0 ? <TableRow><TableCell colSpan={5} className="py-12 text-center text-slate-400">{search ? "No audit logs match this search." : "No platform audit events have been recorded yet."}</TableCell></TableRow> : logs.map((event) => (
                  <TableRow key={event.id} className="border-white/10">
                    <TableCell className="text-slate-300">{formatDateTime(event.createdAt)}</TableCell>
                    <TableCell><p className="text-white">{actorName(event)}</p>{event.admin?.role ? <p className="text-xs text-slate-500">{event.admin.role}</p> : null}</TableCell>
                    <TableCell className="font-mono text-xs text-sky-200">{event.action}</TableCell>
                    <TableCell className="text-slate-300">{scopeText(event)}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1"><Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{event.ipAddress || "No IP"}</Badge>{event.newValues ? <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">Changed values</Badge> : null}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>

        <ConsoleSection title="Latest event" description="Quick sanity check that the list is populated from the audit API.">
          <p className="font-mono text-sm text-sky-200">{latestAction}</p>
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
