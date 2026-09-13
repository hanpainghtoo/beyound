import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"

import { isServerConfigurationError, resolveCoreApiBaseUrl } from "../../../../../../shared/server-core-api-config"

type MetaCallbackPayload = {
  code?: string
  redirectUri?: string
  state?: string
  pageId?: string
  selectionId?: string
}

type TenantChannel = {
  id: string
  channelType: string
  configuration?: Record<string, unknown>
}

type PendingSelection = {
  pages: MetaAccount[]
  expiresAt: number
}

const pendingSelections = new Map<string, PendingSelection>()
const SELECTION_TTL_MS = 5 * 60 * 1000

function sweepExpiredSelections() {
  const now = Date.now()
  for (const [id, entry] of pendingSelections) {
    if (entry.expiresAt <= now) pendingSelections.delete(id)
  }
}

type MetaTokenResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: MetaError
}

type MetaError = {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
}

type MetaAccount = {
  id?: string
  name?: string
  access_token?: string
  category?: string
  tasks?: string[]
}

type MetaAccountsResponse = {
  data?: MetaAccount[]
  error?: MetaError
}

const EXPECTED_STATE = "zayos-messenger-connect"

function graphApiBaseUrl() {
  const version = process.env.META_GRAPH_API_VERSION || process.env.MESSENGER_GRAPH_API_VERSION || "v25.0"
  return `https://graph.facebook.com/${version.replace(/^\/+|\/+$/g, "")}`
}

function metaErrorMessage(payload: { error?: MetaError } | null | undefined, fallback: string) {
  return payload?.error?.message || fallback
}

function isValidRedirectUri(value: string) {
  try {
    const parsed = new URL(value)
    return ["http:", "https:"].includes(parsed.protocol) && parsed.pathname === "/workspace/channels/meta/callback"
  } catch {
    return false
  }
}

async function safeJson<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null
}

async function coreRequest<T>(path: string, init: RequestInit, authorization: string) {
  let apiBaseUrl: string
  try {
    apiBaseUrl = resolveCoreApiBaseUrl(process.env)
  } catch (error) {
    if (isServerConfigurationError(error)) {
      throw new Error("Core API is not configured for channel connection.", { cause: error })
    }
    throw error
  }

  const headers = new Headers(init.headers)
  headers.set("Authorization", authorization)
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  })
  const payload = await safeJson<T & { message?: string }>(response)
  if (!response.ok) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join(", ")
      : payload?.message || `Core API returned HTTP ${response.status}`
    throw new Error(message)
  }
  return payload as T
}

async function exchangeCodeForUserToken(code: string, redirectUri: string) {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET || process.env.MESSENGER_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("Meta OAuth is not configured. Set META_APP_ID and META_APP_SECRET.")
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })
  const response = await fetch(`${graphApiBaseUrl()}/oauth/access_token?${params.toString()}`, {
    cache: "no-store",
  })
  const payload = await safeJson<MetaTokenResponse>(response)
  if (!response.ok || !payload?.access_token) {
    throw new Error(metaErrorMessage(payload, "Unable to exchange Meta authorization code."))
  }
  return payload.access_token
}

async function exchangeShortLivedTokenForLongLived(accessToken: string) {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET || process.env.MESSENGER_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("Meta OAuth is not configured. Set META_APP_ID and META_APP_SECRET.")
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "fb_exchange_token",
    fb_exchange_token: accessToken,
  })
  const response = await fetch(`${graphApiBaseUrl()}/oauth/access_token?${params.toString()}`, {
    cache: "no-store",
  })
  const payload = await safeJson<MetaTokenResponse>(response)
  if (!response.ok || !payload?.access_token) {
    throw new Error(metaErrorMessage(payload, "Unable to exchange short-lived token for long-lived token."))
  }
  return payload.access_token
}

async function subscribePageToWebhook(pageId: string, pageAccessToken: string) {
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    subscribed_fields: "messages,messaging_postbacks,message_deliveries,message_reads",
  })
  const response = await fetch(`${graphApiBaseUrl()}/${pageId}/subscribed_apps?${params.toString()}`, {
    method: "POST",
    cache: "no-store",
  })
  const payload = await safeJson<{ success?: boolean; error?: MetaError }>(response)
  if (!response.ok || !payload?.success) {
    throw new Error(metaErrorMessage(payload, "Unable to subscribe page to webhook."))
  }
}

async function fetchAuthorizedPages(userAccessToken: string) {
  const params = new URLSearchParams({
    access_token: userAccessToken,
    fields: "id,name,access_token,category,tasks",
  })
  const response = await fetch(`${graphApiBaseUrl()}/me/accounts?${params.toString()}`, {
    cache: "no-store",
  })
  const payload = await safeJson<MetaAccountsResponse>(response)
  if (!response.ok) {
    throw new Error(metaErrorMessage(payload, "Unable to load authorized Facebook Pages."))
  }

  const pages = (payload?.data || []).filter((page) => page.id && page.access_token)
  if (pages.length === 0) {
    throw new Error("No Facebook Page with messaging access was returned by Meta.")
  }
  return pages
}

