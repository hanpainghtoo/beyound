import { Building2, MailPlus, Store, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConsoleHeader, ConsolePage, ConsoleSection } from "@/components/platform-console-shell"

export default function Page() {
  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Tenant Onboarding"
        description="Create tenants, assign an owner, pick a plan, configure trial access, enable channels, and send the first invite."
        actions={<Button className="bg-sky-500 text-slate-950 hover:bg-sky-400">Start onboarding</Button>}
      />
      <ConsolePage>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <ConsoleSection title="Create tenant" description="Provision the account and prepare the first billing and access settings.">
            <div className="grid gap-4 md:grid-cols-2">
              {["Tenant name", "Owner name", "Owner email", "Company website"].map((label) => (
                <div key={label}>
                  <Label className="text-slate-300">{label}</Label>
                  <Input className="mt-2 border-white/10 bg-white/5 text-white placeholder:text-slate-500" />
                </div>
              ))}
              <div>
                <Label className="text-slate-300">Plan</Label>
                <Select defaultValue="growth">
                  <SelectTrigger className="mt-2 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
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
