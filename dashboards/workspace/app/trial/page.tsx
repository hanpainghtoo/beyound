import type { Metadata } from "next"
import { Suspense } from "react"

import TrialClient from "./trial-client"
import { fetchPublicLegalPolicy, type PublicLegalPolicy } from "@/lib/public-legal-policies"
import { resolvePublicSiteUrl } from "../../../shared/server-public-site-url-config"

export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  const siteUrl = resolvePublicSiteUrl(process.env)
  const canonicalUrl = siteUrl ? `${siteUrl}/trial` : undefined

  return {
    title: "Start 7 Days Free Trial | ZayOS",
    description: "Create a workspace and start immediately on an auto-provisioned 7-day free trial.",
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph: {
      title: "Start 7 Days Free Trial | ZayOS",
      description: "Create a workspace and start immediately on an auto-provisioned 7-day free trial.",
      url: canonicalUrl,
      siteName: "ZayOS",
      type: "website",
    },
  }
}

export default async function TrialPage() {
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
    <Suspense fallback={null}>
      <TrialClient policies={policies} policiesLoadError={policiesLoadError} />
    </Suspense>
  )
}
