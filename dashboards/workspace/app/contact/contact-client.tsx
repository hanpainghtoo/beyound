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
import { useI18n } from "@/components/providers/i18n-provider"

type Translate = ReturnType<typeof useI18n>["t"]

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

/**
 * `value` is what the API stores, so it stays English in both locales; only
 * the visible label is looked up in the catalog.
 */
const planOptions = [
  { value: "Guided Pilot", labelKey: "contact.options.plans.guidedPilot" },
  { value: "Business Launch", labelKey: "contact.options.plans.businessLaunch" },
  { value: "Business Growth", labelKey: "contact.options.plans.businessGrowth" },
  { value: "Enterprise", labelKey: "contact.options.plans.enterprise" },
  { value: "Not sure yet", labelKey: "contact.options.plans.notSure" },
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

type IntentConfig = {
  /**
   * Submitted to the API as-is, so it stays English in both locales - only the
   * matching option's label is translated at render time.
   */
  interestedIn: string
  submitLabelKey: string
  helperTextKey: string
}

const intentConfig: Record<ContactIntent, IntentConfig> = {
  demo: {
    interestedIn: "Product demo",
    submitLabelKey: "contact.intents.demo.submitLabel",
    helperTextKey: "contact.intents.demo.helperText",
  },
  sales: {
    interestedIn: "Pricing / Sales inquiry",
    submitLabelKey: "contact.intents.sales.submitLabel",
    helperTextKey: "contact.intents.sales.helperText",
  },
  support: {
    interestedIn: "Support",
    submitLabelKey: "contact.intents.support.submitLabel",
    helperTextKey: "contact.intents.support.helperText",
  },
  general: {
    interestedIn: "General inquiry",
    submitLabelKey: "contact.intents.general.submitLabel",
    helperTextKey: "contact.intents.general.helperText",
  },
  trial: {
    interestedIn: "Product demo",
    submitLabelKey: "contact.intents.trial.submitLabel",
    helperTextKey: "contact.intents.trial.helperText",
  },
}

function normalizeIntent(value: string | null): ContactIntent {
  if (value === "demo" || value === "sales" || value === "support" || value === "trial") return value
  return "general"
}

function validateForm(form: FormState, requiresSalesQualification: boolean, t: Translate) {
  const nextErrors: Partial<Record<keyof FormState, string>> = {}

  if (!form.fullName.trim()) nextErrors.fullName = t("contact.errors.fullName")
  if (!form.companyName.trim()) nextErrors.companyName = t("contact.errors.companyName")
  if (!form.emailAddress.trim()) nextErrors.emailAddress = t("contact.errors.emailAddress")
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailAddress.trim())) nextErrors.emailAddress = t("contact.errors.emailInvalid")
  if (!form.businessType) nextErrors.businessType = t("contact.errors.businessType")
  if (!form.teamSize) nextErrors.teamSize = t("contact.errors.teamSize")
  if (requiresSalesQualification && !form.salesChannels.trim()) nextErrors.salesChannels = t("contact.errors.salesChannels")
  if (requiresSalesQualification && !form.dailyOrderRange) nextErrors.dailyOrderRange = t("contact.errors.dailyOrderRange")
  if (requiresSalesQualification && !form.selectedPackage.trim()) nextErrors.selectedPackage = t("contact.errors.selectedPackage")
  if (!form.message.trim()) nextErrors.message = t("contact.errors.message")

  return nextErrors
}

