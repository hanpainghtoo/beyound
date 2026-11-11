"use client"

import { useEffect, useState } from "react"

import { agentMediaApi } from "@/lib/api"

export type MediaImageState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; url: string }
  | { status: "failed" }

/**
 * Resolves a stored media id to a signed image URL.
 *
 * The id is what gets persisted; the URL is minted on demand and expires with
 * the signed-link TTL, so it must never be written back to the record. A file
 * that has since been deleted (or a link that has already expired) resolves to
 * `failed` rather than throwing, so callers can render a recoverable state
 * instead of a broken image.
 */
export function useMediaImage(
  mediaId: string | null | undefined,
): MediaImageState {
  const [state, setState] = useState<MediaImageState>({ status: "idle" })

  useEffect(() => {
    if (!mediaId) {
      setState({ status: "idle" })
      return
    }

    let cancelled = false
    setState({ status: "pending" })

    agentMediaApi
      .download(mediaId)
      .then((result) => {
        if (cancelled) return
        const url = result.download?.url
        setState(url ? { status: "ready", url } : { status: "failed" })
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed" })
      })

    return () => {
      cancelled = true
    }
  }, [mediaId])

  return state
}
