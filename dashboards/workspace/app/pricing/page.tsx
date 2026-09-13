import type { Metadata } from "next"
import Script from "next/script"

import { MarketingShell } from "@/components/marketing-shell"
import PricingClient from "./pricing-client"
import { publicPricingFaqs } from "@/lib/public-pricing"
import { resolvePublicSiteUrl } from "../../../shared/server-public-site-url-config"
import { Suspense } from "react"
import PricingCardsFetcher from "./pricing-cards-fetcher"
import { PricingSkeleton } from "./pricing-skeleton"

export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  const siteUrl = resolvePublicSiteUrl(process.env)
  const canonicalUrl = siteUrl ? `${siteUrl}/pricing` : undefined

  return {
    title: "Pricing for Growing Commerce Teams",
    description:
      "Choose a guided ZayOS rollout for your team, channels, and operating workflow. Prices are presented from the live platform-managed subscription catalog.",
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph: {
      title: "Pricing for Growing Commerce Teams | ZayOS",
      description:
        "Compare guided ZayOS rollout packages for Myanmar commerce teams using the live subscription catalog managed in Platform Console.",
      url: canonicalUrl,
      siteName: "ZayOS",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Pricing for Growing Commerce Teams | ZayOS",
      description:
        "Compare guided ZayOS rollout packages for Myanmar commerce teams using the live subscription catalog managed in Platform Console.",
    },
  }
}

export default async function PricingPage() {

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: publicPricingFaqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  }

  return (
    <MarketingShell
      footerVariant="compact"
      primaryCta={{ label: "7 Days Free Trial", href: "/trial" }}
    >
      <Script
        id="pricing-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <PricingClient>
        <Suspense fallback={<PricingSkeleton />}>
          <PricingCardsFetcher />
        </Suspense>
      </PricingClient>
    </MarketingShell>
  )
}
