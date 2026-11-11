"use client"

import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmailDeliveryCheckProps {
  status: "idle" | "sending" | "sent" | "error" | "unavailable"
  email: string
  onResend: () => void
}

export function EmailDeliveryCheck({
  status,
  email,
  onResend,
}: EmailDeliveryCheckProps) {
  return (
    <div className="rounded-xl border p-4">
      {status === "idle" ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <AlertCircle className="h-4 w-4" />
          <span>Enter your email to check delivery status.</span>
        </div>
      ) : status === "sending" ? (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Checking delivery for {email}...</span>
        </div>
      ) : status === "sent" ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          <span>Verification email sent to {email}.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onResend}
            className="ml-auto h-8 px-2 text-xs"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Resend
          </Button>
        </div>
      ) : status === "unavailable" ? (
        <div className="flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>Email delivery is currently unavailable for {email}.</span>
        </div>
      ) : status === "error" ? (
        <div className="flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to check email delivery. Please try again.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onResend}
            className="ml-auto h-8 px-2 text-xs"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  )
}
