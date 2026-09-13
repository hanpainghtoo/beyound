"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Clock3,
  Globe2,
  ImageIcon,
  Radio,
  Save,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage, tenantSettingsApi, type UpdateTenantSettingsInput } from "@/lib/api"

type SettingsState = {
  companyName: string
  industry: string
  businessType: string
  contactPerson: string
  contactEmail: string
  contactPhone: string
  website: string
  logoUrl: string
  description: string
  address: string
  language: string
  timezone: string
  emailNotifications: boolean
  smsNotifications: boolean
  pushNotifications: boolean
}

const defaultSettings: SettingsState = {
  companyName: "ZayOS Workspace",
  industry: "",
  businessType: "",
  contactPerson: "",
  contactEmail: "support@kme.com.mm",
  contactPhone: "",
  website: "",
  logoUrl: "",
  description: "",
  address: "",
  language: "en",
  timezone: "Asia/Yangon",
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: true,
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")

  useEffect(() => {
    tenantSettingsApi
      .get()
      .then((workspaceSettings) => {
        const flags = workspaceSettings.featureFlags || {}
        setSettings((current) => ({
          ...current,
          companyName: workspaceSettings.companyName || current.companyName,
          industry: workspaceSettings.industry || "",
          businessType: workspaceSettings.businessType || "",
          contactPerson: workspaceSettings.contactPerson || "",
          contactEmail: workspaceSettings.contactEmail || current.contactEmail,
          contactPhone: workspaceSettings.contactPhone || "",
          website: workspaceSettings.website || "",
          logoUrl: workspaceSettings.logoUrl || "",
          description: workspaceSettings.description || "",
          address: workspaceSettings.address || "",
          language: workspaceSettings.language || "en",
          timezone: workspaceSettings.timezone || "Asia/Yangon",
          emailNotifications: Boolean(flags.emailNotifications ?? current.emailNotifications),
          smsNotifications: Boolean(flags.smsNotifications ?? current.smsNotifications),
          pushNotifications: Boolean(flags.pushNotifications ?? current.pushNotifications),
        }))
      })
      .catch((error) => setStatusMessage(getApiErrorMessage(error, "Failed to load workspace settings")))
      .finally(() => setIsLoading(false))
  }, [])

  const saveSettings = async () => {
    setIsSaving(true)
    setStatusMessage("")
    const payload: UpdateTenantSettingsInput = {
      companyName: settings.companyName,
      industry: settings.industry,
      businessType: settings.businessType,
      contactPerson: settings.contactPerson,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      website: settings.website,
      logoUrl: settings.logoUrl,
      description: settings.description,
      address: settings.address,
      timezone: settings.timezone,
      language: settings.language,
      featureFlags: {
        emailNotifications: settings.emailNotifications,
        smsNotifications: settings.smsNotifications,
        pushNotifications: settings.pushNotifications,
      },
    }

    try {
      const currentWorkspace = await tenantSettingsApi.get()
      const workspaceSettings = await tenantSettingsApi.update({
        ...payload,
        featureFlags: {
          ...(currentWorkspace.featureFlags || {}),
          ...payload.featureFlags,
        },
      })
      setSettings((current) => ({
        ...current,
        companyName: workspaceSettings.companyName,
        industry: workspaceSettings.industry || "",
        businessType: workspaceSettings.businessType || "",
        contactPerson: workspaceSettings.contactPerson || "",
        contactEmail: workspaceSettings.contactEmail,
        contactPhone: workspaceSettings.contactPhone || "",
        website: workspaceSettings.website || "",
        logoUrl: workspaceSettings.logoUrl || "",
        description: workspaceSettings.description || "",
        address: workspaceSettings.address || "",
        timezone: workspaceSettings.timezone,
        language: workspaceSettings.language,
      }))
      setStatusMessage("Workspace settings saved.")
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error, "Failed to save workspace settings"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage workspace profile, team setup, channels, notifications, and how daily sales operations run."
        actions={
          <Button onClick={saveSettings} disabled={isLoading || isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        }
      />

      <WorkspacePage containerClassName="max-w-7xl">
        {statusMessage ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            <AlertCircle className="h-4 w-4" />
            {statusMessage}
          </div>
        ) : null}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <WorkspaceSection title="Workspace identity" description="The business details shown across your workspace.">
            <div className="mb-5 flex items-center gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                {settings.logoUrl ? <img src={settings.logoUrl} alt="" className="h-full w-full object-contain p-2" /> : <Building2 className="h-7 w-7 text-slate-400" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-950 dark:text-slate-50">{settings.companyName || "Unnamed workspace"}</p>
                <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{settings.website || "No website added"}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Company name">
                <Input value={settings.companyName} onChange={(event) => setSettings({ ...settings, companyName: event.target.value })} />
              </Field>
              <Field label="Website">
                <Input value={settings.website} onChange={(event) => setSettings({ ...settings, website: event.target.value })} placeholder="https://example.com" />
              </Field>
              <Field label="Industry">
                <Input value={settings.industry} onChange={(event) => setSettings({ ...settings, industry: event.target.value })} />
              </Field>
              <Field label="Business type">
                <Select value={settings.businessType} onValueChange={(value) => setSettings({ ...settings, businessType: value })}>
                  <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online-shop">Online Shop</SelectItem>
                    <SelectItem value="sales-team">Sales Team</SelectItem>
                    <SelectItem value="retail-distribution">Retail & Distribution</SelectItem>
                    <SelectItem value="local-brand">Local Brand</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Workspace logo URL">
                  <div className="relative">
                    <ImageIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input className="pl-9" value={settings.logoUrl} onChange={(event) => setSettings({ ...settings, logoUrl: event.target.value })} placeholder="https://example.com/logo.png" />
                  </div>
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Business address">
                  <Input value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Workspace description">
                  <Textarea className="min-h-[108px]" value={settings.description} onChange={(event) => setSettings({ ...settings, description: event.target.value })} />
                </Field>
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Contact and region" description="Primary contact and regional defaults for this workspace.">
            <div className="grid gap-4">
              <Field label="Contact person">
                <Input value={settings.contactPerson} onChange={(event) => setSettings({ ...settings, contactPerson: event.target.value })} />
              </Field>
              <Field label="Contact email">
                <Input type="email" value={settings.contactEmail} onChange={(event) => setSettings({ ...settings, contactEmail: event.target.value })} />
              </Field>
              <Field label="Contact phone">
                <Input value={settings.contactPhone} onChange={(event) => setSettings({ ...settings, contactPhone: event.target.value })} />
              </Field>
              <Field label="Timezone">
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input className="pl-9" value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} />
                </div>
              </Field>
              <Field label="Language">
                <Select value={settings.language} onValueChange={(value) => setSettings({ ...settings, language: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="my">Myanmar</SelectItem>
                    <SelectItem value="th">Thai</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-start gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
                Dates, times, and customer-facing defaults follow these regional settings.
              </div>
            </div>
          </WorkspaceSection>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <WorkspaceSection title="Notifications" description="Choose how the workspace receives important alerts.">
            <div className="space-y-3">
              <ToggleRow label="Email notifications" description="Conversation, payment, and delivery updates by email." checked={settings.emailNotifications} onChange={(checked) => setSettings({ ...settings, emailNotifications: checked })} />
              <ToggleRow label="SMS notifications" description="Urgent operational alerts sent to the workspace phone." checked={settings.smsNotifications} onChange={(checked) => setSettings({ ...settings, smsNotifications: checked })} />
              <ToggleRow label="Push notifications" description="Real-time alerts while working in ZayOS." checked={settings.pushNotifications} onChange={(checked) => setSettings({ ...settings, pushNotifications: checked })} />
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Workspace administration" description="Open the dedicated settings for daily operations.">
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              <SettingsLink href="/workspace/channels" icon={Radio} title="Channels" description="Connect and manage customer messaging channels." />
              <SettingsLink href="/workspace/team" icon={Users} title="Team members" description="Manage people, roles, and workspace access." />
              <SettingsLink href="/workspace/orders-settings" icon={SlidersHorizontal} title="Order settings" description="Configure payment, delivery, and order workflow defaults." />
            </div>
          </WorkspaceSection>
        </div>
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

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex min-h-[72px] items-center justify-between gap-4 rounded-md border border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function SettingsLink({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
  return (
    <Link href={href} className="group flex min-h-[76px] items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600" />
    </Link>
  )
}
