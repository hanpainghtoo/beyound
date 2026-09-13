import { redirect } from "next/navigation"
import { fetchPublicSubscriptionPlans } from "@/lib/public-subscription-plans"
import StepUploadReceiptClient from "./step-upload-receipt-client"

export default async function StepUploadReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string }>
}) {
  const { planId } = await searchParams

  if (!planId) {
    redirect("/pricing")
  }

  const plans = await fetchPublicSubscriptionPlans()
  const plan = plans.find((p) => p.id === planId)

  if (!plan) {
    redirect("/pricing")
  }

  return <StepUploadReceiptClient planId={planId} />
}
