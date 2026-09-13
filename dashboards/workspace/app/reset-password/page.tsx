"use client"

import { FormEvent, Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, LockKeyhole } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { confirmPasswordReset, getApiErrorMessage } from "@/lib/api"

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [token, setToken] = useState(searchParams.get("token") || "")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setMessage("")
    if (!token.trim() || password.length < 8) {
      setError("Enter the reset token and a password of at least 8 characters.")
      return
    }
    setSaving(true)
    try {
      const result = await confirmPasswordReset(token.trim(), password)
      setMessage(result.message)
      setTimeout(() => router.push('/login'), 2000)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to reset password."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <Button asChild variant="ghost" className="mb-4 px-0 text-slate-600 hover:bg-transparent">
        <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" />Back to sign in</Link>
      </Button>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Use your reset or invite token to activate the workspace account and set a password.</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="token">Reset token</Label><Input id="token" value={token} onChange={(event) => setToken(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="password">New password</Label><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10" /></div></div>
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        <Button type="submit" className="w-full bg-indigo-600 text-white hover:bg-indigo-700" disabled={saving}>{saving ? "Saving..." : "Reset password"}</Button>
      </form>
    </section>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-950">
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
