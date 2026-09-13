"use client"
import { useState, type FormEvent, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircle, Clock3, Mail, MessageSquareText, Phone, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MarketingFaqAccordion, MarketingFinalCta, MarketingShell, SectionHeading, SectionLabel } from "@/components/marketing-shell"
import { trackMarketingEvent } from "@/lib/marketing-analytics"
import { getPublicRuntimeConfig } from "@/lib/public-runtime-config"

type ContactIntent = "demo" | "sales" | "support" | "general" | "trial"
type FormState = {
  fullName: string
  companyName: string
  emailAddress: string
  phoneNumber: string
  businessType: string
  teamSize: string
  salesChannels: string
  dailyOrderRange: string
  selectedPackage: string
  interestedIn: string
  message: string
  source: string
  website: string
}

const emptyForm: FormState = {
  fullName: "",
  companyName: "",
  emailAddress: "",
  phoneNumber: "",
  businessType: "",
  teamSize: "",
  salesChannels: "",
  dailyOrderRange: "",
  selectedPackage: "",
  interestedIn: "",
  message: "",
  source: "",
  website: "",
}

const planOptions = [
  { value: "Guided Pilot", label: "Guided Pilot (7 Days Free Trial)" },
  { value: "Business Launch", label: "Business Launch" },
  { value: "Business Growth", label: "Business Growth" },
  { value: "Enterprise", label: "Enterprise Custom" },
  { value: "Not sure yet", label: "Not sure yet / Need recommendation" },
]

function normalizeSelectedPackage(value: string): string {
  if (!value) return ""
  const lower = value.toLowerCase()
  if (lower.includes("trial") || lower.includes("pilot") || lower.includes("guided")) return "Guided Pilot"
  if (lower.includes("launch") || lower.includes("starter")) return "Business Launch"
  if (lower.includes("growth") || lower.includes("pro")) return "Business Growth"
  if (lower.includes("enterprise") || lower.includes("custom")) return "Enterprise"
  return value
}

const intentConfig: Record<ContactIntent, { interestedIn: string; submitLabel: string; helperText: string }> = {
  demo: {
    interestedIn: "Product demo",
    submitLabel: "Request Demo",
    helperText: "Tell us a little about your sales workflow and we’ll prepare the right walkthrough.",
  },
  sales: {
    interestedIn: "Pricing / Sales inquiry",
    submitLabel: "Contact Sales",
    helperText: "Share your team size, channels, or rollout goals so we can recommend the right plan.",
  },
  support: {
    interestedIn: "Support",
    submitLabel: "Contact Support",
    helperText: "Let us know what you need help with and the team will guide you to the next step.",
  },
  general: {
    interestedIn: "General inquiry",
    submitLabel: "Send Message",
    helperText: "Use the form below for product questions, partnerships, or general inquiries.",
  },
  trial: {
    interestedIn: "Product demo",
    submitLabel: "Request Trial",
    helperText: "Ready to test ZayOS? Fill out your details below and we'll get your trial environment set up.",
  },
}

function normalizeIntent(value: string | null): ContactIntent {
  if (value === "demo" || value === "sales" || value === "support" || value === "trial") return value
  return "general"
}

function validateForm(form: FormState, requiresSalesQualification: boolean) {
  const nextErrors: Partial<Record<keyof FormState, string>> = {}

  if (!form.fullName.trim()) nextErrors.fullName = "Full name is required."
  if (!form.companyName.trim()) nextErrors.companyName = "Company name is required."
  if (!form.emailAddress.trim()) nextErrors.emailAddress = "Email address is required."
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailAddress.trim())) nextErrors.emailAddress = "Enter a valid email address."
  if (!form.businessType) nextErrors.businessType = "Business type is required."
  if (!form.teamSize) nextErrors.teamSize = "Team size is required."
  if (requiresSalesQualification && !form.salesChannels.trim()) nextErrors.salesChannels = "Sales channels are required."
  if (requiresSalesQualification && !form.dailyOrderRange) nextErrors.dailyOrderRange = "Approximate daily-order range is required."
  if (requiresSalesQualification && !form.selectedPackage.trim()) nextErrors.selectedPackage = "Selected package is required."
  if (!form.message.trim()) nextErrors.message = "Message is required."

  return nextErrors
}

