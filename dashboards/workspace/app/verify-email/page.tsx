"use client"

import { FormEvent, Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, MailCheck, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  confirmEmailVerification,
  getApiErrorMessage,
  getStoredSession,
  requestEmailVerification,
} from "@/lib/api"

function VerifyEmailForm() {
  const searchParams = useSearchParams()
  const session = getStoredSession()
  const [token, setToken] = useState(searchParams.get("token") || "")
  const [email, setEmail] = useState(session?.user.email || "")
  const [message, setMessage] = useState(
    session?.emailVerificationDelivery === "unavailable"
      ? "Your workspace was created. Verification delivery is not configured yet, so use resend when delivery is available."
      : "Your workspace is waiting for email verification.",
  )
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)

  const submitToken = async (nextToken: string) => {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const result = await confirmEmailVerification(nextToken)
      setMessage(`${result.message}. You can continue to the workspace.`)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to verify this email."))
    } finally {
      setSaving(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token.trim()) {
      setError("Enter the verification token from your email.")
      return
    }
    await submitToken(token.trim())
  }

  const resend = async () => {
    if (!email.trim()) {
      setError("Enter your workspace email address.")
      return
    }
    setResending(true)
    setError("")
    setMessage("")
    try {
      const result = await requestEmailVerification(email.trim())
      setMessage(result.message)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to request verification."))
    } finally {
      setResending(false)
    }
  }

  return (
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <Button asChild variant="ghost" className="mb-4 px-0 text-slate-600 hover:bg-transparent">
        <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" />Back to sign in</Link>
      </Button>
      <div className="flex items-center gap-3">
        <MailCheck className="h-7 w-7 text-emerald-600" />
        <h1 className="text-2xl font-bold">Verify your email</h1>
      </div>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="token">Verification token</Label>
          <Input id="token" value={token} onChange={(event) => setToken(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Workspace email</Label>
          <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        <Button type="submit" className="w-full bg-indigo-600 text-white hover:bg-indigo-700" disabled={saving}>{saving ? "Verifying..." : "Verify email"}</Button>
        <Button type="button" variant="outline" className="w-full" onClick={resend} disabled={resending}>
          <Send className="mr-2 h-4 w-4" />{resending ? "Sending..." : "Resend verification"}
        </Button>
      </form>
      <Button asChild variant="link" className="mt-4 w-full">
        <Link href="/workspace">Continue to workspace</Link>
      </Button>
    </section>
  )
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-950">
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
        <VerifyEmailForm />
      </Suspense>
    </main>
  )
}
