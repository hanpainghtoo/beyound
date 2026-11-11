"use client"

import Link from "next/link"
import { useEffect } from "react"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  MarketingFaqAccordion,
  MarketingFinalCta,
  SectionHeading,
  marketingPrimaryButtonClass,
} from "@/components/marketing-shell"
import { trackMarketingEvent } from "@/lib/marketing-analytics"
import { publicPricingFaqs } from "@/lib/public-pricing"
import { useI18n } from "@/components/providers/i18n-provider"





export default function PricingClient({
  children,
  addOns,
}: {
  children: React.ReactNode
  addOns: React.ReactNode
}) {
  const { t } = useI18n()

  useEffect(() => {
    trackMarketingEvent("pricing_page_view", { source: "pricing" })
  }, [])

  // Pricing plan data fetching has been moved to a server component to support Suspense skeleton loading

  return (
    <>
      <section className="mx-auto max-w-[1480px] px-5 pb-14 pt-12 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            {t("pricing.heroTitleLine1")} <span className="text-indigo-600">ZayOS</span><br />
            <span className="text-indigo-600">{t("pricing.heroTitleLine2")}</span> {t("pricing.heroTitleLine3")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-7 text-slate-600">
            {t("pricing.heroSubtitle")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className={marketingPrimaryButtonClass}>
              <Link
                href="/trial"
                onClick={() => trackMarketingEvent("pricing_plan_cta_click", { source: "pricing", selected_plan: "general-demo", cta_label: "7 Days Free Trial" })}
              >
                {t("pricing.heroCta")}
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

      {addOns}

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
          <SectionHeading align="center" title={t("pricing.faqTitle")} description={t("pricing.faqSubtitle")} />
          <div className="mt-8">
            <MarketingFaqAccordion
              items={publicPricingFaqs.map((item) => ({
                question: t(item.questionKey),
                answer: item.question === "Can product or customer data be imported?" ? (
                  <span>
                    {t(item.answerKey)}{" "}
                    {t("pricing.faqPrivacyPrefix")}{" "}
                    <Link href="/privacy-policy" className="font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-4">
                      {t("footer.privacyPolicy")}
                    </Link>{" "}
                    {t("pricing.faqPrivacySuffix")}
                  </span>
                ) : (
                  t(item.answerKey)
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
            eyebrow={t("pricing.finalCtaEyebrow")}
            title={t("pricing.finalCtaTitle")}
            description={t("pricing.finalCtaDescription")}
            primaryAction={{ label: t("pricing.heroCta"), href: "/trial" }}
            secondaryAction={{ label: t("common.talkToSales"), href: "/contact?intent=sales&source=pricing" }}
          />
        </div>
      </section>
    </>
  )
}
