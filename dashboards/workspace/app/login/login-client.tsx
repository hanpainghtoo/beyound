"use client"

import { type FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Mail,
  MessageSquareText,
  PackageCheck,
  ShieldCheck,
  Store,
  Truck,
  UsersRound,
} from "lucide-react"

import { MarketingHeader } from "@/components/marketing-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { platformConsoleLoginUrl } from "@/lib/app-boundaries"
import { ApiError, clearSession, getApiErrorMessage, getStoredSession, login, validateRealEmail } from "@/lib/api"
import { defaultWorkspaceRouteForRole } from "@/lib/roles"
import { useI18n } from "@/components/providers/i18n-provider"

const moduleChips = [
  { labelKey: "signIn.moduleChips.dashboard", icon: LayoutDashboard },
  { labelKey: "signIn.moduleChips.inbox", icon: MessageSquareText },
  { labelKey: "signIn.moduleChips.orders", icon: PackageCheck },
  { labelKey: "signIn.moduleChips.deliveries", icon: Truck },
  { labelKey: "signIn.moduleChips.customers", icon: UsersRound },
  { labelKey: "signIn.moduleChips.notifications", icon: Bell },
]

const commerceFlow = [
  { titleKey: "signIn.commerceFlow.chat.title", detailKey: "signIn.commerceFlow.chat.detail" },
  { titleKey: "signIn.commerceFlow.memory.title", detailKey: "signIn.commerceFlow.memory.detail" },
  { titleKey: "signIn.commerceFlow.order.title", detailKey: "signIn.commerceFlow.order.detail" },
]

const proofCards = [
  {
    icon: MessageSquareText,
    titleKey: "signIn.proof.inboxToOrder.title",
    detailKey: "signIn.proof.inboxToOrder.detail",
  },
  {
    icon: Store,
    titleKey: "signIn.proof.businessOps.title",
    detailKey: "signIn.proof.businessOps.detail",
  },
  {
    icon: ShieldCheck,
    titleKey: "signIn.proof.secureAccess.title",
    detailKey: "signIn.proof.secureAccess.detail",
  },
]

function defaultRouteForSession(session: ReturnType<typeof getStoredSession>, requestedNextPath: string | null) {
  return requestedNextPath?.startsWith("/workspace")
    ? requestedNextPath
    : defaultWorkspaceRouteForRole(session?.user.role)
}

