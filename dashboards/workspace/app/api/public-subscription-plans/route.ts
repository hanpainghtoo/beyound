import { NextResponse } from "next/server"

import { fetchPublicSubscriptionPlans } from "@/lib/public-subscription-plans"

export async function GET() {
  try {
    const plans = await fetchPublicSubscriptionPlans()
    return NextResponse.json(plans)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load public subscription plans." },
      { status: 502 },
    )
  }
}
