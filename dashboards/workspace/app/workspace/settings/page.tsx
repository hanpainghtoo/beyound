"use client"

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react"
// import Link from "next/link"
import {
  Building2,
  Clock3,
  Globe2,
  ImagePlus,
  Save,
} from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { FeatureTogglesSection } from "@/components/settings/feature-toggles-section"
import { useI18n } from "@/components/providers/i18n-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { agentMediaApi, getApiErrorMessage, tenantSettingsApi, type UpdateTenantSettingsInput } from "@/lib/api"
import { toast } from "sonner"

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
  contactEmail: "",
  contactPhone: "",
  website: "",
  logoUrl: "",
  description: "",
  address: "",
  // "my" matches DEFAULT_LOCALE in i18n_translation/translation.ts. The old
  // "en" default contradicted it, so a workspace that had never saved this
  // field claimed English while the UI rendered Burmese.
  language: "my",
  timezone: "Asia/Yangon",
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: true,
}

export default function SettingsPage() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<SettingsState>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("")
  const logoInputRef = useRef<HTMLInputElement>(null)

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
          language: workspaceSettings.language || "my",
          timezone: workspaceSettings.timezone || "Asia/Yangon",
          emailNotifications: Boolean(flags.emailNotifications ?? current.emailNotifications),
          smsNotifications: Boolean(flags.smsNotifications ?? current.smsNotifications),
          pushNotifications: Boolean(flags.pushNotifications ?? current.pushNotifications),
        }))
        setLogoPreviewUrl(workspaceSettings.logoUrl || "")
      })
      .catch((error) => toast.error(getApiErrorMessage(error, t("workspace.settings.toasts.unableLoad"))))
      .finally(() => setIsLoading(false))
  }, [t])

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error(t("workspace.settings.toasts.invalidImageType"))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("workspace.settings.toasts.imageTooLarge", { maxSize: "5 MB" }))
      return
    }

    const localPreview = URL.createObjectURL(file)
    setLogoPreviewUrl(localPreview)
    setIsUploadingLogo(true)
    try {
      const uploaded = await agentMediaApi.upload(file, "workspace-logo")
      updateSetting("logoUrl", uploaded.download.url)
      setLogoPreviewUrl(uploaded.download.url)
      toast.success(t("workspace.settings.toasts.logoUploaded"))
    } catch (error) {
      setLogoPreviewUrl(settings.logoUrl)
      toast.error(getApiErrorMessage(error, t("workspace.settings.toasts.logoUploadFailed")))
    } finally {
      URL.revokeObjectURL(localPreview)
      setIsUploadingLogo(false)
    }
  }

  const saveSettings = async () => {
    setIsSaving(true)
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
      toast.success(t("workspace.settings.toasts.saved"))
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.settings.toasts.saveFailed")))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        navKey="settings"
        eyebrow={t("workspace.settings.eyebrow")}
        title={t("workspace.settings.title")}
        description={t("workspace.settings.description")}
        actions={
          <Button onClick={saveSettings} disabled={isLoading || isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? t("workspace.settings.submit.saving") : t("workspace.settings.submit.save")}
          </Button>
        }
      />

      <WorkspacePage containerClassName="max-w-7xl">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <WorkspaceSection title={t("workspace.settings.identityTitle")} description={t("workspace.settings.identityDescription")}>
            <div className="mb-5 flex flex-wrap items-center gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                {logoPreviewUrl ? <img src={logoPreviewUrl} alt={t("workspace.settings.logoAlt", { name: settings.companyName || t("workspace.settings.eyebrow") })} className="h-full w-full object-contain p-2" /> : <Building2 className="h-7 w-7 text-slate-400" />}
              </div>
              <div className="min-w-0 flex-1">
                {/* No `truncate`: the parent is min-w-0 and these lines wrap instead. The
                    Burmese fallbacks are much wider than "Unnamed workspace". */}
                <p className="font-semibold text-slate-950 dark:text-slate-50">{settings.companyName || t("workspace.settings.unnamedWorkspace")}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{settings.website || t("workspace.settings.noWebsite")}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("workspace.settings.logoTypes", { maxSize: "5 MB" })}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={handleLogoUpload} />
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo}>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {isUploadingLogo ? t("workspace.settings.uploading") : t("workspace.settings.upload")}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("workspace.settings.fields.companyName")}>
                <Input value={settings.companyName} onChange={(event) => updateSetting("companyName", event.target.value)} />
              </Field>
              <Field label={t("workspace.settings.fields.website")}>
                <Input value={settings.website} onChange={(event) => updateSetting("website", event.target.value)} placeholder={t("workspace.settings.placeholders.website")} />
              </Field>
              <Field label={t("workspace.settings.fields.industry")}>
                <Input value={settings.industry} onChange={(event) => updateSetting("industry", event.target.value)} placeholder={t("workspace.settings.placeholders.industry")} />
              </Field>
              <Field label={t("workspace.settings.fields.businessType")}>
                <Select value={settings.businessType} onValueChange={(value) => updateSetting("businessType", value)}>
                  <SelectTrigger><SelectValue placeholder={t("workspace.settings.fields.businessTypePlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online-shop">{t("workspace.settings.businessTypes.online-shop")}</SelectItem>
                    <SelectItem value="sales-team">{t("workspace.settings.businessTypes.sales-team")}</SelectItem>
                    <SelectItem value="retail-distribution">{t("workspace.settings.businessTypes.retail-distribution")}</SelectItem>
                    <SelectItem value="local-brand">{t("workspace.settings.businessTypes.local-brand")}</SelectItem>
                    <SelectItem value="other">{t("workspace.settings.businessTypes.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {/* <div className="md:col-span-2">
                <Field label={t("workspace.settings.logoUrlFieldLabel")}>
                  <Input value={settings.logoUrl} onChange={(event) => { updateSetting("logoUrl", event.target.value); setLogoPreviewUrl(event.target.value) }} placeholder={t("workspace.settings.logoUrlPlaceholder")} />
                </Field>
              </div> */}
              <div className="md:col-span-2">
                <Field label={t("workspace.settings.fields.address")}>
                  <Input value={settings.address} onChange={(event) => updateSetting("address", event.target.value)} placeholder={t("workspace.settings.placeholders.address")} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label={t("workspace.settings.fields.description")}>
                  <Textarea className="min-h-[108px]" value={settings.description} onChange={(event) => updateSetting("description", event.target.value)} placeholder={t("workspace.settings.placeholders.description")} />
                </Field>
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection title={t("workspace.settings.contactRegionTitle")} description={t("workspace.settings.contactRegionDescription")}>
            <div className="grid gap-4">
              <Field label={t("workspace.settings.fields.contactPerson")}>
                <Input value={settings.contactPerson} onChange={(event) => updateSetting("contactPerson", event.target.value)} />
              </Field>
              <Field label={t("workspace.settings.fields.contactEmail")}>
                <Input type="email" value={settings.contactEmail} onChange={(event) => updateSetting("contactEmail", event.target.value)} />
              </Field>
              <Field label={t("workspace.settings.fields.contactPhone")}>
                <Input value={settings.contactPhone} onChange={(event) => updateSetting("contactPhone", event.target.value)} />
              </Field>
              <Field label={t("workspace.settings.fields.timezone")}>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Select value={settings.timezone} onValueChange={(value) => updateSetting("timezone", value)}>
                    <SelectTrigger className="pl-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Yangon">{t("workspace.settings.timezones.Asia/Yangon")}</SelectItem>
                      <SelectItem value="Asia/Bangkok">{t("workspace.settings.timezones.Asia/Bangkok")}</SelectItem>
                      <SelectItem value="Asia/Singapore">{t("workspace.settings.timezones.Asia/Singapore")}</SelectItem>
                      <SelectItem value="UTC">{t("workspace.settings.timezones.UTC")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Field>
              <div className="flex items-start gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
                {t("workspace.settings.regionHint")}
              </div>
            </div>
          </WorkspaceSection>
        </div>

        <div className="mt-5">
          <FeatureTogglesSection />
        </div>

        {/* <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
          <WorkspaceSection title={t("workspace.settings.notifications.title")} description={t("workspace.settings.notifications.description")}>
            <div className="space-y-3">
              <ToggleRow label={t("workspace.settings.notifications.email")} description={t("workspace.settings.notifications.emailDescription")} checked={settings.emailNotifications} onChange={(checked) => setSettings({ ...settings, emailNotifications: checked })} />
              <ToggleRow label={t("workspace.settings.notifications.sms")} description={t("workspace.settings.notifications.smsDescription")} checked={settings.smsNotifications} onChange={(checked) => setSettings({ ...settings, smsNotifications: checked })} />
              <ToggleRow label={t("workspace.settings.notifications.push")} description={t("workspace.settings.notifications.pushDescription")} checked={settings.pushNotifications} onChange={(checked) => setSettings({ ...settings, pushNotifications: checked })} />
            </div>
          </WorkspaceSection>

          <WorkspaceSection title={t("workspace.settings.administration.title")} description={t("workspace.settings.administration.description")}>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              <SettingsLink href="/workspace/channels" icon={Radio} title={t("workspace.settings.administration.channels")} description={t("workspace.settings.administration.channelsDescription")} />
              <SettingsLink href="/workspace/team" icon={Users} title={t("workspace.settings.administration.teamMembers")} description={t("workspace.settings.administration.teamMembersDescription")} />
              <SettingsLink href="/workspace/payment-settings" icon={SlidersHorizontal} title={t("workspace.settings.administration.orderSettings")} description={t("workspace.settings.administration.orderSettingsDescription")} />
            </div>
          </WorkspaceSection>
        </div> */}
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

// function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
//   return (
//     <div className="flex min-h-[72px] items-center justify-between gap-4 rounded-md border border-slate-200 px-4 py-3 dark:border-slate-800">
//       <div>
//         <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
//         <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
//       </div>
//       <Switch checked={checked} onCheckedChange={onChange} />
//     </div>
//   )
// }

// function SettingsLink({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
//   return (
//     <Link href={href} className="group flex min-h-[76px] items-center gap-3 py-3 first:pt-0 last:pb-0">
//       <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
//         <Icon className="h-4 w-4" />
//       </span>
//       <span className="min-w-0 flex-1">
//         <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
//         <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
//       </span>
//       <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600" />
//     </Link>
//   )
// }
