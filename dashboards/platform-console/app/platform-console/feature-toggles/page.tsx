"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, RefreshCw, Save } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ConsoleHeader, ConsolePage, ConsoleSection } from "@/components/platform-console-shell"
import {
  getPlatformFeatureToggles,
  getStoredSession,
  PlatformApiError,
  updatePlatformFeatureToggles,
  type PlatformFeatureTogglesDto,
} from "@/lib/api"

type ToggleRow = {
  key: string
  label: string
  description: string
  enabled: boolean
}

const defaultToggles: ToggleRow[] = [
  { key: "public_self_registration", label: "Public self registration", description: "Allow merchants to create a workspace without assisted onboarding.", enabled: false },
  { key: "billing_reminders", label: "Billing reminders", description: "Allow automated invoice reminder jobs once a sender is configured.", enabled: false },
  { key: "platform_support_access", label: "Support access workflow", description: "Allow controlled support investigation flows when the supporting APIs are complete.", enabled: false },
  { key: "platform_order_visibility", label: "Platform order visibility", description: "Expose cross-tenant order support views when platform order APIs are available.", enabled: false },
]

const canUpdateToggles = (role?: string) => role === "super_admin" || role === "ops_admin"
const canViewToggles = (role?: string) => canUpdateToggles(role) || role === "it_admin"
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Feature toggles could not be loaded."

function normalizeToggles(settings: PlatformFeatureTogglesDto): ToggleRow[] {
  const merged = defaultToggles.map((toggle) => ({ ...toggle, enabled: Boolean(settings[toggle.key]) }))
  const known = new Set(defaultToggles.map((toggle) => toggle.key))
  Object.entries(settings).forEach(([key, value]) => {
    if (!known.has(key)) {
      merged.push({
        key,
        label: key.replaceAll("_", " "),
        description: "Custom persisted feature toggle.",
        enabled: Boolean(value),
      })
    }
  })
  return merged
}

function toPayload(toggles: ToggleRow[]): PlatformFeatureTogglesDto {
  return toggles.reduce((payload, toggle) => {
    payload[toggle.key] = toggle.enabled
    return payload
  }, {} as PlatformFeatureTogglesDto)
}

export default function Page() {
  const [role, setRole] = useState<string>()
  const [toggles, setToggles] = useState<ToggleRow[]>(defaultToggles)
  const [newKey, setNewKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)

  const canUpdate = canUpdateToggles(role)
  const canView = canViewToggles(role)
  const enabledCount = useMemo(() => toggles.filter((toggle) => toggle.enabled).length, [toggles])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    setSuccess("")
    setPermissionDenied(false)
    try {
      setToggles(normalizeToggles(await getPlatformFeatureToggles()))
    } catch (requestError) {
      if (requestError instanceof PlatformApiError && requestError.status === 403) setPermissionDenied(true)
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setRole(getStoredSession()?.user.role)
    void load()
  }, [load])

  const toggleValue = (key: string, enabled: boolean) => {
    setToggles((current) => current.map((toggle) => toggle.key === key ? { ...toggle, enabled } : toggle))
    setSuccess("")
  }

  const addToggle = () => {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "")
    if (!key || toggles.some((toggle) => toggle.key === key)) return
    setToggles((current) => [...current, { key, label: key.replaceAll("_", " "), description: "Custom persisted feature toggle.", enabled: false }])
    setNewKey("")
  }

  const save = async () => {
    if (!canUpdate) return
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      setToggles(normalizeToggles(await updatePlatformFeatureToggles(toPayload(toggles))))
      setSuccess("Feature toggles saved.")
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Feature Flags"
        description="Persist simple platform feature toggles through the audited backend settings store."
        actions={<Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}
      />
      <ConsolePage>
        {role && !canView ? <StateMessage title="Feature flag permission required" message="Your platform role is not allowed to view feature toggles." destructive /> : null}
        {role === "it_admin" ? <StateMessage title="Read-only feature flag access" message="IT admins can review persisted toggles. Only super and operations admins can save changes." /> : null}
        {error ? <StateMessage title={permissionDenied ? "Permission required" : "Feature toggles unavailable"} message={error} destructive /> : null}
        {success ? <StateMessage title="Saved" message={success} /> : null}

        <ConsoleSection
          title="Rollout controls"
          description="These toggles are persisted as key/value flags. Complex rollout rules remain outside this screen until dedicated APIs exist."
          action={<Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">{loading ? "Loading" : `${enabledCount} enabled`}</Badge>}
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {loading ? <StatePanel message="Loading persisted feature toggles..." /> : toggles.map((flag) => (
              <div key={flag.key} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium capitalize text-white">{flag.label}</p>
                    <p className="mt-2 text-sm text-slate-400">{flag.description}</p>
                    <p className="mt-2 font-mono text-xs text-slate-500">{flag.key}</p>
                  </div>
                  <Switch checked={flag.enabled} disabled={!canUpdate || loading} onCheckedChange={(enabled) => toggleValue(flag.key, enabled)} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div>
              <Label htmlFor="new-toggle" className="text-slate-300">Add custom toggle key</Label>
              <Input id="new-toggle" value={newKey} onChange={(event) => setNewKey(event.target.value)} disabled={!canUpdate || loading} placeholder="example_feature_flag" className="mt-2 border-white/10 bg-slate-950/40 text-white" />
            </div>
            <Button variant="outline" onClick={addToggle} disabled={!canUpdate || !newKey.trim()} className="self-end border-white/10 bg-white/5 text-white hover:bg-white/10">Add</Button>
            <Button onClick={() => void save()} disabled={!canUpdate || saving || loading} className="self-end bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save toggles"}</Button>
          </div>
        </ConsoleSection>
      </ConsolePage>
    </>
  )
}

function StatePanel({ message }: { message: string }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-10 text-center text-sm text-slate-400 xl:col-span-2">{message}</div>
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
