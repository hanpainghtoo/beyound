"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Copy, Edit, Eye, MailPlus, MoreHorizontal, Plus, Search as SearchIcon, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/workspace-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  getStoredSession,
  tenantAgentsApi,
  type CreateTenantAgentInput,
  type InviteTenantAgentInput,
  type TenantAgentDto,
} from "@/lib/api"
import { getPasswordPolicyError, PASSWORD_POLICY_HINT } from "@/lib/password-policy"
import { teamKeys } from "@/lib/queries/team"
import type { WorkspaceRole } from "@/lib/roles"
import { canDeleteTeamMember, canEditTeamMember } from "@/lib/team-permissions"
import { useWorkspacePresence } from "@/hooks/use-workspace-presence"
import { useI18n } from "@/components/providers/i18n-provider"

type TeamRole = WorkspaceRole

type TeamMemberRow = {
  id: string
  fullName: string
  email: string
  phone: string
  role: TeamRole
  roleLabelKey: string
  status: "active" | "inactive" | "suspended"
  isOnline: boolean
  lastSeenAt: string
}

type MemberField = "fullName" | "email" | "phone" | "password" | "confirmPassword"
type FieldErrors = Partial<Record<MemberField, string>>

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^[+]?[\d\s()-]{6,20}$/

// Validators return an error *key*, not copy: the same message is rendered in
// several places, and the text has to come from the active locale.
/**
 * Everything a field can put in `error`.
 *
 * Two shapes coexist on purpose:
 *  - dotted keys we own (`workspace.*`, `validation.*`), resolved with `t`
 *  - resolved English sentences from `lib/password-policy.ts`, resolved with
 *    `translate()` (or passed through verbatim when unmapped)
 */
type ValidationErrorKey =
  | "workspace.team.fields.fullNameRequired"
  | "workspace.team.fields.emailRequired"
  | "workspace.team.fields.invalidEmail"
  | "workspace.team.fields.invalidPhone"
  | "validation.confirmPasswordRequired"
  | "validation.passwordMismatch"
  | string

function validateFullName(value: string): ValidationErrorKey | "" {
  return value.trim() ? "" : "workspace.team.fields.fullNameRequired"
}

function validateEmail(value: string): ValidationErrorKey | "" {
  const email = value.trim()
  if (!email) return "workspace.team.fields.emailRequired"
  if (!EMAIL_REGEX.test(email)) return "workspace.team.fields.invalidEmail"
  return ""
}

function validatePhone(value: string): ValidationErrorKey | "" {
  const phone = value.trim()
  if (!phone) return ""
  if (!PHONE_REGEX.test(phone)) return "workspace.team.fields.invalidPhone"
  return ""
}

function collectFieldErrors(fields: Record<MemberField, ValidationErrorKey | "">): FieldErrors {
  const errors: FieldErrors = {}
  for (const [field, message] of Object.entries(fields)) {
    if (message) errors[field as MemberField] = message
  }
  return errors
}

/**
 * Presentation-only maps. Everything below is keyed by the role slug, never by
 * the English label: the label is what gets translated, and it was previously
 * doubling as the <Select> value and as the lookup key for `roleTone` /
 * `roleDescriptions`, so translating it would have broken role persistence and
 * the colour coding at the same time.
 */
const roleLabelKeys: Record<TeamRole, string> = {
  owner: "workspace.team.roles.owner",
  admin: "workspace.team.roles.admin",
  supervisor: "workspace.team.roles.supervisor",
  agent: "workspace.team.roles.agent",
  finance: "workspace.team.roles.finance",
  delivery: "workspace.team.roles.delivery",
}

const roleDescriptionKeys: Record<TeamRole, string> = {
  owner: "workspace.team.roleDescriptions.owner",
  admin: "workspace.team.roleDescriptions.admin",
  supervisor: "workspace.team.roleDescriptions.supervisor",
  agent: "workspace.team.roleDescriptions.agent",
  finance: "workspace.team.roleDescriptions.finance",
  delivery: "workspace.team.roleDescriptions.delivery",
}

