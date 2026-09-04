"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent, type ReactNode } from "react"
import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MarketingHeader } from "@/components/marketing-header"
import { storeSession, type AuthSession } from "@/lib/api"
import { getPasswordPolicyError } from "@/lib/password-policy"
import type { PublicLegalPolicy } from "@/lib/public-legal-policies"

type SignupForm = {
  fullName: string
  companyName: string
  workEmail: string
  password: string
  confirmPassword: string
  phoneNumber: string
  businessType: string
  teamSize: string
  mainChannel: string
  monthlyOrders: string
  website: string
  acceptTerms: boolean
}

const emptyForm: SignupForm = {
  fullName: "",
  companyName: "",
  workEmail: "",
  password: "",
  confirmPassword: "",
  phoneNumber: "",
  businessType: "",
  teamSize: "",
  mainChannel: "Facebook, Telegram",
  monthlyOrders: "1-50 Orders/month",
  website: "",
  acceptTerms: true,
}

function validate(form: SignupForm) {
  const errors: Partial<Record<keyof SignupForm, string>> = {}

  if (!form.fullName.trim()) errors.fullName = "Full name is required."
  if (!form.companyName.trim()) errors.companyName = "Company name is required."
  if (!form.workEmail.trim()) errors.workEmail = "Work email is required."
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail.trim()))
    errors.workEmail = "Enter a valid email address."
  if (!form.businessType) errors.businessType = "Business type is required."
  if (!form.teamSize) errors.teamSize = "Team size is required."
  const passwordError = getPasswordPolicyError(form.password)
  if (passwordError) errors.password = passwordError
  if (!form.confirmPassword.trim())
    errors.confirmPassword = "Please confirm your password."
  else if (form.confirmPassword !== form.password)
    errors.confirmPassword = "Passwords do not match."

  return errors
}

