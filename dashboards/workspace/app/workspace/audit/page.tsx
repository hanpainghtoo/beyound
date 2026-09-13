"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Clock3, Search as SearchIcon, ShieldCheck, ShieldOff } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { getApiErrorMessage, tenantAuditLogsApi, type TenantAuditLogDto } from "@/lib/api"

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function humanize(value?: string | null) {
  if (!value) return "Not recorded"
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function actionTone(action: string) {
  if (/delete|remove|suspend|fail|reject/i.test(action)) return "destructive" as const
  return "outline" as const
}

export default function AuditPage() {
  const [logs, setLogs] = useState<TenantAuditLogDto[]>([])
  const [query, setQuery] = useState("")
  const [moduleFilter, setModuleFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setIsLoading(true)
    setError("")
    tenantAuditLogsApi
      .list()
      .then(setLogs)
      .catch((requestError) => {
        setLogs([])
        setError(getApiErrorMessage(requestError, "Unable to load audit events. Please refresh or contact support."))
      })
      .finally(() => setIsLoading(false))
  }, [])

  const modules = useMemo(
    () => Array.from(new Set(logs.map((log) => log.resourceType).filter((value): value is string => Boolean(value)))).sort(),
    [logs],
  )
  const actions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort(), [logs])
  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        const actor = log.user?.fullName || log.user?.email || "Workspace user"
        const normalizedQuery = query.toLowerCase()
        const matchesQuery =
          actor.toLowerCase().includes(normalizedQuery) ||
          log.action.toLowerCase().includes(normalizedQuery) ||
          (log.resourceType || "").toLowerCase().includes(normalizedQuery)
        const matchesModule = moduleFilter === "all" || log.resourceType === moduleFilter
        const matchesAction = actionFilter === "all" || log.action === actionFilter
        return matchesQuery && matchesModule && matchesAction
      }),
    [actionFilter, logs, moduleFilter, query],
  )

  return (
    <>
      <WorkspaceHeader
        eyebrow="Management"
        title="Audit"
        description="Track team, workspace, and commerce activity in one place."
      />

      <WorkspacePage>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard title="Total events" value={logs.length} description="Persisted workspace events" icon={Clock3} />
          <MetricCard title="Team events" value={logs.filter((log) => log.resourceType === "tenant_user").length} description="Member and role changes" icon={ShieldCheck} />
          <MetricCard title="Risk events" value={logs.filter((log) => actionTone(log.action) === "destructive").length} description="Destructive or failed actions" icon={ShieldOff} />
        </div>

        <WorkspaceSection title="Filters" description="Search by user, action, or resource.">
          {error ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3 border-b pb-4 dark:border-slate-800">
            <div className="relative min-w-[200px] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search audit events" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger><SelectValue placeholder="Resource" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All resources</SelectItem>
                {modules.map((module) => <SelectItem key={module} value={module}>{humanize(module)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((action) => <SelectItem key={action} value={action}>{humanize(action)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{isLoading ? "Loading audit events..." : `${filteredLogs.length} matching records`}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Loading audit events...</TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10">
                    <WorkspaceEmptyState icon={AlertCircle} title="Audit events are unavailable" description={error} />
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10">
                    <WorkspaceEmptyState icon={Clock3} title="No audit events found" description="Workspace activity will appear here after team members make changes." />
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>{log.user?.fullName || log.user?.email || "Workspace user"}</TableCell>
                    <TableCell>
                      <Badge variant={actionTone(log.action)}>{humanize(log.action)}</Badge>
                    </TableCell>
                    <TableCell>{humanize(log.resourceType)}</TableCell>
                    <TableCell>{log.ipAddress || "Not recorded"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </WorkspaceSection>
      </WorkspacePage>
    </>
  )
}

function MetricCard({ title, value, description, icon: Icon }: { title: string; value: number; description: string; icon: typeof Clock3 }) {
  return (
    <Card className="workspace-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}
