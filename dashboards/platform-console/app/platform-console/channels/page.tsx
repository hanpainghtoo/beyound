"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, KeyRound, RefreshCw, Webhook } from "lucide-react"
import { z } from "zod"

import { PlatformConsoleStateMessage } from "@/components/platform-console-release-state"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getPlatformChannels } from "@/lib/api"

const PlatformChannelSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  channelType: z.string(),
  channelName: z.string(),
  displayName: z.string().nullable().optional(),
  status: z.string(),
  credentialStatus: z.string(),
  connectionStatus: z.string(),
  errorMessage: z.string().nullable().optional(),
  lastSyncAt: z.string().nullable().optional(),
  updatedAt: z.string(),
  tenant: z.object({
    id: z.string(),
    tenantCode: z.string(),
    companyName: z.string(),
    status: z.string(),
  }),
})

type PlatformChannel = z.infer<typeof PlatformChannelSchema>

const providerLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase())

function stateBadge(state: string) {
  if (state === "Healthy") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
  if (state === "Degraded") return "border-amber-400/30 bg-amber-500/10 text-amber-200"
  return "border-sky-400/30 bg-sky-500/10 text-sky-200"
}

function connectionBadge(state: string) {
  if (state === "connected") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
  if (state === "error") return "border-rose-400/30 bg-rose-500/10 text-rose-200"
  return "border-amber-400/30 bg-amber-500/10 text-amber-200"
}

export default function Page() {
  const [channels, setChannels] = useState<PlatformChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const response = await getPlatformChannels()
      setChannels(z.array(PlatformChannelSchema).parse(response))
    } catch (requestError) {
      setChannels([])
      setError(requestError instanceof Error ? requestError.message : "Live channel visibility could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const providerCards = useMemo(() => {
    const groups = new Map<string, PlatformChannel[]>()
    for (const channel of channels) {
      const list = groups.get(channel.channelType) || []
      list.push(channel)
      groups.set(channel.channelType, list)
    }

    return Array.from(groups.entries())
      .map(([provider, providerChannels]) => {
        const connected = providerChannels.filter((channel) => channel.connectionStatus === "connected").length
        const errors = providerChannels.filter((channel) => channel.connectionStatus === "error" || channel.status === "error").length
        const pending = providerChannels.filter((channel) => channel.connectionStatus !== "connected" && channel.connectionStatus !== "error").length
        const platformState = errors > 0 ? "Degraded" : connected > 0 ? "Healthy" : "Pending"

        return {
          provider,
          label: providerLabel(provider),
          platformState,
          total: providerChannels.length,
          connected,
          errors,
          pending,
        }
      })
      .sort((first, second) => first.label.localeCompare(second.label))
  }, [channels])

  const degradedCount = channels.filter((channel) => channel.connectionStatus === "error" || channel.status === "error").length
  const pendingCount = channels.filter((channel) => channel.connectionStatus !== "connected" && channel.connectionStatus !== "error").length
  const connectedCount = channels.filter((channel) => channel.connectionStatus === "connected").length

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Channel Operations"
        description="Actual tenant channel visibility across supported providers. Only persisted channel state is shown."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <ConsolePage>
        {error ? <PlatformConsoleStateMessage title="Channel data unavailable" message={error} destructive /> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Connected channels" value={loading ? "..." : connectedCount} note="Persisted connected state" tone="blue" />
          <ConsoleStatCard label="Degraded channels" value={loading ? "..." : degradedCount} note="Error state from live channel rows" tone="amber" />
          <ConsoleStatCard label="Pending setup" value={loading ? "..." : pendingCount} note="Not yet connected or ready" tone="rose" />
          <ConsoleStatCard label="Providers in use" value={loading ? "..." : providerCards.length} note="Observed channel types" tone="cyan" />
        </div>

        <ConsoleSection title="Provider command center" description="Provider summaries are computed only from persisted tenant channel records.">
          {loading ? (
            <p className="text-sm text-slate-400">Loading live channel providers...</p>
          ) : error ? (
            <p className="text-sm text-rose-200">Provider summaries are unavailable because the channel API request failed.</p>
          ) : providerCards.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">No platform channel records have been created yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {providerCards.map((provider) => (
                <div key={provider.provider} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{provider.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{provider.total} persisted tenant channel records</p>
                    </div>
                    <Badge variant="outline" className={stateBadge(provider.platformState)}>
                      {provider.platformState}
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-3 text-xs leading-5 text-slate-300">
                    <p className="inline-flex items-center gap-2">
                      <KeyRound className="h-3.5 w-3.5 text-sky-300" />
                      {provider.connected} connected
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <Webhook className="h-3.5 w-3.5 text-emerald-300" />
                      {provider.pending} pending or ready
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                      {provider.errors} error state
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ConsoleSection>

        <ConsoleSection title="Tenant channel state" description="Tenant-level channel rows returned directly from the platform-admin channel visibility API.">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <Table>
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Tenant</TableHead>
                  <TableHead className="text-slate-300">Provider</TableHead>
                  <TableHead className="text-slate-300">Channel</TableHead>
                  <TableHead className="text-slate-300">Tenant status</TableHead>
                  <TableHead className="text-slate-300">Connection</TableHead>
                  <TableHead className="text-slate-300">Credentials</TableHead>
                  <TableHead className="text-slate-300">Last sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center text-slate-400">Loading live channels...</TableCell></TableRow>
                ) : error ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center text-rose-200">Channel rows could not be loaded.</TableCell></TableRow>
                ) : channels.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center text-slate-400">No live tenant channels exist yet.</TableCell></TableRow>
                ) : (
                  channels.map((channel) => (
                    <TableRow key={channel.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="font-medium text-white">
                        <div>
                          <p>{channel.tenant.companyName}</p>
                          <p className="text-xs text-slate-500">{channel.tenant.tenantCode}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300">{providerLabel(channel.channelType)}</TableCell>
                      <TableCell className="text-slate-300">{channel.displayName || channel.channelName}</TableCell>
                      <TableCell><Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{channel.tenant.status}</Badge></TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline" className={connectionBadge(channel.connectionStatus)}>{channel.connectionStatus}</Badge>
                          {channel.errorMessage ? <p className="max-w-xs text-xs text-rose-200">{channel.errorMessage}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300">{channel.credentialStatus}</TableCell>
                      <TableCell className="text-slate-300">{channel.lastSyncAt ? new Date(channel.lastSyncAt).toLocaleString() : "No sync recorded"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>
      </ConsolePage>
    </>
  )
}
