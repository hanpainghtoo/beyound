"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  confirmPasswordReset,
  getApiErrorMessage,
  getTenantInviteContext,
  login,
  storeSession,
  type TenantInviteContext,
} from "@/lib/api"
import { getPasswordPolicyError, PASSWORD_POLICY_HINT } from "@/lib/password-policy"
import { roleLabel } from "@/lib/roles"

function AcceptInviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")?.trim() || ""
  const [context, setContext] = useState<TenantInviteContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [confirmMatchStatus, setConfirmMatchStatus] = useState<"idle" | "matched" | "mismatched">("idle")
  const [passwordError, setPasswordError] = useState("")
  const [confirmError, setConfirmError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [saving, setSaving] = useState(false)
  const [activated, setActivated] = useState(false)
  const [loginFailed, setLoginFailed] = useState(false)

  const passwordCriteria = {
    hasLength: password.length >= 12,
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z\d]/.test(password),
  }
  const isPasswordValid = Object.values(passwordCriteria).every(Boolean)
  const passwordBorderClass = password.length > 0
    ? isPasswordValid
      ? "border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25"
      : "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
    : passwordError
      ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
      : "border-[#d7e0ec]"
  const confirmPasswordBorderClass = confirmMatchStatus === "matched"
    ? "border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25"
    : confirmMatchStatus === "mismatched" || confirmError
      ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25"
      : "border-[#d7e0ec]"

  useEffect(() => {
    if (!confirmPassword) {
      setConfirmMatchStatus("idle")
      return
    }
    if (confirmPassword === password) {
      setConfirmMatchStatus("matched")
      return
    }
    setConfirmMatchStatus("idle")
    const timer = setTimeout(() => {
      if (confirmPassword !== password) setConfirmMatchStatus("mismatched")
    }, 600)
    return () => clearTimeout(timer)
  }, [confirmPassword, password])

  useEffect(() => {
    if (!token) {
      setLoadError("This invitation link is invalid or has expired.")
      setLoading(false)
      return
    }

    let cancelled = false
    getTenantInviteContext(token)
      .then((result) => {
        if (!cancelled) setContext(result)
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getApiErrorMessage(error, "This invitation link is invalid or has expired."))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextPasswordError = getPasswordPolicyError(password)
    const nextConfirmError = !confirmPassword
      ? "Please confirm your password."
      : password !== confirmPassword
        ? "Passwords do not match."
        : ""
    setPasswordError(nextPasswordError)
    setConfirmError(nextConfirmError)
    setSubmitError("")
    if (nextPasswordError || nextConfirmError || !context) return

    setSaving(true)
    try {
      await confirmPasswordReset(token, password)
      setActivated(true)
      try {
        const session = await login(context.email, password)
        storeSession(session)
        router.replace("/workspace")
      } catch {
        setLoginFailed(true)
      }
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, "Unable to activate this invitation."))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <InviteShell><LoadingState /></InviteShell>
  }

  if (loadError || !context) {
    return (
      <InviteShell>
        <StateCard
          icon={<AlertCircle className="h-6 w-6" />}
          title="Invitation unavailable"
          body={loadError || "This invitation link is invalid or has expired."}
          tone="error"
        />
      </InviteShell>
    )
  }

  if (activated && loginFailed) {
    return (
      <InviteShell>
        <StateCard
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Your account is ready"
          body="Your team-member account has been activated. Sign in with the email address from your invitation."
          tone="success"
          action={<Button asChild className="mt-6 w-full bg-[#1677ff] hover:bg-[#0e64db]"><Link href="/login">Continue to sign in</Link></Button>}
        />
      </InviteShell>
    )
  }

  return (
    <InviteShell>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1677ff]">Workspace invitation</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#14213d]">Finish setting up your account</h1>
        <p className="mt-3 text-[15px] leading-7 text-[#5d6b80]">
          You’re joining <strong className="text-[#14213d]">{context.companyName}</strong> as <strong className="text-[#14213d]">{roleLabel(context.role)}</strong>.
        </p>
        <p className="mt-1 text-sm text-[#6f7d91]">Invited by {context.inviterName}.</p>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1677ff]" />
        <p>Choose a password for <strong>{context.email}</strong>. This one-time invitation expires {new Date(context.expiresAt).toLocaleDateString()}.</p>
      </div>

      <form className="space-y-5" onSubmit={submit} noValidate>
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={(value) => { setPassword(value); setPasswordError(""); setSubmitError("") }}
          visible={showPassword}
          onToggle={() => setShowPassword((value) => !value)}
          error={passwordError}
          inputClassName={passwordBorderClass}
          autoComplete="new-password"
        />
        <div className="-mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {[
            ["12+ chars", passwordCriteria.hasLength],
            ["Uppercase", passwordCriteria.hasUpper],
            ["Number", passwordCriteria.hasNumber],
            ["Symbol", passwordCriteria.hasSpecial],
          ].map(([label, valid]) => (
            <span key={String(label)} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${valid ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {valid ? "✓" : "•"} {label}
            </span>
          ))}
        </div>
        <PasswordField
          id="confirm-password"
          label="Confirm password"
          value={confirmPassword}
          onChange={(value) => { setConfirmPassword(value); setConfirmError(""); setSubmitError("") }}
          visible={showConfirmPassword}
          onToggle={() => setShowConfirmPassword((value) => !value)}
          error={confirmError}
          inputClassName={confirmPasswordBorderClass}
          autoComplete="new-password"
        />
        {confirmMatchStatus === "matched" ? (
          <p className="-mt-3 flex items-center gap-1 text-[11px] font-medium text-emerald-600"><Check className="h-3 w-3" /> Passwords match</p>
        ) : confirmMatchStatus === "mismatched" ? (
          <p className="-mt-3 flex items-center gap-1 text-[11px] font-medium text-red-500"><X className="h-3 w-3" /> Passwords do not match</p>
        ) : null}
        <p className="text-xs leading-5 text-[#718096]">{PASSWORD_POLICY_HINT}</p>
        {submitError ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</p> : null}
        <Button type="submit" className="h-11 w-full bg-[#1677ff] font-semibold text-white shadow-sm hover:bg-[#0e64db]" disabled={saving}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Activating account...</> : "Accept invitation"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-[#718096]">Already have access? <Link href="/login" className="font-semibold text-[#1677ff] hover:underline">Sign in</Link></p>
    </InviteShell>
  )
}

