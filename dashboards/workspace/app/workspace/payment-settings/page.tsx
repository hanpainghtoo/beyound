"use client"

import { useEffect, useState } from "react"
// HIDDEN: The ?tab= query param is no longer used on the payment-only page. Uncomment to restore tab navigation.
// import { usePathname, useRouter, useSearchParams } from "next/navigation"
// HIDDEN: Invoice settings are not needed for now. Payment-only page requested. Uncomment to restore.
// import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
// HIDDEN: Input is only used by invoice settings. Payment-only page requested. Uncomment to restore.
// import { Input } from "@/components/ui/input"
// HIDDEN: Label is only used by the hidden Field helper. Payment-only page requested. Uncomment to restore.
// import { Label } from "@/components/ui/label"
// HIDDEN: Select is only used by invoice and routing settings. Payment-only page requested. Uncomment to restore.
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
// HIDDEN: TabsList/TabsTrigger render the invoice/delivery/routing tab bar. Payment-only page requested. Uncomment to restore.
import { Tabs, TabsContent } from "@/components/ui/tabs"
// HIDDEN: Textarea is only used by invoice settings. Payment-only page requested. Uncomment to restore.
// import { Textarea } from "@/components/ui/textarea"
// HIDDEN: FileText, Settings, and Truck are only used by hidden tab headers. Payment-only page requested. Uncomment to restore.
// import { FileText, Settings, Truck } from "lucide-react"
import { CreditCard, Save } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage } from "@/components/workspace"
import { useI18n } from "@/components/providers/i18n-provider"
import { getApiErrorMessage, tenantSettingsApi, type UpdateTenantSettingsInput } from "@/lib/api"
import { toast } from "sonner"
import { PaymentMethodSettings } from "@/components/payment-method-settings"
// HIDDEN: ReactNode is only used by the hidden Field helper. Payment-only page requested. Uncomment to restore.
// import type { ReactNode } from "react"

type OrderSettingsState = {
  invoicePrefix: string
  taxRate: number
  currency: string
  paymentTerms: string
  codEnabled: boolean
  onlinePaymentEnabled: boolean
  bankTransferEnabled: boolean
  autoAssignment: boolean
  assignmentMethod: string
  firstResponseSlaMinutes: number
  nextResponseSlaMinutes: number
  unreadQueueEnabled: boolean
  hotLeadQueueEnabled: boolean
  vipQueueEnabled: boolean
  overdueQueueEnabled: boolean
}

/**
 * `paymentTerms` is stored as a slug, not the English label.
 *
 * It used to store "Net 30" verbatim, so the English sentence was the persisted
 * value. Translating the option text would therefore have rewritten saved tenant
 * data. `normalizePaymentTerms` maps legacy English values onto the slugs on
 * read, so existing workspaces migrate transparently the next time they load.
 */
const PAYMENT_TERMS_SLUGS = ["due-on-receipt", "net-15", "net-30", "net-60"] as const

type PaymentTermsSlug = (typeof PAYMENT_TERMS_SLUGS)[number]

const LEGACY_PAYMENT_TERMS: Record<string, PaymentTermsSlug> = {
  "Due on Receipt": "due-on-receipt",
  "Net 15": "net-15",
  "Net 30": "net-30",
  "Net 60": "net-60",
}

function normalizePaymentTerms(value: string | undefined): PaymentTermsSlug {
  if (!value) return "net-30"
  if ((PAYMENT_TERMS_SLUGS as readonly string[]).includes(value)) return value as PaymentTermsSlug
  return LEGACY_PAYMENT_TERMS[value] ?? "net-30"
}

const defaultSettings: OrderSettingsState = {
  invoicePrefix: "INV",
  taxRate: 10,
  currency: "USD",
  paymentTerms: "net-30",
  codEnabled: true,
  onlinePaymentEnabled: true,
  bankTransferEnabled: false,
  autoAssignment: true,
  assignmentMethod: "manual",
  firstResponseSlaMinutes: 30,
  nextResponseSlaMinutes: 60,
  unreadQueueEnabled: true,
  hotLeadQueueEnabled: true,
  vipQueueEnabled: true,
  overdueQueueEnabled: true,
}

