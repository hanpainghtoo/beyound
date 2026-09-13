"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CreditCard, FileText, Save, Settings, Truck } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage } from "@/components/workspace"
import { getApiErrorMessage, tenantSettingsApi, type UpdateTenantSettingsInput } from "@/lib/api"
import type { ReactNode } from "react"

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

const defaultSettings: OrderSettingsState = {
  invoicePrefix: "INV",
  taxRate: 10,
  currency: "USD",
  paymentTerms: "Net 30",
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

export default function OrdersSettingsPage() {
  const [settings, setSettings] = useState<OrderSettingsState>(defaultSettings)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")

  useEffect(() => {
    tenantSettingsApi
      .get()
      .then((tenant) => {
        const productivity = (tenant.featureFlags?.csrProductivity || {}) as Partial<OrderSettingsState>
        setSettings((current) => ({ ...current, ...productivity }))
      })
      .catch((error) => setStatusMessage(getApiErrorMessage(error, "Failed to load order settings")))
  }, [])

  const saveSettings = async () => {
    setIsSaving(true)
    setStatusMessage("")
    try {
      const tenant = await tenantSettingsApi.get()
      const payload: UpdateTenantSettingsInput = {
        featureFlags: {
          ...(tenant.featureFlags || {}),
          csrProductivity: settings,
        },
      }
      await tenantSettingsApi.update(payload)
      setStatusMessage("Order and productivity settings saved.")
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error, "Failed to save order settings"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Management"
        title="Order Settings"
        description="Keep invoice, payment, and routing behavior aligned with the workspace."
        actions={
          <Button onClick={saveSettings} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        }
      />

      <WorkspacePage>
        {statusMessage ? <div className="rounded-xl border bg-white px-3 py-2 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-950">{statusMessage}</div> : null}

        <Tabs defaultValue="invoice" className="space-y-6">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
            <TabsTrigger value="payment">Payment</TabsTrigger>
            <TabsTrigger value="routing">Routing</TabsTrigger>
          </TabsList>

          <TabsContent value="invoice">
            <Card className="workspace-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Invoice Configuration</CardTitle>
                <CardDescription>Configure numbering, currency, and invoice defaults.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label="Invoice Prefix">
                  <Input value={settings.invoicePrefix} onChange={(event) => setSettings({ ...settings, invoicePrefix: event.target.value })} />
                </Field>
                <Field label="Currency">
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
                <Field label="Tax Rate (%)">
                  <Input type="number" value={settings.taxRate} onChange={(event) => setSettings({ ...settings, taxRate: Number(event.target.value) })} />
                </Field>
                <Field label="Payment Terms">
                  <Select value={settings.paymentTerms} onValueChange={(value) => setSettings({ ...settings, paymentTerms: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                      <SelectItem value="Net 15">Net 15</SelectItem>
                      <SelectItem value="Net 30">Net 30</SelectItem>
                      <SelectItem value="Net 60">Net 60</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Invoice Footer">
                  <Textarea placeholder="Thank you for your business!" className="min-h-[80px]" />
                </Field>
                <Badge variant="outline" className="w-fit">Workspace compatible</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery">
            <Card className="workspace-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />Delivery and Fees</CardTitle>
                <CardDescription>Configure delivery behaviour and default fee handling.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label="COD enabled">
                  <Switch checked={settings.codEnabled} onCheckedChange={(checked) => setSettings({ ...settings, codEnabled: checked })} />
                </Field>
                <Field label="Online payment enabled">
                  <Switch checked={settings.onlinePaymentEnabled} onCheckedChange={(checked) => setSettings({ ...settings, onlinePaymentEnabled: checked })} />
                </Field>
                <Field label="Bank transfer enabled">
                  <Switch checked={settings.bankTransferEnabled} onCheckedChange={(checked) => setSettings({ ...settings, bankTransferEnabled: checked })} />
                </Field>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                  Delivery fees and zone rules stay compatible with the existing order flow.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment">
            <Card className="workspace-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment Methods</CardTitle>
                <CardDescription>Enable and disable the workspace payment methods.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow label="Cash on Delivery" checked={settings.codEnabled} onChange={(checked) => setSettings({ ...settings, codEnabled: checked })} />
                <ToggleRow label="Online Payment" checked={settings.onlinePaymentEnabled} onChange={(checked) => setSettings({ ...settings, onlinePaymentEnabled: checked })} />
                <ToggleRow label="Bank Transfer" checked={settings.bankTransferEnabled} onChange={(checked) => setSettings({ ...settings, bankTransferEnabled: checked })} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="routing">
            <Card className="workspace-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Order Routing Rules</CardTitle>
                <CardDescription>Set how conversations and orders move through the workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow label="Team routing" checked={settings.autoAssignment} onChange={(checked) => setSettings({ ...settings, autoAssignment: checked })} />
                <Field label="Assignment method">
                  <Select value={settings.assignmentMethod} onValueChange={(value) => setSettings({ ...settings, assignmentMethod: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual assignment</SelectItem>
                      <SelectItem value="round_robin">Round robin</SelectItem>
                      <SelectItem value="least_busy">Least busy</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="First response target (minutes)">
                    <Input type="number" value={settings.firstResponseSlaMinutes} onChange={(event) => setSettings({ ...settings, firstResponseSlaMinutes: Number(event.target.value) })} />
                  </Field>
                  <Field label="Next response target (minutes)">
                    <Input type="number" value={settings.nextResponseSlaMinutes} onChange={(event) => setSettings({ ...settings, nextResponseSlaMinutes: Number(event.target.value) })} />
                  </Field>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <ToggleRow label="Unread queue" checked={settings.unreadQueueEnabled} onChange={(checked) => setSettings({ ...settings, unreadQueueEnabled: checked })} />
                  <ToggleRow label="Hot lead queue" checked={settings.hotLeadQueueEnabled} onChange={(checked) => setSettings({ ...settings, hotLeadQueueEnabled: checked })} />
                  <ToggleRow label="VIP queue" checked={settings.vipQueueEnabled} onChange={(checked) => setSettings({ ...settings, vipQueueEnabled: checked })} />
                  <ToggleRow label="Overdue queue" checked={settings.overdueQueueEnabled} onChange={(checked) => setSettings({ ...settings, overdueQueueEnabled: checked })} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
