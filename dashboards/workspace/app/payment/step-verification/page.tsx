import { redirect } from "next/navigation"
import StepVerificationClient from "./step-verification-client"

export default async function StepVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string; paymentId?: string }>
}) {
  const { planId, paymentId } = await searchParams

  if (!planId) {
    redirect("/pricing")
  }

  return <StepVerificationClient planId={planId} paymentId={paymentId || ""} />
}
