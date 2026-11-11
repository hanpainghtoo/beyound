import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import SubscribeClient from "./subscribe-client"
import { fetchPublicSubscriptionPlans } from "@/lib/public-subscription-plans"
import { fetchPublicLegalPolicy, type PublicLegalPolicy } from "@/lib/public-legal-policies"
import { QueryProvider } from "@/components/providers/query-provider"
import { resolvePublicSiteUrl } from "../../../shared/server-public-site-url-config"

export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  const siteUrl = resolvePublicSiteUrl(process.env)
  const canonicalUrl = siteUrl ? `${siteUrl}/subscribe` : undefined

  return {
    title: "Subscribe to ZayOS",
    description: "Choose a plan, create your workspace account, and submit payment in one place.",
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph: {
      title: "Subscribe to ZayOS",
      description: "Choose a plan, create your workspace account, and submit payment in one place.",
      url: canonicalUrl,
      siteName: "ZayOS",
      type: "website",
    },
  }
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string; paymentId?: string }>
}) {
  const { planId, paymentId } = await searchParams

  if (!planId) {
    redirect("/pricing")
  }

  const plans = await fetchPublicSubscriptionPlans()
  const plan = plans.find((p) => p.id === planId)

  if (!plan) {
    redirect("/pricing")
  }

  let policies: { terms?: PublicLegalPolicy; privacy?: PublicLegalPolicy } = {}
  let policiesLoadError = ""
  try {
    const [terms, privacy] = await Promise.all([
      fetchPublicLegalPolicy("terms_of_service"),
      fetchPublicLegalPolicy("privacy_policy"),
    ])
    policies = { terms, privacy }
  } catch (error) {
    policiesLoadError = error instanceof Error ? error.message : "Unable to load active legal policies."
  }

  return (
    <QueryProvider>
      <Suspense fallback={null}>
        <SubscribeClient
          planId={planId}
          plan={plan}
          initialPaymentId={paymentId || ""}
          policies={policies}
          policiesLoadError={policiesLoadError}
        />
      </Suspense>
    </QueryProvider>
  )
}
