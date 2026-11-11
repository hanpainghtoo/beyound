"use client"

import { AlertCircle, Loader2, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface EmailCheckInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
  loading?: boolean
  checkResult?: "checking" | "available" | "taken" | null
}

export function EmailCheckInput({
  value,
  onChange,
  error,
  loading,
  checkResult,
}: EmailCheckInputProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold text-slate-900">Login Email</Label>
      <div className="relative">
        <Input
          type="email"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="you@company.com"
          className={`h-11 w-full rounded-xl border-slate-300 pr-10 text-sm transition-colors ${
            error ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25" :
            checkResult === "available" ? "border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25" :
            "border-slate-300"
          }`}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
        ) : checkResult === "available" ? (
          <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
        ) : checkResult === "taken" ? (
          <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {checkResult === "taken" ? (
        <p className="text-xs text-red-600">This email is already registered.</p>
      ) : null}
      {checkResult === "available" ? (
        <p className="text-xs text-emerald-600">Email is available.</p>
      ) : null}
    </div>
  )
}
