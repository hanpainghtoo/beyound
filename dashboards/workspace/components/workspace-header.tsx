"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
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

import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"

type WorkspaceHeaderProps = {
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
  realtimeStatus?: "connecting" | "online" | "offline"
  /**
   * Drop the eyebrow and description, leaving a single title line. For pages
   * whose own content already carries that context and where the header's
   * three stacked lines eat vertical space the work needs — the inbox is the
   * motivating case. Opt-in so no other page's layout shifts.
   */
  compact?: boolean
  /**
   * Stable id for the header icon.
   *
   * The icon used to be resolved by matching the English `title` string, which
   * meant translating a page title silently removed its icon (the lookup missed
   * and `HeaderIcon` became `undefined`). Pass this instead. It is optional only
   * so the ~24 existing call sites can migrate incrementally; once every caller
   * passes it, the title fallback can be deleted along with `legacyIconByTitle`.
   */
  navKey?: WorkspaceHeaderNavKey
}

/** Stable, locale-independent identifiers for the workspace header icon. */
export type WorkspaceHeaderNavKey =
  | "home"
  | "inbox"
  | "search"
  | "orders"
  | "deliveries"
  | "products"
  | "customers"
  | "savedReplies"
  | "media"
  | "reports"
  | "conversationReport"
  | "salesOrdersReport"
  | "deliveryReport"
  | "customerReport"
  | "productReport"
  | "paymentReport"
  | "team"
  | "channels"
  | "roles"
  | "audit"
  | "notifications"
  | "settings"
  | "billing"
  | "profile"

const headerIconByKey: Record<WorkspaceHeaderNavKey, LucideIcon> = {
  home: LayoutDashboard,
  inbox: MessagesSquare,
  search: SearchIcon,
  orders: ShoppingBag,
  deliveries: Truck,
  products: Package,
  customers: UsersRound,
  savedReplies: MessageSquareQuote,
  media: Images,
  reports: BarChart3,
  conversationReport: MessagesSquare,
  salesOrdersReport: BarChart3,
  deliveryReport: Truck,
  customerReport: UsersRound,
  productReport: Store,
  paymentReport: Banknote,
  team: UsersRound,
  channels: Radio,
  roles: Shield,
  audit: ScrollText,
  notifications: Bell,
  settings: Settings,
  billing: CreditCard,
  profile: UsersRound,
}

/**
 * Fallback for callers that have not adopted `navKey` yet. English titles only,
 * and it is already wrong for several pages ("Settings" never matched the
 * "Workspace Settings" key, nor "Order Settings"), which is why `navKey` is the
 * supported path.
 */
const legacyIconByTitle: Record<string, LucideIcon> = {
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

export function WorkspaceHeader({ title, description, eyebrow, actions, realtimeStatus, compact, navKey }: WorkspaceHeaderProps) {
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

  // `navKey` is authoritative. The title lookup is only a migration fallback:
  // it is English-only, so it cannot survive a translated title. The greeting
  // special case stays on the fallback path so unmigrated callers (the home
  // page passes "Good morning, ...") keep their icon.
  const HeaderIcon = navKey
    ? headerIconByKey[navKey]
    : title.startsWith("Good morning")
      ? LayoutDashboard
      : legacyIconByTitle[title]

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
          {eyebrow && !compact ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">{eyebrow}</p> : null}
          <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50 sm:text-2xl">{title}</h1>
          {compact ? null : (
            <p className="hidden truncate text-sm text-slate-500 dark:text-slate-400 sm:block">{description}</p>
          )}
        </div>
      </div>

      <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {realtimeStatus ? (
          <Badge
            variant="outline"
            className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
          >
            <span className={`mr-2 inline-flex h-2.5 w-2.5 rounded-full ${realtimeStatus === "online" ? "bg-emerald-500" : realtimeStatus === "connecting" ? "bg-amber-500" : "bg-slate-400"}`} aria-hidden="true" />
            {realtimeStatus === "online" ? "Live" : realtimeStatus === "connecting" ? "Connecting" : "Offline"}
          </Badge>
        ) : null}
        <div className="hidden h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 lg:flex">
          <CalendarDays className="h-4 w-4" /> {date || "Today"}
        </div>
        <ThemeToggle />
        <LanguageSwitcher />
        {actions ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-[479px]:basis-full">{actions}</div> : null}
      </div>
    </header>
  )
}
