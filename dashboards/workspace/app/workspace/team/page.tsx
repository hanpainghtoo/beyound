"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertCircle, CheckCircle2, Edit, MailPlus, MoreHorizontal, Plus, Search as SearchIcon, Trash2 } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getApiErrorMessage,
  tenantCsrsApi,
  type CreateTenantCsrInput,
  type InviteTenantCsrInput,
  type TenantCsrDto,
  type TenantCsrInviteResult,
} from "@/lib/api"
import { getPasswordPolicyError, PASSWORD_POLICY_HINT } from "@/lib/password-policy"
import type { WorkspaceRole } from "@/lib/roles"

type TeamRole = WorkspaceRole
type WorkspaceRoleLabel = "Owner" | "Admin" | "Manager" | "CSR" | "Finance" | "Delivery"

type TeamMemberRow = {
  id: string
  fullName: string
  email: string
  phone: string
  role: TeamRole
  roleLabel: WorkspaceRoleLabel
  status: "active" | "inactive" | "suspended"
  isOnline: boolean
  lastSeenAt: string
}

const roleLabels: Record<TeamRole, WorkspaceRoleLabel> = {
  owner: "Owner",
  admin: "Admin",
  supervisor: "Manager",
  csr: "CSR",
  finance: "Finance",
  delivery: "Delivery",
}

const roleDescriptions: Record<WorkspaceRoleLabel, string> = {
  Owner: "Full workspace ownership and billing control",
  Admin: "Full management access across the workspace",
  Manager: "Team oversight and operational control",
  CSR: "Customer service role for daily conversation and order operations",
  Finance: "Payment, billing, and payment-status operations",
  Delivery: "Delivery queue access and delivery-stage updates",
}

const roleTone: Record<WorkspaceRoleLabel, { card: string; badge: string; dot: string }> = {
  Owner: {
    card: "border-violet-200 bg-violet-50/70 dark:border-violet-500/20 dark:bg-violet-500/10",
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
    dot: "bg-violet-500",
  },
  Admin: {
    card: "border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/20 dark:bg-indigo-500/10",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200",
    dot: "bg-indigo-500",
  },
  Manager: {
    card: "border-blue-200 bg-blue-50/70 dark:border-blue-500/20 dark:bg-blue-500/10",
    badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
    dot: "bg-blue-500",
  },
  CSR: {
    card: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  Finance: {
    card: "border-amber-200 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10",
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  Delivery: {
    card: "border-cyan-200 bg-cyan-50/70 dark:border-cyan-500/20 dark:bg-cyan-500/10",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200",
    dot: "bg-cyan-500",
  },
}

const statusTone: Record<TeamMemberRow["status"], string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  inactive: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  suspended: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
}

const resolveWorkspaceRole = (role?: TeamRole): WorkspaceRoleLabel => (role ? roleLabels[role] : "CSR")

type TeamCreateForm = CreateTenantCsrInput & {
  confirmPassword: string
}

const defaultForm: TeamCreateForm = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  phone: "",
  role: "csr",
  status: "active",
}

function mapTeamMember(member: TenantCsrDto): TeamMemberRow {
  return {
    id: member.id,
    fullName: member.fullName,
    email: member.email,
    phone: member.phone || "",
    role: member.role,
    roleLabel: resolveWorkspaceRole(member.role),
    status: member.status,
    isOnline: member.isOnline,
    lastSeenAt: member.lastSeenAt || member.updatedAt,
  }
}

function backendRoleFromLabel(label: string): TeamRole {
  if (label === "Owner") return "owner"
  if (label === "Admin") return "admin"
  if (label === "Manager") return "supervisor"
  if (label === "Finance") return "finance"
  if (label === "Delivery") return "delivery"
  return "csr"
}

