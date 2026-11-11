"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  exchangeMetaOAuthCode,
  getEffectiveChannelSettings,
  getStoredSession,
} from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"

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
  selectionToken?: string
}

export default function MetaChannelCallbackPage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, setState] = useState<CallbackState>({
    tone: "loading",
    message: t("workspace.channelsCallback.initialMessage"),
  })

  const handlePageSelect = useCallback(async (pageId: string) => {
    const session = getStoredSession()
    if (!session?.accessToken || (!state.selectionId && !state.selectionToken)) {
      return
    }

    setState({ tone: "loading", message: t("workspace.channelsCallback.connectingMessage") })

    try {
      if (state.selectionToken) {
        // BYO tenants finish against core, which holds the pending login server-side.
        const result = await exchangeMetaOAuthCode({
          selectionToken: state.selectionToken,
          pageId,
        })
        if (!result.ok) {
          throw new Error(t("workspace.channelsCallback.validationFailed"))
        }
        const pageName = result.page?.name || t("workspace.channelsCallback.defaultPageName")
        setState({ tone: "success", message: t("workspace.channelsCallback.connectedMessage", { pageName }) })
        router.replace(`/workspace/channels?provider=messenger&connect=success&page=${encodeURIComponent(pageName)}`)
        return
      }
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
        throw new Error(payload?.error || payload?.errors?.join(" ") || t("workspace.channelsCallback.validationFailed"))
      }

      const pageName = payload.page?.name || t("workspace.channelsCallback.defaultPageName")
      setState({ tone: "success", message: t("workspace.channelsCallback.connectedMessage", { pageName }) })
      router.replace(`/workspace/channels?provider=messenger&connect=success&page=${encodeURIComponent(pageName)}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("workspace.channelsCallback.unableConnect")
      setState({ tone: "error", message })
    }
  }, [state.selectionId, state.selectionToken, router, t])

  useEffect(() => {
    const code = searchParams.get("code")
    const error = searchParams.get("error_message") || searchParams.get("error_description") || searchParams.get("error")
    const authState = searchParams.get("state")

    if (error) {
      setState({ tone: "error", message: error })
      return
    }
    if (!code) {
      setState({ tone: "error", message: t("workspace.channelsCallback.noAuthCode") })
      return
    }

    const session = getStoredSession()
    if (!session?.accessToken) {
      router.replace(`/login?next=${encodeURIComponent(`/workspace/channels/meta/callback?${searchParams.toString()}`)}`)
      return
    }

    const finishConnection = async () => {
      try {
        // BYO tenants exchange against core (which holds the app secret);
        // platform tenants keep the existing Next.js route flow unchanged.
        const effective = await getEffectiveChannelSettings().catch(() => null)
        if (effective?.facebook.mode === "byo_app") {
          const result = await exchangeMetaOAuthCode({
            code,
            state: authState || undefined,
            redirectUri: `${window.location.origin}/workspace/channels/meta/callback`,
          })
          if (result.needsPageSelection) {
            setState({
              tone: "selecting",
              message: t("workspace.channelsCallback.selectPageTitle"),
              pages: (result.pages || []).map((page) => ({
                id: page.id,
                name: page.name || page.id,
                category: page.category || "",
              })),
              selectionToken: result.selectionToken,
            })
            return
          }
          if (!result.ok) {
            throw new Error(t("workspace.channelsCallback.validationFailed"))
          }
          const pageName = result.page?.name || t("workspace.channelsCallback.defaultPageName")
          setState({ tone: "success", message: t("workspace.channelsCallback.connectedMessage", { pageName }) })
          router.replace(`/workspace/channels?provider=messenger&connect=success&page=${encodeURIComponent(pageName)}`)
          return
        }
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
          throw new Error(payload?.error || payload?.errors?.join(" ") || t("workspace.channelsCallback.validationFailed"))
        }

        if (payload?.needsPageSelection) {
          setState({
            tone: "selecting",
            message: t("workspace.channelsCallback.selectPageTitle"),
            pages: payload.pages,
            selectionId: payload.selectionId,
          })
          return
        }

        if (!payload?.ok) {
          throw new Error(payload?.error || payload?.errors?.join(" ") || t("workspace.channelsCallback.validationFailed"))
        }

        const pageName = payload.page?.name || t("workspace.channelsCallback.defaultPageName")
        setState({ tone: "success", message: t("workspace.channelsCallback.connectedMessage", { pageName }) })
        router.replace(`/workspace/channels?provider=messenger&connect=success&page=${encodeURIComponent(pageName)}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : t("workspace.channelsCallback.unableConnect")
        setState({ tone: "error", message })
      }
    }

    void finishConnection()
  }, [router, searchParams, t])

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
        <h1 className="mt-5 text-2xl font-semibold">{t("workspace.channelsCallback.title")}</h1>
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
            <Link href="/workspace/channels?provider=messenger">{t("workspace.channelsCallback.backToChannels")}</Link>
          </Button>
        ) : null}
      </section>
    </main>
  )
}