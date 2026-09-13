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
import { clearSession, getApiErrorMessage, getStoredSession, login } from "@/lib/api"
import { defaultWorkspaceRouteForRole } from "@/lib/roles"

const moduleChips = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Inbox", icon: MessageSquareText },
  { label: "Orders", icon: PackageCheck },
  { label: "Deliveries", icon: Truck },
  { label: "Customers", icon: UsersRound },
  { label: "Notifications", icon: Bell },
]

const commerceFlow = [
  { title: "Chat message", detail: "Capture buyer questions, urgency, and channel source." },
  { title: "Customer memory", detail: "Keep the latest notes, history, and repeat-buyer context visible." },
  { title: "Order and COD", detail: "Move from quote to draft order, payment, and delivery handoff." },
]

const proofCards = [
  {
    icon: MessageSquareText,
    title: "Inbox to order",
    detail: "Reply, price, confirm stock, and open the order without losing context.",
  },
  {
    icon: Store,
    title: "Business operations",
    detail: "Products, channels, billing, team, and settings stay in the same tenant workspace.",
  },
  {
    icon: ShieldCheck,
    title: "Secure tenant access",
    detail: "Platform operators are automatically handed to Platform Console. Tenant users stay here.",
  },
]

function defaultRouteForSession(session: ReturnType<typeof getStoredSession>, requestedNextPath: string | null) {
  return requestedNextPath?.startsWith("/workspace")
    ? requestedNextPath
    : defaultWorkspaceRouteForRole(session?.user.role)
}

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedNextPath = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : null
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
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
      setError("Your session has expired. Please sign in again.")
    }
  }, [requestedNextPath, router, searchParams])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password) {
      setError("Enter your email and password.")
      return
    }

    setIsSubmitting(true)
    try {
      const session = await login(normalizedEmail, password)
      if (session.user.type === "platform_admin") {
        handOffPlatformUser()
        return
      }
      router.replace(defaultRouteForSession(session, requestedNextPath))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to sign in"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f7f8fc_0%,#eef2ff_100%)] text-slate-950">
      <MarketingHeader primaryCta={{ label: "Try it Free", href: "/trial" }} />

      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-5 py-6 sm:px-8">
        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,0.92fr)]">
          <div className="order-2 max-w-2xl lg:order-none">
            <p className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
              Commerce Workspace
            </p>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight text-slate-950 sm:text-5xl lg:text-[64px] lg:leading-[0.95]">
              Turn conversations into orders, delivery, and repeat business.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              ZayOS is the shared tenant workspace for daily selling and business operations. Sign in to continue from live conversations into products, payments, COD, delivery, and follow-up.
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">Commerce flow</p>
                <div className="mt-4 space-y-4">
                  {commerceFlow.map((step, index) => (
                    <div key={step.title} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                          {index + 1}
                        </div>
                        {index < commerceFlow.length - 1 ? <div className="mt-2 h-full w-px bg-indigo-100" /> : null}
                      </div>
                      <div className="pb-2">
                        <p className="text-sm font-semibold text-slate-950">{step.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {proofCards.map(({ icon: Icon, title, detail }) => (
                  <div key={title} className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-700">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="order-first overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.12)] lg:order-none">
            <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
              <aside className="hidden bg-[linear-gradient(180deg,#4f46e5_0%,#4338ca_100%)] p-8 text-white lg:block lg:p-10">
                <div className="flex items-center gap-3">
                  <img src="/zayos-mark-light.png" alt="" className="h-10 w-10 rounded-2xl bg-white/10 p-1.5" />
                  <div>
                  <p className="text-sm font-semibold">ZayOS</p>
                  <p className="text-xs text-indigo-100">Commerce Workspace</p>
                </div>
                </div>
                <h2 className="mt-8 text-3xl font-extrabold leading-tight">Open your Commerce Workspace</h2>
                <p className="mt-4 text-sm leading-7 text-indigo-100">
                  Use the same tenant sign-in for live selling, catalog updates, team setup, channels, billing, and workspace operations.
                </p>
                <div className="mt-8 space-y-3">
                  {[
                    "Shared conversations across every active channel",
                    "Order, payment, COD, and delivery handoff in one operating surface",
                    "Business controls for products, channels, billing, and team setup",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/95">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 rounded-3xl bg-white/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">Workspace modules</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {moduleChips.map(({ label, icon: Icon }) => (
                      <span key={label} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white/95">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="p-6 sm:p-8 lg:p-10">
                <div className="max-w-md">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Sign In</p>
                  <h2 className="mt-3 text-2xl font-bold text-slate-950">Welcome back</h2>
                  <p className="mt-2 text-sm text-slate-600">Primary access for tenant owners, admins, supervisors, CSRs, finance, and delivery staff.</p>
                </div>

                <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="h-11 rounded-xl pl-10"
                        aria-invalid={Boolean(error)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-11 rounded-xl pl-10"
                        aria-invalid={Boolean(error)}
                      />
                    </div>
                  </div>

                  {error ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <Button type="submit" className="h-11 w-full rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-700" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Open Commerce Workspace
                    {!isSubmitting ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                  </Button>
                </form>

                <div className="mt-6 flex flex-col gap-2 text-xs leading-6 text-slate-500">
                  <p>
                    Need access? Contact your workspace administrator or <Link href="/forgot-password" className="font-semibold text-indigo-600 hover:text-indigo-700">reset your password</Link>.
                  </p>
                  <p>
                    Platform operators are redirected to the dedicated Platform Console automatically.
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
