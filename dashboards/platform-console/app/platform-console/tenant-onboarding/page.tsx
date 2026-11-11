"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Building2, Loader2, MailPlus, Store, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConsoleHeader, ConsolePage, ConsoleSection } from "@/components/platform-console-shell"
import { createPlatformTenant, getSubscriptionPlans, type SubscriptionPlanDto } from "@/lib/api"

export default function Page() {
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    tenantName: "",
    ownerName: "",
    ownerEmail: "",
    companyWebsite: "",
    selectedPlanId: "",
    startWithTrial: true,
  })

  useEffect(() => {
    getSubscriptionPlans()
      .then((data) => {
        setPlans(data)
        setForm((prev) => {
          if (data.length > 0 && !prev.selectedPlanId) {
            return { ...prev, selectedPlanId: data[0].id }
          }
          return prev
        })
      })
      .catch(() => {})
  }, [])

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!form.tenantName.trim()) {
      toast.error("Tenant name is required")
      return
    }
    if (!form.ownerEmail.trim()) {
      toast.error("Owner email is required")
      return
    }

    setIsSubmitting(true)
    try {
      const tenantCode = form.tenantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30)

      const result = await createPlatformTenant({
        tenantCode,
        companyName: form.tenantName,
        contactPerson: form.ownerName || undefined,
        contactEmail: form.ownerEmail,
        website: form.companyWebsite || undefined,
        subscriptionPlanId: form.selectedPlanId || undefined,
        ownerFullName: form.ownerName || undefined,
        ownerEmail: form.ownerEmail,
        startWithTrial: form.startWithTrial,
      })

      toast.success(`Tenant "${result.tenant.companyName}" created. Invite sent to ${form.ownerEmail}.`)
      setForm({
        tenantName: "",
        ownerName: "",
        ownerEmail: "",
        companyWebsite: "",
        selectedPlanId: plans[0]?.id || "",
        startWithTrial: true,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create tenant")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Tenant Onboarding"
        description="Create tenants, assign an owner, pick a plan, configure trial access, enable channels, and send the first invite."
        actions={
          <Button
            className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Start onboarding"
            )}
          </Button>
        }
      />
      <ConsolePage>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <ConsoleSection title="Create tenant" description="Provision the account and prepare the first billing and access settings.">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-slate-300">Tenant name</Label>
                <Input
                  className="mt-2 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                  value={form.tenantName}
                  onChange={(e) => handleChange("tenantName", e.target.value)}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <Label className="text-slate-300">Owner name</Label>
                <Input
                  className="mt-2 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                  value={form.ownerName}
                  onChange={(e) => handleChange("ownerName", e.target.value)}
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <Label className="text-slate-300">Owner email</Label>
                <Input
                  className="mt-2 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => handleChange("ownerEmail", e.target.value)}
                  placeholder="e.g. owner@example.com"
                />
              </div>
              <div>
                <Label className="text-slate-300">Company website</Label>
                <Input
                  className="mt-2 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                  value={form.companyWebsite}
                  onChange={(e) => handleChange("companyWebsite", e.target.value)}
                  placeholder="e.g. https://acme.com"
                />
              </div>
              <div>
                <Label className="text-slate-300">Plan</Label>
                <Select value={form.selectedPlanId} onValueChange={(value) => handleChange("selectedPlanId", value)}>
                  <SelectTrigger className="mt-2 border-white/10 bg-white/5 text-white"><SelectValue placeholder="Select a plan" /></SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} — {plan.monthlyPrice ? `${plan.monthlyPrice.toLocaleString()} MMK/mo` : "Custom"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Trial access</Label>
                <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-300">
                  Enabled via the configured trial plan — duration is set
                  server-side and cannot be edited here.
                </div>
              </div>
            </div>
          </ConsoleSection>

          <ConsoleSection title="Onboarding checklist" description="The platform team can enable or skip these steps as needed.">
            <div className="space-y-3">
              {[
                ["Assign owner", "Choose the billing and platform owner."],
                ["Set trial", "Decide if the tenant starts in trial mode."],
                ["Enable channels", "Messenger, Telegram, Viber, Website Chat."],
                ["Send invite", "Invite the owner and first admin user."],
              ].map(([title, detail], index) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-sky-500/15 p-2 text-sky-200">{index + 1}</div>
                    <div>
                      <p className="font-medium text-white">{title}</p>
                      <p className="mt-1 text-sm text-slate-400">{detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ConsoleSection>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: Building2, title: "Tenant record", note: "Create the account in the platform registry." },
            { icon: UsersRound, title: "Owner invitation", note: "Create the first platform-owned account." },
            { icon: Store, title: "Channel enablement", note: "Provision the requested channel providers." },
            { icon: MailPlus, title: "Email delivery", note: "Send the invite and onboarding checklist." },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_60px_rgba(2,6,23,0.25)]">
                <Icon className="h-5 w-5 text-sky-300" />
                <p className="mt-3 font-medium text-white">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{item.note}</p>
              </div>
            )
          })}
        </div>
      </ConsolePage>
    </>
  )
}
