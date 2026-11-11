"use client"

import { useEffect, useMemo, useState } from "react"
import { Shield, UsersRound } from "lucide-react"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { getApiErrorMessage, tenantAgentsApi, type TenantAgentDto } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"

type RoleName = "Owner" | "Admin" | "Manager" | "Agent"

type RoleDefinition = {
  name: RoleName
  label: string
  description: string
  permissions: Record<string, string>
}

function getRoles(t: (key: string) => string): RoleDefinition[] {
  const moduleNames = {
    inbox: t("workspace.roles.moduleInbox"),
    customers: t("workspace.roles.moduleCustomers"),
    orders: t("workspace.roles.moduleOrders"),
    deliveries: t("workspace.roles.moduleDeliveries"),
    products: t("workspace.roles.moduleProducts"),
    savedReplies: t("workspace.roles.moduleSavedReplies"),
    media: t("workspace.roles.moduleMedia"),
    reports: t("workspace.roles.moduleReports"),
    team: t("workspace.roles.moduleTeam"),
    channels: t("workspace.roles.moduleChannels"),
    workspaceSettings: t("workspace.roles.moduleWorkspaceSettings"),
    billing: t("workspace.roles.moduleBilling"),
    audit: t("workspace.roles.moduleAudit"),
  }

  return [
    {
      name: "Owner",
      label: t("workspace.roles.ownerName"),
      description: t("workspace.roles.ownerDescription"),
      permissions: {
        [t("workspace.roles.groupHomeInboxOrders")]: t("workspace.roles.fullAccess"),
        [t("workspace.roles.groupTeamChannelsRoles")]: t("workspace.roles.manage"),
        [t("workspace.roles.groupSettingsBilling")]: t("workspace.roles.manage"),
        [moduleNames.audit]: t("workspace.roles.viewAndExport"),
      },
    },
    {
      name: "Admin",
      label: t("workspace.roles.adminName"),
      description: t("workspace.roles.adminDescription"),
      permissions: {
        [t("workspace.roles.groupHomeInboxOrders")]: t("workspace.roles.fullAccess"),
        [t("workspace.roles.groupTeamChannelsRoles")]: t("workspace.roles.manage"),
        [t("workspace.roles.groupSettingsBilling")]: t("workspace.roles.manage"),
        [moduleNames.audit]: t("workspace.roles.viewAndExport"),
      },
    },
    {
      name: "Manager",
      label: t("workspace.roles.managerName"),
      description: t("workspace.roles.managerDescription"),
      permissions: {
        [t("workspace.roles.groupHomeInboxOrders")]: t("workspace.roles.fullAccess"),
        [t("workspace.roles.groupTeamChannels")]: t("workspace.roles.manage"),
        [t("workspace.roles.groupSettingsBilling")]: t("workspace.roles.view"),
        [moduleNames.audit]: t("workspace.roles.view"),
      },
    },
    {
      name: "Agent",
      label: t("workspace.roles.agentName"),
      description: t("workspace.roles.agentDescription"),
      permissions: {
        [moduleNames.inbox]: t("workspace.roles.workAssignedConversations"),
        [moduleNames.orders]: t("workspace.roles.createUpdateOrderDetails"),
        [moduleNames.products]: t("workspace.roles.view"),
        [moduleNames.reports]: t("workspace.roles.noAccess"),
        [moduleNames.billing]: t("workspace.roles.noAccess"),
      },
    },
  ]
}

function getModules(t: (key: string) => string): string[] {
  return [
    t("workspace.roles.moduleInbox"),
    t("workspace.roles.moduleCustomers"),
    t("workspace.roles.moduleOrders"),
    t("workspace.roles.moduleDeliveries"),
    t("workspace.roles.moduleProducts"),
    t("workspace.roles.moduleSavedReplies"),
    t("workspace.roles.moduleMedia"),
    t("workspace.roles.moduleReports"),
    t("workspace.roles.moduleTeam"),
    t("workspace.roles.moduleChannels"),
    t("workspace.roles.moduleWorkspaceSettings"),
    t("workspace.roles.moduleBilling"),
    t("workspace.roles.moduleAudit"),
  ]
}

export default function RolesPage() {
  const [members, setMembers] = useState<TenantAgentDto[]>([])
  const { t } = useI18n()
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    tenantAgentsApi
      .list()
      .then(setMembers)
      .catch((requestError) => {
        setLoadFailed(true)
        toast.error(getApiErrorMessage(requestError, t("workspace.roles.unableLoad")))
      })
      .finally(() => setIsLoading(false))
  }, [t])

  const roles = useMemo(() => getRoles(t), [t])
  const modules = useMemo(() => getModules(t), [t])

  const roleCounts = useMemo(() => {
    const counts: Record<RoleName, number> = { Owner: 0, Admin: 0, Manager: 0, Agent: 0 }
    members.forEach((member) => {
      if (member.role === "owner") counts.Owner += 1
      if (member.role === "admin") counts.Admin += 1
      if (member.role === "supervisor") counts.Manager += 1
      if (member.role === "agent") counts.Agent += 1
    })
    return counts
  }, [members])

  return (
    <>
      <WorkspaceHeader
        navKey="roles"
        eyebrow={t("workspace.roles.eyebrow")}
        title={t("workspace.roles.title")}
        description={t("workspace.roles.description")}
      />

      <WorkspacePage>
        <WorkspaceSection
          title={t("workspace.roles.sectionTitle")}
          description={t("workspace.roles.sectionDescription")}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <Card key={role.name} className="workspace-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                      <CardTitle>{role.label}</CardTitle>
                    </div>
                    <Badge variant="outline">{isLoading ? t("workspace.roles.loadingBadge") : loadFailed ? t("workspace.roles.emptyBadge") : t("workspace.roles.membersBadge", { count: String(roleCounts[role.name]) })}</Badge>
                  </div>
                  <CardDescription>{role.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="space-y-2">
                    {Object.entries(role.permissions).map(([permission, access]) => (
                      <div key={permission} className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 text-sm dark:border-slate-800">
                        <span>{permission}</span>
                        <span className="font-medium text-slate-950 dark:text-slate-50">{access}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </WorkspaceSection>

        <WorkspaceSection
          title={t("workspace.roles.matrixTitle")}
          description={t("workspace.roles.matrixDescription")}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspace.roles.moduleCol")}</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.name}>{role.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((module) => (
                <TableRow key={module}>
                  <TableCell className="font-medium">{module}</TableCell>
                  {roles.map((role) => (
                    <TableCell key={role.name} className="text-sm text-slate-600 dark:text-slate-300">
                      {role.permissions[module] || t("workspace.roles.read")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </WorkspaceSection>

        <WorkspaceSection title={t("workspace.roles.noteTitle")} description={t("workspace.roles.noteDescription")}>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <UsersRound className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("workspace.roles.noteBody")}
            </p>
          </div>
        </WorkspaceSection>
      </WorkspacePage>
    </>
  )
}
