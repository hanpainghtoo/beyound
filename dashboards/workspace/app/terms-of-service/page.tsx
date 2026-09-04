import type { Metadata } from "next"

import { LegalPolicyPage } from "@/components/legal-policy-page"
import { getFallbackLegalPolicy } from "@/lib/public-legal-policy-fallbacks"
import { fetchPublicLegalPolicy } from "@/lib/public-legal-policies"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of service information for ZayOS.",
}

export const dynamic = "force-dynamic"

export default async function TermsOfServicePage({ searchParams }: { searchParams?: Promise<{ version?: string }> }) {
  let policy
  let loadError: string | undefined
  const params = await searchParams
  try {
    policy = await fetchPublicLegalPolicy("terms_of_service", params?.version)
  } catch (error) {
    loadError = error instanceof Error ? error.message : undefined
  }
  return (
    <LegalPolicyPage
      fallbackTitle="Terms of Service"
      policy={policy || (params?.version ? undefined : getFallbackLegalPolicy("terms_of_service"))}
      error={loadError}
    />
  )
}
