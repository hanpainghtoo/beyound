"use client"

import { useState, useEffect, Suspense } from "react"
import { ArrowLeft, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { otpLogin, storeSession, generateOtp } from "@/lib/api"

function OtpLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paymentId = searchParams.get("paymentId")

  const [otp, setOtp] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendSeconds, setResendSeconds] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [showOtp, setShowOtp] = useState(false)
  const [otpEmail, setOtpEmail] = useState("")

  useEffect(() => {
    const stored = sessionStorage.getItem("zayos_otp_email")
    if (stored) setOtpEmail(stored)
  }, [])

  useEffect(() => {
    // Start timer when paymentId is present (arriving from payment flow)
    if (paymentId) {
      const startTimer = () => {
        let seconds = 60
        setResendSeconds(seconds)
        const timer = setInterval(() => {
          seconds--
          setResendSeconds(seconds)
          if (seconds <= 0) {
            clearInterval(timer)
            setResendSeconds(null)
          }
        }, 1000)
        return timer
      }
      const timerId = startTimer()
      // Cleanup on unmount or when paymentId changes
      return () => clearInterval(timerId)
    }
  }, [paymentId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6) {
      setError("Please enter a 6-digit OTP.")
      return
    }
    setIsLoading(true)
    setError("")
    try {
      const email = otpEmail || searchParams.get("email") || ""
      if (!email) {
        throw new Error("No email found. Please go back and try again.")
      }

      const session = await otpLogin(email, otp)
      storeSession(session)
      router.push("/")
      setResendSeconds(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid OTP. Please try again."
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!otpEmail) {
      setError("No email found. Please go back and try again.")
      return
    }
    setIsResending(true)
    setError("")
    setSuccess("")
    try {
      await generateOtp(otpEmail, "otp_login", paymentId || undefined)
      setSuccess("A new OTP has been sent to your email.")
      setResendSeconds(60)
      const timer = setInterval(() => {
        setResendSeconds((current) => {
          if (current === null || current <= 0) {
            clearInterval(timer)
            return null
          }
          return current - 1
        })
      }, 1000)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to resend OTP. Please try again."
      )
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Back link */}
        <Link
          href={`/payment/step-verification?planId=${encodeURIComponent(searchParams.get("planId") || "")}`}
          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to verification
        </Link>

        {/* Card */}
        <div className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
              <svg className="h-7 w-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-950">Verify your identity</h2>
            <p className="mt-2 text-sm text-slate-600">
              Enter the 6-digit OTP sent to {otpEmail || "your email"}
            </p>
          </div>

          {/* OTP Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-sm font-bold text-slate-900">OTP Code</Label>
              <div className="relative mt-2">
                <Input
                  type={showOtp ? "text" : "password"}
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6)
                    setOtp(val)
                    setError("")
                  }}
                  placeholder="000000"
                  maxLength={6}
                  className="h-14 rounded-xl border-slate-300 bg-white text-center text-2xl tracking-[0.5em] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOtp(!showOtp)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showOtp ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {success ? (
              <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <span>{success}</span>
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#5B68F6] via-[#3B82F6] to-[#00A3E0] py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:opacity-95 disabled:opacity-50 sm:text-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify & Sign In"
              )}
            </Button>
          </form>

{/* Footer */}
           <p className="mt-6 text-center text-sm text-slate-500">
             Didn&apos;t receive the OTP?{" "}
             <button
               onClick={handleResend}
               disabled={isResending || (resendSeconds !== null && resendSeconds > 0)}
               className="text-indigo-600 hover:underline disabled:opacity-50"
             >
               {isResending ? (
                 "Sending..."
               ) : (
                 resendSeconds !== null && resendSeconds > 0 ? (
                   `Resend in ${resendSeconds}s`
                 ) : (
                   "Resend code"
                 )
               )}
             </button>
           </p>
        </div>
      </div>
    </div>
  )
}

export default function OtpLoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-white"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>}>
      <OtpLoginForm />
    </Suspense>
  )
}
