"use client"

import { FormEvent, useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/components/providers/i18n-provider"
import { ApiError, getApiErrorMessage, requestPasswordReset } from "@/lib/api"

/** Mirrors the backend code thrown when no active account owns the email. */
const EMAIL_NOT_FOUND_CODE = "PASSWORD_RESET_EMAIL_NOT_FOUND"

export default function ForgotPasswordClient() {
  const { t } = useI18n()
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim()) {
      toast.error(t("forgotPassword.errors.emailRequired"))
      return
    }
    setSaving(true)
    try {
      await requestPasswordReset(email.trim(), "tenant_user")
      setSubmitted(true)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === EMAIL_NOT_FOUND_CODE) {
        toast.error(t("forgotPassword.errors.emailNotFound"))
      } else {
        toast.error(getApiErrorMessage(requestError, t("forgotPassword.errors.requestFailed")))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthShell>
      {submitted ? (
        <div className="py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[#1677ff]">{t("forgotPassword.successEyebrow")}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#14213d]">{t("forgotPassword.successTitle")}</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#5d6b80]">{t("forgotPassword.successMessage")}</p>
          <p className="mt-4 text-sm leading-6 text-[#718096]">{t("forgotPassword.successHint")}</p>
          <Button asChild variant="outline" className="mt-7 h-11 w-full border-[#d7e0ec] text-[#263653] hover:bg-[#f5f8fc]">
            <Link href="/login">{t("forgotPassword.backToSignIn")}</Link>
          </Button>
        </div>
      ) : (
        <>
          <Button asChild variant="ghost" className="mb-8 h-auto px-0 text-[#6f7d91] hover:bg-transparent hover:text-[#14213d]">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("forgotPassword.backToSignIn")}
            </Link>
          </Button>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1677ff]">{t("forgotPassword.eyebrow")}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#14213d]">{t("forgotPassword.title")}</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#5d6b80]">{t("forgotPassword.description")}</p>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1677ff]" />
            <p>{t("forgotPassword.securityNotice")}</p>
          </div>
          <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-[#263653]">
                {t("forgotPassword.emailLabel")}
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8190a5]" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 border-[#d7e0ec] pl-10 focus-visible:ring-[#1677ff]"
                  placeholder={t("forgotPassword.emailPlaceholder")}
                />
              </div>
            </div>
            <Button type="submit" className="h-11 w-full bg-[#1677ff] font-semibold text-white shadow-sm hover:bg-[#0e64db]" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("forgotPassword.submitting")}
                </>
              ) : (
                t("forgotPassword.submit")
              )}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}

function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e8f2ff_0%,#f5f8fc_42%,#eef2f7_100%)] px-4 py-8 text-[#14213d] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[500px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <img src="/zayos-mark-light.png" alt="" className="h-9 w-9 object-contain" />
          <span className="text-[24px] font-extrabold tracking-[-0.05em]">
            Zay<span className="text-[#1677ff]">OS</span>
          </span>
        </div>
        <section className="rounded-2xl border border-[#d9e3ef] bg-white p-6 shadow-[0_18px_50px_rgba(33,63,100,0.10)] sm:p-9">{children}</section>
        <p className="mt-6 text-center text-xs text-[#8190a5]">{t("forgotPassword.footerNote")}</p>
      </div>
    </main>
  )
}
