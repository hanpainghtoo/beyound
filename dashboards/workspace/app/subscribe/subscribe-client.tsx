"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, type FormEvent, type ReactNode } from "react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Upload,
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
import { Textarea } from "@/components/ui/textarea"
import { MarketingHeader } from "@/components/marketing-header"
import { PaymentMethodCard } from "@/components/payment/payment-method-card"
import { CompactPlanCard } from "@/components/payment/compact-plan-card"
import { useI18n } from "@/components/providers/i18n-provider"
import { usePaymentMethodGroups, mapGroupsToPaymentConfigs } from "@/lib/billing-payment-accounts"
import { businessTypes, teamSizes } from "@/lib/payment-methods"
import { checkEmailExists, validateRealEmail } from "@/lib/api"
import { getPasswordPolicyError } from "@/lib/password-policy"
import type { PublicLegalPolicy } from "@/lib/public-legal-policies"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"

type SubscribeForm = {
  companyName: string
  companyEmail: string
  businessType: string
  teamSize: string
  fullName: string
  personalEmail: string
  password: string
  confirmPassword: string
  acceptTerms: boolean
  selectedOptionId: string
  note: string
}

const emptyForm: SubscribeForm = {
  companyName: "",
  companyEmail: "",
  businessType: "",
  teamSize: "",
  fullName: "",
  personalEmail: "",
  password: "",
  confirmPassword: "",
  acceptTerms: false,
  selectedOptionId: "",
  note: "",
}

const STORAGE_KEY = "zayos_subscribe_data"
const LEGACY_KEYS = ["zayos_step1_data", "zayos_step2_data", "zayos_step3_data"]

type StoredSnapshot = Partial<SubscribeForm> & {
  receiptDataUrl?: string
  receiptFileName?: string
}

function readSnapshot(): StoredSnapshot | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as StoredSnapshot
  } catch {
    /* ignore invalid stored data */
  }
  // One-time import from the legacy multi-route flow, then clear.
  try {
    const step1 = JSON.parse(sessionStorage.getItem(LEGACY_KEYS[0]) || "{}")
    const step2 = JSON.parse(sessionStorage.getItem(LEGACY_KEYS[1]) || "{}")
    const step3 = JSON.parse(sessionStorage.getItem(LEGACY_KEYS[2]) || "{}")
    const merged: StoredSnapshot = {
      companyName: step1.companyName,
      companyEmail: step1.companyEmail,
      businessType: step1.businessType,
      teamSize: step1.teamSize,
      fullName: step2.fullName,
      personalEmail: step2.personalEmail,
      password: step2.password,
      confirmPassword: step2.confirmPassword,
      selectedOptionId: step3.selectedOptionId,
      note: step3.note,
      receiptDataUrl: step3.receiptDataUrl,
      receiptFileName: step3.receiptFileName,
    }
    const hasAny = Object.values(merged).some(
      (value) => typeof value === "string" && value.length > 0,
    )
    return hasAny ? merged : null
  } catch {
    return null
  }
}

