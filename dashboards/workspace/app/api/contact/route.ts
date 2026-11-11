import { NextResponse } from "next/server"
import { postWebhookIfConfigured, submitLeadToCore } from "../_lead-intake"

type ContactIntent = "demo" | "sales" | "support" | "general" | "trial"

type ContactPayload = {
  intent?: ContactIntent
  fullName?: string
  companyName?: string
  emailAddress?: string
  phoneNumber?: string
  businessType?: string
  teamSize?: string
  salesChannels?: string
  dailyOrderRange?: string
  selectedPackage?: string
  interestedIn?: string
  message?: string
  source?: string
  website?: string
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as ContactPayload | null

  if (!payload) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 })
  }

  if (payload.website) {
    return NextResponse.json({ ok: true })
  }

  const requiresSalesQualification =
    payload.source?.trim() === "pricing" ||
    payload.intent === "sales" ||
    payload.intent === "demo" ||
    payload.intent === "trial"

  if (
    !payload.fullName?.trim() ||
    !payload.companyName?.trim() ||
    !payload.emailAddress?.trim() ||
    !payload.businessType?.trim() ||
    !payload.teamSize?.trim() ||
    !payload.message?.trim()
  ) {
    return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 })
  }

  if (
    requiresSalesQualification &&
    (!payload.salesChannels?.trim() || !payload.dailyOrderRange?.trim() || !payload.selectedPackage?.trim())
  ) {
    return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 })
  }

  if (!isValidEmail(payload.emailAddress.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }

  const destinationEmail =
    process.env.ZAYOS_CONTACT_EMAIL ||
    process.env.CONTACT_EMAIL ||
    "support@kme.com.mm"

  const webhookUrl =
    process.env.ZAYOS_CONTACT_WEBHOOK_URL ||
    process.env.CONTACT_FORM_WEBHOOK_URL ||
    process.env.CONTACT_FORM_ENDPOINT

  const submission = {
    intent: payload.intent || "general",
    fullName: payload.fullName.trim(),
    companyName: payload.companyName.trim(),
    emailAddress: payload.emailAddress.trim(),
    phoneNumber: payload.phoneNumber?.trim() || "",
    businessType: payload.businessType.trim(),
    teamSize: payload.teamSize.trim(),
    salesChannels: payload.salesChannels?.trim() || "",
    dailyOrderRange: payload.dailyOrderRange?.trim() || "",
    selectedPackage: payload.selectedPackage?.trim() || "",
    interestedIn: payload.interestedIn?.trim() || "",
    message: payload.message.trim(),
    destinationEmail,
    source: payload.source?.trim() || "contact-form",
    submittedAt: new Date().toISOString(),
  }

  try {
    await submitLeadToCore({
      intent: submission.intent,
      fullName: submission.fullName,
      companyName: submission.companyName,
      emailAddress: submission.emailAddress,
      phoneNumber: submission.phoneNumber,
      businessType: submission.businessType,
      teamSize: submission.teamSize,
      interestedIn: submission.interestedIn,
      message: submission.message,
      source: submission.source,
      metadata: {
        destinationEmail,
        salesChannels: submission.salesChannels,
        dailyOrderRange: submission.dailyOrderRange,
        selectedPackage: submission.selectedPackage,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save your request right now." },
      { status: 502 },
    )
  }

  await postWebhookIfConfigured(webhookUrl, submission)

  return NextResponse.json({ ok: true })
}
