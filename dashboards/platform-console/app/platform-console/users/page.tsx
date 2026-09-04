"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, History, KeyRound, MoreHorizontal, ShieldBan, UserCog, UserPlus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { getPlatformAdmins, PlatformApiError, updatePlatformAdminStatus, type PlatformAdminDto } from "@/lib/api"

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Platform operators could not be loaded."
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Never"
const roleLabel = (role: string) => role.replaceAll("_", " ")
const statusClass = (status: string) => status === "active"
  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
  : status === "suspended"
    ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
    : "border-white/10 bg-white/5 text-slate-400"

export default function Page() {
  const [users, setUsers] = useState<PlatformAdminDto[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState("")
  const [error, setError] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    setPermissionDenied(false)
    try {
      setUsers(await getPlatformAdmins())
    } catch (requestError) {
      if (requestError instanceof PlatformApiError && requestError.status === 403) setPermissionDenied(true)
      setError(errorMessage(requestError))
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeCount = useMemo(() => users.filter((user) => user.status === "active").length, [users])
  const suspendedCount = useMemo(() => users.filter((user) => user.status === "suspended").length, [users])

  const changeStatus = async (user: PlatformAdminDto) => {
    const nextStatus = user.status === "active" ? "suspended" : "active"
    setSavingId(user.id)
    setError("")
    try {
      const updated = await updatePlatformAdminStatus(user.id, nextStatus)
      setUsers((current) => current.map((candidate) => candidate.id === updated.id ? { ...candidate, ...updated } : candidate))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSavingId("")
    }
  }

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Internal Operators"
        description="Internal ZayOS/KME platform staff only: admin, finance, support, security, and operations access. Tenant workspace users are managed from tenant detail."
        actions={<Button variant="outline" disabled className="border-white/10 bg-white/5 text-slate-400"><UserPlus className="mr-2 h-4 w-4" />Invite unavailable</Button>}
      />
      <ConsolePage>
        {error ? <StateMessage title={permissionDenied ? "Super admin permission required" : "Operator data unavailable"} message={error} destructive /> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <ConsoleStatCard label="Operators" value={loading ? "..." : users.length} note="Live platform admin accounts" tone="blue" />
          <ConsoleStatCard label="Active" value={loading ? "..." : activeCount} note="Can access the console" tone="emerald" />
          <ConsoleStatCard label="Suspended" value={loading ? "..." : suspendedCount} note="Access blocked" tone="rose" />
        </div>
        <ConsoleSection title="Operator access" description="Platform operator role, access state, and recent sign-in data from the guarded admin API.">
          <div className="space-y-3">
            {loading ? <StatePanel message="Loading live platform operators..." /> : error ? <StatePanel message="Platform operators could not be loaded." /> : users.length === 0 ? <StatePanel message="No platform operators were returned by the API." /> : users.map((user) => (
              <div key={user.id} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[1.1fr_1fr_.8fr_.8fr_auto] md:items-center">
                <div>
                  <p className="font-medium text-white">{user.fullName}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Role</p>
                  <p className="mt-1 text-sm capitalize text-white">{roleLabel(user.role)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Last login</p>
                  <p className="mt-1 text-sm text-white">{formatDateTime(user.lastLoginAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  <Badge variant="outline" className={`mt-1 ${statusClass(user.status)}`}>{user.status}</Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${user.fullName}`} className="text-slate-300 hover:bg-white/10 hover:text-white"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem disabled><UserCog className="mr-2 h-4 w-4" />Role change unavailable</DropdownMenuItem>
                    <DropdownMenuItem disabled><KeyRound className="mr-2 h-4 w-4" />MFA reset unavailable</DropdownMenuItem>
                    <DropdownMenuItem disabled><History className="mr-2 h-4 w-4" />Use Audit Logs page</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={savingId === user.id} className={user.status === "active" ? "text-rose-600" : "text-emerald-600"} onClick={() => void changeStatus(user)}>
                      <ShieldBan className="mr-2 h-4 w-4" />{savingId === user.id ? "Saving..." : user.status === "active" ? "Suspend access" : "Activate access"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </ConsoleSection>
      </ConsolePage>
    </>
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
