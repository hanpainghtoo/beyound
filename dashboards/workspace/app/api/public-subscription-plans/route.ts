import { NextResponse } from "next/server"
import { fetchPublicSubscriptionPlans } from "@/lib/public-subscription-plans"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Live public plan catalog with frontend transformations applied
export async function GET() {
  try {
    const plans = await fetchPublicSubscriptionPlans()
    return NextResponse.json(plans)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[workspace-public-subscription-plans] ${message}`)
    return NextResponse.json(
      { error: "Unable to load subscription plans." },
      { status: 503 },
    )
  }
}
