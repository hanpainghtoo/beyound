import { redirect } from "next/navigation"

export default async function BillingV2Redirect({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams
  const tab = params.tab ? `?tab=${params.tab}` : ""
  redirect(`/workspace/billing${tab}`)
}