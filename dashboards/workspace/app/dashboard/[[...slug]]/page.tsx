"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { platformConsoleLegacyUrl } from "@/lib/app-boundaries"

export default function LegacyDashboardHandoff() {
  const pathname = usePathname()
  const targetUrl = platformConsoleLegacyUrl(pathname)

  useEffect(() => {
    window.location.replace(targetUrl)
  }, [targetUrl])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050b14] px-4 text-slate-50">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center shadow-2xl">
        <img src="/zayos-mark-light.png" alt="" className="mx-auto h-12 w-12 object-contain" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Platform Console moved</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Platform operator tools now live in the dedicated ZayOS Platform Console.
        </p>
        <Button asChild className="mt-6 w-full bg-sky-500 text-slate-950 hover:bg-sky-400">
          <a href={targetUrl}>Open Platform Console</a>
        </Button>
      </section>
    </main>
  )
}
