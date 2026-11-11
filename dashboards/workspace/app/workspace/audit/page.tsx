"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Clock3, Search as SearchIcon, Users, Activity, ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { tenantAuditLogsApi, tenantAgentsApi, type TenantAgentDto } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"

function formatRelativeTime(value: string, t: (key: string) => string) {
  const date = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t("workspace.audit.justNow")
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

type UserSummary = {
  id: string
  fullName: string
  email: string
  role: string
  status: string
  isOnline: boolean
  lastSeenAt: string | null
  createdAt: string
  eventCount: number
  lastActivity: string | null
}

const PAGE_SIZE = 20

export default function AuditPage() {
  const [summaries, setSummaries] = useState<UserSummary[]>([])
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, hasNext: false, hasPrev: false })
  const [totalEvents, setTotalEvents] = useState(0)
  const [team, setTeam] = useState<TenantAgentDto[]>([])
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const { t } = useI18n()

  // The rollup is aggregated in SQL so counts and "last activity" are exact.
  // Filtering happens server side too, otherwise paging would only filter the
  // rows on the current page.
  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setLoadFailed(false)

    tenantAuditLogsApi
      .summary({ search: query || undefined, role: roleFilter, status: statusFilter, page, limit: PAGE_SIZE })
      .then((result) => {
        setSummaries(result.data)
        setMeta({ page: result.page, totalPages: result.totalPages, hasNext: result.hasNext, hasPrev: result.hasPrev })
        setTotalEvents(result.totalEvents)
      })
      .catch(() => {
        setSummaries([])
        setLoadFailed(true)
        toast.error(t("workspace.audit.unableLoad"))
      })
      .finally(() => setIsLoading(false))

    return () => controller.abort()
  }, [t, query, roleFilter, statusFilter, page])

  // Team list is only used to populate the filter dropdowns.
  useEffect(() => {
    tenantAgentsApi
      .list()
      .then(setTeam)
      .catch(() => setTeam([]))
  }, [])

  const resetToFirstPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setPage(1)
    setter(value)
  }

  const roles = useMemo(() => Array.from(new Set(team.map((m) => m.role))).sort(), [team])
  const statuses = useMemo(() => Array.from(new Set(team.map((m) => m.status))).sort(), [team])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    )
  }

  if (loadFailed) {
    return (
      <WorkspacePage>
        <WorkspaceSection title={t("workspace.audit.sectionAuditTitle")}>
          <WorkspaceEmptyState 
            icon={AlertCircle} 
            title={t("workspace.audit.unavailableTitle")} 
            description={t("workspace.audit.unavailableDescription")} 
          />
        </WorkspaceSection>
      </WorkspacePage>
    )
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow={t("workspace.audit.eyebrow")}
        title={t("workspace.audit.title")}
        description={t("workspace.audit.description")}
        actions={
          <div className="flex items-center gap-2">
            <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {team.length} {t("workspace.audit.teamMembers")}
            </Badge>
          </div>
        }
      />

      <WorkspacePage>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="workspace-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("workspace.audit.totalTeamMembers")}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{team.length}</div>
              <p className="text-xs text-muted-foreground">{t("workspace.audit.activeMembersInWorkspace")}</p>
            </CardContent>
          </Card>
          <Card className="workspace-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("workspace.audit.totalAuditEvents")}</CardTitle>
              <Clock3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEvents}</div>
              <p className="text-xs text-muted-foreground">{t("workspace.audit.persistedWorkspaceEvents")}</p>
            </CardContent>
          </Card>
          <Card className="workspace-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("workspace.audit.activeMembers")}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {team.filter(m => m.status === "active").length}
              </div>
              <p className="text-xs text-muted-foreground">{t("workspace.audit.currentlyActiveTeamMembers")}</p>
            </CardContent>
          </Card>
        </div>

        <WorkspaceSection title={t("workspace.audit.sectionTitle")} description={t("workspace.audit.sectionDescription")}>
          <div className="flex flex-wrap gap-3 border-b pb-4 dark:border-slate-800">
            <div className="relative min-w-[200px] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder={t("workspace.audit.searchPlaceholder")} value={query} onChange={(event) => resetToFirstPage(setQuery)(event.target.value)} />
            </div>
            <Select value={roleFilter} onValueChange={resetToFirstPage(setRoleFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder={t("workspace.audit.roleFilterPlaceholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("workspace.audit.allRoles")}</SelectItem>
                {roles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={resetToFirstPage(setStatusFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder={t("workspace.audit.statusFilterPlaceholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("workspace.audit.allStatuses")}</SelectItem>
                {statuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className="text-sm text-muted-foreground">{t("workspace.audit.pageOf", { page: meta.page, total: meta.totalPages })}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!meta.hasPrev || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                {t("common.previous")}
              </Button>
              <Button variant="outline" size="sm" disabled={!meta.hasNext || isLoading} onClick={() => setPage((value) => value + 1)}>
                {t("common.next")}
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspace.audit.colMember")}</TableHead>
                <TableHead>{t("workspace.audit.colRole")}</TableHead>
                <TableHead>{t("workspace.audit.colStatus")}</TableHead>
                <TableHead className="text-right">{t("workspace.audit.colEvents")}</TableHead>
                <TableHead>{t("workspace.audit.colLastActivity")}</TableHead>
                <TableHead className="text-right">{t("workspace.audit.colAction")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <WorkspaceEmptyState icon={Users} title={t("workspace.audit.emptyTitle")} description={t("workspace.audit.emptyDescription")} />
                  </TableCell>
                </TableRow>
              ) : (
                summaries.map((user) => (
                  <TableRow key={user.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center dark:bg-slate-800">
                          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                            {user.fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-950 dark:text-white">{user.fullName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{user.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-600 dark:text-slate-400">
                      {user.eventCount}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                      {user.lastActivity ? formatRelativeTime(user.lastActivity, t) : t("workspace.audit.never")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link 
                        href={`/workspace/team/${user.id}?tab=audit`}
                        className="inline-flex items-center gap-1.5 text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium text-sm"
                      >
                        {t("workspace.audit.viewActivity")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
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