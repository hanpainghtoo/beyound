import { fetchPublicSubscriptionPlans } from "@/lib/public-subscription-plans"
import { PricingCards } from "./pricing-cards"

export default async function PricingCardsFetcher() {
  let plans = [] as Awaited<ReturnType<typeof fetchPublicSubscriptionPlans>>
  let loadError = ""

  try {
    const fetchedPlans = await fetchPublicSubscriptionPlans()
    plans = JSON.parse(
      JSON.stringify(fetchedPlans, (_key, value) => {
        if (typeof value === "bigint") {
          return value.toString()
        }
        return value
      }),
    )
  } catch (error) {
    console.error("[PRICING_PLAN_LOAD_FAILED]", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    })
    loadError = "Unable to load the live pricing catalog."
  }

  return <PricingCards plans={plans} loadError={loadError} />
}
