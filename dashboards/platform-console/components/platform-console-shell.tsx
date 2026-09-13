"use client"

import type React from "react"
import { useEffect, useState } from "react"

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { PlatformConsoleSidebar } from "@/components/platform-console-sidebar"
import { Badge } from "@/components/ui/badge"
import { SessionGuard } from "@/components/session-guard"

type ConsolePageProps = {
  children: React.ReactNode
  className?: string
  containerClassName?: string
}

type ConsoleSectionProps = {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

type ConsoleStatCardProps = {
  label: string
  value: string | number
  note?: string
  tone: "blue" | "cyan" | "emerald" | "amber" | "rose" | "slate"
}

const statStyles: Record<ConsoleStatCardProps["tone"], string> = {
  blue: "from-blue-500 to-cyan-400 text-blue-50",
  cyan: "from-cyan-500 to-sky-400 text-cyan-50",
  emerald: "from-emerald-500 to-teal-400 text-emerald-50",
  amber: "from-amber-500 to-orange-400 text-amber-50",
  rose: "from-rose-500 to-pink-400 text-rose-50",
  slate: "from-slate-600 to-slate-400 text-slate-50",
}

function ConsolePage({ children, className, containerClassName }: ConsolePageProps) {
  return (
    <main
      className={cn(
        "flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_22%),linear-gradient(180deg,#08111f_0%,#091423_52%,#07101d_100%)] p-4 text-slate-50 sm:p-6",
        className,
      )}
    >
      <div className={cn("mx-auto w-full max-w-[1560px] space-y-5", containerClassName)}>{children}</div>
    </main>
  )
}

function ConsoleHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  const [date, setDate] = useState("")

  useEffect(() => {
    setDate(
      new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
    )
  }, [])

  return (
    <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-4 shadow-[0_18px_60px_rgba(2,6,23,0.35)] backdrop-blur md:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="shrink-0 rounded-xl border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" />
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300">
              {eyebrow}
            </p>
          ) : null}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
              {title}
            </h1>
            <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-200">
              Internal console
            </Badge>
          </div>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{description}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 md:inline-flex">
          {date || "Today"}
        </div>
        {actions}
      </div>
    </header>
  )
}

function ConsoleSection({ title, description, action, children, className }: ConsoleSectionProps) {
  return (
    <section className={cn("overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_18px_60px_rgba(2,6,23,0.28)]", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}

function ConsoleStatCard({ label, value, note, tone }: ConsoleStatCardProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_18px_60px_rgba(2,6,23,0.26)]">
      <div className={cn("h-1 bg-gradient-to-r", statStyles[tone])} />
      <div className="flex min-h-[136px] items-start justify-between gap-4 px-5 py-5">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">{label}</p>
          <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
          {note ? <p className="text-xs leading-6 text-slate-400">{note}</p> : null}
        </div>
      </div>
    </div>
  )
}

export { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard }

export function PlatformConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard>
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-screen w-full bg-[#050b14] text-slate-50">
          <PlatformConsoleSidebar />
          <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </SidebarProvider>
    </SessionGuard>
  )
}
