import Link from "next/link"
import {
  ArrowRight,
  Banknote,
  BarChart3,
  MessagesSquare,
  Store,
  Truck,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

import { WorkspaceCard, WorkspacePage } from "@/components/workspace"
import { WorkspaceHeader } from "@/components/workspace-header"

type ReportLink = {
  title: string
  description: string
  href: string
  icon: LucideIcon
  iconClass: string
  iconBackground: string
}

const reports: ReportLink[] = [
  {
    title: "Conversation Report",
    description: "Conversation volume, resolution, response time, and channel activity.",
    href: "/workspace/reports/conversations",
    icon: MessagesSquare,
    iconClass: "text-blue-600 dark:text-blue-300",
    iconBackground: "bg-blue-50 dark:bg-blue-500/15",
  },
  {
    title: "Sales & Orders Report",
    description: "Order volume, revenue, fulfillment, and conversation conversion.",
    href: "/workspace/reports/sales-orders",
    icon: BarChart3,
    iconClass: "text-violet-600 dark:text-violet-300",
    iconBackground: "bg-violet-50 dark:bg-violet-500/15",
  },
  {
    title: "Delivery Report",
    description: "Delivery progress, courier assignments, delays, and returns.",
    href: "/workspace/reports/deliveries",
    icon: Truck,
    iconClass: "text-cyan-700 dark:text-cyan-300",
    iconBackground: "bg-cyan-50 dark:bg-cyan-500/15",
  },
  {
    title: "Customer Report",
    description: "Customer growth, activity, repeat purchases, and key segments.",
    href: "/workspace/reports/customers",
    icon: UsersRound,
    iconClass: "text-sky-700 dark:text-sky-300",
    iconBackground: "bg-sky-50 dark:bg-sky-500/15",
  },
  {
    title: "Product Report",
    description: "Catalog activity, stock health, product demand, and orders.",
    href: "/workspace/reports/products",
    icon: Store,
    iconClass: "text-amber-700 dark:text-amber-300",
    iconBackground: "bg-amber-50 dark:bg-amber-500/15",
  },
  {
    title: "Payment/COD Report",
    description: "Collected payments, COD balances, transfers, and confirmations.",
    href: "/workspace/reports/payments",
    icon: Banknote,
    iconClass: "text-emerald-700 dark:text-emerald-300",
    iconBackground: "bg-emerald-50 dark:bg-emerald-500/15",
  },
]

export default function ReportsPage() {
  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Reports"
        description="Review performance across conversations, sales, delivery, customers, products, and payments."
      />

      <WorkspacePage containerClassName="max-w-7xl">
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">All reports</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a report to review its latest records and key metrics.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => {
            const Icon = report.icon

            return (
              <WorkspaceCard key={report.href} className="group transition-colors hover:border-indigo-200 dark:hover:border-indigo-700">
                <Link href={report.href} className="flex min-h-[176px] flex-col p-5">
                  <div className="flex items-start justify-between gap-4">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-md ${report.iconBackground}`}>
                      <Icon aria-hidden="true" className={`h-5 w-5 ${report.iconClass}`} strokeWidth={1.9} />
                    </span>
                    <ArrowRight aria-hidden="true" className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-300" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-950 dark:text-slate-50">{report.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{report.description}</p>
                </Link>
              </WorkspaceCard>
            )
          })}
        </div>
      </WorkspacePage>
    </>
  )
}
