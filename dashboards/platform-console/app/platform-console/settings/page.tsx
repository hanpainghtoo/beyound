"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Clock3, Mail, ReceiptText, RefreshCw, Save } from "lucide-react"

import { FoundationNote } from "@/components/business-ops-foundation"
import { ConsoleHeader, ConsolePage, ConsoleSection } from "@/components/platform-console-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getPlatformSettings,
  getStoredSession,
  PlatformApiError,
  updatePlatformSettings,
  type PlatformSettingsDto,
  type UpdatePlatformSettingsInput,
} from "@/lib/api"

type SettingsForm = {
  supportEmail: string
  supportPhone: string
  supportUrl: string
  defaultCurrency: string
  defaultTimezone: string
  invoiceReminderDays: string
  invoiceReminderSenderEnabled: "enabled" | "disabled"
  invoiceFooterNote: string
}

const defaultForm: SettingsForm = {
  supportEmail: "support@kme.com.mm",
  supportPhone: "",
  supportUrl: "",
  defaultCurrency: "MMK",
  defaultTimezone: "Asia/Yangon",
  invoiceReminderDays: "3",
  invoiceReminderSenderEnabled: "disabled",
  invoiceFooterNote: "",
}

const fieldClass = "mt-2 border-white/10 bg-slate-950/40 text-white"
const canUpdateSettings = (role?: string) => role === "super_admin" || role === "ops_admin"
const canViewSettings = (role?: string) => canUpdateSettings(role) || role === "it_admin"
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "The settings request could not be completed."
const stringSetting = (settings: PlatformSettingsDto, key: keyof SettingsForm, fallback = "") => typeof settings[key] === "string" ? String(settings[key]) : fallback
const boolSetting = (settings: PlatformSettingsDto, key: string, fallback = false) => typeof settings[key] === "boolean" ? Boolean(settings[key]) : fallback

function toForm(settings: PlatformSettingsDto): SettingsForm {
  return {
    supportEmail: stringSetting(settings, "supportEmail", defaultForm.supportEmail),
    supportPhone: stringSetting(settings, "supportPhone", defaultForm.supportPhone),
    supportUrl: stringSetting(settings, "supportUrl", defaultForm.supportUrl),
    defaultCurrency: stringSetting(settings, "defaultCurrency", defaultForm.defaultCurrency),
    defaultTimezone: stringSetting(settings, "defaultTimezone", defaultForm.defaultTimezone),
    invoiceReminderDays: String(typeof settings.invoiceReminderDays === "number" ? settings.invoiceReminderDays : defaultForm.invoiceReminderDays),
    invoiceReminderSenderEnabled: boolSetting(settings, "invoiceReminderSenderEnabled") ? "enabled" : "disabled",
    invoiceFooterNote: stringSetting(settings, "invoiceFooterNote", defaultForm.invoiceFooterNote),
  }
}

function toPayload(form: SettingsForm): UpdatePlatformSettingsInput {
  return {
    supportEmail: form.supportEmail.trim(),
    supportPhone: form.supportPhone.trim(),
    supportUrl: form.supportUrl.trim(),
    defaultCurrency: form.defaultCurrency,
    defaultTimezone: form.defaultTimezone,
    invoiceReminderDays: Math.max(Number(form.invoiceReminderDays || 0), 0),
    invoiceReminderSenderEnabled: form.invoiceReminderSenderEnabled === "enabled",
    invoiceFooterNote: form.invoiceFooterNote.trim(),
  }
}

