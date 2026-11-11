"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect, type FormEvent, type ReactNode } from "react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  Loader2,
  User,
  X,
} from "lucide-react"

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
import { checkEmailExists, validateRealEmail } from "@/lib/api"
import { getPasswordPolicyError } from "@/lib/password-policy"
import { useI18n } from "@/components/providers/i18n-provider"
import type { PublicLegalPolicy } from "@/lib/public-legal-policies"

type SignupForm = {
  companyName: string
  businessType: string
  companyEmail: string
  teamSize: string
  fullName: string
  phoneNumber: string
  password: string
  confirmPassword: string
  loginEmailType: "company" | "personal"
  personalEmail: string
  website: string
  acceptTerms: boolean
}

const emptyForm: SignupForm = {
  companyName: "",
  businessType: "",
  companyEmail: "",
  teamSize: "",
  fullName: "",
  phoneNumber: "",
  password: "",
  confirmPassword: "",
  loginEmailType: "company",
  personalEmail: "",
  website: "",
  acceptTerms: false,
}

export default function TrialClient({
  policies,
  policiesLoadError,
}: {
  policies?: { terms?: PublicLegalPolicy; privacy?: PublicLegalPolicy }
  policiesLoadError?: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<SignupForm>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof SignupForm, string>>>({})
  const [submissionError, setSubmissionError] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [confirmMatchStatus, setConfirmMatchStatus] = useState<"idle" | "matched" | "mismatched">("idle")
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailValidationError, setEmailValidationError] = useState("")

  const passwordCriteria = {
    hasLength: form.password.length >= 12,
    hasUpper: /[A-Z]/.test(form.password),
    hasNumber: /\d/.test(form.password),
    hasSpecial: /[^A-Za-z\d]/.test(form.password),
  }

  const isPasswordValid =
    passwordCriteria.hasLength &&
    passwordCriteria.hasUpper &&
    passwordCriteria.hasNumber &&
    passwordCriteria.hasSpecial

  const passwordBorderClass =
    form.password.length > 0
      ? isPasswordValid
        ? "border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25"
        : "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
      : errors.password
        ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
        : "border-slate-300"

  const confirmPasswordBorderClass =
    confirmMatchStatus === "matched"
      ? "border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25"
      : confirmMatchStatus === "mismatched" || errors.confirmPassword
        ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
        : "border-slate-300"

  useEffect(() => {
    if (!form.confirmPassword) {
      setConfirmMatchStatus("idle")
      return
    }
    if (form.confirmPassword === form.password) {
      setConfirmMatchStatus("matched")
      return
    }
    setConfirmMatchStatus("idle")
    const timer = setTimeout(() => {
      if (form.confirmPassword !== form.password) {
        setConfirmMatchStatus("mismatched")
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [form.confirmPassword, form.password])

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
    if (field === "companyEmail" || field === "personalEmail") {
      setEmailValidationError("")
    }
  }

  const handleCompanyEmailBlur = async () => {
    if (!form.companyEmail.trim()) return
    const realResult = validateRealEmail(form.companyEmail)
    if (realResult.valid === false) {
      setEmailValidationError(realResult.message)
      return
    }
    setEmailChecking(true)
    try {
      const checkResult = await checkEmailExists(form.companyEmail)
      if (checkResult.exists) {
        setEmailValidationError(checkResult.message)
      }
    } catch {
      setEmailValidationError(t("validation.emailVerifyFailed"))
    } finally {
      setEmailChecking(false)
    }
  }

  const handlePersonalEmailBlur = async () => {
    if (form.loginEmailType === "company") return
    if (!form.personalEmail.trim()) return
    const realResult = validateRealEmail(form.personalEmail)
    if (realResult.valid === false) {
      setEmailValidationError(realResult.message)
      return
    }
    setEmailChecking(true)
    try {
      const checkResult = await checkEmailExists(form.personalEmail)
      if (checkResult.exists) {
        setEmailValidationError(checkResult.message)
      }
    } catch {
      setEmailValidationError(t("validation.emailVerifyFailed"))
    } finally {
      setEmailChecking(false)
    }
  }

  const validateStep1 = () => {
    const nextErrors: Partial<Record<keyof SignupForm, string>> = {}
    if (!form.companyName.trim()) nextErrors.companyName = t("validation.companyNameRequired")
    if (!form.companyEmail.trim()) nextErrors.companyEmail = t("validation.companyEmailRequired")
    else { const realResult = validateRealEmail(form.companyEmail); if (realResult.valid === false) nextErrors.companyEmail = realResult.message }
    if (!form.businessType) nextErrors.businessType = t("validation.businessTypeRequired")
    if (!form.teamSize) nextErrors.teamSize = t("validation.teamSizeRequired")

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const validateStep2 = () => {
    const nextErrors: Partial<Record<keyof SignupForm, string>> = {}
    if (!form.fullName.trim()) nextErrors.fullName = t("validation.fullNameRequired")
    if (!form.phoneNumber.trim()) nextErrors.phoneNumber = t("validation.phoneRequired")

    const passwordError = getPasswordPolicyError(form.password)
    if (passwordError) nextErrors.password = passwordError
    if (!form.confirmPassword.trim())
      nextErrors.confirmPassword = t("validation.confirmPasswordRequired")
    else if (form.confirmPassword !== form.password)
      nextErrors.confirmPassword = t("validation.passwordMismatch")

    setErrors(nextErrors)
    return { valid: Object.keys(nextErrors).length === 0, errors: nextErrors }
  }

  const validateStep3 = () => {
    const nextErrors: Partial<Record<keyof SignupForm, string>> = {}
    if (form.loginEmailType === "personal") {
      if (!form.personalEmail.trim()) {
        nextErrors.personalEmail = t("validation.personalEmailRequired")
      } else { const realResult = validateRealEmail(form.personalEmail); if (realResult.valid === false) nextErrors.personalEmail = realResult.message }
    }
    if (!form.acceptTerms) {
      nextErrors.acceptTerms = t("validation.acceptTermsRequired")
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1() && !emailValidationError) {
        setStep(2)
        setSubmissionError("")
      } else {
        setSubmissionError(emailValidationError || t("validation.completeCompanyInfo"))
      }
    } else if (step === 2) {
      const result = validateStep2()
      if (result.valid) {
        setStep(3)
        setSubmissionError("")
      } else {
        setSubmissionError(Object.values(result.errors).filter(Boolean).join(" "))
      }
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateStep1()) {
      setStep(1)
      setSubmissionError(t("validation.completeCompanyInfo"))
      return
    }
    const step2Result = validateStep2()
    if (!step2Result.valid) {
      setStep(2)
      setSubmissionError(Object.values(step2Result.errors).filter(Boolean).join(" "))
      return
    }
    if (!validateStep3()) {
      if (!form.acceptTerms) {
        setSubmissionError(t("validation.agreeToStartTrial"))
      } else {
        setSubmissionError(t("validation.completeAllToConfirm"))
      }
      return
    }

    if (emailValidationError) {
      setSubmissionError(emailValidationError)
      return
    }
    const loginEmail =
      form.loginEmailType === "company"
        ? form.companyEmail.trim()
        : form.personalEmail.trim()
    if (!loginEmail) {
      setSubmissionError(t("validation.enterLoginEmail"))
      return
    }
    setSubmissionError("")
    setEmailValidationError("")
    setEmailChecking(true)
    try {
      const loginCheck = await checkEmailExists(loginEmail)
      if (loginCheck.exists) {
        setSubmissionError(loginCheck.message)
        return
      }
    } catch {
      setSubmissionError(t("validation.emailsVerifyFailed"))
      return
    } finally {
      setEmailChecking(false)
    }
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/start-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          companyName: form.companyName.trim(),
          companyEmail: form.companyEmail.trim(),
          personalEmail: loginEmail,
          workEmail: loginEmail,
          password: form.password,
          phoneNumber: form.phoneNumber.trim(),
          businessType: form.businessType,
          teamSize: form.teamSize,
          website: form.website,
          acceptTerms: form.acceptTerms,
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<AuthSession>)
        | null
      if (!response.ok) {
        throw new Error(
          payload?.error || t("validation.workspaceCreateFailed"),
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
          : t("validation.workspaceCreateFailed"),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="flex min-h-screen w-full flex-col justify-start bg-white text-black antialiased"
      style={{
        background:
          "linear-gradient(219deg, rgba(228,241,252,1) 6%, rgba(221,226,252,1) 52%, rgba(236,238,254,1) 75%, rgba(243,245,253,1) 98%)",
      }}
    >
      <MarketingHeader
        showTopBanner={false}
        primaryCta={{ labelKey: "navigation.requestDemo", href: "/contact?intent=demo" }}
      />

      <main className="mx-auto flex flex-1 flex-col justify-start mt-5 w-full max-w-[1100px] px-4 py-2 sm:px-6 sm:py-3 lg:px-8">
        {/* Title Section */}
        <div className="mx-auto max-w-[800px] text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
            {t("trial.heroTitlePrefix")} <span className="text-[#0084FF]">{t("trial.heroTitleAccent")}</span>
          </h1>
          <p className="mt-1 text-xs font-bold text-slate-900 sm:text-sm">
            {t("trial.heroSubtitle")}
          </p>
        </div>

        {/* Card Form */}
        <div className="mx-auto mt-3 w-full max-w-[760px] rounded-[22px] border border-[#816EF7]/40 bg-white p-5 shadow-lg shadow-indigo-100/40 sm:mt-5 sm:p-7">
          {/* Stepper Tabs (Numbered circles changing to green checkmark when complete) */}
          <div
            className={`mb-4 flex items-center justify-center gap-2 sm:mb-5 transition-opacity ${
              isSubmitting ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => setStep(1)}
              aria-label={t("trial.stepAria.1")}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all sm:h-9 sm:w-9 sm:text-sm ${
                step > 1
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25 hover:bg-emerald-600"
                  : step === 1
                    ? "bg-[#0084FF] text-white shadow-md shadow-blue-500/25 ring-4 ring-blue-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
              }`}
            >
              {step > 1 ? (
                <Check className="h-4 w-4 stroke-[2.5]" />
              ) : (
                1
              )}
            </button>

            {/* Connecting Line 1 -> 2 */}
            <div
              className={`h-0.5 w-10 sm:w-16 transition-colors duration-300 ${
                step > 1 ? "bg-emerald-500" : "bg-slate-200"
              }`}
            />

            {/* Step 2 */}
            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setStep(2)
              }}
              aria-label={t("trial.stepAria.2")}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all sm:h-9 sm:w-9 sm:text-sm ${
                step > 2
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25 hover:bg-emerald-600"
                  : step === 2
                    ? "bg-[#0084FF] text-white shadow-md shadow-blue-500/25 ring-4 ring-blue-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
              }`}
            >
              {step > 2 ? (
                <Check className="h-4 w-4 stroke-[2.5]" />
              ) : (
                2
              )}
            </button>

            {/* Connecting Line 2 -> 3 */}
            <div
              className={`h-0.5 w-10 sm:w-16 transition-colors duration-300 ${
                step > 2 ? "bg-emerald-500" : "bg-slate-200"
              }`}
            />

            {/* Step 3 */}
            <button
              type="button"
              onClick={() => {
                if (validateStep1() && validateStep2().valid) setStep(3)
              }}
              aria-label={t("trial.stepAria.3")}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all sm:h-9 sm:w-9 sm:text-sm ${
                submitted
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25"
                  : step === 3
                    ? "bg-[#0084FF] text-white shadow-md shadow-blue-500/25 ring-4 ring-blue-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
              }`}
            >
              {submitted ? (
                <Check className="h-4 w-4 stroke-[2.5]" />
              ) : (
                3
              )}
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <input
              aria-hidden="true"
              autoComplete="off"
              className="hidden"
              tabIndex={-1}
              name="website"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
            />

            {/* STEP 1: Company Information */}
            {step === 1 ? (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                    {t("trial.step1Title")}
                  </h2>
                </div>

                <div className="grid gap-3.5 md:grid-cols-2">
                  <Field label={`${t("trial.companyNameLabel")} *`} error={errors.companyName}>
                    <Input
                      value={form.companyName}
                      onChange={(event) =>
                        updateField("companyName", event.target.value)
                      }
                      placeholder={t("trial.companyNamePlaceholder")}
                      className="h-10.5 w-full rounded-xl border-slate-300 text-sm sm:h-11"
                    />
                  </Field>

                  <Field label={`${t("trial.companyEmailLabel")} *`} error={errors.companyEmail || emailValidationError}>
                    <Input
                      type="email"
                      value={form.companyEmail}
                      onChange={(event) =>
                        updateField("companyEmail", event.target.value)
                      }
                      onBlur={handleCompanyEmailBlur}
                      placeholder={t("common.exampleEmail")}
                      className={`h-10.5 w-full rounded-xl border-slate-300 text-sm sm:h-11 ${errors.companyEmail || emailValidationError ? "border-red-500" : ""}`}
                    />
                    {emailChecking ? (
                      <p className="mt-1 text-xs text-indigo-600 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Checking email...
                      </p>
                    ) : null}
                  </Field>

                  <Field label={`${t("trial.businessTypeLabel")} *`} error={errors.businessType}>
                    <Select
                      value={form.businessType}
                      onValueChange={(value) => updateField("businessType", value)}
                    >
                      <SelectTrigger className="h-10.5 w-full rounded-xl border-slate-300 bg-white text-left text-sm sm:h-11">
                        <SelectValue placeholder={t("trial.businessTypePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online-shop">{t("trial.businessTypes.online-shop")}</SelectItem>
                        <SelectItem value="sales-team">{t("trial.businessTypes.sales-team")}</SelectItem>
                        <SelectItem value="retail-distribution">
                          Retail & Distribution
                        </SelectItem>
                        <SelectItem value="local-brand">{t("trial.businessTypes.local-brand")}</SelectItem>
                        <SelectItem value="other">{t("trial.businessTypes.other")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label={`${t("trial.teamSizeLabel")} *`} error={errors.teamSize}>
                    <Select
                      value={form.teamSize}
                      onValueChange={(value) => updateField("teamSize", value)}
                    >
                      <SelectTrigger className="h-10.5 w-full rounded-xl border-slate-300 bg-white text-left text-sm sm:h-11">
                        <SelectValue placeholder={t("trial.teamSizePlaceholder")} />
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
                </div>

                {submissionError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{submissionError}</span>
                  </div>
                ) : null}

                <Button
                  type="button"
                  onClick={handleNext}
                  className="mt-3 h-11 w-full rounded-xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:opacity-95 sm:h-12 sm:text-base"
                >
                  {t("trial.nextToPersonal")}
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
            ) : null}

            {/* STEP 2: Personal Information */}
            {step === 2 ? (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                    Personal Details
                  </h2>
                </div>

                <div className="grid gap-3.5 md:grid-cols-2">
                  <Field label={`${t("trial.fullNameLabel")} *`} error={errors.fullName}>
                    <Input
                      value={form.fullName}
                      onChange={(event) =>
                        updateField("fullName", event.target.value)
                      }
                      placeholder={t("trial.fullNamePlaceholder")}
                      className={`h-10.5 w-full rounded-xl text-sm sm:h-11 transition-colors ${
                        errors.fullName
                          ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
                          : "border-slate-300"
                      }`}
                    />
                  </Field>

                  <Field label={`${t("trial.phoneNumberLabel")} *`} error={errors.phoneNumber}>
                    <Input
                      value={form.phoneNumber}
                      onChange={(event) =>
                        updateField("phoneNumber", event.target.value)
                      }
                      placeholder="Enter your phone number (e.g. 09123456789)"
                      className={`h-10.5 w-full rounded-xl text-sm sm:h-11 transition-colors ${
                        errors.phoneNumber
                          ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
                          : "border-slate-300"
                      }`}
                    />
                  </Field>

                  <div>
                    <Field
                      label={`${t("trial.passwordLabel")} *`}
                      error={errors.password}
                    >
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(event) =>
                            updateField("password", event.target.value)
                          }
                          placeholder="At least 12 chars with uppercase, number, symbol"
                          className={`h-10.5 w-full rounded-xl pr-10 text-sm sm:h-11 transition-colors ${passwordBorderClass}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                          aria-label={showPassword ? t("signIn.hidePassword") : t("signIn.showPassword")}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </Field>
                    {/* Compact Real-Time Requirement Chips */}
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${
                          passwordCriteria.hasLength
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {passwordCriteria.hasLength ? "✓" : "•"} {t("trial.passwordChips.length")}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${
                          passwordCriteria.hasUpper
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {passwordCriteria.hasUpper ? "✓" : "•"} {t("trial.passwordChips.uppercase")}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${
                          passwordCriteria.hasNumber
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {passwordCriteria.hasNumber ? "✓" : "•"} {t("trial.passwordChips.number")}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${
                          passwordCriteria.hasSpecial
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {passwordCriteria.hasSpecial ? "✓" : "•"} {t("trial.passwordChips.symbol")}
                      </span>
                    </div>
                  </div>

                  <div>
                    <Field
                      label={`${t("trial.confirmPasswordLabel")} *`}
                      error={
                        confirmMatchStatus !== "matched" && confirmMatchStatus !== "mismatched"
                          ? errors.confirmPassword
                          : undefined
                      }
                    >
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          value={form.confirmPassword}
                          onChange={(event) =>
                            updateField("confirmPassword", event.target.value)
                          }
                          placeholder={t("trial.confirmPasswordPlaceholder")}
                          className={`h-10.5 w-full rounded-xl pr-10 text-sm sm:h-11 transition-colors ${confirmPasswordBorderClass}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                          aria-label={showConfirmPassword ? t("signIn.hidePassword") : t("signIn.showPassword")}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </Field>
                    {/* Debounced Real-Time Password Match Feedback */}
                    {confirmMatchStatus === "matched" ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                        <Check className="h-3 w-3" /> {t("trial.passwordsMatch")}
                      </p>
                    ) : confirmMatchStatus === "mismatched" ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-red-500">
                        <X className="h-3 w-3" /> {t("trial.passwordsDoNotMatch")}
                      </p>
                    ) : null}
                  </div>
                </div>

                {submissionError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{submissionError}</span>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStep(1)
                      setSubmissionError("")
                    }}
                    className="h-10.5 rounded-xl border-slate-300 px-5 font-semibold text-slate-700 hover:bg-slate-50 sm:h-11"
                  >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    {t("trial.back")}
                  </Button>

                  <Button
                    type="button"
                    onClick={handleNext}
                    className="h-10.5 flex-1 rounded-xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:opacity-95 sm:h-11 sm:text-base"
                  >
                    {t("trial.nextToConfirmEmail")}
                    <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* STEP 3: Confirm Email & Launch */}
            {step === 3 ? (
              <fieldset
                disabled={isSubmitting}
                className={`space-y-4 border-0 p-0 m-0 ${
                  isSubmitting ? "pointer-events-none opacity-75 cursor-wait" : ""
                }`}
              >
                <div className="text-center">
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                    {t("trial.step3Title")}
                  </h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Option 1: Company Email */}
                  <div
                    onClick={() => updateField("loginEmailType", "company")}
                    className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-3.5 transition-all sm:p-4 ${
                      form.loginEmailType === "company"
                        ? "border-[#0084FF] bg-blue-50/40 ring-2 ring-[#0084FF]/20 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="loginEmailType"
                        checked={form.loginEmailType === "company"}
                        onChange={() => updateField("loginEmailType", "company")}
                        className="mt-1 h-4 w-4 text-[#0084FF] focus:ring-[#0084FF]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-4 w-4 text-slate-500" />
                          <p className="text-xs font-bold text-slate-900 sm:text-sm">
                            Use Company Email
                          </p>
                        </div>
                        <p className="mt-1 break-all text-xs font-semibold text-[#0084FF] sm:text-sm">
                          {form.companyEmail || t("common.exampleEmail")}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          Recommended for organization accounts & centralized billing.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Personal Email */}
                  <div
                    onClick={() => updateField("loginEmailType", "personal")}
                    className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-3.5 transition-all sm:p-4 ${
                      form.loginEmailType === "personal"
                        ? "border-[#0084FF] bg-blue-50/40 ring-2 ring-[#0084FF]/20 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="loginEmailType"
                        checked={form.loginEmailType === "personal"}
                        onChange={() => updateField("loginEmailType", "personal")}
                        className="mt-1 h-4 w-4 text-[#0084FF] focus:ring-[#0084FF]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <User className="h-4 w-4 text-slate-500" />
                          <p className="text-xs font-bold text-slate-900 sm:text-sm">
                            Use Personal Email
                          </p>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          Use a personal email for direct individual account ownership.
                        </p>
                        {form.loginEmailType === "personal" ? (
                          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                             <Input
                               type="email"
                               value={form.personalEmail}
                               onChange={(event) =>
                                 updateField("personalEmail", event.target.value)
                               }
                               onBlur={handlePersonalEmailBlur}
                               placeholder={t("trial.personalEmailPlaceholder")}
                               className={`h-9.5 w-full rounded-xl bg-white text-xs sm:text-sm transition-colors ${
                                 errors.personalEmail || emailValidationError
                                   ? "border-red-500 focus-visible:border-red-500"
                                   : "border-slate-300"
                               }`}
                               autoFocus
                             />
                             {emailChecking ? (
                               <p className="mt-1 text-[11px] text-indigo-600 flex items-center gap-1">
                                 <Loader2 className="h-3 w-3 animate-spin" />
                                 Checking email...
                               </p>
                             ) : null}
                             {errors.personalEmail || emailValidationError ? (
                               <p className="mt-1 text-[11px] text-red-600">
                                 {errors.personalEmail || emailValidationError}
                               </p>
                             ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {policiesLoadError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/50 p-2 text-xs text-amber-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Legal policy details are temporarily unavailable.{" "}
                      {policiesLoadError}
                    </span>
                  </div>
                ) : null}

                {submissionError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{submissionError}</span>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => {
                      setStep(2)
                      setSubmissionError("")
                    }}
                    className="h-10.5 rounded-xl border-slate-300 px-5 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11"
                  >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    {t("trial.back")}
                  </Button>

                  <Button
                    type="submit"
                    className="h-10.5 flex-1 rounded-xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:text-base"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("trial.startingTrial")}
                      </span>
                    ) : (
                      t("trial.startTrialButton")
                    )}
                  </Button>
                </div>

                <div className="pt-0.5">
                  <label className="flex cursor-pointer items-start justify-center gap-2 text-center text-[11px] text-slate-600 sm:text-xs">
                    <input
                      type="checkbox"
                      checked={form.acceptTerms}
                      onChange={(event) =>
                        updateField("acceptTerms", event.target.checked)
                      }
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded transition-all text-[#0084FF] focus:ring-[#0084FF] ${
                        errors.acceptTerms
                          ? "border-red-500 ring-2 ring-red-400"
                          : "border-slate-300"
                      }`}
                    />
                    <span>
                      {t("trial.termsAgreePrefix")}{" "}
                      <Link
                        href={termsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#5E4BCE] underline underline-offset-4 hover:text-[#4A38AA]"
                      >
                        {t("trial.termsLink")}
                      </Link>{" "}
                      {t("trial.termsConjunction")}{" "}
                      <Link
                        href={privacyHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#5E4BCE] underline underline-offset-4 hover:text-[#4A38AA]"
                      >
                        {t("trial.privacyLink")}
                      </Link>
                      {t("trial.termsSuffix")}
                    </span>
                  </label>
                  {errors.acceptTerms ? (
                    <p className="mt-1.5 text-center text-xs font-semibold text-red-600">
                      {errors.acceptTerms}
                    </p>
                  ) : null}
                </div>

                {submitted ? (
                  <p className="text-center text-xs font-medium text-emerald-600 sm:text-sm">
                    {t("trial.workspaceReadyRedirecting")}
                  </p>
                ) : null}
              </fieldset>
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
    <div className="w-full space-y-1">
      <Label className="text-xs font-bold text-slate-900 sm:text-sm">{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

