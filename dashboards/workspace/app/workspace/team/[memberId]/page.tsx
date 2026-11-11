"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, ArrowLeft, Copy, Loader2, Mail, MailPlus, Phone, Settings, Trash2, User } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Badge as BadgeUI } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { tenantAgentsApi, tenantAuditLogsApi, getApiErrorMessage, getStoredSession, type TenantAgentDto, type TenantAuditLogDto } from "@/lib/api"
import { canEditTeamMember, canDeleteTeamMember } from "@/lib/team-permissions"
import type { WorkspaceRole } from "@/lib/roles"
import { useWorkspacePresence } from "@/hooks/use-workspace-presence"
import { useI18n } from "@/components/providers/i18n-provider"

type MemberRole = WorkspaceRole
type MemberStatus = "active" | "inactive" | "suspended"

/** Rows per audit page. Kept modest so the scrollable table stays usable. */
const AUDIT_PAGE_SIZE = 20

const roleLabelKeys: Record<MemberRole, string> = {
  owner: "workspace.team.roles.owner",
  admin: "workspace.team.roles.admin",
  supervisor: "workspace.team.roles.supervisor",
  agent: "workspace.team.roles.agent",
  finance: "workspace.team.roles.finance",
  delivery: "workspace.team.roles.delivery",
}

const statusLabelKeys: Record<MemberStatus, string> = {
  active: "workspace.team.statuses.active",
  inactive: "workspace.team.statuses.inactive",
  suspended: "workspace.team.statuses.suspended",
}

/** Keyed by the role slug, not the English label: the label is display-only
 * and is what gets translated. */
const roleTone: Record<MemberRole, { badge: string; dot: string }> = {
  owner: {
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
    dot: "bg-violet-500",
  },
  admin: {
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200",
    dot: "bg-indigo-500",
  },
  supervisor: {
    badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
    dot: "bg-blue-500",
  },
  agent: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  finance: {
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  delivery: {
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200",
    dot: "bg-cyan-500",
  },
}

const statusTone: Record<MemberStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  inactive: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  suspended: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
}

/**
 * Locale-aware date rendering.
 *
 * Latin digits (`-u-nu-latn`) so numbers match the rest of the product instead
 * of switching to Myanmar digits (၀၁၂), and Asia/Yangon to match the workspace
 * timezone default so timestamps do not shift with the viewer's machine.
 */
function makeDateFormatter(locale: string) {
  const formatter = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Yangon",
  })
  return (value: string) => formatter.format(new Date(value))
}

function roleLabelKey(role?: MemberRole): string {
  return roleLabelKeys[role ?? "agent"]
}

/**
 * Role labels are display-only now. `backendRoleFromLabel` used to reverse the
 * English label back into a slug because the <Select> stored the label as its
 * value; the Select now stores the slug, so the round trip is gone.
 */

/**
 * `error` is a translation KEY (the validators return `workspace.*` keys), so
 * it resolves through `t`.
 */
function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-sm text-red-600 dark:text-red-300" role="alert">{t(error)}</p> : null}
    </div>
  )
}

type AuditMeta = {
  page: number
  totalPages: number
  total: number
  hasNext: boolean
  hasPrev: boolean
}

function AuditPager({ meta, onPageChange }: { meta: AuditMeta; onPageChange: (page: number) => void }) {
  const { t } = useI18n()
  if (meta.total === 0) return null
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        {t("workspace.member.auditPageOf", { page: meta.page, total: meta.totalPages })}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => onPageChange(meta.page - 1)}>
          {t("common.previous")}
        </Button>
        <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => onPageChange(meta.page + 1)}>
          {t("common.next")}
        </Button>
      </div>
    </div>
  )
}

