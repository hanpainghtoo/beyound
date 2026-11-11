"use client"

import { cn } from "@/lib/utils"
import { disconnectWorkspacePresence } from "@/hooks/use-workspace-presence"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Bell,
  BarChart3,
  ChevronUp,
  CreditCard,
  Images,
  House,
  LogOut,
  MessageSquareQuote,
  MessagesSquare,
  Radio,
  Package,
  Shield,
  Settings,
  ShoppingBag,
  ScrollText,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import { clearSession, getStoredSession } from "@/lib/api"
import { useTenantFeatures } from "@/lib/queries/features"
import { useI18n } from "@/components/providers/i18n-provider"
import { roleLabel, type WorkspaceRole } from "@/lib/roles"

type WorkspaceNavItem = {
  /** i18n key suffix under `workspace.items`. */
  key: WorkspaceNavItemKey
  url: string
  icon: LucideIcon
  roles: readonly WorkspaceRole[]
  /** Plan 55: feature category key gating this nav entry. */
  featureKey?: string
}

type WorkspaceNavItemKey =
  | "home"
  | "inbox"
  | "orders"
  | "deliveries"
  | "products"
  | "customers"
  | "savedReplies"
  | "media"
  | "reports"
  | "team"
  | "channels"
  | "roles"
  | "audit"
  | "workspaceSettings"
  | "paymentMethods"
  | "billing"

/** i18n key suffix under `workspace.sections`. */
type WorkspaceNavSectionKey =
  | "workspace"
  | "commerce"
  | "customers"
  | "knowledge"
  | "reports"
  | "management"

/**
 * Nav is keyed by stable slug, not by the English title: `title` is the
 * translated label, so it cannot double as a lookup key (that is exactly how
 * `sectionAccent` used to break when a title was localised).
 */
const navigation = [
  {
    key: "workspace",
    items: [
      { key: "home", url: "/workspace", icon: House, roles: ["owner", "admin", "supervisor", "agent"] },
      { key: "inbox", url: "/workspace/inbox", icon: MessagesSquare, roles: ["owner", "admin", "supervisor", "agent"] },
    ],
  },
  {
    key: "commerce",
    items: [
      { key: "orders", url: "/workspace/orders", icon: ShoppingBag, roles: ["owner", "admin", "supervisor", "agent", "finance"], featureKey: "orders" },
      { key: "deliveries", url: "/workspace/deliveries", icon: Truck, roles: ["owner", "admin", "supervisor", "agent", "delivery"], featureKey: "deliveries" },
      { key: "products", url: "/workspace/products", icon: Package, roles: ["owner", "admin", "supervisor"] },
    ],
  },
  {
    key: "customers",
    items: [
      { key: "customers", url: "/workspace/customers", icon: UsersRound, roles: ["owner", "admin", "supervisor", "agent"] },
    ],
  },
  {
    key: "knowledge",
    items: [
      { key: "savedReplies", url: "/workspace/saved-replies", icon: MessageSquareQuote, roles: ["owner", "admin", "supervisor", "agent"] },
      { key: "media", url: "/workspace/media", icon: Images, roles: ["owner", "admin", "supervisor", "agent"] },
    ],
  },
  {
    key: "reports",
    items: [
      { key: "reports", url: "/workspace/reports", icon: BarChart3, roles: ["owner", "admin", "supervisor", "finance"] },
    ],
  },
  {
    key: "management",
    items: [
      { key: "team", url: "/workspace/team", icon: UsersRound, roles: ["owner", "admin", "supervisor", "agent"] },
      { key: "channels", url: "/workspace/channels", icon: Radio, roles: ["owner", "admin", "supervisor"] },
      { key: "roles", url: "/workspace/roles", icon: Shield, roles: ["owner", "admin"] },
      { key: "audit", url: "/workspace/audit", icon: ScrollText, roles: ["owner", "admin", "supervisor"] },
      { key: "workspaceSettings", url: "/workspace/settings", icon: Settings, roles: ["owner", "admin"] },
      { key: "paymentMethods", url: "/workspace/payment-settings", icon: CreditCard, roles: ["owner", "admin", "supervisor"] },
      { key: "billing", url: "/workspace/billing", icon: WalletCards, roles: ["owner", "admin", "supervisor", "finance"] },
    ],
  },
] satisfies ReadonlyArray<{ key: WorkspaceNavSectionKey; items: readonly WorkspaceNavItem[] }>

/** Matches the active-item accent sampled from the design: #4F39F5. */
const ACTIVE_ACCENT = "#4F39F5"

function NavIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <Icon
      aria-hidden="true"
      strokeWidth={1.75}
      className={`size-5 shrink-0 transition-colors ${
        active
          ? "text-[#4F39F5] dark:text-indigo-300"
          : "text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100"
      }`}
    />
  )
}

export function AppSidebar({ className }: { className?: string }) {
  const { t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const session = getStoredSession()
  const role = (session?.user.role as WorkspaceRole | undefined) || "agent"
  // Plan 55: hide nav entries whose feature toggle is off for this tenant.
  // Absent data means enabled, so nav never flickers while loading.
  const featuresQuery = useTenantFeatures()
  const enabledFeatures = new Map(
    (featuresQuery.data ?? []).map((feature) => [feature.key, feature.isEnabled])
  )
  const isFeatureEnabled = (key?: string) => (key ? enabledFeatures.get(key) !== false : true)
  const visibleNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item: WorkspaceNavItem) =>
          (item.roles as readonly string[]).includes(role) &&
          isFeatureEnabled(item.featureKey)
      ),
    }))
    .filter((section) => section.items.length > 0)
  const userName = session?.user.fullName || t("workspace.footer.defaultMemberName")
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  const logout = () => {
    disconnectWorkspacePresence()
    clearSession()
    document.documentElement.classList.remove("dark")
    document.documentElement.style.colorScheme = "light"
    router.push("/login")
  }

  return (
    <Sidebar collapsible="icon" className={cn("border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950", className)}>
      <SidebarHeader className="border-b border-slate-200 bg-white px-4 py-4 group-data-[collapsible=icon]:px-2 dark:border-slate-800 dark:bg-slate-950">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3">
              <img src="/zayos-mark-light.png" alt="" className="size-9 shrink-0 object-contain" />
              <p className="truncate text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">ZayOS</p>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {visibleNavigation.map((section) => (
          <SidebarGroup key={section.key} className="relative px-4 py-3 group-data-[collapsible=icon]:px-2">
            <SidebarGroupLabel className="mb-2 h-auto px-0 text-[15px] font-bold tracking-normal text-slate-900 dark:text-slate-50">
              {t(`workspace.sections.${section.key}`)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    {(() => {
                      const itemPath = item.url.split("?")[0]
                      const isOrdersPage = pathname === "/workspace/orders" || pathname.startsWith("/workspace/orders/")
                      const isDeliveryFallbackActive = role === "delivery" && itemPath === "/workspace/deliveries" && isOrdersPage
                      const active = pathname === itemPath || (itemPath !== "/workspace" && pathname.startsWith(`${itemPath}/`)) || isDeliveryFallbackActive
                      return (
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={t(`workspace.items.${item.key}`)}
                          className="group relative h-11 rounded-lg px-3 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 data-[active=true]:bg-[#F3F1FE] data-[active=true]:font-semibold data-[active=true]:text-[#4F39F5] dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-slate-50 dark:data-[active=true]:bg-indigo-500/15 dark:data-[active=true]:text-indigo-200"
                        >
                          <Link href={item.url}>
                            <span
                              aria-hidden="true"
                              style={active ? { backgroundColor: ACTIVE_ACCENT } : undefined}
                              className={`absolute inset-y-1.5 left-0 w-1 rounded-r-full transition-colors ${
                                active
                                  ? "opacity-100 dark:bg-indigo-300"
                                  : "bg-slate-300 opacity-0 group-hover:opacity-60 dark:bg-slate-600"
                              }`}
                            />
                            <NavIcon icon={item.icon} active={active} />
                            <span className="min-w-0 flex-1">{t(`workspace.items.${item.key}`)}</span>
                          </Link>
                        </SidebarMenuButton>
                      )
                    })()}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-slate-200/80 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="rounded-xl bg-slate-50/80 ring-1 ring-slate-200/80 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground dark:bg-slate-900/80 dark:ring-slate-800"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={session?.user.avatarUrl || undefined} alt={userName} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{userName}</span>
                    <span className="truncate text-xs">{roleLabel(role)}</span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
              <DropdownMenuItem onClick={() => router.push("/workspace/profile")}>
                <Settings className="mr-2 h-4 w-4" />
                {t("workspace.footer.myProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/workspace/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                {t("workspace.footer.workspaceSettings")}
              </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/workspace/notifications")}>
                  <Bell className="mr-2 h-4 w-4" />
                  {t("workspace.footer.notifications")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("workspace.footer.logOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
