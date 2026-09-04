"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  Bell,
  Banknote,
  BarChart3,
  CalendarDays,
  Images,
  LayoutDashboard,
  MessageSquareQuote,
  MessagesSquare,
  Radio,
  Package,
  Search as SearchIcon,
  Shield,
  Settings,
  ShoppingBag,
  Store,
  ScrollText,
  Truck,
  UsersRound,
  CreditCard,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button as UiButton } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

type WorkspaceHeaderProps = {
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
}

const headerIconByTitle: Record<string, LucideIcon> = {
  Home: LayoutDashboard,
  Inbox: MessagesSquare,
  Search: SearchIcon,
  Orders: ShoppingBag,
  Deliveries: Truck,
  Products: Package,
  Customers: UsersRound,
  "Saved Replies": MessageSquareQuote,
  Media: Images,
  Reports: BarChart3,
  "Conversation Report": MessagesSquare,
  "Sales & Orders Report": BarChart3,
  "Delivery Report": Truck,
  "Customer Report": UsersRound,
  "Product Report": Store,
  "Payment/COD Report": Banknote,
  Team: UsersRound,
  Channels: Radio,
  Roles: Shield,
  Audit: ScrollText,
  Notifications: Bell,
  "Workspace Settings": Settings,
  Billing: CreditCard,
  Profile: UsersRound,
}

export function WorkspaceHeader({ title, description, eyebrow, actions }: WorkspaceHeaderProps) {
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

  const HeaderIcon = title.startsWith("Good morning") ? LayoutDashboard : headerIconByTitle[title]

  return (
    <header className="workspace-header">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <SidebarTrigger className="shrink-0" />
        {HeaderIcon ? (
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20 sm:flex">
            <HeaderIcon aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">{eyebrow}</p> : null}
          <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50 sm:text-2xl">{title}</h1>
          <p className="hidden truncate text-sm text-slate-500 dark:text-slate-400 sm:block">{description}</p>
        </div>
      </div>

      <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        <Badge
          variant="outline"
          className="hidden md:inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
        >
          <span className="mr-2 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Online
        </Badge>
        <div className="hidden h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 lg:flex">
          <CalendarDays className="h-4 w-4" /> {date || "Today"}
        </div>
        <ThemeToggle />
        <UiButton asChild variant="ghost" size="icon" aria-label="Notifications">
          <Link href="/workspace/notifications">
            <Bell aria-hidden="true" className="h-4 w-4" />
          </Link>
        </UiButton>
        {actions ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-[479px]:basis-full">{actions}</div> : null}
      </div>
    </header>
  )
}