export default function StartClient({
  policies,
  policiesLoadError,
}: {
  policies?: { terms?: PublicLegalPolicy; privacy?: PublicLegalPolicy }
  policiesLoadError?: string
}) {
  const router = useRouter()
  const [form, setForm] = useState<SignupForm>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof SignupForm, string>>>({})
  const [submissionError, setSubmissionError] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const termsHref = policies?.terms?.version
    ? `/terms-of-service?version=${encodeURIComponent(policies.terms.version)}`
    : "/terms-of-service"
  const privacyHref = policies?.privacy?.version
    ? `/privacy-policy?version=${encodeURIComponent(policies.privacy.version)}`
    : "/privacy-policy"

  const updateField = <K extends keyof SignupForm>(
    field: K,
    value: SignupForm[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmissionError("")
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate(form)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setSubmissionError("Please complete the required fields.")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/start-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fullName: form.fullName.trim(),
          companyName: form.companyName.trim(),
          workEmail: form.workEmail.trim(),
          password: form.password,
          phoneNumber: form.phoneNumber.trim(),
          notes: `Channel: ${form.mainChannel}, Monthly Orders: ${form.monthlyOrders}`,
          acceptTerms: true,
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<AuthSession>)
        | null
      if (!response.ok) {
        throw new Error(
          payload?.error || "Unable to create your workspace right now.",
        )
      }

      if (payload?.accessToken && payload?.refreshToken && payload?.user) {
        storeSession(payload as AuthSession)
      }

      setSubmitted(true)
      setForm(emptyForm)
      setErrors({})
      router.push(
        payload?.emailVerificationRequired ? "/verify-email" : "/workspace",
      )
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Unable to create your workspace right now.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen w-full bg-white text-black antialiased"
      style={{
        background:
          "linear-gradient(219deg, rgba(228,241,252,1) 6%, rgba(221,226,252,1) 52%, rgba(236,238,254,1) 75%, rgba(243,245,253,1) 98%)",
      }}
    >
      <MarketingHeader
        showTopBanner={false}
        primaryCta={{ label: "Request Demo", href: "/contact?intent=demo" }}
      />

      <main className="mx-auto max-w-[1280px] px-5 pb-20 pt-6 sm:px-8 sm:pt-10 lg:px-10">
        {/* Title Section */}
        <div className="mx-auto max-w-[860px] text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            Start Your <span className="text-[#0084FF]">7 Days Free Trial</span>
          </h1>
          <p className="mt-4 text-base font-bold text-slate-900 sm:text-lg">
            See how ZayOS can simplify your everyday commerce operations.
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Bring your customer conversations, orders, payments, deliveries,
            products, and customer data into one organized workspace.
          </p>
        </div>

        {/* Card Form */}
        <div className="mx-auto mt-10 max-w-[860px] rounded-[28px] border border-[#816EF7]/40 bg-white p-6 shadow-lg shadow-indigo-100/50 sm:p-10">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <input
              aria-hidden="true"
              autoComplete="off"
              className="hidden"
              tabIndex={-1}
              name="website"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
            />

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Full Name *" error={errors.fullName}>
                <Input
                  value={form.fullName}
                  onChange={(event) =>
                    updateField("fullName", event.target.value)
                  }
                  placeholder="Enter your full name"
                  className="h-12 rounded-xl border-slate-300"
                />
              </Field>

              <Field label="Company Name*" error={errors.companyName}>
                <Input
                  value={form.companyName}
                  onChange={(event) =>
                    updateField("companyName", event.target.value)
                  }
                  placeholder="Enter your company name"
                  className="h-12 rounded-xl border-slate-300"
                />
              </Field>

              <Field label="Work Email*" error={errors.workEmail}>
                <Input
                  type="email"
                  value={form.workEmail}
                  onChange={(event) =>
                    updateField("workEmail", event.target.value)
                  }
                  placeholder="you@company.com"
                  className="h-12 rounded-xl border-slate-300"
                />
              </Field>

              <Field label="Password*" error={errors.password}>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    updateField("password", event.target.value)
                  }
                  placeholder="Use at least 12 characters with uppercase"
                  className="h-12 rounded-xl border-slate-300"
                />
              </Field>

              <Field label="Confirm Password*" error={errors.confirmPassword}>
                <Input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) =>
                    updateField("confirmPassword", event.target.value)
                  }
                  placeholder="Re-enter your password"
                  className="h-12 rounded-xl border-slate-300"
                />
              </Field>

              <Field label="Phone Number" error={errors.phoneNumber}>
                <Input
                  value={form.phoneNumber}
                  onChange={(event) =>
                    updateField("phoneNumber", event.target.value)
                  }
                  placeholder="Enter your phone number"
                  className="h-12 rounded-xl border-slate-300"
                />
              </Field>

              <Field label="Business Type*" error={errors.businessType}>
                <Select
                  value={form.businessType}
                  onValueChange={(value) => updateField("businessType", value)}
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-300">
                    <SelectValue placeholder="Select your business type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online-shop">Online Shop</SelectItem>
                    <SelectItem value="sales-team">Sales Team</SelectItem>
                    <SelectItem value="retail-distribution">
                      Retail & Distribution
                    </SelectItem>
                    <SelectItem value="local-brand">Local Brand</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Team Size*" error={errors.teamSize}>
                <Select
                  value={form.teamSize}
                  onValueChange={(value) => updateField("teamSize", value)}
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-300">
                    <SelectValue placeholder="Select team size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-3">1-3</SelectItem>
                    <SelectItem value="4-10">4-10</SelectItem>
                    <SelectItem value="11-25">11-25</SelectItem>
                    <SelectItem value="26-50">26-50</SelectItem>
                    <SelectItem value="50+">50+</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Main Channel*" error={errors.mainChannel}>
                <Select
                  value={form.mainChannel}
                  onValueChange={(value) => updateField("mainChannel", value)}
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-300">
                    <SelectValue placeholder="Facebook, Telegram" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Facebook, Telegram">
                      Facebook, Telegram
                    </SelectItem>
                    <SelectItem value="Facebook & Messenger">
                      Facebook & Messenger
                    </SelectItem>
                    <SelectItem value="Telegram">Telegram</SelectItem>
                    <SelectItem value="Viber">Viber</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                    <SelectItem value="Website Chat">Website Chat</SelectItem>
                    <SelectItem value="All Channels">All Channels</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Monthly Orders*" error={errors.monthlyOrders}>
                <Select
                  value={form.monthlyOrders}
                  onValueChange={(value) =>
                    updateField("monthlyOrders", value)
                  }
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-300">
                    <SelectValue placeholder="1-50 Orders/month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-50 Orders/month">
                      1-50 Orders/month
                    </SelectItem>
                    <SelectItem value="51-200 Orders/month">
                      51-200 Orders/month
                    </SelectItem>
                    <SelectItem value="201-500 Orders/month">
                      201-500 Orders/month
                    </SelectItem>
                    <SelectItem value="500+ Orders/month">
                      500+ Orders/month
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {policiesLoadError ? (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50/50 p-2.5 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Legal policy details are temporarily unavailable.{" "}
                  {policiesLoadError}
                </span>
              </div>
            ) : null}

            {submissionError ? (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submissionError}</span>
              </div>
            ) : null}

            <Button
              type="submit"
              className="mt-6 h-13 w-full rounded-xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-95 disabled:opacity-50 sm:h-14 sm:rounded-2xl sm:text-lg"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Starting your trial..."
                : "Start Your 7 Days Free Trial"}
            </Button>

            <div className="text-center text-xs text-slate-500">
              By creating an account, you agree to our{" "}
              <Link
                href={termsHref}
                className="font-medium text-[#5E4BCE] underline underline-offset-4"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href={privacyHref}
                className="font-medium text-[#5E4BCE] underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              .
            </div>

            {submitted ? (
              <p className="text-center text-sm font-medium text-emerald-600">
                Your workspace is ready. Redirecting you now...
              </p>
            ) : null}
          </form>
        </div>
      </main>
    </div>
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
      <Label className="text-sm font-bold text-slate-900">{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
