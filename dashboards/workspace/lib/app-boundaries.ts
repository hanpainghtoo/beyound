import { getPublicRuntimeConfig } from "@/lib/public-runtime-config"

function platformConsoleBaseUrl() {
  return getPublicRuntimeConfig().platformConsoleUrl || "http://localhost:6101"
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "")
}

function withBase(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${normalizeBaseUrl(platformConsoleBaseUrl())}${normalizedPath}`
}

export function platformConsoleLoginUrl(nextPath?: string | null) {
  const url = new URL(withBase("/login"))
  if (nextPath?.startsWith("/platform-console")) {
    url.searchParams.set("next", nextPath)
  }
  return url.toString()
}

export function platformConsoleLegacyUrl(workspacePath: string) {
  const path = workspacePath || "/dashboard"
  const routeMap: Record<string, string> = {
    "/dashboard": "/platform-console",
    "/dashboard/tenants": "/platform-console/merchants",
    "/dashboard/feature-flags": "/platform-console/feature-toggles",
    "/dashboard/plans-entitlements": "/platform-console/subscription-plans",
    "/dashboard/platform-users": "/platform-console/users",
    "/dashboard/system-health": "/platform-console/operations",
  }

  if (routeMap[path]) return withBase(routeMap[path])

  if (path.startsWith("/dashboard/tenants/")) {
    return withBase(path.replace("/dashboard/tenants", "/platform-console/merchants"))
  }

  if (path.startsWith("/dashboard/")) {
    return withBase(path.replace("/dashboard", "/platform-console"))
  }

  return withBase("/platform-console")
}
