"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowRight, Building2, Plus, RefreshCw, Search } from "lucide-react"

import { BusinessBadge } from "@/components/business-ops-foundation"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  createPlatformTenant,
  getPlatformTenants,
  getStoredSession,
  getSubscriptionPlans,
  PlatformApiError,
  type CreatePlatformTenantInput,
  type CreatePlatformTenantResult,
  type PlatformTenantDto,
  type SubscriptionPlanDto,
} from "@/lib/api"

const initialForm: CreatePlatformTenantInput = {
  tenantCode: "",
  companyName: "",
  contactEmail: "",
  contactPerson: "",
  contactPhone: "",
  status: "pending",
  ownerFullName: "",
  ownerEmail: "",
  startWithTrial: false,
}

const canManageMerchants = (role?: string) => role === "super_admin" || role === "ops_admin"
const friendlyError = (error: unknown) => error instanceof Error ? error.message : "The merchant request could not be completed."

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<PlatformTenantDto[]>([])
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([])
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [form, setForm] = useState<CreatePlatformTenantInput>(initialForm)
  const [role, setRole] = useState<string>()
  const [createdResult, setCreatedResult] = useState<CreatePlatformTenantResult | null>(null)
  const canManage = canManageMerchants(role)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    setPermissionDenied(false)
    try {
      const [tenantResult, planResult] = await Promise.all([getPlatformTenants(), getSubscriptionPlans()])
      setMerchants(tenantResult.data)
      setPlans(planResult)
    } catch (requestError) {
      if (requestError instanceof PlatformApiError && requestError.status === 403) setPermissionDenied(true)
      setError(friendlyError(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setRole(getStoredSession()?.user.role)
    void load()
  }, [load])

  const filtered = useMemo(() => merchants.filter((merchant) => {
    const haystack = `${merchant.companyName} ${merchant.tenantCode} ${merchant.contactPerson || ""} ${merchant.contactEmail}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase()) && (status === "all" || merchant.status === status)
  }), [merchants, query, status])

  const planName = (id?: string | null) => plans.find((plan) => plan.id === id)?.name || "No plan"

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreateError("")
    setCreating(true)
    try {
      const created = await createPlatformTenant({
        ...form,
        tenantCode: form.tenantCode.trim().toUpperCase(),
        companyName: form.companyName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPerson: form.contactPerson?.trim() || undefined,
        contactPhone: form.contactPhone?.trim() || undefined,
        ownerFullName: form.ownerFullName?.trim() || undefined,
        ownerEmail: form.ownerEmail?.trim() || undefined,
        startWithTrial: form.startWithTrial || undefined,
      })
      setMerchants((current) => [created.tenant, ...current])
      setCreatedResult(created)
      setForm(initialForm)
      setCreateOpen(false)
    } catch (requestError) {
      setCreateError(friendlyError(requestError))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <ConsoleHeader eyebrow="Business Operations" title="Merchants" description="Live merchant directory for account status, plan, usage, billing, and support operations." actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button onClick={() => setCreateOpen(true)} disabled={!canManage} className="bg-sky-500 text-slate-950 hover:bg-sky-400"><Plus className="mr-2 h-4 w-4" />Create merchant</Button>
        </div>
      } />
      <ConsolePage>
        {!canManage && !permissionDenied ? <StateMessage title="Read-only access" message="Your platform role can inspect merchants but cannot create or change merchant status." /> : null}
        {error ? <StateMessage title={permissionDenied ? "Permission required" : "Merchant data unavailable"} message={error} destructive /> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Total merchants" value={loading ? "..." : merchants.length} note="Live tenant records" tone="blue" />
          <ConsoleStatCard label="Active" value={loading ? "..." : merchants.filter((item) => item.status === "active").length} note="Operating normally" tone="emerald" />
          <ConsoleStatCard label="Pending" value={loading ? "..." : merchants.filter((item) => item.status === "pending").length} note="Awaiting approval" tone="amber" />
          <ConsoleStatCard label="Suspended" value={loading ? "..." : merchants.filter((item) => item.status === "suspended").length} note="Access restricted" tone="rose" />
        </div>

        <ConsoleSection title="Filters" description="Filter the loaded merchant directory without substituting sample records.">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, code, owner, or email" className="border-white/10 bg-slate-950/40 pl-9 text-white" /></div>
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
          </div>
        </ConsoleSection>

        <ConsoleSection title="Merchant directory" description="Tenant identity and plan data returned by the guarded platform-admin API." action={<Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{filtered.length} shown</Badge>}>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table>
              <TableHeader className="bg-slate-950/70"><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="text-slate-300">Merchant</TableHead><TableHead className="text-slate-300">Contact</TableHead><TableHead className="text-slate-300">Plan</TableHead><TableHead className="text-slate-300">Status</TableHead><TableHead className="text-slate-300">Updated</TableHead><TableHead className="text-right text-slate-300">Action</TableHead></TableRow></TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400">Loading live merchants...</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400">Merchant records could not be loaded.</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400"><Building2 className="mx-auto mb-3 h-6 w-6" />{merchants.length ? "No merchants match these filters." : "No merchants have been created yet."}</TableCell></TableRow> : filtered.map((merchant) => (
                  <TableRow key={merchant.id} className="border-white/10 hover:bg-white/5"><TableCell><p className="font-medium text-white">{merchant.companyName}</p><p className="text-xs text-slate-500">{merchant.tenantCode}</p></TableCell><TableCell><p className="text-slate-300">{merchant.contactPerson || "No contact person"}</p><p className="text-xs text-slate-500">{merchant.contactEmail}</p></TableCell><TableCell className="text-slate-300">{planName(merchant.subscriptionPlanId)}</TableCell><TableCell><BusinessBadge value={merchant.status} /></TableCell><TableCell className="text-slate-300">{new Date(merchant.updatedAt).toLocaleDateString()}</TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm" className="text-sky-200 hover:bg-white/10 hover:text-white"><Link href={`/platform-console/merchants/${merchant.id}`}>Open detail<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>
      </ConsolePage>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Create merchant</DialogTitle>
            <DialogDescription className="text-slate-300">
              Creates a tenant workspace with an active owner user. A temporary password will be generated for the owner.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            {createError ? <StateMessage title="Create failed" message={createError} destructive /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tenant code" value={form.tenantCode} onChange={(v) => setForm({ ...form, tenantCode: v })} required />
              <Field label="Company name" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} required />
              <Field label="Contact email" value={form.contactEmail} onChange={(v) => setForm({ ...form, contactEmail: v })} type="email" required />
              <Field label="Contact person" value={form.contactPerson || ""} onChange={(v) => setForm({ ...form, contactPerson: v })} />
              <Field label="Contact phone" value={form.contactPhone || ""} onChange={(v) => setForm({ ...form, contactPhone: v })} />
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="mb-3 text-sm font-medium text-slate-400">Owner user (optional, falls back to contact info)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Owner full name" value={form.ownerFullName || ""} onChange={(v) => setForm({ ...form, ownerFullName: v })} />
                <Field label="Owner email" value={form.ownerEmail || ""} onChange={(v) => setForm({ ...form, ownerEmail: v })} type="email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Trial onboarding</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm({ ...form, startWithTrial: !form.startWithTrial })}
                className={form.startWithTrial ? "border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30" : "border-white/10 bg-slate-950/40 text-slate-300 hover:bg-white/10"}
              >
                {form.startWithTrial ? "✓ Start with trial" : "Start with trial"}
              </Button>
              <p className="text-xs text-slate-400">
                Provisions the configured trial plan (duration is set server-side). Business plans are not assigned here — the merchant requests and pays for a plan from the Workspace billing page, then you activate it.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="border-white/10 bg-white/5">Cancel</Button>
              <Button type="submit" disabled={creating} className="bg-sky-500 text-slate-950 hover:bg-sky-400">{creating ? "Creating..." : "Create merchant"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdResult} onOpenChange={() => setCreatedResult(null)}>
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Merchant created</DialogTitle>
            <DialogDescription className="text-slate-300">The workspace and owner user have been created.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <p className="mb-2 text-sm font-medium text-emerald-200">Temporary password</p>
              <code className="block rounded-lg bg-slate-950 p-3 font-mono text-lg text-white">{createdResult?.temporaryPassword}</code>
              <p className="mt-2 text-xs text-emerald-300/70">This password will not be shown again. Share it securely with the merchant owner.</p>
            </div>
            <div className="text-sm text-slate-400">
              <p><strong className="text-slate-300">Merchant:</strong> {createdResult?.tenant.companyName}</p>
              <p><strong className="text-slate-300">Owner email:</strong> {createdResult?.tenant.contactEmail}</p>
              {createdResult?.tenant.subscriptionEndDate ? (
                <p className="mt-1 text-amber-200">
                  Trial provisioned — ends {new Date(createdResult.tenant.subscriptionEndDate).toLocaleString()}.
                </p>
              ) : null}
              {createdResult?.inviteSent ? <p className="mt-2 text-emerald-300">Welcome email sent to the owner.</p> : <p className="mt-2 text-amber-300">Email delivery unavailable — share the password manually.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedResult(null)} className="bg-sky-500 text-slate-950 hover:bg-sky-400">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}

function StateMessage({ title, message, destructive = false }: { title: string; message: string; destructive?: boolean }) { return <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${destructive ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">{title}</p><p className="mt-1 opacity-80">{message}</p></div></div> }
function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { const id = label.toLowerCase().replaceAll(" ", "-"); return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="border-white/10 bg-slate-950/40" /></div> }
