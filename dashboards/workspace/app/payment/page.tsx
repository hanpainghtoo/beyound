import { redirect } from "next/navigation"

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string }>
}) {
  const { planId } = await searchParams

  if (!planId) {
    redirect("/pricing")
  }

  redirect(`/payment/step-create-account?planId=${encodeURIComponent(planId)}`)
}
