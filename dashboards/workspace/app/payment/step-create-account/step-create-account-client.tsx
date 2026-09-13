"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState, useEffect, type FormEvent, type ReactNode, Suspense } from "react"
import { ArrowLeft, ArrowRight, AlertCircle, Loader2 } from "lucide-react"

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
import { PaymentStepper } from "@/components/payment/payment-stepper"
import { PlanDetailCard } from "@/components/payment/plan-detail-card"
import { businessTypes, teamSizes } from "@/lib/payment-methods"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"

type CompanyForm = {
  companyName: string
  companyEmail: string
  businessType: string
  teamSize: string
}

const emptyForm: CompanyForm = {
  companyName: "",
  companyEmail: "",
  businessType: "",
  teamSize: "",
}

function validate(form: CompanyForm) {
  const errors: Partial<Record<keyof CompanyForm, string>> = {}

  if (!form.companyName.trim()) errors.companyName = "Company name is required."
  if (!form.companyEmail.trim()) errors.companyEmail = "Company email is required."
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.companyEmail.trim()))
    errors.companyEmail = "Enter a valid email address."
  if (!form.businessType) errors.businessType = "Business type is required."
  if (!form.teamSize) errors.teamSize = "Team size is required."

  return errors
}

const STORAGE_KEY_STEP1 = "zayos_step1_data"

function StepCreateAccountForm({ planId }: { planId: string }) {
  const router = useRouter()

  const [form, setForm] = useState<CompanyForm>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(STORAGE_KEY_STEP1)
      if (saved) {
        try { return JSON.parse(saved) } catch { /* ignore invalid stored data */ }
      }
    }
    return emptyForm
  })

  const [errors, setErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [plan, setPlan] = useState<DisplaySubscriptionPlan | null>(null)

  useEffect(() => {
    fetch("/api/public-subscription-plans")
      .then((res) => res.json())
      .then((plans) => {
        const found = plans.find((p: { id: string }) => p.id === planId)
        if (found) setPlan(found)
      })
      .catch(() => {})
  }, [planId])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY_STEP1, JSON.stringify(form))
  }, [form])

  const updateField = <K extends keyof CompanyForm>(field: K, value: CompanyForm[K]) => {
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
      await new Promise((resolve) => setTimeout(resolve, 300))

      router.push(`/payment/step-choose-method?planId=${encodeURIComponent(planId)}`)
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Unable to proceed. Please try again."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pricing
        </Link>
        <h1 className="text-2xl font-bold text-slate-950 flex-1 text-center">Complete Your Payment</h1>
        <div className="shrink-0 w-[120px]" />
      </div>

      {/* Stepper */}
      <div className="mb-8">
        <PaymentStepper currentStep={1} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        {/* Left Column - Form */}
        <div className="flex-1 min-w-0">
          <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-2 text-xl font-bold text-slate-950">Company Info</h2>
            <p className="mb-6 text-sm text-slate-600">
              Tell us about your company to get started.
            </p>

            <form className="space-y-12" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Company Name *" error={errors.companyName}>
                  <Input
                    value={form.companyName}
                    onChange={(event) => updateField("companyName", event.target.value)}
                    placeholder="Enter your company name"
                    className="h-12 rounded-xl border-slate-300"
                  />
                </Field>

                <Field label="Company Email *" error={errors.companyEmail}>
                  <Input
                    type="email"
                    value={form.companyEmail}
                    onChange={(event) => updateField("companyEmail", event.target.value)}
                    placeholder="company@business.com"
                    className="h-12 rounded-xl border-slate-300"
                  />
                </Field>

                <Field label="Business Type *" error={errors.businessType}>
                  <Select
                    value={form.businessType}
                    onValueChange={(value) => updateField("businessType", value)}
                  >
                    <SelectTrigger className="h-12 rounded-xl border-slate-300">
                      <SelectValue placeholder="Select your business type" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Team Size *" error={errors.teamSize}>
                  <Select
                    value={form.teamSize}
                    onValueChange={(value) => updateField("teamSize", value)}
                  >
                    <SelectTrigger className="h-12 rounded-xl border-slate-300">
                      <SelectValue placeholder="Select team size" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamSizes.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {submissionError ? (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submissionError}</span>
                </div>
              ) : null}

              <Button
                type="submit"
                className="mt-6 h-14 w-full rounded-2xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:opacity-95 disabled:opacity-50 sm:text-lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Next: Personal Info
                    <ArrowRight className="h-5 w-5" />
                  </span>
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Right Column - Plan Summary */}
        <div className="lg:w-[380px] shrink-0">
          <div className="sticky top-6">
            {plan && <PlanDetailCard plan={plan} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold text-slate-900">{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

export default function StepCreateAccountClient({ planId }: { planId: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>}>
      <StepCreateAccountForm planId={planId} />
    </Suspense>
  )
}
