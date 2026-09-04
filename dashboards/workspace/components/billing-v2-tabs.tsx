"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo } from "react"

import { cn } from "@/lib/utils"

export const BILLING_V2_TABS = [
  { value: "my-plan", label: "My Plan" },
  { value: "packages", label: "Packages" },
  { value: "billing-history", label: "Billing History" },
] as const

export type BillingV2Tab = (typeof BILLING_V2_TABS)[number]["value"]

function isBillingV2Tab(value: string | null): value is BillingV2Tab {
  return BILLING_V2_TABS.some((tab) => tab.value === value)
}

export function useBillingV2Tab() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const activeTab = useMemo<BillingV2Tab>(() => {
    const requestedTab = searchParams.get("tab")
    return isBillingV2Tab(requestedTab) ? requestedTab : "my-plan"
  }, [searchParams])

  const setActiveTab = (tab: BillingV2Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return { activeTab, setActiveTab }
}

export function BillingV2Tabs({
  activeTab,
  onTabChange,
}: {
  activeTab: BillingV2Tab
  onTabChange: (tab: BillingV2Tab) => void
}) {
  return (
    <nav
      aria-label="Billing sections"
      data-testid="billing-v2-tabs"
      className="border-b-4 border-slate-200/90 dark:border-slate-800"
    >
      <div role="tablist" className="grid grid-cols-3">
        {BILLING_V2_TABS.map((tab) => {
          const active = tab.value === activeTab
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-current={active ? "page" : undefined}
              aria-selected={active}
              aria-label={`Open ${tab.label}`}
              data-testid={`billing-v2-tab-${tab.value}`}
              onClick={() => onTabChange(tab.value)}
              className={cn(
                "relative -mb-1 min-w-0 px-2 py-3 text-center text-base font-semibold transition-colors sm:px-4 sm:py-4 sm:text-xl",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950",
                active
                  ? "text-indigo-600 dark:text-indigo-300"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
              )}
            >
              {tab.label}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 bottom-0 h-1 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