export default function SubscribeClient({
  planId,
  plan,
  initialPaymentId,
  policies,
  policiesLoadError,
}: {
  planId: string
  plan: DisplaySubscriptionPlan
  initialPaymentId?: string
  policies?: { terms?: PublicLegalPolicy; privacy?: PublicLegalPolicy }
  policiesLoadError?: string
}) {
  const router = useRouter()
  const { t, translate } = useI18n()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialPaymentId ? 4 : 1)
  const [form, setForm] = useState<SubscribeForm>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof SubscribeForm, string>>>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [confirmMatchStatus, setConfirmMatchStatus] = useState<"idle" | "matched" | "mismatched">("idle")
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailValidationError, setEmailValidationError] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [paymentId, setPaymentId] = useState(initialPaymentId || "")
  const [invoiceNo, setInvoiceNo] = useState("")
  const [verifyEmail, setVerifyEmail] = useState("")
  const [hydrated, setHydrated] = useState(false)
  const objectUrlRef = useRef<string | null>(null)
  const { groups, isLoading: groupsLoading, isError: groupsError } = usePaymentMethodGroups()
  const paymentMethods = mapGroupsToPaymentConfigs(groups)

  // Restore persisted form + receipt once.
  useEffect(() => {
    const snapshot = readSnapshot()
    if (snapshot) {
      setForm((current) => ({
        ...current,
        companyName: snapshot.companyName || current.companyName,
        companyEmail: snapshot.companyEmail || current.companyEmail,
        businessType: snapshot.businessType || current.businessType,
        teamSize: snapshot.teamSize || current.teamSize,
        fullName: snapshot.fullName || current.fullName,
        personalEmail: snapshot.personalEmail || current.personalEmail,
        password: snapshot.password || current.password,
        confirmPassword: snapshot.confirmPassword || current.confirmPassword,
        acceptTerms: snapshot.acceptTerms ?? current.acceptTerms,
        selectedOptionId: snapshot.selectedOptionId || current.selectedOptionId,
        note: snapshot.note || current.note,
      }))
      if (snapshot.receiptDataUrl && snapshot.receiptFileName) {
        fetch(snapshot.receiptDataUrl)
          .then((res) => res.blob())
          .then((blob) => {
            const file = new File([blob], snapshot.receiptFileName as string, { type: blob.type })
            setSelectedFile(file)
            setPreviewUrl(snapshot.receiptDataUrl as string)
          })
          .catch(() => {})
      }
    }
    try {
      const storedPaymentId = sessionStorage.getItem("zayos_payment_id")
      if (storedPaymentId && !initialPaymentId) setPaymentId(storedPaymentId)
      setInvoiceNo(sessionStorage.getItem("zayos_invoice_no") || "")
      setVerifyEmail(sessionStorage.getItem("zayos_otp_email") || "")
    } catch {
      /* sessionStorage unavailable */
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist serializable form (receipt as data URL).
  useEffect(() => {
    if (!hydrated) return
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      const prev = (raw ? JSON.parse(raw) : {}) as StoredSnapshot
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...prev,
          companyName: form.companyName,
          companyEmail: form.companyEmail,
          businessType: form.businessType,
          teamSize: form.teamSize,
          fullName: form.fullName,
          personalEmail: form.personalEmail,
          password: form.password,
          confirmPassword: form.confirmPassword,
          acceptTerms: form.acceptTerms,
          selectedOptionId: form.selectedOptionId,
          note: form.note,
        } satisfies StoredSnapshot),
      )
    } catch {
      /* ignore storage errors */
    }
  }, [form, hydrated])

  useEffect(() => {
    if (groupsError) {
      setSubmissionError("Unable to load payment methods. Please try again.")
    }
  }, [groupsError])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

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

  const termsHref = policies?.terms?.version
    ? `/terms-of-service?version=${encodeURIComponent(policies.terms.version)}`
    : "/terms-of-service"
  const privacyHref = policies?.privacy?.version
    ? `/privacy-policy?version=${encodeURIComponent(policies.privacy.version)}`
    : "/privacy-policy"

  const updateField = <K extends keyof SubscribeForm>(
    field: K,
    value: SubscribeForm[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmissionError("")
    if (field === "companyEmail" || field === "personalEmail") {
      setEmailValidationError("")
    }
  }

  const checkEmail = async (email: string) => {
    const realResult = validateRealEmail(email)
    if (realResult.valid === false) {
      setEmailValidationError(realResult.message)
      return false
    }
    setEmailChecking(true)
    try {
      const checkResult = await checkEmailExists(email)
      if (checkResult.exists) {
        setEmailValidationError(checkResult.message)
        return false
      }
    } catch {
      setEmailValidationError("Unable to verify email. Please try again.")
      return false
    } finally {
      setEmailChecking(false)
    }
    return true
  }

  const handleCompanyEmailBlur = async () => {
    if (!form.companyEmail.trim()) return
    await checkEmail(form.companyEmail)
  }

  const handlePersonalEmailBlur = async () => {
    if (!form.personalEmail.trim()) return
    await checkEmail(form.personalEmail)
  }

  const validateStep1 = () => {
    const nextErrors: Partial<Record<keyof SubscribeForm, string>> = {}
    if (!form.companyName.trim()) nextErrors.companyName = t("validation.companyNameRequired")
    if (!form.companyEmail.trim()) nextErrors.companyEmail = t("validation.companyEmailRequired")
    else {
      const realResult = validateRealEmail(form.companyEmail)
      if (realResult.valid === false) nextErrors.companyEmail = realResult.message
    }
    if (!form.businessType) nextErrors.businessType = t("validation.businessTypeRequired")
    if (!form.teamSize) nextErrors.teamSize = t("validation.teamSizeRequired")
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const validateStep2 = () => {
    const nextErrors: Partial<Record<keyof SubscribeForm, string>> = {}
    if (!form.fullName.trim()) nextErrors.fullName = t("validation.fullNameRequired")
    if (!form.personalEmail.trim()) nextErrors.personalEmail = t("validation.personalEmailRequired")
    else {
      const realResult = validateRealEmail(form.personalEmail)
      if (realResult.valid === false) nextErrors.personalEmail = realResult.message
    }
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
    const nextErrors: Partial<Record<keyof SubscribeForm, string>> = {}
    if (!form.selectedOptionId) nextErrors.selectedOptionId = t("validation.selectPaymentMethod")
    if (!selectedFile) nextErrors.selectedOptionId = t("validation.uploadReceiptRequired")
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
      if (result.valid && !emailValidationError) {
        setStep(3)
        setSubmissionError("")
      } else {
        setSubmissionError(
          emailValidationError || Object.values(result.errors).filter(Boolean).join(" "),
        )
      }
    }
  }

  const persistReceipt = (file: File | null) => {
    try {
      if (!file) {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        const prev = (raw ? JSON.parse(raw) : {}) as StoredSnapshot
        delete prev.receiptDataUrl
        delete prev.receiptFileName
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prev))
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const raw = sessionStorage.getItem(STORAGE_KEY)
          const prev = (raw ? JSON.parse(raw) : {}) as StoredSnapshot
          sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              ...prev,
              receiptDataUrl: reader.result,
              receiptFileName: file.name,
            }),
          )
        } catch {
          /* ignore storage errors */
        }
      }
      reader.readAsDataURL(file)
    } catch {
      /* ignore storage errors */
    }
  }

  const handleFileChange = (file: File | null) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setSelectedFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setPreviewUrl(dataUrl)
        objectUrlRef.current = dataUrl
      }
      reader.readAsDataURL(file)
      persistReceipt(file)
    } else {
      setPreviewUrl(null)
      persistReceipt(null)
    }
    setErrors((current) => ({ ...current, selectedOptionId: undefined }))
    setSubmissionError("")
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith("image/")) {
        handleFileChange(file)
      }
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateStep1()) {
      setStep(1)
      setSubmissionError("Please complete all required fields in Company Information.")
      return
    }
    const step2Result = validateStep2()
    if (!step2Result.valid) {
      setStep(2)
      setSubmissionError(Object.values(step2Result.errors).filter(Boolean).join(" "))
      return
    }
    if (!validateStep3()) {
      setSubmissionError(
        errors.selectedOptionId ||
          (!selectedFile || !form.selectedOptionId
            ? "Please select a payment method and upload your receipt."
            : "Please agree to the Terms of Service and Privacy Policy to continue."),
      )
      return
    }
    if (emailValidationError) {
      setSubmissionError(emailValidationError)
      return
    }
    if (!selectedFile || !form.selectedOptionId) {
      setSubmissionError("Please select a payment method and upload your receipt.")
      return
    }
    setSubmissionError("")
    setEmailValidationError("")
    setEmailChecking(true)
    try {
      for (const email of [form.companyEmail.trim(), form.personalEmail.trim()]) {
        const loginCheck = await checkEmailExists(email)
        if (loginCheck.exists) {
          setSubmissionError(loginCheck.message)
          return
        }
      }
    } catch {
      setSubmissionError("Unable to verify emails. Please try again.")
      return
    } finally {
      setEmailChecking(false)
    }
    setIsSubmitting(true)
    try {
      // Upload the receipt BEFORE registering so the created billing record
      // carries the payment proof (the register endpoint only accepts a
      // file id, never raw bytes).
      const proofUpload = await fetch("/api/proxy/auth/register/payment-proof-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          contentType: selectedFile.type,
          sizeBytes: selectedFile.size,
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(t("errors.receiptUploadFailed"))
        return r.json() as Promise<{ fileId: string; uploadUrl: string }>
      })
      const putRes = await fetch(proofUpload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      })
      if (!putRes.ok) throw new Error(t("errors.receiptUploadFailed"))
      const backendResponse = await fetch("/api/proxy/auth/register/from-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionPlanId: planId,
          companyName: form.companyName.trim(),
          companyEmail: form.companyEmail.trim(),
          businessType: form.businessType,
          teamSize: form.teamSize,
          fullName: form.fullName.trim(),
          personalEmail: form.personalEmail.trim(),
          password: form.password,
          paymentMethodOptionId: form.selectedOptionId,
          paymentProofFileId: proofUpload.fileId,
          note: form.note || undefined,
          acceptTerms: true,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error(t("errors.emailAlreadyRegistered"))
        return r.json() as Promise<{ paymentId: string; invoiceNo?: string; email: string }>
      })

      try {
        sessionStorage.setItem("zayos_payment_id", backendResponse.paymentId)
        if (backendResponse.invoiceNo) {
          sessionStorage.setItem("zayos_invoice_no", backendResponse.invoiceNo)
        }
        sessionStorage.setItem("zayos_otp_email", backendResponse.email)
        sessionStorage.removeItem(STORAGE_KEY)
        for (const key of LEGACY_KEYS) sessionStorage.removeItem(key)
      } catch {
        /* ignore storage errors */
      }
      setPaymentId(backendResponse.paymentId)
      setInvoiceNo(backendResponse.invoiceNo || "")
      setVerifyEmail(backendResponse.email)
      setSelectedFile(null)
      setPreviewUrl(null)
      // Drop credentials from memory: step 4 is terminal, no back-navigation.
      setForm((current) => ({ ...current, password: "", confirmPassword: "" }))
      setStep(4)
      router.refresh()
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : t("errors.submitFailed"),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const goToStep = (target: 1 | 2 | 3) => {
    // Step 4 is terminal: no in-app back-navigation after submit.
    if (step === 4) return
    if (target === 2 && !validateStep1()) return
    if (target === 3) {
      if (!validateStep1()) {
        setStep(1)
        return
      }
      const result = validateStep2()
      if (!result.valid) {
        setStep(2)
        return
      }
    }
    setSubmissionError("")
    setStep(target)
  }

  const selectedMethodName = (() => {
    for (const method of paymentMethods) {
      const found = method.options.find((o) => o.id === form.selectedOptionId)
      if (found) return `${method.name} · ${found.name}`
    }
    return null
  })()

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
            {t("registration.titlePrefix")} <span className="text-[#0084FF]">{t("registration.titleAccent")}</span>
          </h1>
          <p className="mt-1 text-xs font-bold text-slate-900 sm:text-sm">
            {translate(plan.name)} · {translate(plan.monthlyPriceDisplay)}
          </p>
        </div>

        {/* Card Form */}
        <div className={`mx-auto mt-3 w-full ${step === 4 ? "max-w-[760px]" : "max-w-[1100px]"} rounded-[22px] border border-[#816EF7]/40 bg-white p-5 shadow-lg shadow-indigo-100/40 sm:mt-5 sm:p-7`}>
          {/* Stepper Tabs (Numbered circles changing to green checkmark when complete; locked on confirmation) */}
          <div
            className={`mb-4 flex items-center justify-center gap-2 sm:mb-5 transition-opacity ${
              isSubmitting || step === 4 ? "pointer-events-none opacity-50" : ""
            }`}
            aria-disabled={step === 4}
          >
            <StepCircle n={1} step={step} done={step > 1} label={t("registration.stepAria.1")} onClick={() => goToStep(1)} disabled={step === 4} />
            <StepConnector done={step > 1} />
            <StepCircle n={2} step={step} done={step > 2} label={t("registration.stepAria.2")} onClick={() => goToStep(2)} disabled={step === 4} />
            <StepConnector done={step > 2} />
            <StepCircle n={3} step={step} done={step > 3} label={t("registration.stepAria.3")} onClick={() => goToStep(3)} disabled={step === 4} />
            <StepConnector done={step > 3} />
            <StepCircle n={4} step={step} done={false} label={t("registration.stepAria.4")} onClick={() => {}} current={step === 4} disabled />
          </div>

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            {/* STEP 1: Company Information */}
            {step === 1 ? (
              <div className="flex flex-col gap-8 lg:flex-row">
                <div className="flex-1 min-w-0 space-y-4">
                <div className="text-center">
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                    {t("registration.step1Title")}
                  </h2>
                </div>

                <div className="grid gap-3.5 md:grid-cols-2">
                  <Field label={`${t("registration.companyNameLabel")} *`} error={errors.companyName}>
                    <Input
                      value={form.companyName}
                      onChange={(event) => updateField("companyName", event.target.value)}
                      placeholder={t("registration.companyNamePlaceholder")}
                      className="h-10.5 w-full rounded-xl border-slate-300 text-sm sm:h-11"
                    />
                  </Field>

                  <Field label={`${t("registration.companyEmailLabel")} *`} error={errors.companyEmail || emailValidationError}>
                    <Input
                      type="email"
                      value={form.companyEmail}
                      onChange={(event) => updateField("companyEmail", event.target.value)}
                      onBlur={handleCompanyEmailBlur}
                      placeholder={t("common.exampleEmail")}
                      className={`h-10.5 w-full rounded-xl border-slate-300 text-sm sm:h-11 ${errors.companyEmail || emailValidationError ? "border-red-500" : ""}`}
                    />
                    {emailChecking ? (
                      <p className="mt-1 text-xs text-indigo-600 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t("common.loading")}
                      </p>
                    ) : null}
                  </Field>

                  <Field label={`${t("registration.businessTypeLabel")} *`} error={errors.businessType}>
                    <Select
                      value={form.businessType}
                      onValueChange={(value) => updateField("businessType", value)}
                    >
                      <SelectTrigger className="h-10.5 w-full rounded-xl border-slate-300 bg-white text-left text-sm sm:h-11">
                        <SelectValue placeholder={t("registration.businessTypePlaceholder")} />
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

                  <Field label={`${t("registration.teamSizeLabel")} *`} error={errors.teamSize}>
                    <Select
                      value={form.teamSize}
                      onValueChange={(value) => updateField("teamSize", value)}
                    >
                      <SelectTrigger className="h-10.5 w-full rounded-xl border-slate-300 bg-white text-left text-sm sm:h-11">
                        <SelectValue placeholder={t("registration.teamSizePlaceholder")} />
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
                  {t("registration.nextToPersonalInfo")}
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                </div>
                <div className="lg:w-[340px] shrink-0">
                  <div className="lg:sticky lg:top-6">
                    <CompactPlanCard plan={plan} />
                  </div>
                </div>
              </div>
            ) : null}

            {/* STEP 2: Personal Information */}
            {step === 2 ? (
              <div className="flex flex-col gap-8 lg:flex-row">
                <div className="flex-1 min-w-0 space-y-4">
                <div className="text-center">
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                    {t("registration.step2Title")}
                  </h2>
                </div>

                <div className="grid gap-3.5 md:grid-cols-2">
                  <Field label={`${t("registration.fullNameLabel")} *`} error={errors.fullName}>
                    <Input
                      value={form.fullName}
                      onChange={(event) => updateField("fullName", event.target.value)}
                      placeholder={t("registration.fullNamePlaceholder")}
                      className={`h-10.5 w-full rounded-xl text-sm sm:h-11 transition-colors ${
                        errors.fullName
                          ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
                          : "border-slate-300"
                      }`}
                    />
                  </Field>

                  <Field label={`${t("registration.personalEmailLabel")} *`} error={errors.personalEmail || emailValidationError}>
                    <Input
                      type="email"
                      value={form.personalEmail}
                      onChange={(event) => updateField("personalEmail", event.target.value)}
                      onBlur={handlePersonalEmailBlur}
                      placeholder="you@email.com"
                      className={`h-10.5 w-full rounded-xl text-sm sm:h-11 transition-colors ${
                        errors.personalEmail || emailValidationError
                          ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
                          : "border-slate-300"
                      }`}
                    />
                    {emailChecking ? (
                      <p className="mt-1 text-xs text-indigo-600 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t("common.loading")}
                      </p>
                    ) : null}
                  </Field>

                  <div>
                    <Field label={`${t("registration.passwordLabel")} *`} error={errors.password}>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(event) => updateField("password", event.target.value)}
                          placeholder={t("registration.passwordPlaceholder")}
                          className={`h-10.5 w-full rounded-xl pr-10 text-sm sm:h-11 transition-colors ${passwordBorderClass}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </Field>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${passwordCriteria.hasLength ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {passwordCriteria.hasLength ? "✓" : "•"} 12+ chars
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${passwordCriteria.hasUpper ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {passwordCriteria.hasUpper ? "✓" : "•"} Uppercase
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${passwordCriteria.hasNumber ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {passwordCriteria.hasNumber ? "✓" : "•"} Number
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${passwordCriteria.hasSpecial ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {passwordCriteria.hasSpecial ? "✓" : "•"} Symbol
                      </span>
                    </div>
                  </div>

                  <div>
                    <Field
                      label={`${t("registration.confirmPasswordLabel")} *`}
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
                          onChange={(event) => updateField("confirmPassword", event.target.value)}
                          placeholder={t("registration.confirmPasswordPlaceholder")}
                          className={`h-10.5 w-full rounded-xl pr-10 text-sm sm:h-11 transition-colors ${confirmPasswordBorderClass}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </Field>
                    {confirmMatchStatus === "matched" ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                        <Check className="h-3 w-3" /> Passwords match
                      </p>
                    ) : confirmMatchStatus === "mismatched" ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-red-500">
                        <X className="h-3 w-3" /> Passwords do not match
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
                    {t("registration.back")}
                  </Button>

                  <Button
                    type="button"
                    onClick={handleNext}
                    className="h-10.5 flex-1 rounded-xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:opacity-95 sm:h-11 sm:text-base"
                  >
                    Next: Payment & Receipt
                    <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                </div>
                </div>
                <div className="lg:w-[340px] shrink-0">
                  <div className="lg:sticky lg:top-6">
                    <CompactPlanCard plan={plan} />
                  </div>
                </div>
              </div>
            ) : null}

            {/* STEP 3: Payment & Receipt */}
            {step === 3 ? (
              <fieldset
                disabled={isSubmitting}
                className={`space-y-4 border-0 p-0 m-0 ${
                  isSubmitting ? "pointer-events-none opacity-75 cursor-wait" : ""
                }`}
              >
                <div className="text-center">
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                    {t("registration.step3Title")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {t("registration.step3Subtitle")}
                  </p>
                </div>

                <div className="flex flex-col gap-8 lg:flex-row">
                  <div className="flex-1 min-w-0 space-y-4">
                <div className={isSubmitting ? "pointer-events-none opacity-50" : ""}>
                  <Label className="text-xs font-bold text-slate-900 mb-3 block">{t("registration.paymentMethodRequired")}</Label>
                  {groupsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                    </div>
                  ) : paymentMethods.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                      {t("registration.paymentAccountsUnavailable")}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {paymentMethods.map((method) => (
                        <PaymentMethodCard
                          key={method.id}
                          method={method}
                          selectedOptionId={form.selectedOptionId || null}
                          onSelectOption={(optionId) => updateField("selectedOptionId", optionId)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className={isSubmitting ? "pointer-events-none opacity-50" : ""}>
                  <Label className="text-xs font-bold text-slate-900 mb-3 block">Payment Proof *</Label>
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`relative rounded-2xl border-2 border-dashed transition-all ${
                      selectedFile
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-300 hover:border-slate-400"
                    }`}
                    style={selectedFile ? { padding: 0 } : undefined}
                  >
                    {selectedFile && previewUrl ? (
                      <div className="relative rounded-xl overflow-hidden">
                        <img
                          src={previewUrl}
                          alt="Payment receipt preview"
                          className="w-full max-h-[400px] object-contain"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                              <p className="text-xs text-white/70">
                                {(selectedFile.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleFileChange(null)}
                              className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
                            >
                              {t("registration.receiptRemove")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 p-8 text-center">
                        <Upload className="mx-auto h-10 w-10 text-slate-400" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{t("registration.receiptDropzone")}</p>
                          <p className="mt-0.5 text-xs text-slate-500">JPG, PNG, GIF</p>
                        </div>
                        <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                          {t("registration.chooseFile")}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleFileChange(file)
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className={isSubmitting ? "pointer-events-none opacity-50" : ""}>
                  <Label className="text-xs font-bold text-slate-900 mb-2 block">{t("registration.noteLabel")} ({t("common.optional").toLowerCase()})</Label>
                  <Textarea
                    value={form.note}
                    onChange={(e) => updateField("note", e.target.value)}
                    placeholder={t("registration.notePlaceholder")}
                    className="rounded-xl border-slate-300 min-h-[80px]"
                  />
                </div>

                {policiesLoadError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/50 p-2 text-xs text-amber-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Legal policy details are temporarily unavailable. {policiesLoadError}
                    </span>
                  </div>
                ) : null}

                {submissionError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{submissionError}</span>
                  </div>
                ) : null}

                <div>
                  <label className="flex cursor-pointer items-start justify-center gap-2 text-center text-[11px] text-slate-600 sm:text-xs">
                    <input
                      type="checkbox"
                      checked={form.acceptTerms}
                      onChange={(event) => updateField("acceptTerms", event.target.checked)}
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded transition-all text-[#0084FF] focus:ring-[#0084FF] ${
                        errors.acceptTerms
                          ? "border-red-500 ring-2 ring-red-400"
                          : "border-slate-300"
                      }`}
                    />
                    <span>
                      {t("registration.termsPrefix")}{" "}
                      <Link
                        href={termsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#5E4BCE] underline underline-offset-4 hover:text-[#4A38AA]"
                      >
                        {t("registration.termsLink")}
                      </Link>{" "}
                      {t("registration.termsConjunction")}{" "}
                      <Link
                        href={privacyHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#5E4BCE] underline underline-offset-4 hover:text-[#4A38AA]"
                      >
                        {t("registration.privacyLink")}
                      </Link>
                      {t("registration.termsSuffix")}
                    </span>
                  </label>
                  {errors.acceptTerms ? (
                    <p className="mt-1.5 text-center text-xs font-semibold text-red-600">
                      {errors.acceptTerms}
                    </p>
                  ) : null}
                </div>

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
                    {t("registration.back")}
                  </Button>

                  <Button
                    type="submit"
                    className="h-10.5 flex-1 rounded-xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:text-base"
                    disabled={isSubmitting || groupsLoading || paymentMethods.length === 0}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("registration.submittingPayment")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        {t("registration.submitPayment")}
                        <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                      </span>
                    )}
                  </Button>
                </div>

                  </div>
                  <div className="lg:w-[340px] shrink-0">
                    <div className="lg:sticky lg:top-6">
                      <CompactPlanCard plan={plan} />
                    </div>
                  </div>
                </div>
              </fieldset>
            ) : null}

            {/* STEP 4: Confirmation */}
            {step === 4 ? (
              <div className="space-y-4">
                <div className="rounded-[24px] bg-gradient-to-br from-indigo-500 via-indigo-500 to-blue-500 p-6 text-center text-white shadow-lg">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                    <Check className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-white">Receipt received — under review</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-white/90">
                    We&apos;ve emailed your verification code. Verify your email now — dashboard access unlocks once our team confirms your payment.
                  </p>

                  <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white">
                      <Check className="h-3 w-3" />
                      {t("registration.step4Submitted")}
                    </div>
                    <span className="text-white/60">→</span>
                    <div className="rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white">
                      {t("registration.step4InReview")}
                    </div>
                    <span className="text-white/60">→</span>
                    <div className="rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/60">
                      {t("registration.step4Confirmed")}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-950">{translate(plan.name)}</h3>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {t("registration.periodLabel")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-950">{translate(plan.monthlyPriceDisplay)}</p>
                      <p className="text-xs text-slate-500">{t("pricing.perMonth")}</p>
                    </div>
                  </div>

                  <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                    {paymentId || invoiceNo ? (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">{t("registration.invoiceRef")}</dt>
                        <dd className="font-semibold text-slate-900">{invoiceNo || paymentId}</dd>
                      </div>
                    ) : null}

                    {selectedMethodName ? (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">{t("registration.paymentMethod")}</dt>
                        <dd className="text-right font-medium text-slate-900">{selectedMethodName}</dd>
                      </div>
                    ) : null}

                    {form.note ? (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">{t("registration.noteLabel")}</dt>
                        <dd className="text-right font-medium text-slate-900">{form.note}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>

                <Link
                  href={
                    verifyEmail
                      ? `/verify-email?email=${encodeURIComponent(verifyEmail)}`
                      : "/verify-email"
                  }
                >
                  <Button className="w-full h-12 rounded-xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:opacity-95 sm:h-13 sm:text-base">
                    {t("registration.verifyEmailAndSignIn")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <p className="text-center text-xs text-slate-500">
                  {t("registration.resendCodeHelp")}
                </p>
              </div>
            ) : null}
          </form>
        </div>
      </main>
    </div>
  )
}

function StepCircle({
  n,
  step,
  done,
  label,
  onClick,
  current,
  disabled,
}: {
  n: number
  step: number
  done: boolean
  label: string
  onClick: () => void
  current?: boolean
  disabled?: boolean
}) {
  const active = current ?? step === n
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all sm:h-9 sm:w-9 sm:text-sm ${
        done
          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25 hover:bg-emerald-600"
          : active
            ? "bg-[#0084FF] text-white shadow-md shadow-blue-500/25 ring-4 ring-blue-100"
            : "bg-slate-100 text-slate-400 border border-slate-200"
      } ${disabled ? "cursor-not-allowed" : ""}`}
    >
      {done ? <Check className="h-4 w-4 stroke-[2.5]" /> : n}
    </button>
  )
}

function StepConnector({ done }: { done: boolean }) {
  return (
    <div
      className={`h-0.5 w-6 sm:w-10 transition-colors duration-300 ${
        done ? "bg-emerald-500" : "bg-slate-200"
      }`}
    />
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
