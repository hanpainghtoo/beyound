"use client"

import { Users, HardDrive, MessageCircle, Mail, Send, Database } from "lucide-react"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"

type PlanDetailCardProps = {
  plan: DisplaySubscriptionPlan
}

export function PlanDetailCard({ plan }: PlanDetailCardProps) {
  return (
    <div className="rounded-[28px] border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">Selected Plan</h3>
      <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xl font-bold text-indigo-600">{plan.name}</p>
        <p className="mt-1.5 text-2xl font-bold text-slate-900">{plan.monthlyPriceDisplay}</p>
        <p className="mt-1 text-sm text-slate-500">{plan.periodDurationLabel}</p>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">{plan.summary}</p>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4 grid grid-cols-2 gap-x-4 gap-y-4">
          <div className="flex items-start gap-2.5">
            <Mail className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {plan.inboundMessageLimit ? plan.inboundMessageLimit.toLocaleString() : "Unlimited"}
              </p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider leading-tight">Inbound</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Send className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {plan.outboundMessageLimit ? plan.outboundMessageLimit.toLocaleString() : "Unlimited"}
              </p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider leading-tight">Outbound</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Database className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {plan.apiLimit ? plan.apiLimit.toLocaleString() : "Unlimited"}
              </p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider leading-tight">API</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MessageCircle className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-tight">{plan.maxChannels} Channels</p>
              <p className="text-[11px] text-slate-400 font-normal leading-tight mt-0.5 truncate">
                {plan.supportedProvidersLabel}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <HardDrive className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{plan.storageLimitGb} GB</p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider leading-tight">Storage</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Users className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{plan.maxCsrs}</p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider leading-tight">Seats</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
