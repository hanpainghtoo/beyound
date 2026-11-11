import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  MessageSquareText,
  ShoppingBag,
  Truck,
  UsersRound,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  MarketingFinalCta,
  MarketingShell,
  SectionHeading,
  SectionLabel,
  UseCasesHero,
  marketingPrimaryButtonClass,
  marketingSecondaryButtonClass,
} from "@/components/marketing-shell"

export const metadata: Metadata = {
  title: "Use Cases",
  description: "See how ZayOS helps online shops, sales teams, retailers, and growing brands manage chat-led sales in one workspace.",
}

const useCases = [
  {
    title: "Online Shops",
    description: "Respond faster and reduce missed orders.",
    icon: ShoppingBag,
    outcome: "Faster replies and fewer missed sales",
  },
  {
    title: "Growing Sales Teams",
    description: "Assign ownership and track follow-up clearly.",
    icon: UsersRound,
    outcome: "Every conversation has a clear next owner",
  },
  {
    title: "Retail & Distribution",
    description: "Organize orders, products, payments, and delivery.",
    icon: Building2,
    outcome: "One place for operational follow-through",
  },
  {
    title: "Local Brands",
    description: "Professional customer service without heavy ERP software.",
    icon: Zap,
    outcome: "Lean setup with a polished customer experience",
  },
]

const challenges = [
  ["Too many chats, hard to keep up", "Unified inbox brings all chats into one place."],
  ["Manual order taking", "Convert chats to orders quickly."],
  ["No visibility on deliveries", "Track deliveries and update customers."],
  ["Scattered customer info", "Save customer history in one profile."],
  ["Hard to measure performance", "Dashboards show what matters."],
]

export default function UseCasesPage() {
  return (
    <MarketingShell footerVariant="compact">
      <section className="mx-auto grid max-w-[1480px] items-center gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:px-10">
        <div>
          <SectionLabel>Use Cases</SectionLabel>
          <h1 className="mt-8 text-5xl font-extrabold text-slate-950 sm:text-6xl lg:text-[72px]">
            Built for Businesses That Sell Through Chat
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            ZayOS helps teams turn conversations into customers, orders, deliveries, and repeat sales.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className={marketingPrimaryButtonClass}>
              <Link href="/trial">7 Days Free Trial <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" className={marketingSecondaryButtonClass}>
              <Link href="/contact?intent=demo">Product Demo</Link>
            </Button>
          </div>
        </div>
        <UseCasesHero />
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <SectionHeading align="center" title="ZayOS is designed for businesses of different sizes." description="The same outcome across online shops, sales teams, retail, and local brands." />
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {useCases.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="inline-flex rounded-2xl bg-violet-50 p-3 text-violet-600">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outcome</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{item.outcome}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <SectionHeading
            align="center"
            title="Common challenges businesses face - and how ZayOS solves them"
            description="From messy chats to missed deliveries, ZayOS brings order to every step."
          />
          <div className="mt-10 hidden overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-4">Challenge</th>
                  <th className="px-5 py-4">How ZayOS helps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {challenges.map(([left, right]) => (
                  <tr key={left}>
                    <td className="px-5 py-4 text-slate-600">{left}</td>
                    <td className="px-5 py-4 font-medium text-slate-950">{right}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-8 grid gap-4 lg:hidden">
            {challenges.map(([left, right]) => (
              <div key={left} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-950">{left}</p>
                <p className="mt-2 text-sm leading-7 text-slate-600">{right}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <SectionHeading align="center" title="Handling conversations, orders, and deliveries - the ZayOS way" description="The difference is a smarter workflow that keeps the next step obvious." />
          <div className="mt-10 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-5">
              {[
                ["Messages come in", "Chat from every channel lands in one inbox.", MessageSquareText],
                ["Chats converted to orders", "The team creates orders from conversations.", ShoppingBag],
                ["Delivery tracked", "Delivery updates stay visible.", Truck],
                ["Customers get updates", "Customers know what is happening.", CheckCircle2],
                ["Happy customers", "Sales flow becomes easier to manage.", Zap],
              ].map(([title, description, Icon]) => (
                <div key={title as string} className="rounded-2xl border border-slate-200 p-4 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-950">{title as string}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description as string}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <MarketingFinalCta
            eyebrow="Final CTA"
            title="Ready to turn more conversations into happy customers?"
            primaryAction={{ label: "7 Days Free Trial", href: "/trial" }}
            secondaryAction={{ label: "Product Demo", href: "/contact?intent=demo" }}
          />
        </div>
      </section>
    </MarketingShell>
  )
}
