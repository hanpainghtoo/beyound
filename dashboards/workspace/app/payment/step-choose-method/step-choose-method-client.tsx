"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect, type FormEvent, type ReactNode, Suspense } from "react"
import { ArrowLeft, ArrowRight, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PaymentStepper } from "@/components/payment/payment-stepper"
import { PlanDetailCard } from "@/components/payment/plan-detail-card"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"

type PersonalForm = {
  fullName: string
  personalEmail: string
  password: string
  confirmPassword: string
}

const emptyForm: PersonalForm = {
  fullName: "",
  personalEmail: "",
  password: "",
  confirmPassword: "",
}

const STORAGE_KEY_STEP2 = "zayos_step2_data"

function validate(form: PersonalForm) {
  const errors: Partial<Record<keyof PersonalForm, string>> = {}

  if (!form.fullName.trim()) errors.fullName = "Full name is required."
  if (!form.personalEmail.trim()) errors.personalEmail = "Personal email is required."
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personalEmail.trim()))
    errors.personalEmail = "Enter a valid email address."
  if (!form.password) errors.password = "Password is required."
  else if (form.password.length < 12) errors.password = "Password must be at least 12 characters."
  else if (!/[A-Z]/.test(form.password)) errors.password = "Password must contain an uppercase letter."
  else if (!/[0-9]/.test(form.password)) errors.password = "Password must contain a number."
  else if (!/[^A-Za-z0-9]/.test(form.password)) errors.password = "Password must contain a symbol."
  if (!form.confirmPassword) errors.confirmPassword = "Please confirm your password."
  else if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match."

  return errors
}

function StepChooseMethodForm({ planId }: { planId: string }) {
  const router = useRouter()

  const [form, setForm] = useState<PersonalForm>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(STORAGE_KEY_STEP2)
      if (saved) {
        try { return JSON.parse(saved) } catch { /* ignore invalid stored data */ }
      }
    }
    return emptyForm
  })

  const [errors, setErrors] = useState<Partial<Record<keyof PersonalForm, string>>>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [plan, setPlan] = useState<DisplaySubscriptionPlan | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    fetch("/api/public-subscription-plans")
      .then((res) => res.json())
      .then((plans) => {
        const found = plans.find((p: { id: string }) => p.id === planId)
        if (found) setPlan(found)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [planId])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY_STEP2, JSON.stringify(form))
  }, [form])

  const updateField = <K extends keyof PersonalForm>(field: K, value: PersonalForm[K]) => {
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

      router.push(`/payment/step-upload-receipt?planId=${encodeURIComponent(planId)}`)
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Unable to proceed. Please try again."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const passwordChecks = [
    { label: "12+ chars", valid: form.password.length >= 12 },
    { label: "Uppercase", valid: /[A-Z]/.test(form.password) },
    { label: "Number", valid: /[0-9]/.test(form.password) },
    { label: "Symbol", valid: /[^A-Za-z0-9]/.test(form.password) },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="flex-1 text-2xl font-bold text-slate-950 text-center">Complete Your Payment</h1>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pricing
        </button>
      </div>

      <div className="mb-8">
        <PaymentStepper currentStep={2} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        <div className="flex-1 min-w-0">
          <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-2 text-xl font-bold text-slate-950">Personal Details</h2>
            <p className="mb-6 text-sm text-slate-600">
              Enter your personal information to continue.
            </p>

            <form className="space-y-12" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Full Name *" error={errors.fullName}>
                  <Input
                    value={form.fullName}
                    onChange={(event) => updateField("fullName", event.target.value)}
                    placeholder="Enter your full name"
                    className="h-12 rounded-xl border-slate-300"
                  />
                </Field>

                <Field label="Personal Email *" error={errors.personalEmail}>
                  <Input
                    type="email"
                    value={form.personalEmail}
                    onChange={(event) => updateField("personalEmail", event.target.value)}
                    placeholder="you@email.com"
                    className="h-12 rounded-xl border-slate-300"
                  />
                </Field>

                <Field label="Password *" error={errors.password}>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) => updateField("password", event.target.value)}
                      placeholder="At least 12 chars with uppercase, number, symbol"
                      className="h-12 rounded-xl border-slate-300 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                <Field label="Confirm Password *" error={errors.confirmPassword}>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={(event) => updateField("confirmPassword", event.target.value)}
                      placeholder="Re-enter your password"
                      className="h-12 rounded-xl border-slate-300 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
              </div>

              {/* Password Requirements */}
              <div className="flex flex-wrap gap-2">
                {passwordChecks.map((check) => (
                  <span
                    key={check.label}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                      check.valid
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {check.valid && <span className="text-emerald-500">✓</span>}
                    {check.label}
                  </span>
                ))}
              </div>

              {submissionError ? (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submissionError}</span>
                </div>
              ) : null}

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="h-14 rounded-2xl border-slate-300 px-6 text-base font-semibold"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" />
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:opacity-95 disabled:opacity-50 sm:text-lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Confirm Payment
                      <ArrowRight className="h-5 w-5" />
                    </span>
                  )}
                </Button>
              </div>
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

export default function StepChooseMethodClient({ planId }: { planId: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>}>
      <StepChooseMethodForm planId={planId} />
    </Suspense>
  )
}
