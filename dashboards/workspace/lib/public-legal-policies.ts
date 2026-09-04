import { isServerConfigurationError, resolveCoreApiBaseUrl } from "../../shared/server-core-api-config.js"

export type PublicLegalPolicy = {
  policyKey: "terms_of_service" | "privacy_policy" | "data_deletion"
  version: string
  title: string
  content: string
  effectiveAt: string
  supportEmail: string
  legalEmail: string
}

export async function fetchPublicLegalPolicy(policyKey: PublicLegalPolicy["policyKey"], version?: string) {
  let apiBaseUrl: string
  try {
    apiBaseUrl = resolveCoreApiBaseUrl(process.env)
  } catch (error) {
    if (isServerConfigurationError(error)) {
      console.error(`[workspace-public-legal-policy] ${error.message}`)
      throw new Error("Legal policy is temporarily unavailable.", { cause: error })
    }
    throw error
  }

  const pathVersion = version ? encodeURIComponent(version) : "active"
  const response = await fetch(`${apiBaseUrl}/public/policies/${policyKey}/${pathVersion}`, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Unable to load legal policy (${response.status})`)
  }
  return response.json() as Promise<PublicLegalPolicy>
}
