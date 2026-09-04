"use client"

import Link from "next/link"
import { AlertCircle, Users, HardDrive, MessageCircle, Mail, Send, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trackMarketingEvent } from "@/lib/marketing-analytics"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"

export function PricingCards({ plans, loadError }: { plans: DisplaySubscriptionPlan[]; loadError?: string }) {
  const visiblePlans = plans.filter((plan) => plan.status === "active")

  if (loadError) {
    return (
      <div className="mx-auto max-w-[1120px] rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Live pricing catalog unavailable</p>
            <p className="mt-1">{loadError}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {visiblePlans.map((plan) => (
        <article
          key={plan.id}
          className={`relative flex h-full flex-col rounded-[32px] border bg-white p-6 sm:p-8 shadow-sm ${
            plan.recommended ? "border-indigo-500 ring-2 ring-indigo-500" : "border-slate-200/80"
          }`}
        >
          {plan.recommended ? (
            <div className="absolute -top-3.5 left-0 right-0 flex justify-center">
              <span className="rounded-full bg-indigo-600 px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                {plan.recommendationLabel.length > 15 ? "Recommended" : plan.recommendationLabel}
              </span>
            </div>
          ) : null}
          
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-950 mt-2">{plan.name}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{plan.summary}</p>
          </div>

          <div className="mt-6 flex flex-col">
            <div>
              <p className="text-2xl font-bold text-slate-950">{plan.monthlyPriceDisplay}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">{plan.periodDurationLabel}</p>
            </div>

            <div className="mt-8 mb-6 rounded-3xl bg-slate-50 p-5 sm:p-6 grid grid-cols-2 gap-y-5 gap-x-3 text-sm font-medium text-slate-700">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 shrink-0 text-indigo-500" />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-slate-900 truncate">{plan.inboundMessageLimit ? plan.inboundMessageLimit.toLocaleString() : 'Unlimited'}</span>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider">Inbound</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Send className="h-5 w-5 shrink-0 text-indigo-500" />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-slate-900 truncate">{plan.outboundMessageLimit ? plan.outboundMessageLimit.toLocaleString() : 'Unlimited'}</span>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider">Outbound</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Database className="h-5 w-5 shrink-0 text-indigo-500" />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-slate-900 truncate">{plan.apiLimit ? plan.apiLimit.toLocaleString() : 'Unlimited'}</span>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider">API</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 shrink-0 text-indigo-500" />
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 whitespace-nowrap">{plan.maxChannels} Channels</span>
                  <span className="text-[10px] text-slate-400 font-normal leading-tight mt-0.5 line-clamp-2">{plan.supportedProvidersLabel}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <HardDrive className="h-5 w-5 shrink-0 text-indigo-500" />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-slate-900 truncate">{plan.storageLimitGb} GB</span>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider">Storage</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 shrink-0 text-indigo-500" />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-slate-900 truncate">{plan.maxCsrs} Users</span>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider">Seats</span>
                </div>
              </div>
            </div>
          </div>

          <Button
            asChild
            className={`mt-6 h-12 w-full rounded-2xl font-semibold ${
              plan.recommended ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
            }`}
            variant={plan.recommended ? "default" : "outline"}
          >
            <Link
              href={plan.ctaHref}
              onClick={() =>
                trackMarketingEvent("pricing_plan_cta_click", {
                  source: "pricing",
                  selected_plan: plan.name,
                  cta_label: plan.ctaLabel,
                })
              }
            >
              {plan.ctaLabel}
            </Link>
          </Button>
        </article>
      ))}
    </div>
  )
}