function MemberDetailPageView() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const params = useParams()
  const memberId = params.memberId as string
  const searchParams = useSearchParams()
  const { realtimeStatus } = useWorkspacePresence()
  const [activeTab, setActiveTab] = useState<"profile" | "audit">(
    searchParams.get("tab") === "audit" ? "audit" : "profile",
  )
  const [member, setMember] = useState<TenantAgentDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [auditLogs, setAuditLogs] = useState<TenantAuditLogDto[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditPage, setAuditPage] = useState(1)
  const [auditMeta, setAuditMeta] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
    hasNext: false,
    hasPrev: false,
  })
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "agent" as MemberRole,
    status: "active" as MemberStatus,
  })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [viewer, setViewer] = useState<{ id: string; role: string } | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadMember = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await tenantAgentsApi.get(memberId)
      setMember(data)
      setEditForm({
        fullName: data.fullName,
        email: data.email,
        phone: data.phone || "",
        role: data.role as MemberRole,
        status: data.status as MemberStatus,
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.member.toasts.unableLoad")))
      router.push("/workspace/team")
    } finally {
      setIsLoading(false)
    }
  }, [memberId, router, t])

  const loadAuditLogs = useCallback(async (page: number) => {
    setAuditLoading(true)
    try {
      const result = await tenantAuditLogsApi.list({ userId: memberId, limit: AUDIT_PAGE_SIZE, page })
      setAuditLogs(result.data)
      setAuditMeta({
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.member.toasts.unableLoadAudit")))
    } finally {
      setAuditLoading(false)
    }
  }, [memberId, t])

  useEffect(() => {
    void loadMember()
  }, [loadMember])

  useEffect(() => {
    if (member) {
      void loadAuditLogs(auditPage)
    }
  }, [member, loadAuditLogs, auditPage])

  useEffect(() => {
    const session = getStoredSession()
    setViewer(session?.user ? { id: session.user.id, role: session.user.role } : null)
  }, [])

  const canEdit = member && viewer ? canEditTeamMember(viewer.role, viewer.id, { id: member.id, role: member.role }) : false
  const canDelete = member && viewer ? canDeleteTeamMember(viewer.role, { id: member.id, role: member.role }) : false

  const handleBack = () => {
    // Return to wherever the member was opened from (team list or audit),
    // falling back to the team list for deep links / direct visits.
    if (window.history.length > 1) router.back()
    else router.push("/workspace/team")
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    )
  }

  if (!member) {
    return null
  }

  const formatDateTime = makeDateFormatter(locale)
  const roleLabelKeyValue = roleLabelKey(member.role)
  const roleStyle = roleTone[member.role] || roleTone.agent
  const statusStyle = statusTone[member.status]

  const handleSave = async () => {
    const errors: Record<string, string> = {}
    if (!editForm.fullName.trim()) errors.fullName = "workspace.team.fields.fullNameRequired"
    if (!editForm.email.trim()) errors.email = "workspace.team.fields.emailRequired"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email.trim())) errors.email = "workspace.team.fields.invalidEmail"
    if (editForm.phone && !/^[+]?[\d\s()-]{6,20}$/.test(editForm.phone)) errors.phone = "workspace.team.fields.invalidPhone"

    setEditErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSaving(true)
    try {
      const updated = await tenantAgentsApi.update(member.id, {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone?.trim(),
        role: editForm.role,
        status: editForm.status,
      })
      setMember(updated)
      setEditForm({
        fullName: updated.fullName,
        email: updated.email,
        phone: updated.phone || "",
        role: updated.role as MemberRole,
        status: updated.status as MemberStatus,
      })
      setIsEditing(false)
      toast.success(t("workspace.member.toasts.updated", { name: updated.fullName }))
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.member.toasts.unableUpdate")))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await tenantAgentsApi.delete(member.id)
      toast.success(t("workspace.member.toasts.removed", { name: member.fullName }))
      router.push("/workspace/team")
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.member.toasts.unableDelete")))
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleResendInvite = async () => {
    if (!member) return
    try {
      await tenantAgentsApi.resendInvite(member.id)
      toast.success(t("workspace.member.toasts.resent", { email: member.email }), {
        description: t("workspace.member.toasts.resentDescription"),
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.member.toasts.unableResend")))
    }
  }

  const handleCopyInviteLink = async () => {
    if (!member) return
    try {
      // Reuses the resend endpoint: a fresh one-time token is issued (and the
      // email re-sent), then the link is copied for manual sharing.
      const result = await tenantAgentsApi.resendInvite(member.id)
      if (!result.inviteUrl) {
        toast.error(t("workspace.member.toasts.linkUnavailable"), {
          description: t("workspace.member.toasts.linkUnavailableDescription"),
        })
        return
      }
      await navigator.clipboard.writeText(result.inviteUrl)
      toast.success(t("workspace.member.toasts.linkCopied"), {
        description: t("workspace.member.toasts.linkCopiedDescription", {
          email: member.email,
          expires: formatDateTime(result.expiresAt),
        }),
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to copy invitation link"))
    }
  }

  // Account status and live presence are independent signals: a suspended
  // member can still be connected, and an online member can still be
  // suspended. These used to share one helper, so the status badge dot
  // reflected presence and presence flipped with account status.
  const getStatusDot = () => {
    if (member.status === "suspended") return <span className="h-2 w-2 rounded-full bg-red-500" />
    if (member.status === "inactive") return <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
    return <span className="h-2 w-2 rounded-full bg-emerald-500" />
  }

  return (
    <>
      <WorkspaceHeader
        navKey="team"
        eyebrow={t("workspace.member.eyebrow")}
        title={member.fullName}
        description={t("workspace.member.summaryTemplate", {
          role: t(roleLabelKeyValue),
          status: t(statusLabelKeys[member.status]),
        })}
        realtimeStatus={realtimeStatus}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/workspace/audit" className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg dark:text-slate-200 dark:hover:bg-slate-800">
              {t("workspace.member.auditCardTitle")}
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <Button variant="outline" size="sm" className="mb-4" onClick={handleBack}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          {t("workspace.member.backToTeam")}
        </Button>

        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full bg-slate-100 flex items-center justify-center dark:bg-slate-800">
                    <User className="h-10 w-10 text-slate-500 dark:text-slate-400" />
                  </div>
                  <span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 ${roleStyle.dot}`} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{member.fullName}</h1>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {member.email}
                    </span>
                    {member.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {member.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <BadgeUI variant="outline" className={roleStyle.badge}>
                    {t(roleLabelKeyValue)}
                    <span className={`ml-1.5 h-1.5 w-1.5 rounded-full ${roleStyle.dot}`} />
                  </BadgeUI>
                  <BadgeUI variant="outline" className={statusStyle}>
                    {getStatusDot()}
                    {t(statusLabelKeys[member.status])}
                  </BadgeUI>
                </div>
                {viewer && viewer.role !== "agent" && (
                  <div className="flex gap-2">
                    {member.status === "inactive" && canEdit && (
                      <Button variant="outline" onClick={handleCopyInviteLink}>
                        <Copy className="mr-2 h-4 w-4" />
                        {t("workspace.member.actions.copyInviteLink")}
                      </Button>
                    )}
                    {member.status === "inactive" && canEdit && (
                      <Button variant="outline" onClick={handleResendInvite}>
                        <MailPlus className="mr-2 h-4 w-4" />
                        {t("workspace.member.actions.resendInvite")}
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("workspace.member.actions.delete")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "profile" | "audit")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">{t("workspace.member.profileTab")}</TabsTrigger>
            <TabsTrigger value="audit">{t("workspace.member.auditTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6 space-y-6">
            {/* Edit Form (when editing) */}
            {isEditing && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("workspace.member.editCardTitle")}</CardTitle>
                  <CardDescription>{t("workspace.member.editCardDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("workspace.member.labels.fullName")} error={editErrors.fullName}>
                        <Input
                          value={editForm.fullName}
                          onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                          aria-invalid={Boolean(editErrors.fullName)}
                        />
                      </Field>
                      <Field label={t("workspace.member.labels.email")} error={editErrors.email}>
                        <Input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          aria-invalid={Boolean(editErrors.email)}
                        />
                      </Field>
                      <Field label={t("workspace.member.labels.phone")} error={editErrors.phone}>
                        <Input
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          aria-invalid={Boolean(editErrors.phone)}
                        />
                      </Field>
                      <Field label={t("workspace.member.labels.role")} error={editErrors.role}>
                        <Select
                          value={editForm.role}
                          onValueChange={(value) => setEditForm({ ...editForm, role: value as MemberRole })}
                        >
                          <SelectTrigger><SelectValue placeholder={t("workspace.member.labels.rolePlaceholder")} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">{t("workspace.team.roles.owner")}</SelectItem>
                            <SelectItem value="admin">{t("workspace.team.roles.admin")}</SelectItem>
                            <SelectItem value="supervisor">{t("workspace.team.roles.supervisor")}</SelectItem>
                            <SelectItem value="agent">{t("workspace.team.roles.agent")}</SelectItem>
                            <SelectItem value="finance">{t("workspace.team.roles.finance")}</SelectItem>
                            <SelectItem value="delivery">{t("workspace.team.roles.delivery")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={t("workspace.member.labels.status")} error={editErrors.status}>
                        <Select
                          value={editForm.status}
                          onValueChange={(value) => setEditForm({ ...editForm, status: value as MemberStatus })}
                        >
                          <SelectTrigger><SelectValue placeholder={t("workspace.member.labels.statusPlaceholder")} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">{t("workspace.team.statuses.active")}</SelectItem>
                            <SelectItem value="inactive">{t("workspace.team.statuses.inactive")}</SelectItem>
                            <SelectItem value="suspended">{t("workspace.team.statuses.suspended")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>{t("common.cancel")}</Button>
                      <Button type="submit" disabled={isSaving}>{isSaving ? t("workspace.member.submit.saving") : t("workspace.member.submit.save")}</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Profile Details (read-only) */}
            {!isEditing && (
              <div className="max-h-[calc(100svh-16rem)] overflow-y-auto pr-2">
                <Card className="mb-6">
                  <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {t("workspace.member.contactCard")}
                    </CardTitle>
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        <Settings className="mr-1.5 h-3.5 w-3.5" />
                        {t("workspace.member.actions.edit")}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Contact Information */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("workspace.member.labels.fullName")}</label>
                        <p className="text-lg font-medium text-slate-950 dark:text-white">{member.fullName}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("workspace.member.labels.email")}</label>
                        <p className="text-lg font-medium text-slate-950 dark:text-white">{member.email}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("workspace.member.labels.phone")}</label>
                        <p className="text-lg font-medium text-slate-950 dark:text-white">{member.phone || t("workspace.member.notProvided")}</p>
                      </div>
                    </div>

                    {/* Role */}
                    <div className="border-t pt-6 space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("workspace.member.labels.role")}</label>
                        <BadgeUI variant="outline" className={`inline-flex items-center gap-1.5 ${roleStyle.badge}`}>
                          {t(roleLabelKeyValue)}
                          <span className={`h-2 w-2 rounded-full ${roleStyle.dot}`} />
                        </BadgeUI>
                      </div>
                    </div>

                    {/* Created */}
                    <div className="border-t pt-6">
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("workspace.member.labels.created")}</label>
                        <p className="text-lg font-medium text-slate-950 dark:text-white">{formatDateTime(member.createdAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Separator className="my-6" />

            {/* Audit Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {t("workspace.member.auditCardTitle")}
                </CardTitle>
                <CardDescription>
                  {t("workspace.member.auditCardDescription", { count: auditMeta.total })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <Activity className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p>{t("workspace.member.noAuditEvents")}</p>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.time")}</TableHead>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.action")}</TableHead>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.resource")}</TableHead>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.ipAddress")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">{formatDateTime(log.createdAt)}</TableCell>
                              <TableCell className="text-sm font-medium text-slate-950 dark:text-white capitalize">{log.action.replace(/_/g, " ")}</TableCell>
                              <TableCell className="text-sm text-slate-600 dark:text-slate-400 capitalize">{log.resourceType}</TableCell>
                              <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-400">{log.ipAddress || t("workspace.member.notRecorded")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <AuditPager meta={auditMeta} onPageChange={setAuditPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {t("workspace.member.fullAuditTitle")}
                </CardTitle>
                <CardDescription>
                  {t("workspace.member.fullAuditDescription", { count: auditMeta.total })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <Activity className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p>{t("workspace.member.noAuditEventsShort")}</p>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.time")}</TableHead>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.action")}</TableHead>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.resourceType")}</TableHead>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.resourceId")}</TableHead>
                            <TableHead className="sticky top-0 bg-slate-50 dark:bg-slate-900">{t("workspace.member.columns.ipAddress")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">{formatDateTime(log.createdAt)}</TableCell>
                              <TableCell className="text-sm font-medium text-slate-950 dark:text-white capitalize">{log.action.replace(/_/g, " ")}</TableCell>
                              <TableCell className="text-sm text-slate-600 dark:text-slate-400 capitalize">{log.resourceType}</TableCell>
                              {/* This column is labelled Resource ID, so it must render
                                  the affected resource, not the audit row's own id. */}
                              <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                                {log.resourceId ? `${log.resourceId.slice(0, 8)}…` : t("workspace.member.notRecorded")}
                              </TableCell>
                              <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-400">{log.ipAddress || t("workspace.member.notRecorded")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <AuditPager meta={auditMeta} onPageChange={setAuditPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.member.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.member.deleteDescription", { name: member.fullName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? t("workspace.member.submit.deleting") : t("workspace.member.submit.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function MemberDetailPage() {
  return <MemberDetailPageView />
}