import type { MetadataRoute } from "next"

import { resolvePublicSiteUrl } from "../../shared/server-public-site-url-config"

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolvePublicSiteUrl(process.env)

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    host: siteUrl || undefined,
    sitemap: siteUrl ? `${siteUrl}/sitemap.xml` : undefined,
  }
}
