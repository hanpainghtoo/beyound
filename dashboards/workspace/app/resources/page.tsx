import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BookOpen, FileText, HelpCircle, LifeBuoy } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  MarketingFaqAccordion,
  MarketingFinalCta,
  MarketingShell,
  ResourcesHeroPreview,
  SectionHeading,
  SectionLabel,
  marketingPrimaryButtonClass,
} from "@/components/marketing-shell"

export const metadata: Metadata = {
  title: "Resources",
  description: "Browse ZayOS guides, FAQs, and support paths for chat commerce teams.",
}

const launchResources = [
  {
    label: "Guide",
    title: "Getting Started Guide",
    description: "A short introduction to how teams use ZayOS to manage conversations, orders, and deliveries.",
    href: "/contact?intent=demo",
    cta: "Read Guide",
    icon: BookOpen,
  },
  {
    label: "Overview",
    title: "Product Overview",
    description: "See the main ZayOS Workspace modules and how they fit together for conversational commerce.",
    href: "/product",
    cta: "View Product",
    icon: FileText,
  },
  {
    label: "FAQ",
    title: "Frequently Asked Questions",
    description: "Answers to common questions about plans, onboarding, and how ZayOS fits growing teams.",
    href: "/pricing",
    cta: "View FAQs",
    icon: HelpCircle,
  },
  {
    label: "Support",
    title: "Contact Support",
    description: "Need help or want to talk to the team? Reach out and we’ll guide you to the right next step.",
    href: "/contact?intent=support",
    cta: "Contact Support",
    icon: LifeBuoy,
  },
]

export default function ResourcesPage() {
  return (
    <MarketingShell footerVariant="compact">
      <section className="mx-auto max-w-[1480px] px-5 pb-16 pt-12 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <SectionLabel>Resources</SectionLabel>
            <h1 className="mt-8 text-5xl font-extrabold text-slate-950 sm:text-6xl lg:text-[72px]">
              Resources for Chat Commerce Teams
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Practical guides, setup checklists, and operational playbooks for teams running chat-led sales in Myanmar.
            </p>
            <div className="mt-8">
              <Button asChild className={marketingPrimaryButtonClass}>
                <Link href="#start-here">
                  Browse resources
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <ResourcesHeroPreview />
        </div>
      </section>

      <section id="start-here" className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <SectionHeading
            align="left"
            title="Start here"
            description="These launch-ready resources cover the key questions most visitors have on Day 1."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {launchResources.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="inline-flex rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
                  <h3 className="mt-2 text-lg font-bold text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                  <Button asChild variant="ghost" className="mt-4 h-auto px-0 font-semibold text-indigo-700 hover:bg-transparent hover:text-indigo-800">
                    <Link href={item.href}>
                      {item.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <SectionHeading
            align="left"
            title="Common launch questions"
            description="A few quick answers while the fuller help center is being prepared."
          />
          <div className="mt-8">
            <MarketingFaqAccordion
              items={[
                { question: "Can we start with a pilot?", answer: "Yes. Teams can request a guided pilot and validate ZayOS with one focused workflow." },
                { question: "Can I review packages online?", answer: "Yes. Pilot and Growth workspace details are public, while Business and Custom packages route to sales." },
                { question: "Where do existing customers sign in?", answer: "Existing workspace users should use the Sign In page with their assigned account." },
                { question: "Are more resources coming?", answer: "Yes. We’ll keep adding guides, FAQs, and support content as the product grows." },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <MarketingFinalCta
            eyebrow="Need a direct answer?"
            title="Talk to the ZayOS team about your workflow or pricing."
            primaryAction={{ label: "7 Days Free Trial", href: "/trial" }}
            secondaryAction={{ label: "Product Demo", href: "/contact?intent=demo" }}
          />
        </div>
      </section>
    </MarketingShell>
  )
}