const statusLabelKeys: Record<TeamMemberRow["status"], string> = {
  active: "workspace.team.statuses.active",
  inactive: "workspace.team.statuses.inactive",
  suspended: "workspace.team.statuses.suspended",
}

const roleTone: Record<TeamRole, { card: string; badge: string; dot: string }> = {
  owner: {
    card: "border-violet-200 bg-violet-50/70 dark:border-violet-500/20 dark:bg-violet-500/10",
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
    dot: "bg-violet-500",
  },
  admin: {
    card: "border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/20 dark:bg-indigo-500/10",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200",
    dot: "bg-indigo-500",
  },
  supervisor: {
    card: "border-blue-200 bg-blue-50/70 dark:border-blue-500/20 dark:bg-blue-500/10",
    badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
    dot: "bg-blue-500",
  },
  agent: {
    card: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  finance: {
    card: "border-amber-200 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10",
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  delivery: {
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

const roleLabelKey = (role?: TeamRole): string => roleLabelKeys[role ?? "agent"]

type TeamCreateForm = CreateTenantAgentInput & {
  confirmPassword: string
}

const defaultForm: TeamCreateForm = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  phone: "",
  role: "agent",
  status: "active",
}

function mapTeamMember(member: TenantAgentDto): TeamMemberRow {
  return {
    id: member.id,
    fullName: member.fullName,
    email: member.email,
    phone: member.phone || "",
    role: member.role,
    roleLabelKey: roleLabelKey(member.role),
    status: member.status,
    isOnline: member.isOnline,
    lastSeenAt: member.lastSeenAt || member.updatedAt,
  }
}

/**
 * Role labels are display-only now. `backendRoleFromLabel` used to reverse the
 * English label back into a slug because the <Select> stored the label as its
 * value; the Select now stores the slug, so the round trip is gone.
 */

function defaultInviteFormFromCreate(form: CreateTenantAgentInput): InviteTenantAgentInput {
  return {
    fullName: form.fullName.trim(),
    email: form.email.trim(),
    phone: form.phone?.trim(),
    role: form.role,
    status: form.status,
  }
}

import { useRouter } from "next/navigation"

export default function TeamPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { t, locale } = useI18n()

  /**
   * Locale-aware date rendering for invite-expiry copy.
   *
   * Two deliberate choices:
   *  - Latin digits (`-u-nu-latn`). `Intl` defaults `my` to Myanmar digits
   *   (၀၁၂), which would clash with the Latin digits used everywhere else.
   *  - Asia/Yangon, matching the workspace timezone default in settings, so a
   *   timestamp does not shift with the viewer's machine.
   */
  const formatTimestamp = (value: string) =>
    new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Yangon",
    }).format(new Date(value))
  const [team, setTeam] = useState<TeamMemberRow[]>([])
  const [query, setQuery] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMemberRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<TeamMemberRow | null>(null)
  const [createMode, setCreateMode] = useState<"invite" | "direct">("invite")
  const [createForm, setCreateForm] = useState<TeamCreateForm>(defaultForm)
  const [createErrors, setCreateErrors] = useState<FieldErrors>({})
  const [editForm, setEditForm] = useState<Omit<CreateTenantAgentInput, "password">>({
    fullName: "",
    email: "",
    phone: "",
    role: "agent",
    status: "active",
  })
  const [editErrors, setEditErrors] = useState<FieldErrors>({})
  const [viewer, setViewer] = useState<{ id: string; role: string } | null>(null)
  const { onlineUserIds, realtimeStatus } = useWorkspacePresence()

  const loadTeam = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const rows = await tenantAgentsApi.list()
      setTeam(rows.map(mapTeamMember))
    } catch (requestError) {
      setLoadError(true)
      toast.error(getApiErrorMessage(requestError, t("workspace.team.loadError")))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  useEffect(() => {
    const session = getStoredSession()
    setViewer(session?.user ? { id: session.user.id, role: session.user.role } : null)
  }, [])

  const filteredTeam = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return team
    return team.filter(
      (member) =>
        member.fullName.toLowerCase().includes(normalized) ||
        member.email.toLowerCase().includes(normalized) ||
        t(roleLabelKey(member.role)).toLowerCase().includes(normalized),
    )
  }, [query, team, t])

  const directCreatePasswordError = createMode === "direct" ? getPasswordPolicyError(createForm.password) : ""
  const directCreateDisabled =
    isSaving ||
    (createMode === "direct" &&
      (!!directCreatePasswordError || !createForm.confirmPassword.trim() || createForm.confirmPassword !== createForm.password))

  const createMember = async () => {
    const fields: Record<MemberField, ValidationErrorKey | ""> = {
      fullName: validateFullName(createForm.fullName),
      email: validateEmail(createForm.email),
      phone: validatePhone(createForm.phone || ""),
      password: createMode === "direct" ? getPasswordPolicyError(createForm.password) : "",
      confirmPassword:
        createMode === "direct"
          ? !createForm.confirmPassword.trim()
            ? "validation.confirmPasswordRequired"
            : createForm.confirmPassword !== createForm.password
              ? "validation.passwordMismatch"
              : ""
          : "",
    }
    const errors = collectFieldErrors(fields)
    setCreateErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.error(t("workspace.team.toasts.fixFields"))
      return
    }

    setIsSaving(true)
    try {
      if (createMode === "direct") {
        const passwordError = getPasswordPolicyError(createForm.password)
        if (passwordError) {
          throw new Error(passwordError)
        }
        if (!createForm.confirmPassword.trim()) {
          throw new Error("validation.confirmPasswordRequired")
        }
        if (createForm.confirmPassword !== createForm.password) {
          throw new Error("validation.passwordMismatch")
        }
      }

      if (createMode === "invite") {
        const invited = await tenantAgentsApi.invite(defaultInviteFormFromCreate(createForm))
        setTeam((current) => [mapTeamMember(invited.user), ...current])
        toast.success(t("workspace.team.toasts.inviteSent", { email: invited.user.email }), {
          description: t("workspace.team.toasts.inviteSentDescription"),
        })
      } else {
        const created = await tenantAgentsApi.create({
          fullName: createForm.fullName.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          phone: createForm.phone?.trim(),
          role: createForm.role,
          status: createForm.status,
        })
        setTeam((current) => [mapTeamMember(created), ...current])
        toast.success(t("workspace.team.toasts.created", { name: created.fullName }), {
          description:
            created.credentialsEmailDelivery === "delivered"
              ? t("workspace.team.toasts.createdDeliveredDescription", { email: created.email })
              : t("workspace.team.toasts.createdFailedDescription"),
        })
      }
      setCreateForm(defaultForm)
      setCreateErrors({})
      setIsCreateOpen(false)
      // Refresh dropdown consumers sharing the team options cache.
      void queryClient.invalidateQueries({ queryKey: teamKeys.all })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t(createMode === "invite" ? "workspace.team.toasts.unableInvite" : "workspace.team.toasts.unableCreate")))
    } finally {
      setIsSaving(false)
    }
  }

  const saveMember = async () => {
    if (!editingMember) return
    const errors = collectFieldErrors({
      fullName: validateFullName(editForm.fullName),
      email: validateEmail(editForm.email),
      phone: validatePhone(editForm.phone || ""),
      password: "",
      confirmPassword: "",
    })
    setEditErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.error(t("workspace.team.toasts.fixFields"))
      return
    }

    setIsSaving(true)
    try {
      const updated = await tenantAgentsApi.update(editingMember.id, {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone?.trim(),
        role: editForm.role,
        status: editForm.status,
      })
      setTeam((current) => current.map((member) => (member.id === updated.id ? mapTeamMember(updated) : member)))
      setEditingMember(null)
      toast.success(t("workspace.team.toasts.updated", { name: updated.fullName }))
      // Refresh dropdown consumers sharing the team options cache.
      void queryClient.invalidateQueries({ queryKey: teamKeys.all })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.team.toasts.unableUpdate")))
    } finally {
      setIsSaving(false)
    }
  }

  const executeDeleteMember = async () => {
    if (!pendingDelete) return
    const member = pendingDelete
    setPendingDelete(null)
    setIsDeleting(true)
    try {
      await tenantAgentsApi.delete(member.id)
      setTeam((current) => current.filter((item) => item.id !== member.id))
      toast.success(t("workspace.team.toasts.removed", { name: member.fullName }))
      // Refresh dropdown consumers sharing the team options cache.
      void queryClient.invalidateQueries({ queryKey: teamKeys.all })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.team.toasts.unableDelete")))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleResendInvite = async (member: TeamMemberRow) => {
    try {
      await tenantAgentsApi.resendInvite(member.id)
      toast.success(t("workspace.team.toasts.resent", { email: member.email }), {
        description: t("workspace.team.toasts.resentDescription"),
      })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.team.toasts.unableResend")))
    }
  }

  const handleCopyInviteLink = async (member: TeamMemberRow) => {
    try {
      // Reuses the resend endpoint: a fresh one-time token is issued (and the
      // email re-sent), then the link is copied for manual sharing.
      const result = await tenantAgentsApi.resendInvite(member.id)
      if (!result.inviteUrl) {
        toast.error(t("workspace.team.toasts.linkUnavailable"), {
          description: t("workspace.team.toasts.linkUnavailableDescription"),
        })
        return
      }
      await navigator.clipboard.writeText(result.inviteUrl)
      toast.success(t("workspace.team.toasts.linkCopied"), {
        description: t("workspace.team.toasts.linkCopiedDescription", {
          email: member.email,
          expires: formatTimestamp(result.expiresAt),
        }),
      })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.team.toasts.unableCopyLink")))
    }
  }

  const openEdit = (member: TeamMemberRow) => {
    setEditingMember(member)
    setEditErrors({})
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
        navKey="team"
        eyebrow={t("workspace.team.eyebrow")}
        title={t("workspace.team.title")}
        description={t("workspace.team.description")}
        realtimeStatus={realtimeStatus}
        actions={
          viewer?.role === "agent" ? null : (
          <Dialog
            open={isCreateOpen}
            onOpenChange={(open) => {
              setIsCreateOpen(open)
              if (!open) setCreateErrors({})
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("workspace.team.addMember")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{t("workspace.team.addMemberTitle")}</DialogTitle>
                <DialogDescription>{t("workspace.team.addMemberDescription")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <Field label={t("workspace.team.fields.setupMethod")}>
                  <Select value={createMode} onValueChange={(value: "invite" | "direct") => setCreateMode(value)}>
                    <SelectTrigger><SelectValue placeholder={t("workspace.team.fields.setupMethodPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invite">{t("workspace.team.fields.setupMethodInvite")}</SelectItem>
                      <SelectItem value="direct">{t("workspace.team.fields.setupMethodDirect")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("workspace.team.fields.fullName")} error={createErrors.fullName}>
                  <Input
                    value={createForm.fullName}
                    onChange={(event) => setCreateForm({ ...createForm, fullName: event.target.value })}
                    aria-invalid={Boolean(createErrors.fullName)}
                  />
                </Field>
                <Field label={t("workspace.team.fields.email")} error={createErrors.email}>
                  <Input
                    type="email"
                    value={createForm.email}
                    onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
                    aria-invalid={Boolean(createErrors.email)}
                  />
                </Field>
                <Field label={t("workspace.team.fields.phone")} error={createErrors.phone}>
                  <Input
                    value={createForm.phone || ""}
                    onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })}
                    aria-invalid={Boolean(createErrors.phone)}
                  />
                </Field>
                <Field label={t("workspace.team.fields.role")}>
                  <Select value={createForm.role} onValueChange={(value) => setCreateForm({ ...createForm, role: value as TeamRole })}>
                    <SelectTrigger><SelectValue placeholder={t("workspace.team.fields.rolePlaceholder")} /></SelectTrigger>
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
                {createMode === "direct" ? (
                  <>
                    <Field label={t("workspace.team.fields.password")} error={createErrors.password || directCreatePasswordError}>
                      <Input
                        type="password"
                        value={createForm.password}
                        onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
                        placeholder={PASSWORD_POLICY_HINT}
                        aria-invalid={Boolean(createErrors.password || directCreatePasswordError)}
                      />
                    </Field>
                    <Field label={t("workspace.team.fields.confirmPassword")} error={createErrors.confirmPassword}>
                      <Input
                        type="password"
                        value={createForm.confirmPassword}
                        onChange={(event) => setCreateForm({ ...createForm, confirmPassword: event.target.value })}
                        aria-invalid={Boolean(createErrors.confirmPassword)}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                    {t("workspace.team.inviteHint")}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={createMember} disabled={directCreateDisabled}>
                  {isSaving ? t("workspace.team.submit.saving") : createMode === "invite" ? t("workspace.team.submit.invite") : t("workspace.team.submit.create")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )
        }
      />

      <WorkspacePage>
        <WorkspaceSection
          title={t("workspace.team.sectionTitle")}
          description={t("workspace.team.sectionDescription")}
          action={
            <div className="flex items-center gap-2">
              <div className="relative hidden min-w-[280px] md:block">
                <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("workspace.team.searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Object.entries(roleDescriptionKeys).map(([slug, descriptionKey]) => (
              <div key={slug} className={`rounded-xl border p-4 ${roleTone[slug as TeamRole].card}`}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${roleTone[slug as TeamRole].dot}`} />
                  <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{t(roleLabelKey(slug as TeamRole))}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t(descriptionKey)}</p>
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="mb-3 flex items-center gap-2">
                <MailPlus className="h-4 w-4 text-slate-500 dark:text-slate-300" />
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{t("workspace.team.onboardingInviteTitle")}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("workspace.team.onboardingInviteDescription")}
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspace.team.columns.member")}</TableHead>
                <TableHead>{t("workspace.team.columns.email")}</TableHead>
                <TableHead>{t("workspace.team.columns.role")}</TableHead>
                <TableHead>{t("workspace.team.columns.status")}</TableHead>
                <TableHead>{t("workspace.team.columns.online")}</TableHead>
                <TableHead className="text-right">{t("workspace.team.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {t("workspace.team.loading")}
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-muted-foreground">{t("workspace.team.loadError")}</p>
                      <Button variant="outline" size="sm" onClick={() => void loadTeam()}>
                        {t("workspace.team.tryAgain")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredTeam.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {t("workspace.team.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTeam.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.fullName}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleTone[member.role].badge}>
                        {t(member.roleLabelKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {/* Was `{member.status}`, i.e. the raw API enum. The
                          `capitalize` class never applied because the value was
                          never shown through CSS text-transform in a useful way —
                          users read "active"/"suspended" verbatim. */}
                      <Badge variant="outline" className={statusTone[member.status]}>
                        {t(statusLabelKeys[member.status])}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <span className={`h-2 w-2 rounded-full ${onlineUserIds.has(member.id) ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                        {onlineUserIds.has(member.id) ? t("workspace.team.online") : t("workspace.team.offline")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const canEdit = canEditTeamMember(viewer?.role, viewer?.id, member)
                        const canDelete = canDeleteTeamMember(viewer?.role, member)
                        if (!canEdit && !canDelete) return null
                        return (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t("workspace.team.actions.ariaFor", { name: member.fullName })}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEdit ? (
                                <DropdownMenuItem onClick={() => openEdit(member)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  {t("workspace.team.actions.edit")}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem onClick={() => router.push(`/workspace/team/${member.id}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                {t("workspace.team.actions.view")}
                              </DropdownMenuItem>
                              {canEdit && member.status === "inactive" ? (
                                <DropdownMenuItem onClick={() => handleResendInvite(member)}>
                                  <MailPlus className="mr-2 h-4 w-4" />
                                  {t("workspace.team.actions.resendInvite")}
                                </DropdownMenuItem>
                              ) : null}
                              {canEdit && member.status === "inactive" ? (
                                <DropdownMenuItem onClick={() => handleCopyInviteLink(member)}>
                                  <Copy className="mr-2 h-4 w-4" />
                                  {t("workspace.team.actions.copyInviteLink")}
                                </DropdownMenuItem>
                              ) : null}
                              {canDelete ? (
                                <DropdownMenuItem className="text-red-600" onClick={() => setPendingDelete(member)}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("workspace.team.actions.delete")}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )
                      })()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </WorkspaceSection>

        <Dialog
          open={Boolean(editingMember)}
          onOpenChange={(open) => {
            if (!open) {
              setEditingMember(null)
              setEditErrors({})
            }
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("workspace.team.editTitle")}</DialogTitle>
              <DialogDescription>{t("workspace.team.editDescription")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label={t("workspace.team.fields.fullName")} error={editErrors.fullName}>
                <Input
                  value={editForm.fullName}
                  onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })}
                  aria-invalid={Boolean(editErrors.fullName)}
                />
              </Field>
              <Field label={t("workspace.team.fields.email")} error={editErrors.email}>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                  aria-invalid={Boolean(editErrors.email)}
                />
              </Field>
              <Field label={t("workspace.team.fields.phone")} error={editErrors.phone}>
                <Input
                  value={editForm.phone || ""}
                  onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                  aria-invalid={Boolean(editErrors.phone)}
                />
              </Field>
              <Field label={t("workspace.team.fields.role")}>
                <Select value={editForm.role} onValueChange={(value) => setEditForm({ ...editForm, role: value as TeamRole })}>
                  <SelectTrigger><SelectValue placeholder={t("workspace.team.fields.rolePlaceholder")} /></SelectTrigger>
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
              <Field label={t("workspace.team.fields.status")}>
                <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value as TenantAgentDto["status"] })}>
                  <SelectTrigger><SelectValue placeholder={t("workspace.team.fields.statusPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("workspace.team.statuses.active")}</SelectItem>
                    <SelectItem value="inactive">{t("workspace.team.statuses.inactive")}</SelectItem>
                    <SelectItem value="suspended">{t("workspace.team.statuses.suspended")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingMember(null)}>{t("common.cancel")}</Button>
              <Button onClick={saveMember} disabled={isSaving}>{isSaving ? t("workspace.team.submit.saving") : t("workspace.team.submit.save")}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(pendingDelete)}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("workspace.team.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("workspace.team.deleteDescription", { name: pendingDelete?.fullName ?? "" })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-600/90 focus-visible:ring-red-600/40 dark:bg-red-600 dark:text-white dark:hover:bg-red-600/90"
                onClick={() => void executeDeleteMember()}
                disabled={isDeleting}
              >
                {isDeleting ? t("workspace.team.submit.deleting") : t("workspace.team.submit.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </WorkspacePage>
    </>
  )
}

/**
 * `error` is a translation KEY: the validators return keys so the message
 * resolves in the active locale.
 *
 * A few errors are already-resolved English sentences from shared helpers
 * (`getPasswordPolicyError`), and those are passed through unchanged. `t` cannot
 * be used for both — it renders an unknown key as the key itself, which would
 * show "Password is too common..." as literal dotted text — so this uses
 * `translate()`, which resolves authored sentences through the English index and
 * returns anything unmapped verbatim.
 */
function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  const { t, translate } = useI18n()
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-300" role="alert">
          {error.startsWith("workspace.") ? t(error) : translate(error)}
        </p>
      ) : null}
    </div>
  )
}
