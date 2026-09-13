"use client"

import { RefreshCw } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

import { BillingHistoryTab } from "@/components/billing-history-tab"
import { MyPlanTab } from "@/components/my-plan-tab"
import { PackagesTab } from "@/components/packages-tab"
import { BillingV2Tabs, useBillingV2Tab } from "@/components/billing-v2-tabs"
import { WorkspaceHeader } from "@/components/workspace-header"
import { Button } from "@/components/ui/button"
import { WorkspacePage } from "@/components/workspace"
import { billingKeys } from "@/lib/queries/billing"

export default function BillingPage() {
  const { activeTab, setActiveTab } = useBillingV2Tab()
  const queryClient = useQueryClient()

  return (
    <>
      <WorkspaceHeader
        eyebrow="Management"
        title="Plan & Billing"
        description="Review plans, usage, upcoming periods, invoices, and payment proof."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: billingKeys.all })
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <WorkspacePage containerClassName="max-w-7xl">
        <div className="space-y-8">
          <BillingV2Tabs activeTab={activeTab} onTabChange={setActiveTab} />
          {activeTab === "packages" ? (
            <PackagesTab />
          ) : activeTab === "my-plan" ? (
            <MyPlanTab />
          ) : (
            <BillingHistoryTab />
          )}
        </div>
      </WorkspacePage>
    </>
  )
}