function PasswordField({ id, label, value, onChange, visible, onToggle, error, inputClassName, autoComplete }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggle: () => void
  error: string
  inputClassName: string
  autoComplete: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold text-[#263653]">{label}</Label>
      <div className="relative">
        <Input id={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} className={`h-11 pr-11 transition-colors focus-visible:ring-[#1677ff] ${inputClassName}`} aria-invalid={Boolean(error)} />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] hover:text-[#14213d]" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e8f2ff_0%,#f5f8fc_42%,#eef2f7_100%)] px-4 py-8 text-[#14213d] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[500px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <img src="/zayos-mark-light.png" alt="" className="h-9 w-9 object-contain" />
          <span className="text-[24px] font-extrabold tracking-[-0.05em]">Zay<span className="text-[#1677ff]">OS</span></span>
        </div>
        <section className="rounded-2xl border border-[#d9e3ef] bg-white p-6 shadow-[0_18px_50px_rgba(33,63,100,0.10)] sm:p-9">
          {children}
        </section>
        <p className="mt-6 text-center text-xs text-[#8190a5]">Secure team access by ZayOS</p>
      </div>
    </main>
  )
}

function LoadingState() {
  return <div className="flex min-h-[280px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#1677ff]" aria-label="Loading invitation" /></div>
}

function StateCard({ icon, title, body, tone, action }: { icon: React.ReactNode; title: string; body: string; tone: "error" | "success"; action?: React.ReactNode }) {
  return <div className="py-8 text-center"><div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${tone === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{icon}</div><h1 className="mt-5 text-2xl font-bold">{title}</h1><p className="mt-3 text-sm leading-6 text-[#64748b]">{body}</p>{action}</div>
}

export default function AcceptInvitePage() {
  return <Suspense fallback={<InviteShell><LoadingState /></InviteShell>}><AcceptInviteForm /></Suspense>
}
