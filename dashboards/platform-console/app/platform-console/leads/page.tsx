"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Bell, CheckCircle2, RefreshCw, Search } from "lucide-react"

import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  approvePlatformPlanChangeRequest,
  getPlatformLeads,
  getStoredSession,
  rejectPlatformPlanChangeRequest,
  updatePlatformLead,
  type PlatformLeadDto,
} from "@/lib/api"

const leadStatuses = ["all", "new", "contacted", "qualified", "converted", "closed"] as const
const leadIntents = ["all", "demo", "sales", "support", "general", "trial"] as const
const canManageLeads = (role?: string) => role === "super_admin" || role === "ops_admin"
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not recorded"
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unable to load leads."

export default function PlatformLeadsPage() {
  const [role, setRole] = useState<string>()
  const [leads, setLeads] = useState<PlatformLeadDto[]>([])
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<(typeof leadStatuses)[number]>("all")
  const [intent, setIntent] = useState<(typeof leadIntents)[number]>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await getPlatformLeads({ status, intent, search: query })
      setLeads(result.data)
    } catch (requestError) {
      setError(errorMessage(requestError))
      setLeads([])
    } finally {
      setLoading(false)
    }
  }, [intent, query, status])

  useEffect(() => {
    setRole(getStoredSession()?.user.role)
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timeout)
  }, [load])

  const stats = useMemo(() => ({
    total: leads.length,
    newLeads: leads.filter((lead) => lead.status === "new").length,
    demos: leads.filter((lead) => lead.intent === "demo").length,
    converted: leads.filter((lead) => lead.status === "converted").length,
  }), [leads])

  const markContacted = async (lead: PlatformLeadDto) => {
    setSavingId(lead.id)
    try {
      const updated = await updatePlatformLead(lead.id, { status: "contacted", note: "Marked contacted from Platform Console." })
      setLeads((current) => current.map((item) => item.id === lead.id ? updated : item))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSavingId(null)
    }
  }

  const reviewPlanChange = async (lead: PlatformLeadDto, outcome: "approve" | "reject") => {
    setSavingId(lead.id)
    try {
      const updated = outcome === "approve"
        ? await approvePlatformPlanChangeRequest(lead.id, "Reviewed from Platform Console.")
        : await rejectPlatformPlanChangeRequest(lead.id, "Rejected from Platform Console.")
      setLeads((current) => current.map((item) => item.id === lead.id ? updated : item))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSavingId(null)
    }
  }

  const allowed = canManageLeads(role)

  return (
    <>
      <ConsoleHeader
        eyebrow="Growth Operations"
        title="Leads"
        description="Demo, contact, and trial requests captured from the public site."
        actions={<Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}
      />
      <ConsolePage>
        {role && !allowed ? <StateMessage title="Lead access required" message="Your platform role is not allowed to view captured leads." destructive /> : null}
        {error ? <StateMessage title="Lead queue unavailable" message={error} destructive /> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Loaded leads" value={loading ? "..." : stats.total} note="Current filtered queue" tone="blue" />
          <ConsoleStatCard label="New" value={loading ? "..." : stats.newLeads} note="Awaiting first follow-up" tone="amber" />
          <ConsoleStatCard label="Demo requests" value={loading ? "..." : stats.demos} note="Intent equals demo" tone="emerald" />
          <ConsoleStatCard label="Converted" value={loading ? "..." : stats.converted} note="Marked converted" tone="cyan" />
        </div>

        <ConsoleSection title="Filters" description="Search by requester, company, or email.">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" className="border-white/10 bg-slate-950/40 pl-9 text-white" /></div>
            <Select value={status} onValueChange={(value) => setStatus(value as (typeof leadStatuses)[number])}><SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue /></SelectTrigger><SelectContent>{leadStatuses.map((item) => <SelectItem key={item} value={item}>{item === "all" ? "All statuses" : item}</SelectItem>)}</SelectContent></Select>
            <Select value={intent} onValueChange={(value) => setIntent(value as (typeof leadIntents)[number])}><SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue /></SelectTrigger><SelectContent>{leadIntents.map((item) => <SelectItem key={item} value={item}>{item === "all" ? "All intents" : item}</SelectItem>)}</SelectContent></Select>
          </div>
        </ConsoleSection>

        <ConsoleSection title="Lead queue" description="Requests are persisted even when webhook delivery is not configured.">
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table className="min-w-[1080px]">
              <TableHeader className="bg-slate-950/70"><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="text-slate-300">Requester</TableHead><TableHead className="text-slate-300">Intent</TableHead><TableHead className="text-slate-300">Context</TableHead><TableHead className="text-slate-300">Message</TableHead><TableHead className="text-slate-300">Captured</TableHead><TableHead className="text-right text-slate-300">Action</TableHead></TableRow></TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400">Loading captured leads...</TableCell></TableRow> : !allowed ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400">Lead queue access is restricted.</TableCell></TableRow> : leads.length === 0 ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400"><Bell className="mx-auto mb-3 h-6 w-6" />No leads match these filters.</TableCell></TableRow> : leads.map((lead) => {
                  const isPlanChange = lead.source === "workspace-plan-change" && lead.metadata?.requestType === "plan_change"
                  const reviewOutcome = typeof lead.metadata?.reviewOutcome === "string" ? lead.metadata.reviewOutcome : null
                  return (
                  <TableRow key={lead.id} className="border-white/10 hover:bg-white/5">
                    <TableCell><p className="font-medium text-white">{lead.fullName}</p><p className="text-xs text-slate-400">{lead.companyName}</p><a href={`mailto:${lead.emailAddress}`} className="text-xs text-sky-300 hover:text-sky-200">{lead.emailAddress}</a>{lead.phoneNumber ? <p className="text-xs text-slate-500">{lead.phoneNumber}</p> : null}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1"><Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-100">{lead.intent}</Badge><Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{lead.status}</Badge>{isPlanChange ? <Badge variant="outline" className="border-indigo-400/30 bg-indigo-500/10 text-indigo-100">{reviewOutcome === "approved" ? "approved" : reviewOutcome === "rejected" ? "rejected" : "plan change"}</Badge> : null}</div><p className="mt-2 text-xs text-slate-500">{lead.source || "public-site"}</p></TableCell>
                    <TableCell className="text-sm text-slate-300"><p>{lead.businessType || "Business type not set"}</p><p className="text-xs text-slate-500">{lead.teamSize || "Team size not set"}</p><p className="text-xs text-slate-500">{lead.interestedIn || "Interest not set"}</p></TableCell>
                    <TableCell className="max-w-72 whitespace-pre-wrap text-sm text-slate-300">{lead.message || "No message provided."}</TableCell>
                    <TableCell className="text-sm text-slate-300">{formatDate(lead.createdAt)}{lead.contactedAt ? <p className="mt-1 text-xs text-emerald-300">Contacted {formatDate(lead.contactedAt)}</p> : null}</TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2">{lead.status === "new" ? <Button size="sm" onClick={() => void markContacted(lead)} disabled={savingId === lead.id} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><CheckCircle2 className="mr-2 h-4 w-4" />{savingId === lead.id ? "Saving..." : "Mark contacted"}</Button> : null}{isPlanChange && !reviewOutcome && lead.status !== "closed" && lead.status !== "converted" ? <Button size="sm" variant="outline" onClick={() => void reviewPlanChange(lead, "approve")} disabled={savingId === lead.id} className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20">{savingId === lead.id ? "Saving..." : "Approve"}</Button> : null}{isPlanChange && !reviewOutcome && lead.status !== "closed" && lead.status !== "converted" ? <Button size="sm" variant="outline" onClick={() => void reviewPlanChange(lead, "reject")} disabled={savingId === lead.id} className="border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20">{savingId === lead.id ? "Saving..." : "Reject"}</Button> : null}</div></TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>
      </ConsolePage>
    </>
  )
}

function StateMessage({ title, message, destructive = false }: { title: string; message: string; destructive?: boolean }) {
  return <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${destructive ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">{title}</p><p className="mt-1 opacity-80">{message}</p></div></div>
}