export default function ContactClient() {
  const { t } = useI18n()
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

    const nextErrors = validateForm(form, requiresSalesQualification, t)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setSubmissionError(t("contact.errors.requiredSummary"))
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
        throw new Error(payload?.error || t("contact.errors.sendFailed"))
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
      setSubmissionError(error instanceof Error ? error.message : t("contact.errors.sendFailed"))
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
            <SectionLabel>{t("contact.sectionLabel")}</SectionLabel>
            <h1 className="mt-8 text-5xl font-extrabold text-slate-950 sm:text-6xl lg:text-[72px]">
              {t("contact.title")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              {t(intentDetails.helperTextKey)}
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
              <h2 className="text-2xl font-bold text-slate-950">{t("contact.formTitle")}</h2>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {t("contact.formSubtitle")}
            </p>

            {intent === "trial" ? (
              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("contact.trialNotice")}</span>
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
              <Field label={t("contact.fields.fullName")} required error={errors.fullName}>
                <Input value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} placeholder={t("contact.placeholders.fullName")} />
              </Field>
              <Field label={t("contact.fields.companyName")} required error={errors.companyName}>
                <Input value={form.companyName} onChange={(event) => updateField("companyName", event.target.value)} placeholder={t("contact.placeholders.companyName")} />
              </Field>
              <Field label={t("contact.fields.emailAddress")} required error={errors.emailAddress}>
                <Input type="email" value={form.emailAddress} onChange={(event) => updateField("emailAddress", event.target.value)} placeholder={t("contact.placeholders.emailAddress")} />
              </Field>
              <Field label={t("contact.fields.phoneNumber")}>
                <Input value={form.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} placeholder={t("contact.placeholders.phoneNumber")} />
              </Field>
              <Field label={t("contact.fields.businessType")} required error={errors.businessType}>
                <Select value={form.businessType} onValueChange={(value) => updateField("businessType", value)}>
                  <SelectTrigger><SelectValue placeholder={t("contact.selects.businessType")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online-shop">{t("contact.options.businessType.onlineShop")}</SelectItem>
                    <SelectItem value="sales-team">{t("contact.options.businessType.salesTeam")}</SelectItem>
                    <SelectItem value="retail-distribution">{t("contact.options.businessType.retailDistribution")}</SelectItem>
                    <SelectItem value="local-brand">{t("contact.options.businessType.localBrand")}</SelectItem>
                    <SelectItem value="other">{t("contact.options.businessType.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("contact.fields.teamSize")} required error={errors.teamSize}>
                <Select value={form.teamSize} onValueChange={(value) => updateField("teamSize", value)}>
                  <SelectTrigger><SelectValue placeholder={t("contact.selects.teamSize")} /></SelectTrigger>
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
                  <Field label={t("contact.fields.salesChannels")} required error={errors.salesChannels}>
                    <Input
                      value={form.salesChannels}
                      onChange={(event) => updateField("salesChannels", event.target.value)}
                      placeholder={t("contact.placeholders.salesChannels")}
                    />
                  </Field>
                  <Field label={t("contact.fields.dailyOrderRange")} required error={errors.dailyOrderRange}>
                    <Select value={form.dailyOrderRange} onValueChange={(value) => updateField("dailyOrderRange", value)}>
                      <SelectTrigger><SelectValue placeholder={t("contact.selects.dailyOrderRange")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">{t("contact.options.orders.range1")}</SelectItem>
                        <SelectItem value="11-25">{t("contact.options.orders.range2")}</SelectItem>
                        <SelectItem value="26-50">{t("contact.options.orders.range3")}</SelectItem>
                        <SelectItem value="51-100">{t("contact.options.orders.range4")}</SelectItem>
                        <SelectItem value="100+">{t("contact.options.orders.range5")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              ) : null}
            </div>

            {requiresSalesQualification ? (
              <div className="mt-5">
                <Field label={t("contact.fields.selectedPackage")} required error={errors.selectedPackage}>
                  <Select
                    value={form.selectedPackage}
                    onValueChange={(value) => updateField("selectedPackage", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("contact.selects.selectedPackage")} />
                    </SelectTrigger>
                    <SelectContent>
                      {planOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ) : null}

            <div className="mt-5">
              <Field label={t("contact.fields.interestedIn")}>
                <Select value={selectedInterestedIn} onValueChange={(value) => updateField("interestedIn", value)}>
                  <SelectTrigger><SelectValue placeholder={t("contact.selects.interestedIn")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Product demo">{t("contact.options.interestedIn.productDemo")}</SelectItem>
                    <SelectItem value="Pricing / Sales inquiry">{t("contact.options.interestedIn.pricing")}</SelectItem>
                    <SelectItem value="Support">{t("contact.options.interestedIn.support")}</SelectItem>
                    <SelectItem value="General inquiry">{t("contact.options.interestedIn.general")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="mt-5">
              <Field label={t("contact.fields.message")} required error={errors.message}>
                <Textarea
                  className="min-h-[160px] sm:min-h-[180px]"
                  value={form.message}
                  onChange={(event) => updateField("message", event.target.value)}
                  placeholder={t("contact.placeholders.message")}
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
              {isSubmitting ? t("contact.sending") : t(intentDetails.submitLabelKey)}
            </Button>
            {submitted ? (
              <p className="mt-4 text-center text-sm text-emerald-600">
                {t("contact.success")}
              </p>
            ) : null}
          </form>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-slate-950">{t("contact.info.title")}</h2>
              <div className="mt-6 space-y-5">
                <InfoRow icon={Mail} title={t("contact.info.email.title")} text={destinationEmail} subtext={t("contact.info.email.subtext")} />
                <InfoRow icon={Clock3} title={t("contact.info.response.title")} text={t("contact.info.response.text")} subtext={t("contact.info.response.subtext")} />
                <InfoRow icon={Phone} title={t("contact.info.pricing.title")} text={t("contact.info.pricing.text")} subtext={t("contact.info.pricing.subtext")} />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-slate-950">{t("contact.next.title")}</h2>
              <div className="mt-6 space-y-5">
                {[
                  {
                    step: "1",
                    title: t("contact.next.steps.step1.title"),
                    description: t("contact.next.steps.step1.description"),
                  },
                  {
                    step: "2",
                    title: t("contact.next.steps.step2.title"),
                    description: t("contact.next.steps.step2.description"),
                  },
                  {
                    step: "3",
                    title: t("contact.next.steps.step3.title"),
                    description: t("contact.next.steps.step3.description"),
                  },
                ].map(({ step, title, description }) => (
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
          <SectionHeading
            align="left"
            title={t("contact.faq.title")}
            description={t("contact.faq.description")}
          />
          <div className="mt-8">
            <MarketingFaqAccordion
              items={[
                { question: t("contact.faq.items.q1"), answer: t("contact.faq.items.a1") },
                { question: t("contact.faq.items.q2"), answer: t("contact.faq.items.a2") },
                { question: t("contact.faq.items.q3"), answer: t("contact.faq.items.a3") },
                { question: t("contact.faq.items.q4"), answer: t("contact.faq.items.a4") },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
          <MarketingFinalCta
            eyebrow={t("contact.finalCta.eyebrow")}
            title={t("contact.finalCta.title")}
            primaryAction={{ label: t("contact.finalCta.primary"), href: "/resources" }}
            secondaryAction={{ label: t("contact.finalCta.secondary"), href: "/product" }}
          />
        </div>
      </section>
    </MarketingShell>
  )
}

function Field({
  label,
  required,
  children,
  error,
}: {
  label: string
  /** Kept out of the catalog so translations never carry a stray "*". */
  required?: boolean
  children: ReactNode
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-slate-700">
        {label}
        {required ? " *" : null}
      </Label>
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
