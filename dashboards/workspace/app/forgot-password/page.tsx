"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getApiErrorMessage, requestPasswordReset } from "@/lib/api"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setMessage("")
    if (!email.trim()) {
      setError("Enter your workspace email.")
      return
    }
    setSaving(true)
    try {
      const result = await requestPasswordReset(email.trim(), "tenant_user")
      setMessage(result.message)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to request password reset."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Button asChild variant="ghost" className="mb-4 px-0 text-slate-600 hover:bg-transparent">
          <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" />Back to sign in</Link>
        </Button>
        <h1 className="text-2xl font-bold">Reset workspace password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enter your workspace email and we will send a one-time reset link if the account is active.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="email">Workspace email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="pl-10" />
            </div>
          </div>
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
          <Button type="submit" className="w-full bg-indigo-600 text-white hover:bg-indigo-700" disabled={saving}>{saving ? "Sending..." : "Send reset link"}</Button>
        </form>
      </section>
    </main>
  )
}
