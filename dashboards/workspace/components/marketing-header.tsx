"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type NavItem = {
  /** Translation key under `navigation.*`. Resolved inside the component. */
  labelKey: string
  href: string
}

export const marketingNavItems: NavItem[] = [
  { labelKey: "navigation.home", href: "/" },
  { labelKey: "navigation.product", href: "/product" },
  // { labelKey: "navigation.useCases", href: "/use-cases" },
  { labelKey: "navigation.pricing", href: "/pricing" },
  // { labelKey: "navigation.resources", href: "/resources" },
  { labelKey: "navigation.contact", href: "/contact" },
]

const DEFAULT_PRIMARY_CTA = { labelKey: "navigation.tryItFree", href: "/trial" }
const DEFAULT_SECONDARY_CTA = { labelKey: "navigation.productDemo", href: "/contact?intent=demo" }

export function MarketingHeader({
  primaryCta = DEFAULT_PRIMARY_CTA,
  secondaryCta = DEFAULT_SECONDARY_CTA,
  showTopBanner = true,
}: {
  primaryCta?: {
    labelKey?: string
    label?: string
    href: string
  }
  secondaryCta?: {
    labelKey?: string
    label?: string
    href: string
  }
  primaryCtaTone?: "indigo" | "brand"
  showTopBanner?: boolean
}) {
  const pathname = usePathname()
  const { t } = useI18n()
  const isActive = (href: string) => pathname === href

  // Callers may pass a raw label; fall back to the shared default key.
  const primaryLabel = primaryCta.labelKey
    ? t(primaryCta.labelKey)
    : primaryCta.label ?? t(DEFAULT_PRIMARY_CTA.labelKey)
  const secondaryLabel = secondaryCta.labelKey
    ? t(secondaryCta.labelKey)
    : secondaryCta.label ?? t(DEFAULT_SECONDARY_CTA.labelKey)
  // Pages whose primary CTA is already "request demo" point both buttons at the
  // same URL. Rendering both made that row the widest on the site (509px vs a
  // 488px track at 1440) and pushed the language switcher onto a second line.
  const showSecondaryCta = secondaryCta.href !== primaryCta.href

  return (
    <header className="sticky top-0 z-50 border-b border-white/70 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      {/* Top Announcement Banner */}
      {showTopBanner && (
        <div className="relative flex min-h-[40px] w-full items-center justify-center bg-gradient-to-r from-[#6366F1] via-[#3B82F6] to-[#06B6D4] px-4 py-1.5 text-center text-xs font-semibold text-white sm:text-sm">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <span>{t("trial.metaTitle")}</span>
            <Link
              href="/trial"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-xs font-bold text-[#4F46E5] shadow-sm transition hover:bg-slate-50"
            >
              {t("common.startFreeTrial")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      <div className="relative mx-auto flex min-h-18 max-w-[1480px] items-center gap-3 px-5 sm:px-8 lg:gap-4 lg:px-10 min-[1200px]:grid min-[1200px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link href="/" className="z-10 flex shrink-0 items-center gap-2.5 min-[1200px]:justify-self-start">
          <img src="/zayos-mark-light.png" alt="" className="h-8 w-8 object-contain" />
          <span className="text-[22px] font-extrabold text-slate-950">ZayOS</span>
        </Link>

        {/* Navigation pill.
            It used to be absolutely centred (left-1/2 -translate-x-1/2) while
            the actions sat in normal flow, so whenever the labels got wider -
            always the case in Burmese - the pill was painted straight over
            "Sign In". Two modes now:

              >= 1200px  the row is a grid [1fr auto 1fr], so the pill is dead
                         centre and both side columns are the same width, which
                         makes an overlap structurally impossible.
              1024-1199  the row is flex and the pill takes a real flex column
                         (min-w-0 + flex-1). It centres itself in whatever
                         space is left: slightly off-centre, but it can never
                         reach either edge.
        */}
        <div className="header-nav pointer-events-auto hidden min-w-0 flex-1 items-center justify-center lg:flex">
          <nav className="flex max-w-full items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-2 py-1.5 text-[15px] font-medium text-slate-700 shadow-sm" aria-label="Primary">
            {marketingNavItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative whitespace-nowrap rounded-full px-3.5 py-2 transition-all hover:bg-slate-100 hover:text-slate-950",
                    active && "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100 hover:bg-indigo-50",
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Right action items */}
        <div className="header-actions z-10 hidden items-center gap-3 lg:flex min-[1200px]:justify-self-end">
          <Button asChild variant="ghost" className="h-10 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950">
            <Link href="/login">{t("navigation.signIn")}</Link>
          </Button>

          <Button
            asChild
            className="relative h-10 shrink-0 whitespace-nowrap rounded-full bg-gradient-to-r from-[#00C6FF] via-[#3B82F6] to-[#7B2CBF] px-5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(59,130,246,0.45)] transition hover:opacity-95"
          >
            <Link href={primaryCta.href} className="gap-1.5">
              {primaryLabel}
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          </Button>

          {/* Demo is the widest label in the row: it only joins the row once
              there is room for it (>= 1440px), and Burmese drops it entirely -
              its label runs ~35% wider than the English one and would push the
              action group past the point where the pill can stay centred.
              It is skipped entirely when the primary CTA already targets it. */}
          {showSecondaryCta ? (
            <Button
              asChild
              variant="outline"
              className="header-demo hidden h-10 shrink-0 whitespace-nowrap rounded-full border border-[#5E4BCE] bg-white px-5 text-sm font-semibold text-[#5E4BCE] transition hover:bg-[#F3F1FF] min-[1440px]:flex"
            >
              <Link href={secondaryCta.href} className="gap-1.5">
                {secondaryLabel}
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            </Button>
          ) : null}

          <LanguageSwitcher className="shrink-0 pl-1" />
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="ml-auto rounded-full border-slate-200 bg-white/90 shadow-sm lg:hidden" aria-label={t("navigation.openMenu")}>
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full max-w-sm border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] p-0">
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-slate-200/80 px-6 py-5 text-left">
                <SheetTitle className="flex items-center gap-2 text-left text-lg font-bold text-slate-950">
                  <img src="/zayos-mark-light.png" alt="" className="h-7 w-7 object-contain" />
                  ZayOS
                </SheetTitle>
                <SheetDescription className="text-left text-sm text-slate-500">
                  Commerce Workspace
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 px-6 py-5">
                <nav className="space-y-1" aria-label="Mobile">
                  {marketingNavItems.map((item) => {
                    const active = isActive(item.href)
                    return (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-200 hover:bg-white hover:text-slate-950 hover:shadow-sm",
                            active && "border-indigo-100 bg-indigo-50 text-indigo-700 shadow-sm",
                          )}
                        >
                          {t(item.labelKey)}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </SheetClose>
                    )
                  })}
                </nav>
              </div>
              <div className="border-t border-slate-200/80 p-5">
                <div className="grid gap-3">
                  <SheetClose asChild>
                    <Button asChild variant="outline" className="h-11 rounded-full border-slate-200 font-semibold text-slate-700 hover:bg-slate-50">
                      <Link href="/login">{t("navigation.signIn")}</Link>
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button
                      asChild
                      className="h-11 rounded-full bg-gradient-to-r from-[#00C6FF] via-[#3B82F6] to-[#7B2CBF] font-semibold text-white shadow-sm"
                    >
                      <Link href={primaryCta.href} className="gap-1.5">
                        {primaryLabel}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button
                      asChild
                      variant="outline"
                      className="h-11 rounded-full border border-[#5E4BCE] bg-white font-semibold text-[#5E4BCE] hover:bg-[#F3F1FF]"
                    >
                      <Link href={secondaryCta.href} className="gap-1.5">
                        {secondaryLabel}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </SheetClose>
                  <div className="flex justify-center pt-2">
                    <LanguageSwitcher />
                  </div>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