function buildMessengerChannelPayload(page: MetaAccount, authorizedPageCount: number) {
  const appSecret = process.env.META_APP_SECRET || process.env.MESSENGER_APP_SECRET
  if (!appSecret) throw new Error("Meta app secret is not configured.")

  const pageId = String(page.id)
  const pageName = page.name?.trim() || `Facebook Page ${pageId}`
  const verifyToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.MESSENGER_VERIFY_TOKEN ||
    `zayos_meta_${randomBytes(24).toString("hex")}`

  return {
    channelType: "messenger",
    channelName: pageName,
    displayName: pageName,
    credentials: {
      pageId,
      pageAccessToken: page.access_token,
      appSecret,
      verifyToken,
    },
    configuration: {
      provider: "facebook",
      pageId,
      pageName,
      pageCategory: page.category || null,
      pageTasks: page.tasks || [],
      metaAppId: process.env.META_APP_ID,
      providerAppRoutingId:
        process.env.META_PROVIDER_APP_ROUTING_ID ||
        process.env.MESSENGER_PROVIDER_APP_ROUTING_ID ||
        null,
      authorizedPageCount,
      oauthConnectedAt: new Date().toISOString(),
    },
    assignmentRule: "round_robin",
    autoReplyEnabled: false,
  }
}

async function completeChannelSetup(
  selectedPage: MetaAccount,
  authorizedPageCount: number,
  authorization: string,
) {
  const longLivedPageToken = await exchangeShortLivedTokenForLongLived(selectedPage.access_token!)

  const channelPayload = buildMessengerChannelPayload(
    { ...selectedPage, access_token: longLivedPageToken },
    authorizedPageCount,
  )

  // Every authorization completion represents a new saved channel instance.
  // The workspace list, rather than the provider type, is the source of truth for management.
  const channel = await coreRequest<TenantChannel>(
    "/tenant/channels",
    { method: "POST", body: JSON.stringify(channelPayload) },
    authorization,
  )

  await subscribePageToWebhook(selectedPage.id!, longLivedPageToken)

  const tested = await coreRequest<{ ok: boolean; errors?: string[]; channel?: TenantChannel }>(
    `/tenant/channels/${channel.id}/test-connection`,
    { method: "POST" },
    authorization,
  )

  return NextResponse.json({
    ok: tested.ok,
    channel: tested.channel || channel,
    page: {
      id: selectedPage.id,
      name: selectedPage.name,
    },
    authorizedPageCount,
    errors: tested.errors || [],
  })
}

export async function POST(request: Request) {
  sweepExpiredSelections()

  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Sign in before connecting Messenger." }, { status: 401 })
  }

  const payload = (await request.json().catch(() => null)) as MetaCallbackPayload | null
  const pageId = payload?.pageId?.trim()
  const selectionId = payload?.selectionId?.trim()

  try {
    if (selectionId) {
      const cached = pendingSelections.get(selectionId)
      pendingSelections.delete(selectionId)
      if (!cached || cached.expiresAt <= Date.now()) {
        return NextResponse.json(
          { error: "Page selection expired. Please reconnect Facebook Messenger." },
          { status: 410 },
        )
      }
      const selectedPage = cached.pages.find((page) => page.id === pageId)
      if (!selectedPage) {
        throw new Error("Selected page not found in authorized pages.")
      }
      return completeChannelSetup(selectedPage, cached.pages.length, authorization)
    }

    const code = payload?.code?.trim()
    const redirectUri = payload?.redirectUri?.trim()
    if (!code || !redirectUri) {
      return NextResponse.json({ error: "Meta authorization code is missing." }, { status: 400 })
    }
    if (payload?.state !== EXPECTED_STATE) {
      return NextResponse.json({ error: "Meta authorization state is invalid." }, { status: 400 })
    }
    if (!isValidRedirectUri(redirectUri)) {
      return NextResponse.json({ error: "Meta redirect URI is invalid." }, { status: 400 })
    }

    const shortLivedUserToken = await exchangeCodeForUserToken(code, redirectUri)
    const longLivedUserToken = await exchangeShortLivedTokenForLongLived(shortLivedUserToken)
    const pages = await fetchAuthorizedPages(longLivedUserToken)

    if (pages.length === 1) {
      return completeChannelSetup(pages[0], pages.length, authorization)
    }

    const newSelectionId = randomBytes(24).toString("hex")
    pendingSelections.set(newSelectionId, {
      pages,
      expiresAt: Date.now() + SELECTION_TTL_MS,
    })

    return NextResponse.json({
      needsPageSelection: true,
      selectionId: newSelectionId,
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        category: page.category,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to connect Facebook Messenger." },
      { status: 502 },
    )
  }
}