"use client"

import { FormEvent, Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { confirmPasswordReset } from "@/lib/api"

function ResetPasswordForm() {
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reset password.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="w-full max-w-md border-white/10 bg-white/[0.06] text-white">
      <CardHeader>
        <Button asChild variant="ghost" className="mb-2 justify-start px-0 text-slate-300 hover:bg-transparent hover:text-white"><Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" />Back to sign in</Link></Button>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription className="text-slate-300">Use your one-time platform reset token.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2"><Label htmlFor="token">Reset token</Label><Input id="token" value={token} onChange={(event) => setToken(event.target.value)} className="border-white/10 bg-slate-950/40 text-white" /></div>
          <div className="space-y-2"><Label htmlFor="password">New password</Label><div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="border-white/10 bg-slate-950/40 pl-10 text-white" /></div></div>
          {error ? <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
          {message ? <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</p> : null}
          <Button type="submit" className="w-full bg-sky-500 text-slate-950 hover:bg-sky-400" disabled={saving}>{saving ? "Saving..." : "Reset password"}</Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function PlatformResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07101d] px-4 text-white">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
