import { fetchPublicAddOnProducts } from "@/lib/public-add-on-products"
import { PricingAddOns } from "./pricing-add-ons"

export default async function PricingAddOnsFetcher() {
  let products = [] as Awaited<ReturnType<typeof fetchPublicAddOnProducts>>
  let loadError = ""

  try {
    products = await fetchPublicAddOnProducts()
  } catch (error) {
    console.error("[PRICING_ADD_ONS_LOAD_FAILED]", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    })
    loadError = "Please refresh the page or try again shortly."
  }

  return <PricingAddOns products={products} loadError={loadError} />
}
