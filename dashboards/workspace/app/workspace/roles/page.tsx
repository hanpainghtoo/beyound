"use client"

import { useEffect, useMemo, useState } from "react"
import { Shield, UsersRound } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { getApiErrorMessage, tenantCsrsApi, type TenantCsrDto } from "@/lib/api"

type RoleName = "Owner" | "Admin" | "Manager" | "CSR"

type RoleDefinition = {
  name: RoleName
  description: string
  permissions: Record<string, string>
}

const roles: RoleDefinition[] = [
  {
    name: "Owner",
    description: "Full workspace ownership and billing control",
    permissions: {
      "Home / Inbox / Orders": "Full access",
      "Team / Channels / Roles": "Manage",
      "Settings / Billing": "Manage",
      Audit: "View and export",
    },
  },
  {
    name: "Admin",
    description: "Full management access across the workspace",
    permissions: {
      "Home / Inbox / Orders": "Full access",
      "Team / Channels / Roles": "Manage",
      "Settings / Billing": "Manage",
      Audit: "View and export",
    },
  },
  {
    name: "Manager",
    description: "Team oversight and operational control",
    permissions: {
      "Home / Inbox / Orders": "Full access",
      "Team / Channels": "Manage",
      "Settings / Billing": "View",
      Audit: "View",
    },
  },
  {
    name: "CSR",
    description: "Basic working role for daily operations",
    permissions: {
      Inbox: "Work assigned conversations",
      Orders: "Create and update order details",
      Products: "View",
      Reports: "No access",
      Billing: "No access",
    },
  },
]

const modules = ["Inbox", "Customers", "Orders", "Deliveries", "Products", "Saved Replies", "Media", "Reports", "Team", "Channels", "Workspace Settings", "Billing", "Audit"]

export default function RolesPage() {
  const [members, setMembers] = useState<TenantCsrDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    tenantCsrsApi
      .list()
      .then(setMembers)
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Unable to load role membership.")))
      .finally(() => setIsLoading(false))
  }, [])

  const roleCounts = useMemo(() => {
    const counts: Record<RoleName, number> = { Owner: 0, Admin: 0, Manager: 0, CSR: 0 }
    members.forEach((member) => {
      if (member.role === "owner") counts.Owner += 1
      if (member.role === "admin") counts.Admin += 1
      if (member.role === "supervisor") counts.Manager += 1
      if (member.role === "csr") counts.CSR += 1
    })
    return counts
  }, [members])

  return (
    <>
      <WorkspaceHeader
        eyebrow="Management"
        title="Roles"
        description="Use clear workspace access levels for each team member."
      />

      <WorkspacePage>
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        ) : null}
        <WorkspaceSection
          title="Workspace roles"
          description="Owner, Admin, Manager, and CSR are the live workspace roles currently enforced in ZayOS Workspace."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <Card key={role.name} className="workspace-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                      <CardTitle>{role.name}</CardTitle>
                    </div>
                    <Badge variant="outline">{isLoading ? "..." : `${roleCounts[role.name]} members`}</Badge>
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
          title="Permission matrix"
          description="This matrix reflects the current live workspace access model."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.name}>{role.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((module) => (
                <TableRow key={module}>
                  <TableCell className="font-medium">{module}</TableCell>
                  {roles.map((role) => (
                    <TableCell key={role.name} className="text-sm text-slate-600 dark:text-slate-300">
                      {role.permissions[module] || "Read"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </WorkspaceSection>

        <WorkspaceSection title="Access control note" description="Workspace permissions follow the active team role model.">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <UsersRound className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Team member assignment, channel access, and billing controls still respect existing workspace access rules. The
              workspace currently uses Owner, Admin, Manager, and CSR roles only.
            </p>
          </div>
        </WorkspaceSection>
      </WorkspacePage>
    </>
  )
}
