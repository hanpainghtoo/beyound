import { NextResponse } from "next/server"
import { postWebhookIfConfigured, submitLeadToCore } from "../_lead-intake"
import { getPasswordPolicyError } from "@/lib/password-policy"
import { isServerConfigurationError, resolveCoreApiBaseUrl } from "../../../../shared/server-core-api-config"

type TrialSignupPayload = {
  fullName?: string
  companyName?: string
  companyEmail?: string
  personalEmail?: string
  workEmail?: string
  password?: string
  phoneNumber?: string
  businessType?: string
  teamSize?: string
  notes?: string
  website?: string
  acceptTerms?: boolean
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isMockApiEnabled(): boolean {
  return (
    process.env.USE_MOCK_API === "true" ||
    process.env.NEXT_PUBLIC_USE_MOCK_API === "true"
  )
}

function buildMockSession(submission: {
  fullName: string
  companyName: string
  companyEmail: string
  workEmail: string
  phoneNumber: string
  businessType: string
  teamSize: string
}) {
  const tenantId = "mock-tenant-" + Math.random().toString(36).substring(2, 9)
  const userId = "mock-user-" + Math.random().toString(36).substring(2, 9)

  return {
    accessToken: "mock-jwt-access-token-" + Date.now(),
    refreshToken: "mock-jwt-refresh-token-" + Date.now(),
    user: {
      id: userId,
      tenantId,
      email: submission.workEmail,
      fullName: submission.fullName,
      role: "owner",
      type: "tenant_user" as const,
      phone: submission.phoneNumber,
      emailVerifiedAt: new Date().toISOString(),
    },
    emailVerificationRequired: false,
    emailVerificationDelivery: "requested" as const,
    mock: true,
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as TrialSignupPayload | null

  if (!payload) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 })
  }

  if (payload.website) {
    return NextResponse.json({ ok: true })
  }

  const loginEmail = payload.personalEmail?.trim() || payload.workEmail?.trim() || ""
  const companyEmail = payload.companyEmail?.trim() || loginEmail

  if (!payload.fullName?.trim() || !payload.companyName?.trim() || !loginEmail || !payload.businessType?.trim() || !payload.teamSize?.trim() || !payload.phoneNumber?.trim()) {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 })
  }

  if (payload.acceptTerms !== true) {
    return NextResponse.json({ error: "Accept the Terms of Service and Privacy Policy." }, { status: 400 })
  }

  const password = payload.password?.trim() || ""
  const passwordError = getPasswordPolicyError(password)
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 })
  }

  if (!isValidEmail(loginEmail)) {
    return NextResponse.json({ error: "Enter a valid personal/login email address." }, { status: 400 })
  }

  if (companyEmail && !isValidEmail(companyEmail)) {
    return NextResponse.json({ error: "Enter a valid company email address." }, { status: 400 })
  }

  const submission = {
    fullName: payload.fullName.trim(),
    companyName: payload.companyName.trim(),
    companyEmail,
    workEmail: loginEmail,
    phoneNumber: payload.phoneNumber.trim(),
    businessType: payload.businessType.trim(),
    teamSize: payload.teamSize.trim(),
    notes: payload.notes?.trim() || "",
    submittedAt: new Date().toISOString(),
  }

  // Check if Mock API mode is active
  if (isMockApiEnabled() || request.headers.get("x-use-mock") === "true") {
    // Simulate realistic network delay (1000ms) for loading state demo
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.log(`[Mock API] Registered trial workspace for: ${submission.companyName} (${submission.workEmail})`)
    const mockSession = buildMockSession(submission)
    return NextResponse.json(mockSession)
  }

  const webhookUrl =
    process.env.ZAYOS_SIGNUP_WEBHOOK_URL ||
    process.env.TRIAL_SIGNUP_WEBHOOK_URL ||
    process.env.WORKSPACE_SIGNUP_WEBHOOK_URL

  try {
    let apiBaseUrl: string
    try {
      apiBaseUrl = resolveCoreApiBaseUrl(process.env)
    } catch (error) {
      if (isServerConfigurationError(error)) {
        console.error(`[workspace-start-trial] ${error.message}`)
        return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 })
      }
      throw error
    }

    const registrationResponse = await fetch(`${apiBaseUrl}/auth/register/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: submission.fullName,
        companyName: submission.companyName,
        companyEmail: submission.companyEmail,
        workEmail: submission.workEmail,
        password,
        phoneNumber: submission.phoneNumber,
        businessType: submission.businessType,
        teamSize: submission.teamSize,
        notes: submission.notes,
        acceptTerms: payload.acceptTerms,
      }),
    })
    const registrationPayload = (await registrationResponse.json().catch(() => null)) as Record<string, unknown> | null
    if (!registrationResponse.ok) {
      const message = Array.isArray(registrationPayload?.message)
        ? (registrationPayload?.message as string[]).join(", ")
        : typeof registrationPayload?.message === "string"
          ? registrationPayload.message
          : "Unable to create your workspace right now."
      return NextResponse.json({ error: message }, { status: registrationResponse.status })
    }

    try {
      await submitLeadToCore({
        intent: "trial",
        fullName: submission.fullName,
        companyName: submission.companyName,
        emailAddress: submission.workEmail,
        phoneNumber: submission.phoneNumber,
        businessType: submission.businessType,
        teamSize: submission.teamSize,
        message: submission.notes,
        source: "start-trial",
        metadata: {
          registrationMode: "self_serve",
          companyEmail: submission.companyEmail,
        },
      })
      await postWebhookIfConfigured(webhookUrl, submission)
    } catch (leadError) {
      console.warn("Workspace registration succeeded but lead capture follow-up failed.", leadError)
    }

    return NextResponse.json(registrationPayload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create your workspace right now." },
      { status: 502 },
    )
  }
}
