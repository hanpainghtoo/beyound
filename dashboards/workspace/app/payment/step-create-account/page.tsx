import { redirect } from "next/navigation"
import StepCreateAccountClient from "./step-create-account-client"

export default async function StepCreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string; paymentId?: string }>
}) {
  const { planId } = await searchParams

  if (!planId) {
    redirect("/pricing")
  }

  return <StepCreateAccountClient planId={planId} />
}
