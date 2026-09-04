"use client"

import type { ComponentProps, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type WorkspacePageProps = {
  children: ReactNode
  className?: string
  containerClassName?: string
}

type WorkspaceCardProps = ComponentProps<typeof Card>

type WorkspaceStatCardProps = {
  label: string
  value: string | number
  note?: string
  icon: LucideIcon
  tone: "indigo" | "blue" | "violet" | "emerald" | "amber" | "rose"
  className?: string
}

type WorkspaceEmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}

type WorkspaceSectionProps = {
  id?: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

type WorkspaceSplitViewProps = {
  children: ReactNode
  className?: string
}

const statToneClasses: Record<WorkspaceStatCardProps["tone"], string> = {
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-200",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-200",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-200",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-200",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-200",
}

const statAccentClasses: Record<WorkspaceStatCardProps["tone"], string> = {
  indigo: "from-indigo-500 via-cyan-400 to-sky-400",
  blue: "from-blue-500 via-cyan-400 to-sky-400",
  violet: "from-violet-500 via-fuchsia-400 to-indigo-400",
  emerald: "from-emerald-500 via-teal-400 to-cyan-400",
  amber: "from-amber-500 via-orange-400 to-yellow-400",
  rose: "from-rose-500 via-pink-400 to-fuchsia-400",
}

function WorkspacePage({ children, className, containerClassName }: WorkspacePageProps) {
  return (
    <main className={cn("workspace-page", className)}>
      <div className={cn("mx-auto max-w-[1500px] space-y-5", containerClassName)}>{children}</div>
    </main>
  )
}

function WorkspaceCard({ className, ...props }: WorkspaceCardProps) {
  return <Card className={cn("workspace-card", className)} {...props} />
}

function WorkspaceStatCard({ label, value, note, icon: Icon, tone, className }: WorkspaceStatCardProps) {
  return (
    <WorkspaceCard className={cn("group gap-0 overflow-hidden py-0 sm:gap-6 sm:py-6", className)}>
      <div className={cn("h-1 bg-gradient-to-r", statAccentClasses[tone])} />
      <CardContent className="flex min-h-[104px] items-start justify-between gap-2 p-3 sm:min-h-[128px] sm:gap-4 sm:p-5">
        <div className="min-w-0 space-y-1.5 sm:space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">{label}</p>
          <p className="truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-3xl">{value}</p>
          {note ? <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{note}</p> : null}
        </div>
        <div className={cn("rounded-xl p-2 shadow-sm ring-1 ring-inset ring-white/40 dark:ring-white/10 sm:rounded-2xl sm:p-3", statToneClasses[tone])}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </CardContent>
    </WorkspaceCard>
  )
}

function WorkspaceSection({ id, title, description, action, children, className, contentClassName }: WorkspaceSectionProps) {
  return (
    <WorkspaceCard id={id} className={className}>
      <CardHeader className="flex flex-col items-stretch justify-between gap-3 space-y-0 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <div className="flex max-w-full flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>{children}</CardContent>
    </WorkspaceCard>
  )
}

function WorkspaceEmptyState({ icon: Icon, title, description, action, className }: WorkspaceEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center dark:border-slate-800 dark:bg-slate-900/70 sm:p-10", className)}>
      <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-200">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-slate-50">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

function WorkspaceSplitView({ children, className }: WorkspaceSplitViewProps) {
  return <div className={cn("grid min-h-0 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:min-h-[620px] dark:border-slate-800 dark:bg-slate-950", className)}>{children}</div>
}

export {
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspaceSection,
  WorkspaceSplitView,
  WorkspaceStatCard,
}
