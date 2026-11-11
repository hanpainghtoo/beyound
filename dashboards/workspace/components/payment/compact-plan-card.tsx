"use client"

import { Users, HardDrive, MessageCircle, Mail, Send } from "lucide-react"
import { useI18n } from "@/components/providers/i18n-provider"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"

type CompactPlanCardProps = {
  plan: DisplaySubscriptionPlan
}

/** Condensed plan summary for the subscribe flow sidebar: price + key limits only. */
export function CompactPlanCard({ plan }: CompactPlanCardProps) {
  const { t, translate } = useI18n()

  return (
    <div className="rounded-[22px] border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">{t("registration.selectedPlanLabel")}</p>
      <h3 className="mt-1 text-lg font-bold text-slate-950">{translate(plan.name)}</h3>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-xl font-bold text-slate-900">{translate(plan.monthlyPriceDisplay)}</p>
        <p className="text-xs text-slate-500">{translate(plan.periodDurationLabel)}</p>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <LimitRow
          icon={<Mail className="h-4 w-4 shrink-0 text-indigo-500" />}
          value={plan.inboundMessageLimit == null ? t("common.unlimited") : plan.inboundMessageLimit.toLocaleString()}
          label={t("pricing.inbound")}
        />
        <LimitRow
          icon={<Send className="h-4 w-4 shrink-0 text-indigo-500" />}
          value={plan.outboundMessageLimit == null ? t("common.unlimited") : plan.outboundMessageLimit.toLocaleString()}
          label={t("pricing.outbound")}
        />
        <LimitRow
          icon={<MessageCircle className="h-4 w-4 shrink-0 text-indigo-500" />}
          value={plan.maxChannels == null ? `${t("common.unlimited")} ${t("pricing.channels")}` : `${plan.maxChannels} ${t("pricing.channels")}`}
          label={translate(plan.supportedProvidersLabel)}
        />
        <LimitRow
          icon={<Users className="h-4 w-4 shrink-0 text-indigo-500" />}
          value={plan.maxAgents == null ? `${t("common.unlimited")} ${t("pricing.usersUnit")}` : `${plan.maxAgents} ${t("pricing.usersUnit")}`}
          label={t("pricing.seats")}
        />
        <LimitRow
          icon={<HardDrive className="h-4 w-4 shrink-0 text-indigo-500" />}
          value={plan.storageLimitGb == null ? `${t("common.unlimited")} ${t("pricing.storage")}` : `${plan.storageLimitGb} GB`}
          label={t("pricing.storage")}
        />
      </div>

      <p className="mt-3 text-center text-[11px] font-medium text-slate-500">
        {t("registration.noProrationNote")}
      </p>
    </div>
  )
}

function LimitRow({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string
  label: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">{value}</p>
        <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      </div>
    </div>
  )
}
