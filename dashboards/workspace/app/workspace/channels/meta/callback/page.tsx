"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getStoredSession } from "@/lib/api"

type MetaPage = {
  id: string
  name: string
  category: string
}

type CallbackState = {
  tone: "loading" | "success" | "error" | "selecting"
  message: string
  pages?: MetaPage[]
  selectionId?: string
}

export default function MetaChannelCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, setState] = useState<CallbackState>({
    tone: "loading",
    message: "Finishing Facebook Messenger authorization...",
  })

  const handlePageSelect = useCallback(async (pageId: string) => {
    const session = getStoredSession()
    if (!session?.accessToken || !state.selectionId) {
      return
    }

    setState({ tone: "loading", message: "Connecting selected page..." })

    try {
      const response = await fetch("/api/channels/meta/callback", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectionId: state.selectionId,
          pageId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        page?: { name?: string }
        error?: string
        errors?: string[]
      } | null

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || payload?.errors?.join(" ") || "Facebook Messenger connection did not pass validation.")
      }

      const pageName = payload.page?.name || "Facebook Page"
      setState({ tone: "success", message: `${pageName} is connected to ZayOS.` })
      router.replace(`/workspace/channels?provider=messenger&connect=success&page=${encodeURIComponent(pageName)}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect Facebook Messenger."
      setState({ tone: "error", message })
    }
  }, [state.selectionId, router])

  useEffect(() => {
    const code = searchParams.get("code")
    const error = searchParams.get("error_message") || searchParams.get("error_description") || searchParams.get("error")
    const authState = searchParams.get("state")

    if (error) {
      setState({ tone: "error", message: error })
      return
    }
    if (!code) {
      setState({ tone: "error", message: "Meta did not return an authorization code." })
      return
    }

    const session = getStoredSession()
    if (!session?.accessToken) {
      router.replace(`/login?next=${encodeURIComponent(`/workspace/channels/meta/callback?${searchParams.toString()}`)}`)
      return
    }

    const finishConnection = async () => {
      try {
        const response = await fetch("/api/channels/meta/callback", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            state: authState,
            redirectUri: `${window.location.origin}/workspace/channels/meta/callback`,
          }),
        })
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean
          page?: { name?: string }
          error?: string
          errors?: string[]
          needsPageSelection?: boolean
          pages?: MetaPage[]
          selectionId?: string
        } | null

        if (!response.ok) {
          throw new Error(payload?.error || payload?.errors?.join(" ") || "Facebook Messenger connection did not pass validation.")
        }

        if (payload?.needsPageSelection) {
          setState({
            tone: "selecting",
            message: "Select a Facebook Page to connect",
            pages: payload.pages,
            selectionId: payload.selectionId,
          })
          return
        }

        if (!payload?.ok) {
          throw new Error(payload?.error || payload?.errors?.join(" ") || "Facebook Messenger connection did not pass validation.")
        }

        const pageName = payload.page?.name || "Facebook Page"
        setState({ tone: "success", message: `${pageName} is connected to ZayOS.` })
        router.replace(`/workspace/channels?provider=messenger&connect=success&page=${encodeURIComponent(pageName)}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to connect Facebook Messenger."
        setState({ tone: "error", message })
      }
    }

    void finishConnection()
  }, [router, searchParams])

  const Icon = state.tone === "success" ? CheckCircle2 : state.tone === "error" ? AlertCircle : Loader2

  useEffect(() => {
    if (state.tone === "success") {
      window.opener?.postMessage({ type: "messenger-connected" }, window.location.origin)
    }
    if (state.tone === "error") {
      window.opener?.postMessage({ type: "messenger-error" }, window.location.origin)
    }
  }, [state.tone])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center shadow-2xl">
        <Icon className={`mx-auto h-8 w-8 ${state.tone === "loading" ? "animate-spin text-sky-300" : state.tone === "success" ? "text-emerald-300" : state.tone === "selecting" ? "text-sky-300" : "text-rose-300"}`} />
        <h1 className="mt-5 text-2xl font-semibold">Facebook Messenger</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{state.message}</p>
        {state.tone === "selecting" && state.pages ? (
          <div className="mt-6 space-y-2">
            {state.pages.map((page) => (
              <Button
                key={page.id}
                variant="outline"
                className="w-full justify-start text-left"
                onClick={() => handlePageSelect(page.id)}
              >
                <div>
                  <div className="font-medium">{page.name}</div>
                  <div className="text-xs text-slate-400">{page.category}</div>
                </div>
              </Button>
            ))}
          </div>
        ) : null}
        {state.tone === "error" ? (
          <Button asChild className="mt-6 w-full">
            <Link href="/workspace/channels?provider=messenger">Back to Channels</Link>
          </Button>
        ) : null}
      </section>
    </main>
  )
}