export default function Page() {
  const [role, setRole] = useState<string>()
  const [form, setForm] = useState<SettingsForm>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)

  const canUpdate = canUpdateSettings(role)
  const canView = canViewSettings(role)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    setSuccess("")
    setPermissionDenied(false)
    try {
      const settings = await getPlatformSettings()
      setForm(toForm(settings))
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

  const validationError = useMemo(() => {
    if (!form.supportEmail.trim() || !form.supportEmail.includes("@")) return "A valid support email is required."
    const reminderDays = Number(form.invoiceReminderDays)
    if (!Number.isFinite(reminderDays) || reminderDays < 0 || reminderDays > 30) return "Invoice reminder days must be between 0 and 30."
    return ""
  }, [form.invoiceReminderDays, form.supportEmail])

  const save = async () => {
    if (validationError || !canUpdate) return
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      setForm(toForm(await updatePlatformSettings(toPayload(form))))
      setSuccess("Settings saved.")
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ConsoleHeader
        eyebrow="Business Operations"
        title="Settings"
        description="Simple platform business settings for support identity, Myanmar billing defaults, timezone, and invoice reminder policy."
        actions={<Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}
      />
      <ConsolePage>
        {role && !canView ? <StateMessage title="Settings permission required" message="Your platform role is not allowed to view platform settings." destructive /> : null}
        {role === "it_admin" ? <StateMessage title="Read-only settings access" message="IT admins can review settings. Only super and operations admins can save business setting changes." /> : null}
        {error ? <StateMessage title={permissionDenied ? "Permission required" : "Settings unavailable"} message={error} destructive /> : null}
        {success ? <StateMessage title="Saved" message={success} /> : null}

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <ConsoleSection title="Business defaults" description="These values are persisted through the platform settings API and used as the operational source of truth.">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="support-email" className="inline-flex items-center gap-2 text-slate-300"><Mail className="h-4 w-4 text-sky-300" />Support contact</Label>
                <Input id="support-email" type="email" value={form.supportEmail} onChange={(event) => setForm({ ...form, supportEmail: event.target.value })} disabled={loading || !canUpdate} className={fieldClass} />
              </div>
              <TextField id="support-phone" label="Support phone" value={form.supportPhone} disabled={loading || !canUpdate} onChange={(value) => setForm({ ...form, supportPhone: value })} />
              <TextField id="support-url" label="Support URL" value={form.supportUrl} disabled={loading || !canUpdate} onChange={(value) => setForm({ ...form, supportUrl: value })} />
              <div>
                <Label className="inline-flex items-center gap-2 text-slate-300"><ReceiptText className="h-4 w-4 text-sky-300" />Default currency</Label>
                <Select value={form.defaultCurrency} onValueChange={(value) => setForm({ ...form, defaultCurrency: value })} disabled={loading || !canUpdate}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MMK">MMK - Myanmar Kyat</SelectItem><SelectItem value="USD">USD - US Dollar</SelectItem></SelectContent></Select>
              </div>
              <div>
                <Label className="inline-flex items-center gap-2 text-slate-300"><Clock3 className="h-4 w-4 text-sky-300" />Default timezone</Label>
                <Select value={form.defaultTimezone} onValueChange={(value) => setForm({ ...form, defaultTimezone: value })} disabled={loading || !canUpdate}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Asia/Yangon">Asia/Yangon</SelectItem><SelectItem value="UTC">UTC</SelectItem></SelectContent></Select>
              </div>
              <TextField id="invoice-window" label="Invoice reminder days before due date" type="number" min="0" max="30" value={form.invoiceReminderDays} disabled={loading || !canUpdate} onChange={(value) => setForm({ ...form, invoiceReminderDays: value })} />
              <div>
                <Label className="text-slate-300">Reminder sender</Label>
                <Select value={form.invoiceReminderSenderEnabled} onValueChange={(value) => setForm({ ...form, invoiceReminderSenderEnabled: value as SettingsForm["invoiceReminderSenderEnabled"] })} disabled={loading || !canUpdate}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="disabled">Disabled - manual follow-up</SelectItem><SelectItem value="enabled">Enabled - configured sender</SelectItem></SelectContent></Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="invoice-footer" className="text-slate-300">Invoice footer note</Label>
                <Textarea id="invoice-footer" value={form.invoiceFooterNote} onChange={(event) => setForm({ ...form, invoiceFooterNote: event.target.value })} disabled={loading || !canUpdate} className="mt-2 min-h-24 border-white/10 bg-slate-950/40 text-white" />
              </div>
            </div>
            {validationError ? <p className="mt-4 text-sm text-rose-300">{validationError}</p> : null}
            <div className="mt-5 flex justify-end">
              <Button onClick={() => void save()} disabled={loading || saving || !canUpdate || Boolean(validationError)} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save settings"}</Button>
            </div>
          </ConsoleSection>

          <ConsoleSection title="Current values" description="The values below reflect the form state loaded from the persisted settings API.">
            <div className="space-y-3">
              <ValueRow label="Support email" value={loading ? "Loading..." : form.supportEmail} />
              <ValueRow label="Support phone" value={form.supportPhone || "Not set"} />
              <ValueRow label="Support URL" value={form.supportUrl || "Not set"} />
              <ValueRow label="Currency" value={form.defaultCurrency} />
              <ValueRow label="Timezone" value={form.defaultTimezone} />
              <ValueRow label="Reminder window" value={`${form.invoiceReminderDays || "0"} days before due date`} />
              <ValueRow label="Reminder sender" value={form.invoiceReminderSenderEnabled === "enabled" ? "Enabled" : "Disabled"} />
            </div>
          </ConsoleSection>
        </div>

        <FoundationNote
          title="Reminder delivery remains separate"
          description="These settings store the business policy. No reminder email, SMS, or notification job is enabled from this screen."
        />
      </ConsolePage>
    </>
  )
}

function TextField({ id, label, value, onChange, disabled, type = "text", min, max }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; type?: string; min?: string; max?: string }) {
  return (
    <div>
      <Label htmlFor={id} className="text-slate-300">{label}</Label>
      <Input id={id} type={type} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={fieldClass} />
    </div>
  )
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-right text-sm font-medium text-white">{value}</p>
    </div>
  )
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
