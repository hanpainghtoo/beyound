"use client"

import Link from "next/link"
import { useEffect } from "react"
import { ArrowRight, Send, Check, Download, } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  MarketingFaqAccordion,
  MarketingFinalCta,
  SectionHeading,
  marketingPrimaryButtonClass,
} from "@/components/marketing-shell"
import { trackMarketingEvent } from "@/lib/marketing-analytics"
import { publicPricingFaqs } from "@/lib/public-pricing"





export default function PricingClient({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    trackMarketingEvent("pricing_page_view", { source: "pricing" })
  }, [])

  // Pricing plan data fetching has been moved to a server component to support Suspense skeleton loading

  return (
    <>
      <section className="mx-auto max-w-[1480px] px-5 pb-14 pt-12 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Choose the Right <span className="text-indigo-600">ZayOS</span><br />
            <span className="text-indigo-600">Plan</span> for Your Business
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-7 text-slate-600">
            Choose a guided ZayOS plan based on your team size, sales channels, and workflow. We'll help you find the right setup for your business and get started with confidence.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className={marketingPrimaryButtonClass}>
              <Link
                href="/trial"
                onClick={() => trackMarketingEvent("pricing_plan_cta_click", { source: "pricing", selected_plan: "general-demo", cta_label: "7 Days Free Trial" })}
              >
                7 Days Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* <section className="pb-16">
        <div className="mx-auto max-w-[1120px] px-5 sm:px-8 lg:px-10">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <SectionHeading
              title="Subscription plus guided setup"
              description="This page is wired directly to the live subscription catalog managed in Platform Console. Monthly subscription covers the ongoing workspace package, while setup or implementation covers onboarding, operational preparation, and activation for the agreed scope."
            />
          </div>
        </div>
      </section> */}

      <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          {children}
        </div>
      </section>

      <section className="pb-16 bg-slate-50/50 pt-16 mt-8 border-t border-slate-100">
        <div className="mx-auto max-w-4xl px-5 sm:px-8 lg:px-10 text-center">
          <h2 className="text-4xl font-bold text-slate-950">Add Ons</h2>
          <p className="mt-4 text-lg leading-7 text-slate-600 max-w-2xl mx-auto">
            Choose a guided ZayOS plan based on your team size, sales channels, and workflow. We'll help you find the right setup for your business and get started with confidence.
          </p>
        </div>
        
        <div className="mx-auto max-w-4xl px-5 sm:px-8 lg:px-10 mt-12">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Inbound Messages Add-on */}
            <article className="flex flex-col rounded-3xl border border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white shrink-0">
                  <Download className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-950">Inbound Messages</h3>
              </div>
              <p className="mt-3 text-sm text-slate-600 pl-14">
                Add more capacity for customer conversations coming into your business.
              </p>
              
              <ul className="mt-6 flex-1 space-y-3 border-t border-indigo-100 pt-6">
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                  <span className="text-sm font-medium text-slate-700">All channels included</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                  <span className="text-sm font-medium text-slate-700">Choose from 1K, 5K, or 10K messages</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                  <span className="text-sm font-medium text-slate-700">Add more capacity as your volume grows</span>
                </li>
              </ul>

              <div className="mt-8 flex flex-col items-center justify-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Starting from</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-indigo-600">MMK 50,000</span>
                  <span className="text-sm font-semibold text-slate-500">/ 1K msg</span>
                </div>
              </div>
            </article>

            {/* Outbound Messages Add-on */}
            <article className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white shrink-0">
                  <Send className="h-5 w-5 ml-0.5" />
                </div>
                <h3 className="text-xl font-bold text-slate-950">Outbound Messages</h3>
              </div>
              <p className="mt-3 text-sm text-slate-600 pl-14">
                Add more capacity for messages your team sends to customers.
              </p>
              
              <ul className="mt-6 flex-1 space-y-3 border-t border-slate-100 pt-6">
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                  <span className="text-sm font-medium text-slate-700">All channels included</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                  <span className="text-sm font-medium text-slate-700">Choose from 1K, 5K, or 10K messages</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                  <span className="text-sm font-medium text-slate-700">Add more capacity as your volume grows</span>
                </li>
              </ul>

              <div className="mt-8 flex flex-col items-center justify-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Starting from</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-indigo-600">MMK 50,000</span>
                  <span className="text-sm font-semibold text-slate-500">/ 1K msg</span>
                </div>
              </div>
            </article>

          </div>
        </div>
      </section>

      {/* <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <SectionHeading
            align="center"
            title="Plan comparison"
            description="Compare the live commercial and operating limits that are currently published from Platform Console."
          />
          <div className="mt-8 grid gap-4">
            {comparisonRows.map((row) => (
              <div key={row.label} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">{row.label}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {visiblePlans.map((plan) => (
                    <div key={`${row.label}-${plan.id}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-sm font-semibold text-slate-950">{plan.name}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {row.value(plan)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section> */}




      <section className="pb-16">
        <div className="mx-auto max-w-[1120px] px-5 sm:px-8 lg:px-10">
          <SectionHeading align="center" title="Frequently asked questions" description="Answers to common rollout and onboarding questions." />
          <div className="mt-8">
            <MarketingFaqAccordion
              items={publicPricingFaqs.map((item) => ({
                question: item.question,
                answer: item.question === "Can product or customer data be imported?" ? (
                  <span>
                    {item.answer} Review the{" "}
                    <Link href="/privacy-policy" className="font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-4">
                      Privacy Policy
                    </Link>{" "}
                    before sharing any live business data during evaluation or onboarding.
                  </span>
                ) : (
                  item.answer
                ),
              }))}
              onItemToggle={(value) => {
                const index = Number.parseInt(value.replace("item-", ""), 10)
                const item = publicPricingFaqs[index]
                if (!item) return
                trackMarketingEvent("pricing_faq_expand", {
                  source: "pricing",
                  faq_question: item.question,
                })
              }}
            />
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <MarketingFinalCta
            eyebrow="Start with a real commerce workflow"
            title="Tell us how your team handles messages, orders, payments, and delivery."
            description="We’ll recommend the rollout that fits your team size, channel mix, and daily operating workflow."
            primaryAction={{ label: "7 Days Free Trial", href: "/trial" }}
            secondaryAction={{ label: "Talk to Sales", href: "/contact?intent=sales&source=pricing" }}
          />
        </div>
      </section>
    </>
  )
}
