import type { LucideIcon } from "lucide-react"
import { FileText, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ConsoleSection } from "@/components/platform-console-shell"

export function businessStatusClass(value: string) {
  if (["active", "current", "confirmed", "delivered", "resolved", "paid_manual", "collected", "remitted"].includes(value)) {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
  }
  if (["trial", "due_soon", "open", "waiting", "scheduled", "in_transit", "cod_pending", "pending_collection", "pending_confirmation"].includes(value)) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-200"
  }
  if (["paused", "needs_attention", "overdue", "delayed", "returned", "cancelled", "payment_pending"].includes(value)) {
    return "border-rose-400/30 bg-rose-500/10 text-rose-200"
  }
  return "border-white/10 bg-white/5 text-slate-300"
}

export function BusinessBadge({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={businessStatusClass(value)}>
      {value.replaceAll("_", " ")}
    </Badge>
  )
}

export function FilterPlaceholder({
  filters,
}: {
  filters: string[]
}) {
  return (
    <ConsoleSection title="Filters" description="Filter controls are placeholders until the corresponding platform APIs are wired.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {filters.map((filter) => (
          <div key={filter} className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <Input
              readOnly
              value=""
              placeholder={filter}
              className="h-10 border-white/10 bg-slate-950/40 pl-9 text-slate-100 placeholder:text-slate-500"
            />
          </div>
        ))}
      </div>
    </ConsoleSection>
  )
}

export function FoundationNote({
  icon: Icon = FileText,
  title,
  description,
}: {
  icon?: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 p-5 text-sm leading-6 text-slate-300">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-sky-500/15 p-2 text-sky-200">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="mt-1">{description}</p>
        </div>
      </div>
    </div>
  )
}
