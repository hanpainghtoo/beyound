"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, Globe, Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
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
  label: string
  href: string
}

export const marketingNavItems: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Product", href: "/product" },
  // { label: "Use Cases", href: "/use-cases" },
  { label: "Pricing", href: "/pricing" },
  // { label: "Resources", href: "/resources" },
  { label: "Contact", href: "/contact" },
]

export function MarketingHeader({
  primaryCta = { label: "Try it Free", href: "/trial" },
  secondaryCta = { label: "Product Demo", href: "/contact?intent=demo" },
  showTopBanner = true,
}: {
  primaryCta?: {
    label: string
    href: string
  }
  secondaryCta?: {
    label: string
    href: string
  }
  primaryCtaTone?: "indigo" | "brand"
  showTopBanner?: boolean
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href

  return (
    <header className="sticky top-0 z-50 border-b border-white/70 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      {/* Top Announcement Banner */}
      {showTopBanner && (
        <div className="relative flex min-h-[40px] w-full items-center justify-center bg-gradient-to-r from-[#6366F1] via-[#3B82F6] to-[#06B6D4] px-4 py-1.5 text-center text-xs font-semibold text-white sm:text-sm">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <span>Get 7 Days Free Trial</span>
            <Link
              href="/trial"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-xs font-bold text-[#4F46E5] shadow-sm transition hover:bg-slate-50"
            >
              Start Free Trial
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      <div className="relative mx-auto flex h-18 max-w-[1480px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link href="/" className="z-10 flex items-center gap-2.5">
          <img src="/zayos-mark-light.png" alt="" className="h-8 w-8 object-contain" />
          <span className="text-[22px] font-extrabold text-slate-950">ZayOS</span>
        </Link>

        {/* Centered Navigation Pill */}
        <div className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center lg:flex">
          <nav className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-2 py-1.5 text-[15px] font-medium text-slate-700 shadow-sm" aria-label="Primary">
            {marketingNavItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 transition-all hover:bg-slate-100 hover:text-slate-950",
                    active && "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100 hover:bg-indigo-50",
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Right action items */}
        <div className="z-10 hidden shrink-0 items-center gap-3 lg:flex">
          <Button asChild variant="ghost" className="h-10 rounded-full px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950">
            <Link href="/login">Sign in</Link>
          </Button>

          <Button
            asChild
            className="relative h-10 rounded-full bg-gradient-to-r from-[#00C6FF] via-[#3B82F6] to-[#7B2CBF] px-5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(59,130,246,0.45)] transition hover:opacity-95"
          >
            <Link href={primaryCta.href} className="gap-1.5">
              {primaryCta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-10 rounded-full border border-[#5E4BCE] bg-white px-5 text-sm font-semibold text-[#5E4BCE] transition hover:bg-[#F3F1FF]"
          >
            <Link href={secondaryCta.href} className="gap-1.5">
              {secondaryCta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <div className="flex items-center gap-1.5 pl-1 text-sm font-bold text-slate-900">
            <Globe className="h-4 w-4 text-slate-900" />
            <span>EN</span>
          </div>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="ml-auto rounded-full border-slate-200 bg-white/90 shadow-sm lg:hidden" aria-label="Open navigation menu">
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
                          {item.label}
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
                      <Link href="/login">Sign in</Link>
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button
                      asChild
                      className="h-11 rounded-full bg-gradient-to-r from-[#00C6FF] via-[#3B82F6] to-[#7B2CBF] font-semibold text-white shadow-sm"
                    >
                      <Link href={primaryCta.href} className="gap-1.5">
                        {primaryCta.label}
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
                        {secondaryCta.label}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </SheetClose>
                  <div className="flex items-center justify-center gap-1.5 pt-2 text-sm font-bold text-slate-900">
                    <Globe className="h-4 w-4 text-slate-900" />
                    <span>Language: English (EN)</span>
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
