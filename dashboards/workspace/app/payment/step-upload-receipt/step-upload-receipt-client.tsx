"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, Suspense } from "react"
import { ArrowLeft, ArrowRight, AlertCircle, Loader2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { PaymentStepper } from "@/components/payment/payment-stepper"
import { PaymentMethodCard } from "@/components/payment/payment-method-card"
import { PlanDetailCard } from "@/components/payment/plan-detail-card"
import { paymentMethods } from "@/lib/payment-methods"

import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"

type StepUploadReceiptFormProps = {
  planId: string
}

const STORAGE_KEY_STEP3 = "zayos_step3_data"

function StepUploadReceiptForm({ planId }: StepUploadReceiptFormProps) {
  const router = useRouter()
  const [plan, setPlan] = useState<DisplaySubscriptionPlan | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrlRef.current)
    }
    objectUrlRef.current = previewUrl
  }, [previewUrl])

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
    const saved = sessionStorage.getItem(STORAGE_KEY_STEP3)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.selectedOptionId) setSelectedOptionId(data.selectedOptionId)
        if (data.note) setNote(data.note)
        if (data.receiptDataUrl && data.receiptFileName) {
          fetch(data.receiptDataUrl)
            .then(res => res.blob())
            .then(blob => {
              const file = new File([blob], data.receiptFileName, { type: blob.type })
              setSelectedFile(file)
              setPreviewUrl(data.receiptDataUrl)
            })
            .catch(() => {})
        }
      } catch { /* ignore invalid stored data */ }
    }
  }, [])

  const saveStep3 = (file: File | null, optionId: string | null, noteText: string) => {
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        sessionStorage.setItem(STORAGE_KEY_STEP3, JSON.stringify({
          selectedOptionId: optionId,
          note: noteText,
          receiptDataUrl: reader.result,
          receiptFileName: file.name,
        }))
      }
      reader.readAsDataURL(file)
    } else {
      sessionStorage.setItem(STORAGE_KEY_STEP3, JSON.stringify({
        selectedOptionId: optionId,
        note: noteText,
      }))
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
        saveStep3(file, selectedOptionId, note)
      }
      reader.readAsDataURL(file)
    } else {
      setPreviewUrl(null)
      saveStep3(null, selectedOptionId, note)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith("image/")) {
        handleFileChange(file)
      }
    }
  }

  const handlePaymentMethodSelect = (optionId: string) => {
    setSelectedOptionId(optionId)
    saveStep3(selectedFile, optionId, note)
  }

  const handleSubmit = async () => {
    if (!selectedFile || !selectedOptionId) return

    setIsSubmitting(true)
    setError(null)

    try {
      const step1Data = JSON.parse(sessionStorage.getItem("zayos_step1_data") || "{}")
      const step2Data = JSON.parse(sessionStorage.getItem("zayos_step2_data") || "{}")

      if (!step1Data.companyName || !step1Data.companyEmail || !step2Data.fullName || !step2Data.personalEmail) {
        throw new Error("Please complete all previous steps before submitting.")
      }

      const reader = new FileReader()
      const receiptDataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(selectedFile)
      })

      // 1) Create real merchant + send OTP to personal email via real backend
      const backendResponse = await fetch("/api/proxy/auth/register/from-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionPlanId: planId,
          companyName: step1Data.companyName,
          companyEmail: step1Data.companyEmail,
          businessType: step1Data.businessType,
          teamSize: step1Data.teamSize,
          fullName: step2Data.fullName,
          personalEmail: step2Data.personalEmail,
          password: step2Data.password,
          paymentMethodOptionId: selectedOptionId,
          note: note || undefined,
          acceptTerms: true,
        }),
      }).then((r) => { if (!r.ok) throw new Error("Registration failed. This email may already be registered."); return r.json() })

      // 2) Store payment receipt in mock-payment (for admin dashboard display)
      await fetch("/api/mock-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: {
            companyName: step1Data.companyName,
            companyEmail: step1Data.companyEmail,
            businessType: step1Data.businessType,
            teamSize: step1Data.teamSize,
          },
          users: {
            owner: {
              fullName: step2Data.fullName,
              email: step2Data.personalEmail,
              phoneNumber: step2Data.phoneNumber || "",
            },
          },
          payment: {
            planId: planId,
            planName: plan?.name || "",
            selectedOptionId: selectedOptionId,
            note: note || "",
          },
          receipt: {
            fileName: selectedFile.name,
            fileData: receiptDataUrl,
          },
        }),
      })

      // Use real backend's paymentId and personal email for OTP
      sessionStorage.setItem("zayos_payment_id", backendResponse.paymentId)
      sessionStorage.setItem("zayos_otp_email", backendResponse.email)

      await new Promise((resolve) => setTimeout(resolve, 500))

      router.push(`/payment/step-verification?planId=${encodeURIComponent(planId)}&paymentId=${encodeURIComponent(backendResponse.paymentId)}`)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit payment. Please try again."
      )
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-950 mb-6 text-center">Complete Your Payment</h1>

      <div className="mb-8">
        <PaymentStepper currentStep={3} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        <div className="flex-1 min-w-0">
          <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-2 text-xl font-bold text-slate-950">Payment & Receipt</h2>
            <p className="mb-6 text-sm text-slate-600">
              Select your payment method and upload your receipt.
            </p>

            {/* Payment Options */}
            <div className={`mb-10 ${isSubmitting ? "pointer-events-none opacity-50" : ""}`}>
              <Label className="text-sm font-bold text-slate-900 mb-3 block">Payment Method *</Label>
              <div className="space-y-4">
                {paymentMethods.map((method) => (
                  <PaymentMethodCard
                    key={method.id}
                    method={method}
                    selectedOptionId={selectedOptionId}
                    onSelectOption={handlePaymentMethodSelect}
                  />
                ))}
              </div>
            </div>

            {/* Receipt Upload */}
            <div className={`mb-10 ${isSubmitting ? "pointer-events-none opacity-50" : ""}`}>
              <Label className="text-sm font-bold text-slate-900 mb-3 block">Payment Proof *</Label>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`relative rounded-2xl border-2 border-dashed transition-all ${
                  dragActive
                    ? "border-indigo-400 bg-indigo-50"
                    : selectedFile
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
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 p-8 text-center">
                    <Upload className="mx-auto h-10 w-10 text-slate-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Drop your receipt here</p>
                      <p className="mt-0.5 text-xs text-slate-500">Supports JPG, PNG, GIF</p>
                    </div>
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                      Choose File
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

            {/* Note */}
            <div className={`mb-10 ${isSubmitting ? "pointer-events-none opacity-50" : ""}`}>
              <Label className="text-sm font-bold text-slate-900 mb-2 block">Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  saveStep3(selectedFile, selectedOptionId, e.target.value)
                }}
                placeholder="Add a note for the admin..."
                className="rounded-xl border-slate-300 min-h-[80px]"
              />
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                className="h-14 rounded-2xl border-slate-300 px-6 text-base font-semibold"
                disabled={isSubmitting}
              >
                <ArrowLeft className="mr-2 h-5 w-5" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:opacity-95 disabled:opacity-50 sm:text-lg"
                disabled={!selectedFile || !selectedOptionId || isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Submit Payment
                    <ArrowRight className="h-5 w-5" />
                  </span>
                )}
              </Button>
            </div>
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

export default function StepUploadReceiptClient({ planId }: StepUploadReceiptFormProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>}>
      <StepUploadReceiptForm planId={planId} />
    </Suspense>
  )
}