export default function ContactClient() {
  const searchParams = useSearchParams()
  const intent = normalizeIntent(searchParams.get("intent"))
  const source = searchParams.get("source") || ""
  const selectedPackageFromQuery = searchParams.get("package") || ""
  const normalizedInitialPackage = normalizeSelectedPackage(selectedPackageFromQuery)
  const requiresSalesQualification = source === "pricing" || intent === "sales" || intent === "demo" || intent === "trial"
  const intentDetails = intentConfig[intent]
  const [form, setForm] = useState<FormState>({
    ...emptyForm,
    source,
    selectedPackage: normalizedInitialPackage,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [started, setStarted] = useState(false)

  const destinationEmail = getPublicRuntimeConfig().contactEmail || "support@kme.com.mm"

  const selectedInterestedIn = form.interestedIn || intentDetails.interestedIn

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    if (!started) {
      setStarted(true)
      trackMarketingEvent("sales_form_start", {
        source: form.source || source || "contact",
        intent,
        selected_plan: form.selectedPackage || selectedPackageFromQuery || "none",
      })
    }
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmissionError("")
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateForm(form, requiresSalesQualification)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setSubmissionError("Please complete the required fields.")
      return
    }

    setIsSubmitting(true)
    setSubmissionError("")

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          fullName: form.fullName.trim(),
          companyName: form.companyName.trim(),
          emailAddress: form.emailAddress.trim(),
          phoneNumber: form.phoneNumber.trim(),
          businessType: form.businessType,
          teamSize: form.teamSize,
          salesChannels: form.salesChannels.trim(),
          dailyOrderRange: form.dailyOrderRange,
          selectedPackage: form.selectedPackage.trim(),
          interestedIn: selectedInterestedIn,
          message: form.message.trim(),
          source: form.source || source || "contact",
          website: form.website,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to send your request right now.")
      }

      setSubmitted(true)
      setForm({
        ...emptyForm,
        source,
        selectedPackage: selectedPackageFromQuery,
      })
      setErrors({})
      trackMarketingEvent("sales_enquiry_success", {
        source: form.source || source || "contact",
        intent,
        selected_plan: form.selectedPackage || selectedPackageFromQuery || "none",
      })
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Unable to send your request right now.")
      trackMarketingEvent("sales_enquiry_failed", {
        source: form.source || source || "contact",
        intent,
        selected_plan: form.selectedPackage || selectedPackageFromQuery || "none",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <MarketingShell footerVariant="compact">
      <section className="mx-auto max-w-[1480px] px-5 pb-12 pt-12 sm:px-8 lg:px-10">
        <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <SectionLabel>We’re here to help</SectionLabel>
            <h1 className="mt-8 text-5xl font-extrabold text-slate-950 sm:text-6xl lg:text-[72px]">
              Talk to the ZayOS Team
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              {intentDetails.helperText}
            </p>
          </div>

          <div className="hidden justify-end lg:flex">
            <div className="relative h-44 w-60">
              <div className="absolute left-4 top-4 h-20 w-28 rounded-[28px] bg-indigo-100 shadow-sm" />
              <div className="absolute right-0 top-16 h-24 w-36 rounded-[28px] bg-indigo-600 shadow-[0_18px_40px_rgba(79,70,229,0.28)]" />
              <div className="absolute right-4 bottom-0 h-16 w-16 rounded-full bg-indigo-100" />
            </div>
          </div>
        </div>
      </section>

      <section className="pb-14">
        <div className="mx-auto grid max-w-[1480px] gap-6 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
          <form className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:p-8" onSubmit={handleSubmit} noValidate>
            <div className="flex items-center gap-3">
              <MessageSquareText className="h-5 w-5 text-indigo-600" />
              <h2 className="text-2xl font-bold text-slate-950">Send us a message</h2>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Fill out the form below and the ZayOS team will follow up shortly.
            </p>

            {intent === "trial" ? (
              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>You are requesting a Trial. We've pre-filled the plan for you.</span>
              </div>
            ) : null}

            <input
              aria-hidden="true"
              autoComplete="off"
              className="hidden"
              tabIndex={-1}
              name="website"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
            />

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Full Name *" error={errors.fullName}>
                <Input value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} placeholder="Enter your full name" />
              </Field>
              <Field label="Company Name *" error={errors.companyName}>
                <Input value={form.companyName} onChange={(event) => updateField("companyName", event.target.value)} placeholder="Enter your company name" />
              </Field>
              <Field label="Email Address *" error={errors.emailAddress}>
                <Input type="email" value={form.emailAddress} onChange={(event) => updateField("emailAddress", event.target.value)} placeholder="you@company.com" />
              </Field>
              <Field label="Phone Number">
                <Input value={form.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} placeholder="Optional phone number" />
              </Field>
              <Field label="Business Type *" error={errors.businessType}>
                <Select value={form.businessType} onValueChange={(value) => updateField("businessType", value)}>
                  <SelectTrigger><SelectValue placeholder="Select your business type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online-shop">Online Shop</SelectItem>
                    <SelectItem value="sales-team">Sales Team</SelectItem>
                    <SelectItem value="retail-distribution">Retail & Distribution</SelectItem>
                    <SelectItem value="local-brand">Local Brand</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Team Size *" error={errors.teamSize}>
                <Select value={form.teamSize} onValueChange={(value) => updateField("teamSize", value)}>
                  <SelectTrigger><SelectValue placeholder="Select team size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-3">1-3</SelectItem>
                    <SelectItem value="4-10">4-10</SelectItem>
                    <SelectItem value="11-25">11-25</SelectItem>
                    <SelectItem value="26-50">26-50</SelectItem>
                    <SelectItem value="50+">50+</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {requiresSalesQualification ? (
                <>
                  <Field label="Sales Channels *" error={errors.salesChannels}>
                    <Input
                      value={form.salesChannels}
                      onChange={(event) => updateField("salesChannels", event.target.value)}
                      placeholder="Facebook, Viber, TikTok, website chat..."
                    />
                  </Field>
                  <Field label="Daily Order Range *" error={errors.dailyOrderRange}>
                    <Select value={form.dailyOrderRange} onValueChange={(value) => updateField("dailyOrderRange", value)}>
                      <SelectTrigger><SelectValue placeholder="Select approximate daily orders" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1-10 orders / day</SelectItem>
                        <SelectItem value="11-25">11-25 orders / day</SelectItem>
                        <SelectItem value="26-50">26-50 orders / day</SelectItem>
                        <SelectItem value="51-100">51-100 orders / day</SelectItem>
                        <SelectItem value="100+">100+ orders / day</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              ) : null}
            </div>

            {requiresSalesQualification ? (
              <div className="mt-5">
                <Field label="Selected Plan *" error={errors.selectedPackage}>
                  <Select
                    value={form.selectedPackage}
                    onValueChange={(value) => updateField("selectedPackage", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {planOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ) : null}

            <div className="mt-5">
              <Field label="Interested In">
                <Select value={selectedInterestedIn} onValueChange={(value) => updateField("interestedIn", value)}>
                  <SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Product demo">Product demo</SelectItem>
                    <SelectItem value="Pricing / Sales inquiry">Pricing / Sales inquiry</SelectItem>
                    <SelectItem value="Support">Support</SelectItem>
                    <SelectItem value="General inquiry">General inquiry</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="mt-5">
              <Field label="Message *" error={errors.message}>
                <Textarea
                  className="min-h-[160px] sm:min-h-[180px]"
                  value={form.message}
                  onChange={(event) => updateField("message", event.target.value)}
                  placeholder="Tell us about your goals, current challenges, rollout timing, or any workflow details we should review."
                />
              </Field>
            </div>

            {submissionError ? (
              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submissionError}</span>
              </div>
            ) : null}

            <Button className="mt-6 h-12 w-full rounded-2xl bg-indigo-600 px-6 font-semibold text-white hover:bg-indigo-700" disabled={isSubmitting}>
              <Send className="mr-2 h-4 w-4" />
              {isSubmitting ? "Sending..." : intentDetails.submitLabel}
            </Button>
            {submitted ? (
              <p className="mt-4 text-center text-sm text-emerald-600">
                Thanks. Your request has been received. The ZayOS team will contact you shortly.
              </p>
            ) : null}
          </form>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-slate-950">Get in touch</h2>
              <div className="mt-6 space-y-5">
                <InfoRow icon={Mail} title="Email Us" text={destinationEmail} subtext="We typically respond during business hours." />
                <InfoRow icon={Clock3} title="Response Window" text="Within 2 business hours" subtext="Monday - Friday, business hours" />
                <InfoRow icon={Phone} title="Need pricing help?" text="Speak with the ZayOS team" subtext="Request a trial or contact sales" />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-slate-950">What happens next?</h2>
              <div className="mt-6 space-y-5">
                {[
                  ["1", "We review your request", "We look at your team size, business type, and goals before replying."],
                  ["2", "We follow up with the right next step", "You’ll hear from the ZayOS team with a response, pricing guidance, or a demo invite."],
                  ["3", "We help you evaluate fit", "We’ll show how ZayOS can support conversations, orders, deliveries, and team workflows."],
                ].map(([step, title, description]) => (
                  <div key={step} className="flex gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-semibold text-indigo-700">
                      {step}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-950">{title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <SectionHeading align="left" title="Common questions" description="Quick answers to help you get started." />
          <div className="mt-8">
            <MarketingFaqAccordion
              items={[
                { question: "How long does a demo take?", answer: "A typical demo takes around 30 minutes and focuses on the workflows most relevant to your business." },
                { question: "What should I include in my message?", answer: "Share your business type, team size, channels, and what you want to improve so we can prepare properly." },
                { question: "Can you help us choose the right plan?", answer: "Yes. We can guide you through Guided Pilot, Business Launch, Business Growth, and Enterprise scope based on your team and workflow needs." },
                { question: "Where can existing users sign in?", answer: "Workspace users can sign in through the ZayOS login page using their assigned account." },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <MarketingFinalCta
            eyebrow="Need another path?"
            title="Browse resources or return to the product overview."
            primaryAction={{ label: "View Resources", href: "/resources" }}
            secondaryAction={{ label: "View Product", href: "/product" }}
          />
        </div>
      </section>
    </MarketingShell>
  )
}

function Field({
  label,
  children,
  error,
}: {
  label: string
  children: ReactNode
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-slate-700">{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

function InfoRow({
  icon: Icon,
  title,
  text,
  subtext,
}: {
  icon: typeof Mail
  title: string
  text: string
  subtext: string
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-semibold text-slate-950">{title}</p>
        <p className="text-sm text-slate-600">{text}</p>
        <p className="mt-1 text-xs text-slate-500">{subtext}</p>
      </div>
    </div>
  )
}
