import type { Metadata } from "next"

import { LegalPolicyPage } from "@/components/legal-policy-page"
import { getFallbackLegalPolicy } from "@/lib/public-legal-policy-fallbacks"
import { fetchPublicLegalPolicy } from "@/lib/public-legal-policies"

export const metadata: Metadata = {
  title: "Privacy Policy | ZayOS",
  description: "Learn how ZayOS collects, uses, protects, retains, and deletes personal information.",
}

export const dynamic = "force-dynamic"

export default async function PrivacyPolicyPage({ searchParams }: { searchParams?: Promise<{ version?: string }> }) {
  let policy
  let loadError: string | undefined
  const params = await searchParams
  try {
    policy = await fetchPublicLegalPolicy("privacy_policy", params?.version)
  } catch (error) {
    loadError = error instanceof Error ? error.message : undefined
  }
  return (
    <LegalPolicyPage
      fallbackTitle="Privacy Policy"
      policy={policy || (params?.version ? undefined : getFallbackLegalPolicy("privacy_policy"))}
      error={loadError}
    />
  )
}