export default function PaymentSettingsPage() {
  const { t } = useI18n()
  // HIDDEN: Tab query-param navigation is not needed on a payment-only page. Uncomment with the tab blocks to restore.
  // const router = useRouter()
  // const pathname = usePathname()
  // const searchParams = useSearchParams()
  const [settings, setSettings] = useState<OrderSettingsState>(defaultSettings)
  const [isSaving, setIsSaving] = useState(false)
  // HIDDEN: Tab selection state is not needed on a payment-only page. Uncomment with the tab blocks to restore.
  // const [activeTab, setActiveTab] = useState<string>(() => {
  //   const tab = searchParams.get("tab")
  //   return tab === "payment" || tab === "delivery" || tab === "routing" ? tab : "invoice"
  // })
  // useEffect(() => {
  //   const tab = searchParams.get("tab")
  //   setActiveTab(tab === "payment" || tab === "delivery" || tab === "routing" ? tab : "invoice")
  // }, [searchParams])

  useEffect(() => {
    tenantSettingsApi
      .get()
      .then((tenant) => {
        const productivity = (tenant.featureFlags?.agentProductivity || {}) as Partial<OrderSettingsState>
        setSettings((current) => ({
          ...current,
          ...productivity,
          paymentTerms: normalizePaymentTerms(productivity.paymentTerms),
        }))
      })
      .catch((error) => toast.error(getApiErrorMessage(error, t("workspace.ordersSettings.toasts.unableLoad"))))
  }, [t])

  const saveSettings = async () => {
    setIsSaving(true)
    try {
      const tenant = await tenantSettingsApi.get()
      const payload: UpdateTenantSettingsInput = {
        featureFlags: {
          ...(tenant.featureFlags || {}),
          agentProductivity: settings,
        },
      }
      await tenantSettingsApi.update(payload)
      toast.success(t("workspace.ordersSettings.toasts.saved"))
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.ordersSettings.toasts.saveFailed")))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        navKey="settings"
        eyebrow={t("workspace.ordersSettings.eyebrow")}
        title={t("workspace.ordersSettings.title")}
        description={t("workspace.ordersSettings.description")}
        actions={
          <Button onClick={saveSettings} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? t("workspace.ordersSettings.submit.saving") : t("workspace.ordersSettings.submit.save")}
          </Button>
        }
      />

      <WorkspacePage>
        <Tabs value="payment" className="space-y-6">
          {/* HIDDEN: The tab bar is not needed on a payment-only page. Uncomment with the hidden tab contents to restore. */}
          {/*
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
            <TabsTrigger value="invoice">{t("workspace.ordersSettings.tabs.invoice")}</TabsTrigger>
            <TabsTrigger value="delivery">{t("workspace.ordersSettings.tabs.delivery")}</TabsTrigger>
            <TabsTrigger value="payment">{t("workspace.ordersSettings.tabs.payment")}</TabsTrigger>
            <TabsTrigger value="routing">{t("workspace.ordersSettings.tabs.routing")}</TabsTrigger>
          </TabsList>
          */}

          {/* HIDDEN: Invoice settings are not needed for now. Payment-only page requested. Uncomment to restore. */}
          {/*
          <TabsContent value="invoice">
            <Card className="workspace-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{t("workspace.ordersSettings.invoiceTitle")}</CardTitle>
                <CardDescription>{t("workspace.ordersSettings.invoiceDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label={t("workspace.ordersSettings.fields.invoicePrefix")}>
                  <Input value={settings.invoicePrefix} onChange={(event) => setSettings({ ...settings, invoicePrefix: event.target.value })} />
                </Field>
                <Field label={t("workspace.ordersSettings.fields.currency")}>
                  <Select value={settings.currency} onValueChange={(value) => setSettings({ ...settings, currency: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="MMK">MMK</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("workspace.ordersSettings.fields.taxRate")}>
                  <Input type="number" value={settings.taxRate} onChange={(event) => setSettings({ ...settings, taxRate: Number(event.target.value) })} />
                </Field>
                <Field label={t("workspace.ordersSettings.fields.paymentTerms")}>
                  <Select value={settings.paymentTerms} onValueChange={(value) => setSettings({ ...settings, paymentTerms: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="due-on-receipt">{t("workspace.ordersSettings.paymentTerms.due-on-receipt")}</SelectItem>
                      <SelectItem value="net-15">{t("workspace.ordersSettings.paymentTerms.net-15")}</SelectItem>
                      <SelectItem value="net-30">{t("workspace.ordersSettings.paymentTerms.net-30")}</SelectItem>
                      <SelectItem value="net-60">{t("workspace.ordersSettings.paymentTerms.net-60")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("workspace.ordersSettings.fields.invoiceFooter")}>
                  <Textarea placeholder={t("workspace.ordersSettings.placeholders.invoiceFooter")} className="min-h-[80px]" />
                </Field>
                <Badge variant="outline" className="w-fit">{t("workspace.ordersSettings.workspaceCompatible")}</Badge>
              </CardContent>
            </Card>
          </TabsContent>
          */}

          {/* HIDDEN: Delivery settings are not needed for now. Payment-only page requested. Uncomment to restore. */}
          {/*
          <TabsContent value="delivery">
            <Card className="workspace-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />{t("workspace.ordersSettings.deliveryTitle")}</CardTitle>
                <CardDescription>{t("workspace.ordersSettings.deliveryDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label={t("workspace.ordersSettings.fields.codEnabled")}>
                  <Switch checked={settings.codEnabled} onCheckedChange={(checked) => setSettings({ ...settings, codEnabled: checked })} />
                </Field>
                <Field label={t("workspace.ordersSettings.fields.onlinePaymentEnabled")}>
                  <Switch checked={settings.onlinePaymentEnabled} onCheckedChange={(checked) => setSettings({ ...settings, onlinePaymentEnabled: checked })} />
                </Field>
                <Field label={t("workspace.ordersSettings.fields.bankTransferEnabled")}>
                  <Switch checked={settings.bankTransferEnabled} onCheckedChange={(checked) => setSettings({ ...settings, bankTransferEnabled: checked })} />
                </Field>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                  {t("workspace.ordersSettings.invoiceFooterNote")}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          */}

          <TabsContent value="payment">
            <div className="space-y-6"><PaymentMethodSettings showOnline={settings.onlinePaymentEnabled} showBank={settings.bankTransferEnabled} /><Card className="workspace-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{t("workspace.ordersSettings.paymentTitle")}</CardTitle>
                <CardDescription>{t("workspace.ordersSettings.paymentDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow label={t("workspace.ordersSettings.fields.cashOnDelivery")} checked={settings.codEnabled} onChange={(checked) => setSettings({ ...settings, codEnabled: checked })} />
                <ToggleRow label={t("workspace.ordersSettings.fields.onlinePayment")} checked={settings.onlinePaymentEnabled} onChange={(checked) => setSettings({ ...settings, onlinePaymentEnabled: checked })} />
                <ToggleRow label={t("workspace.ordersSettings.fields.bankTransfer")} checked={settings.bankTransferEnabled} onChange={(checked) => setSettings({ ...settings, bankTransferEnabled: checked })} />
              </CardContent>
            </Card></div>
          </TabsContent>

          {/* HIDDEN: Routing settings are not needed for now. Payment-only page requested. Uncomment to restore. */}
          {/*
          <TabsContent value="routing">
            <Card className="workspace-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />{t("workspace.ordersSettings.routingTitle")}</CardTitle>
                <CardDescription>{t("workspace.ordersSettings.routingDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow label={t("workspace.ordersSettings.fields.teamRouting")} checked={settings.autoAssignment} onChange={(checked) => setSettings({ ...settings, autoAssignment: checked })} />
                <Field label={t("workspace.ordersSettings.fields.assignmentMethod")}>
                  <Select value={settings.assignmentMethod} onValueChange={(value) => setSettings({ ...settings, assignmentMethod: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">{t("workspace.ordersSettings.assignmentMethods.manual")}</SelectItem>
                      <SelectItem value="round_robin">{t("workspace.ordersSettings.assignmentMethods.round_robin")}</SelectItem>
                      <SelectItem value="least_busy">{t("workspace.ordersSettings.assignmentMethods.least_busy")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={t("workspace.ordersSettings.fields.firstResponseSla")}>
                    <Input type="number" value={settings.firstResponseSlaMinutes} onChange={(event) => setSettings({ ...settings, firstResponseSlaMinutes: Number(event.target.value) })} />
                  </Field>
                  <Field label={t("workspace.ordersSettings.fields.nextResponseSla")}>
                    <Input type="number" value={settings.nextResponseSlaMinutes} onChange={(event) => setSettings({ ...settings, nextResponseSlaMinutes: Number(event.target.value) })} />
                  </Field>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <ToggleRow label={t("workspace.ordersSettings.fields.unreadQueue")} checked={settings.unreadQueueEnabled} onChange={(checked) => setSettings({ ...settings, unreadQueueEnabled: checked })} />
                  <ToggleRow label={t("workspace.ordersSettings.fields.hotLeadQueue")} checked={settings.hotLeadQueueEnabled} onChange={(checked) => setSettings({ ...settings, hotLeadQueueEnabled: checked })} />
                  <ToggleRow label={t("workspace.ordersSettings.fields.vipQueue")} checked={settings.vipQueueEnabled} onChange={(checked) => setSettings({ ...settings, vipQueueEnabled: checked })} />
                  <ToggleRow label={t("workspace.ordersSettings.fields.overdueQueue")} checked={settings.overdueQueueEnabled} onChange={(checked) => setSettings({ ...settings, overdueQueueEnabled: checked })} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          */}
        </Tabs>
      </WorkspacePage>
    </>
  )
}

// HIDDEN: Field is only used by the hidden invoice/delivery/routing settings. Payment-only page requested. Uncomment to restore.
// function Field({ label, children }: { label: string; children: ReactNode }) {
//   return (
//     <div className="space-y-2">
//       <Label>{label}</Label>
//       {children}
//     </div>
//   )
// }

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
