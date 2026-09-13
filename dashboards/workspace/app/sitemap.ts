import type { MetadataRoute } from "next"

import { resolvePublicSiteUrl } from "../../shared/server-public-site-url-config"

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolvePublicSiteUrl(process.env)
  if (!siteUrl) return []

  const now = new Date()

  return [
    "",
    "/pricing",
    "/contact",
    "/trial",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/privacy-policy",
    "/terms-of-service",
    "/data-deletion",
  ].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
  }))
}