export default function LoginClient() {
  const router = useRouter()
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const requestedNextPath = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : null
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handOffPlatformUser = () => {
    clearSession()
    window.location.assign(platformConsoleLoginUrl())
  }

  useEffect(() => {
    const session = getStoredSession()
    if (session?.user.type === "platform_admin") {
      handOffPlatformUser()
    } else if (session) {
      router.replace(defaultRouteForSession(session, requestedNextPath))
    } else if (searchParams.get("reason") === "session-expired") {
      setFormError("Your session has expired. Please sign in again.")
    }
  }, [requestedNextPath, router, searchParams])

  const handleEmailChange = (value: string) => {
    setEmail(value)
    setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev))
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    setFieldErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim()
    const nextFieldErrors: { email?: string; password?: string } = {}
    if (!normalizedEmail) {
      nextFieldErrors.email = t("validation.enterEmail")
    } else if (!validateRealEmail(normalizedEmail).valid) {
      nextFieldErrors.email = t("validation.invalidEmailShort")
    }
    if (!password) {
      nextFieldErrors.password = t("validation.enterPassword")
    } else if (password.length < 6) {
      nextFieldErrors.password = t("validation.passwordMinLength")
    }
    setFieldErrors(nextFieldErrors)
    setFormError("")
    if (Object.keys(nextFieldErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const session = await login(normalizedEmail, password)
      if (session.user.type === "platform_admin") {
        handOffPlatformUser()
        return
      }
      router.replace(defaultRouteForSession(session, requestedNextPath))
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        const raw = (requestError.rawMessage ?? "").toLowerCase()
        if (requestError.status === 400) {
          if (raw.includes("email")) {
            setFieldErrors({ email: requestError.message })
          } else if (raw.includes("password")) {
            setFieldErrors({ password: requestError.message })
          } else {
            setFormError(requestError.message)
          }
        } else if (requestError.kind === "network") {
          setFormError(
            /timed out/i.test(requestError.message)
              ? requestError.message
              : t("errors.networkShort"),
          )
        } else {
          setFormError(requestError.message)
        }
      } else {
        setFormError(getApiErrorMessage(requestError, t("errors.signInFailed")))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f7f8fc_0%,#eef2ff_100%)] text-slate-950">
      <MarketingHeader primaryCta={{ labelKey: "navigation.tryItFree", href: "/trial" }} />

      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-5 py-6 sm:px-8">
        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,0.92fr)]">
          <div className="order-2 max-w-2xl lg:order-none">
            <p className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
              {t("signIn.workspaceName")}
            </p>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight text-slate-950 sm:text-5xl lg:text-[64px] lg:leading-[0.95]">
              {t("signIn.heroHeadline")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              {t("signIn.heroBody")}
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">{t("signIn.commerceFlowTitle")}</p>
                <div className="mt-4 space-y-4">
                  {commerceFlow.map((step, index) => (
                    <div key={step.titleKey} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                          {index + 1}
                        </div>
                        {index < commerceFlow.length - 1 ? <div className="mt-2 h-full w-px bg-indigo-100" /> : null}
                      </div>
                      <div className="pb-2">
                        <p className="text-sm font-semibold text-slate-950">{t(step.titleKey)}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{t(step.detailKey)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {proofCards.map(({ icon: Icon, titleKey, detailKey }) => (
                  <div key={titleKey} className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-700">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{t(titleKey)}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{t(detailKey)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="order-first overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.12)] lg:order-none">
            {/* minmax(0, …) on both tracks rather than bare `fr`: a grid item's
                automatic minimum size is its min-content width, so with plain `fr`
                neither column may shrink below it. Burmese strings are far wider than
                the English they replaced (the CTA alone is 297px at min-content), so
                the two columns overflowed this `overflow-hidden` card and the sign-in
                form was clipped. `minmax(0, …)` lets them shrink and wrap instead. */}
            <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <aside className="hidden min-w-0 bg-[linear-gradient(180deg,#4f46e5_0%,#4338ca_100%)] p-8 text-white lg:block lg:p-10">
                <div className="flex items-center gap-3">
                  <img src="/zayos-mark-light.png" alt="" className="h-10 w-10 rounded-2xl bg-white/10 p-1.5" />
                  <div>
                  <p className="text-sm font-semibold">ZayOS</p>
                  <p className="text-xs text-indigo-100">{t("signIn.workspaceName")}</p>
                </div>
                </div>
                <h2 className="mt-8 text-3xl font-extrabold leading-tight">{t("signIn.heroTitle")}</h2>
                <p className="mt-4 text-sm leading-7 text-indigo-100">
                  {t("signIn.heroSupport")}
                </p>
                <div className="mt-8 space-y-3">
                  {[
                    "signIn.heroBullets.sharedConversations",
                    "signIn.heroBullets.orderPaymentCod",
                    "signIn.heroBullets.businessControls",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/95">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{t(item)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 rounded-3xl bg-white/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">{t("signIn.workspaceModules")}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {moduleChips.map(({ labelKey, icon: Icon }) => (
                      <span key={labelKey} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white/95">
                        <Icon className="h-3.5 w-3.5" />
                        {t(labelKey)}
                      </span>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="min-w-0 p-6 sm:p-8 lg:p-10">
                <div className="max-w-md">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">{t("signIn.panelTitle")}</p>
                  <h2 className="mt-3 text-2xl font-bold text-slate-950">{t("signIn.welcomeBack")}</h2>
                  <p className="mt-2 text-sm text-slate-600">{t("signIn.panelSubtitle")}</p>
                </div>

                <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("signIn.emailLabel")}</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => handleEmailChange(event.target.value)}
                        className="h-11 rounded-xl pl-10"
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                        disabled={isSubmitting}
                      />
                    </div>
                    {fieldErrors.email ? (
                      <p id="login-email-error" role="alert" className="text-xs font-medium text-red-600">
                        {fieldErrors.email}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t("signIn.passwordLabel")}</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => handlePasswordChange(event.target.value)}
                        className="h-11 rounded-xl pl-10"
                        aria-invalid={Boolean(fieldErrors.password)}
                        aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                        disabled={isSubmitting}
                      />
                    </div>
                    {fieldErrors.password ? (
                      <p id="login-password-error" role="alert" className="text-xs font-medium text-red-600">
                        {fieldErrors.password}
                      </p>
                    ) : null}
                  </div>

                  {formError ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{formError}</span>
                    </div>
                  ) : null}

                  {/* `whitespace-normal` overrides the Button base's `whitespace-nowrap`, and
                    `min-h-11` + `py-2.5` replaces the fixed `h-11`: the Burmese CTA
                    label is much wider than "Open Commerce Workspace" and needs two
                    lines in a narrow column. With the fixed height a second line was
                    clipped inside the pill. */}
                  <Button
                    type="submit"
                    className="min-h-11 w-full whitespace-normal py-2.5 text-center text-base leading-6 rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-700"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    <span className="min-w-0">{t("signIn.submitButton")}</span>
                    {!isSubmitting ? <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  </Button>
                </form>

                <div className="mt-6 flex flex-col gap-2 text-xs leading-6 text-slate-500">
                  <p>
                    {t("signIn.needAccessPrefix")} <Link href="/forgot-password" className="font-semibold text-indigo-600 hover:text-indigo-700">{t("signIn.resetPassword")}</Link>{t("signIn.needAccessSuffix")}
                  </p>
                  <p>
                    {t("signIn.platformRedirectNote")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
