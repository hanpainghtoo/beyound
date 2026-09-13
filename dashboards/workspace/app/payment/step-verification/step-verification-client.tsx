"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect, Suspense } from "react"
import { Check, ArrowLeft, ArrowRight } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { PaymentStepper } from "@/components/payment/payment-stepper"
import { paymentMethods } from "@/lib/payment-methods"
import type { DisplaySubscriptionPlan } from "@/lib/public-subscription-plans"

type StepVerificationFormProps = {
  planId: string
  paymentId: string
}

function StepVerificationForm({ planId, paymentId: paymentIdProp }: StepVerificationFormProps) {
  const router = useRouter()
  const [plan, setPlan] = useState<DisplaySubscriptionPlan | null>(null)
  const [paymentData] = useState<{ selectedOptionId?: string; note?: string } | null>(() => {
    try {
      const saved = sessionStorage.getItem("zayos_step3_data")
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [paymentId, setPaymentId] = useState(paymentIdProp)

  useEffect(() => {
    const stored = sessionStorage.getItem("zayos_payment_id")
    if (stored && !paymentIdProp) {
      setPaymentId(stored)
    }
    sessionStorage.removeItem("zayos_step1_data")
    sessionStorage.removeItem("zayos_step2_data")
    sessionStorage.removeItem("zayos_step2_payment_method")
    sessionStorage.removeItem("zayos_step3_data")
  }, [paymentIdProp])

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const plansRes = await fetch("/api/public-subscription-plans").then((r) => r.json())
        const found = plansRes.find((p: { id: string }) => p.id === planId)
        if (found) setPlan(found)
      } catch { /* ignore fetch errors */ }
      setIsLoading(false)
    }
    fetchPlan()
  }, [planId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-[860px] px-5 py-20 text-center">
        <p className="text-slate-600">Plan not found.</p>
        <Link href="/pricing" className="mt-4 inline-block text-indigo-600 hover:text-indigo-700">
          Back to Pricing
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-950 flex-1 text-center">Complete Your Payment</h1>
        <Button
          variant="outline"
          onClick={() => router.push("/pricing")}
          className="h-10 rounded-xl border-slate-300 text-sm ml-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Pricing
        </Button>
      </div>

      {/* Stepper */}
      <div className="mb-8">
        <PaymentStepper currentStep={4} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        {/* Left Column - Success */}
        <div className="flex-1 min-w-0">
          <div className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
            {/* Success Card */}
            <div className="mb-6 rounded-[24px] bg-gradient-to-br from-indigo-500 via-indigo-500 to-blue-500 p-6 text-center text-white shadow-lg">
              <p className="text-sm font-medium text-white/90">You&apos;re all set</p>
              <div className="mx-auto mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                <Check className="h-6 w-6 text-white" />
              </div>
              <h2 className="mt-3 text-xl font-bold text-white">Payment Received</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/90">
                Thank you! We&apos;ve received your payment receipt and it&apos;s now under review.
                You&apos;ll receive an email with your OTP and dashboard access once verified.
              </p>

              {/* Status Progression */}
              <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white">
                  <Check className="h-3 w-3" />
                  Submitted
                </div>
                <span className="text-white/60">→</span>
                <div className="rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white">
                  In Review
                </div>
                <span className="text-white/60">→</span>
                <div className="rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/60">
                  Confirmed
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-semibold text-slate-900">
                  Payment Summary {paymentId && `(${paymentId})`}
                </h3>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                  Invoice
                </span>
              </div>

<div className="px-6 py-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xl font-bold text-slate-950">{plan.name}</h4>
                      <p className="mt-1 text-sm text-slate-500">
                        Monthly subscription
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-slate-950">{plan.monthlyPriceDisplay}</p>
                      <p className="text-sm text-slate-500">per month</p>
                    </div>
                  </div>

                  {paymentData?.selectedOptionId && (() => {
                      const allOptions = paymentMethods.flatMap((m) => m.options)
                      const selected = allOptions.find((o) => o.id === paymentData.selectedOptionId)
                      if (!selected) return null
                      return (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <p className="text-sm font-medium text-slate-700 mb-1">Payment Method</p>
                          <div className="flex items-center gap-2">
                            {selected.icon && (
                              <img src={selected.icon} alt="" className="h-5 w-5 object-contain" />
                            )}
                            <span className="text-sm text-slate-900 font-medium">{selected.name}</span>
                          </div>
                        </div>
                      )
                    })()}

                  {paymentData?.note && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-sm text-slate-500">Note: {paymentData.note}</p>
                    </div>
                  )}
                </div>

              <div className="mx-5 mb-5 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-bold text-white">Total Amount</p>
                    <p className="text-xs text-white/80">Tax Included</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-white">{plan.monthlyPriceDisplay}</p>
                    <p className="text-xs text-white/80">per month</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sign in with OTP */}
            <div className="mt-5">
              <Link
                href={`/payment/otp-login?paymentId=${encodeURIComponent(paymentId)}`}
              >
                <Button className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:opacity-95">
                  Sign in with OTP
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            </div>
        </div>
      </div>
    </div>
  )
}

export default function StepVerificationClient({ planId, paymentId }: StepVerificationFormProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>}>
      <StepVerificationForm planId={planId} paymentId={paymentId} />
    </Suspense>
  )
}
