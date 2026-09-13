import type { Metadata } from "next"

import { LegalPolicyPage } from "@/components/legal-policy-page"
import { getFallbackLegalPolicy } from "@/lib/public-legal-policy-fallbacks"

export const metadata: Metadata = {
  title: "Data Deletion | ZayOS",
  description: "How to request deletion of account, workspace, customer, integration, and operational data associated with ZayOS.",
}

export default function DataDeletionPage() {
  return <LegalPolicyPage fallbackTitle="Data Deletion" policy={getFallbackLegalPolicy("data_deletion")} />
}
