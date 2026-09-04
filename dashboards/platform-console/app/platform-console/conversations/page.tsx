"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { BusinessBadge, FoundationNote } from "@/components/business-ops-foundation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getPlatformConversations, type PlatformConversationDto } from "@/lib/api"

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "No activity yet"
const channelLabel = (conversation: PlatformConversationDto) =>
  conversation.channel?.displayName || conversation.channel?.channelName || conversation.channel?.channelType || "Unknown"

export default function Page() {
  const [conversations, setConversations] = useState<PlatformConversationDto[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [channelFilter, setChannelFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError("")
      try {
        const response = await getPlatformConversations({
          search,
          status: statusFilter,
          channelType: channelFilter,
          limit: 100,
        })
        setConversations(response.data)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load platform conversations.")
        setConversations([])
      } finally {
        setLoading(false)
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [search, statusFilter, channelFilter])

  const channels = useMemo(
    () => Array.from(new Set(conversations.map((conversation) => conversation.channel?.channelType).filter(Boolean))) as string[],
    [conversations],
  )

  const stats = useMemo(
    () => ({
      total: conversations.length,
      open: conversations.filter((item) => item.status === "open").length,
      pending: conversations.filter((item) => item.status === "pending").length,
      resolved: conversations.filter((item) => ["resolved", "closed"].includes(item.status)).length,
    }),
    [conversations],
  )

  return (
    <>
      <ConsoleHeader
        eyebrow="Business Operations"
        title="Conversations"
        description="Platform-level conversation visibility by merchant, channel, workflow status, and recent customer activity."
      />
      <ConsolePage>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Visible conversations" value={loading ? "…" : stats.total} note="Live cross-merchant rows" tone="blue" />
          <ConsoleStatCard label="Open" value={loading ? "…" : stats.open} note="Need follow-up" tone="amber" />
          <ConsoleStatCard label="Pending" value={loading ? "…" : stats.pending} note="Waiting state" tone="cyan" />
          <ConsoleStatCard label="Resolved / closed" value={loading ? "…" : stats.resolved} note="Completed support threads" tone="emerald" />
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-3">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, customer, message, or subject" className="border-white/10 bg-slate-950/40 text-white" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Conversation status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Channel type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {channels.map((channel) => <SelectItem key={channel} value={channel}>{channel}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <ConsoleSection title="Channel summary" description="Counts by channel across the currently visible platform conversations.">
          {loading ? (
            <p className="text-sm text-slate-400">Loading channel summary…</p>
          ) : error ? (
            <p className="text-sm text-rose-200">{error}</p>
          ) : channels.length === 0 ? (
            <FoundationNote title="No channel rows" description="No live conversations match the current filters." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {channels.map((channel) => (
                <div key={channel} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-sm text-slate-400">{channel}</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {conversations.filter((item) => item.channel?.channelType === channel).length}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ConsoleSection>

        <ConsoleSection title="Conversation visibility" description="Read-only platform support lookup across tenant conversations and last-message context.">
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table>
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Conversation</TableHead>
                  <TableHead className="text-slate-300">Merchant</TableHead>
                  <TableHead className="text-slate-300">Customer</TableHead>
                  <TableHead className="text-slate-300">Channel</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400">Loading platform conversations…</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-rose-200">{error}</TableCell></TableRow> : conversations.length === 0 ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400">No conversation rows match the current platform filters.</TableCell></TableRow> : conversations.map((conversation) => (
                  <TableRow key={conversation.id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="font-medium text-white">
                      <div className="space-y-1">
                        <p>{conversation.subject || conversation.id}</p>
                        <p className="text-xs text-slate-400">{conversation.messageCount.toLocaleString()} messages</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">{conversation.tenant.companyName}</TableCell>
                    <TableCell className="text-slate-300">{conversation.customer?.fullName || "Customer not linked"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-200">{channelLabel(conversation)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <BusinessBadge value={conversation.status} />
                        {conversation.assignedCsr?.fullName ? <p className="text-xs text-slate-400">Assigned to {conversation.assignedCsr.fullName}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">
                      <div className="space-y-1">
                        <p>{formatDate(conversation.lastMessageAt)}</p>
                        <p className="max-w-xs truncate text-xs text-slate-400">{conversation.lastMessagePreview || "No message preview available"}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>

        <FoundationNote title="Read-only support context" description="Platform operators can inspect merchant conversations without reusing tenant-scoped workspace APIs or exposing CSR-performance-specific views." />
      </ConsolePage>
    </>
  )
}
