import { NextRequest, NextResponse } from "next/server"
import { isServerConfigurationError, resolveCoreApiBaseUrl } from "../../../../../shared/server-core-api-config"

const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]

function removeHopByHopHeaders(headers: Headers) {
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header)
  }
}

async function forwardRequest(request: NextRequest, path: string[]) {
  let apiBaseUrl: string
  try {
    apiBaseUrl = resolveCoreApiBaseUrl(process.env)
  } catch (error) {
    if (isServerConfigurationError(error)) {
      console.error(`[platform-console-api-proxy] ${error.message}`)
      return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 })
    }
    throw error
  }

  const upstreamUrl = `${apiBaseUrl}/${path.join("/")}${request.nextUrl.search}`
  const headers = new Headers(request.headers)
  headers.delete("host")
  removeHopByHopHeaders(headers)

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
  }

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstreamUrl, init)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[platform-console-api-proxy] Upstream fetch failed ${request.method} ${upstreamUrl}: ${message}`
    )
    return NextResponse.json(
      { error: "Upstream service unavailable. Please try again later." },
      { status: 502 }
    )
  }

  const responseHeaders = new Headers(upstreamResponse.headers)
  removeHopByHopHeaders(responseHeaders)
  responseHeaders.delete("content-encoding")

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  })
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forwardRequest(request, path)
}
