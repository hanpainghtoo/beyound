import { isServerConfigurationError, resolveCoreApiBaseUrl } from "../../../shared/server-core-api-config"

type LeadSubmission = {
  intent: "demo" | "sales" | "support" | "general" | "trial"
  fullName: string
  companyName: string
  emailAddress: string
  phoneNumber?: string
  businessType?: string
  teamSize?: string
  interestedIn?: string
  message?: string
  source: string
  metadata?: Record<string, unknown>
}

export async function submitLeadToCore(submission: LeadSubmission) {
  let apiBaseUrl: string
  try {
    apiBaseUrl = resolveCoreApiBaseUrl(process.env)
  } catch (error) {
    if (isServerConfigurationError(error)) {
      console.error(`[workspace-lead-intake] ${error.message}`)
      throw new Error("Lead service is temporarily unavailable.", { cause: error })
    }
    throw error
  }

  const response = await fetch(`${apiBaseUrl}/public/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message
    throw new Error(message || "Unable to save your request right now.")
  }

  return response.json()
}

export async function postWebhookIfConfigured(webhookUrl: string | undefined, submission: Record<string, unknown>) {
  if (!webhookUrl) return

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  })

  if (!response.ok) {
    console.warn("Lead webhook delivery failed after the lead was saved.", {
      status: response.status,
      statusText: response.statusText,
    })
  }
}