function defaultInviteFormFromCreate(form: CreateTenantCsrInput): InviteTenantCsrInput {
  return {
    fullName: form.fullName,
    email: form.email,
    phone: form.phone,
    role: form.role,
    status: form.status,
  }
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMemberRow[]>([])
  const [query, setQuery] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMemberRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [inviteResult, setInviteResult] = useState<TenantCsrInviteResult | null>(null)
  const [createMode, setCreateMode] = useState<"invite" | "direct">("invite")
  const [createForm, setCreateForm] = useState<TeamCreateForm>(defaultForm)
  const [editForm, setEditForm] = useState<Omit<CreateTenantCsrInput, "password">>({
    fullName: "",
    email: "",
    phone: "",
    role: "csr",
    status: "active",
  })

  const loadTeam = async () => {
    setIsLoading(true)
    setError("")
    try {
      const rows = await tenantCsrsApi.list()
      setTeam(rows.map(mapTeamMember))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load team members"))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTeam()
  }, [])

  const filteredTeam = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return team
    return team.filter(
      (member) =>
        member.fullName.toLowerCase().includes(normalized) ||
        member.email.toLowerCase().includes(normalized) ||
        member.roleLabel.toLowerCase().includes(normalized),
    )
  }, [query, team])

  const directCreatePasswordError = createMode === "direct" ? getPasswordPolicyError(createForm.password) : ""
  const directCreateDisabled =
    isSaving ||
    (createMode === "direct" &&
      (!!directCreatePasswordError || !createForm.confirmPassword.trim() || createForm.confirmPassword !== createForm.password))

  const createMember = async () => {
    setIsSaving(true)
    setError("")
    setSuccessMessage("")
    setInviteResult(null)
    try {
      if (createMode === "direct") {
        const passwordError = getPasswordPolicyError(createForm.password)
        if (passwordError) {
          throw new Error(passwordError)
        }
        if (!createForm.confirmPassword.trim()) {
          throw new Error("Please confirm the password.")
        }
        if (createForm.confirmPassword !== createForm.password) {
          throw new Error("Passwords do not match.")
        }
      }

      if (createMode === "invite") {
        const invited = await tenantCsrsApi.invite(defaultInviteFormFromCreate(createForm))
        setTeam((current) => [mapTeamMember(invited.user), ...current])
        setInviteResult(invited)
        setSuccessMessage("Invite created. Setup instructions will be sent if delivery is available.")
      } else {
        const created = await tenantCsrsApi.create({
          fullName: createForm.fullName,
          email: createForm.email,
          password: createForm.password,
          phone: createForm.phone,
          role: createForm.role,
          status: createForm.status,
        })
        setTeam((current) => [mapTeamMember(created), ...current])
        setSuccessMessage("Team member created successfully.")
      }
      setCreateForm(defaultForm)
      setIsCreateOpen(false)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, createMode === "invite" ? "Unable to invite team member" : "Unable to create team member"))
    } finally {
      setIsSaving(false)
    }
  }

  const saveMember = async () => {
    if (!editingMember) return
    setIsSaving(true)
    setError("")
    try {
      const updated = await tenantCsrsApi.update(editingMember.id, editForm)
      setTeam((current) => current.map((member) => (member.id === updated.id ? mapTeamMember(updated) : member)))
      setEditingMember(null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to update team member"))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteMember = async (member: TeamMemberRow) => {
    if (!confirm(`Delete ${member.fullName}? This cannot be undone.`)) return
    setError("")
    try {
      await tenantCsrsApi.delete(member.id)
      setTeam((current) => current.filter((item) => item.id !== member.id))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to delete team member"))
    }
  }

  const openEdit = (member: TeamMemberRow) => {
    setEditingMember(member)
    setEditForm({
      fullName: member.fullName,
      email: member.email,
      phone: member.phone,
      role: member.role,
      status: member.status,
    })
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Management"
          title="Team"
        description="Manage the people working inside your ZayOS Workspace, including specialist finance and delivery roles."
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Team Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogDescription>Invite a teammate with a one-time setup link, or create the account directly if you need to hand them a password.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <Field label="Setup Method">
                  <Select value={createMode} onValueChange={(value: "invite" | "direct") => setCreateMode(value)}>
                    <SelectTrigger><SelectValue placeholder="Select setup method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invite">Invite with setup link</SelectItem>
                      <SelectItem value="direct">Create with password</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Full Name">
                  <Input value={createForm.fullName} onChange={(event) => setCreateForm({ ...createForm, fullName: event.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={createForm.phone || ""} onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })} />
                </Field>
                <Field label="Role">
                  <Select value={resolveWorkspaceRole(createForm.role)} onValueChange={(value) => setCreateForm({ ...createForm, role: backendRoleFromLabel(value) })}>
                    <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Owner">Owner</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                      <SelectItem value="CSR">CSR</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Delivery">Delivery</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {createMode === "direct" ? (
                  <>
                    <Field label="Password">
                      <Input
                        type="password"
                        value={createForm.password}
                        onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
                        placeholder={PASSWORD_POLICY_HINT}
                      />
                    </Field>
                    {directCreatePasswordError ? (
                      <p className="text-sm text-red-600 dark:text-red-300">{directCreatePasswordError}</p>
                    ) : null}
                    <Field label="Confirm Password">
                      <Input
                        type="password"
                        value={createForm.confirmPassword}
                        onChange={(event) => setCreateForm({ ...createForm, confirmPassword: event.target.value })}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                    The teammate will activate the account and choose their own password from a one-time invite link.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={createMember} disabled={directCreateDisabled}>
                  {isSaving ? "Saving..." : createMode === "invite" ? "Send Invite" : "Create Member"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <WorkspacePage>
        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
        {successMessage ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </div>
            {inviteResult?.invitation.invitationDelivery ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Invitation delivery: requested</p>
            ) : null}
          </div>
        ) : null}

        <WorkspaceSection
          title="Team Members"
          description="Invite teammates into the workspace with owner, admin, manager, staff, finance, and delivery access levels."
          action={
            <div className="flex items-center gap-2">
              <div className="relative hidden min-w-[280px] md:block">
                <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search team members" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Object.entries(roleDescriptions).map(([role, description]) => (
              <div key={role} className={`rounded-xl border p-4 ${roleTone[role as WorkspaceRoleLabel].card}`}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${roleTone[role as WorkspaceRoleLabel].dot}`} />
                  <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{role}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="mb-3 flex items-center gap-2">
                <MailPlus className="h-4 w-4 text-slate-500 dark:text-slate-300" />
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">Onboarding invite</p>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Use invite mode for new teammates so they can activate their own account with a one-time setup link instead of sharing a starter password.
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Online</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Loading team members...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Team members are unavailable right now.
                  </TableCell>
                </TableRow>
              ) : filteredTeam.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No team members found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTeam.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.fullName}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleTone[member.roleLabel].badge}>
                        {member.roleLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${statusTone[member.status]}`}>
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <span className={`h-2 w-2 rounded-full ${member.isOnline ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                        {member.isOnline ? "Online" : "Offline"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(member)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => deleteMember(member)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </WorkspaceSection>

        <Dialog open={Boolean(editingMember)} onOpenChange={(open) => !open && setEditingMember(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit Team Member</DialogTitle>
              <DialogDescription>Update role and contact details without changing workspace access rules.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label="Full Name">
                <Input value={editForm.fullName} onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={editForm.phone || ""} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} />
              </Field>
              <Field label="Role">
                    <Select value={resolveWorkspaceRole(editForm.role)} onValueChange={(value) => setEditForm({ ...editForm, role: backendRoleFromLabel(value) })}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Owner">Owner</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="CSR">CSR</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Delivery">Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value as TenantCsrDto["status"] })}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
              <Button onClick={saveMember} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </WorkspacePage>
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
