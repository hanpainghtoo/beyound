import { redirect } from "next/navigation"

export default async function StepChooseMethodPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string; paymentId?: string }>
}) {
  const { planId, paymentId } = await searchParams

  if (!planId) {
    redirect("/pricing")
  }

  const suffix = paymentId ? `&paymentId=${encodeURIComponent(paymentId)}` : ""
  redirect(`/subscribe?planId=${encodeURIComponent(planId)}${suffix}`)
}
