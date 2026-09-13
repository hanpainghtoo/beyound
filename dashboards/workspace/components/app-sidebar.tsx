"use client"

import { cn } from "@/lib/utils"
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
import { roleLabel, type WorkspaceRole } from "@/lib/roles"

type WorkspaceNavItem = {
  title: string
  url: string
  icon: LucideIcon
  iconClass: string
  roles: readonly WorkspaceRole[]
}

const navigation = [
  {
    title: "Workspace",
    items: [
      { title: "Home", url: "/workspace", icon: House, iconClass: "text-indigo-600 dark:text-indigo-300", roles: ["owner", "admin", "supervisor", "csr"] },
      { title: "Inbox", url: "/workspace/inbox", icon: MessagesSquare, iconClass: "text-blue-600 dark:text-blue-300", roles: ["owner", "admin", "supervisor", "csr"] },
    ],
  },
  {
    title: "Commerce",
    items: [
      { title: "Orders", url: "/workspace/orders", icon: ShoppingBag, iconClass: "text-violet-600 dark:text-violet-300", roles: ["owner", "admin", "supervisor", "csr", "finance"] },
      { title: "Deliveries", url: "/workspace/deliveries", icon: Truck, iconClass: "text-cyan-700 dark:text-cyan-300", roles: ["owner", "admin", "supervisor", "csr", "delivery"] },
      { title: "Products", url: "/workspace/products", icon: Package, iconClass: "text-amber-700 dark:text-amber-300", roles: ["owner", "admin", "supervisor"] },
    ],
  },
  {
    title: "Customers",
    items: [
      { title: "Customers", url: "/workspace/customers", icon: UsersRound, iconClass: "text-sky-700 dark:text-sky-300", roles: ["owner", "admin", "supervisor", "csr"] },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { title: "Saved Replies", url: "/workspace/saved-replies", icon: MessageSquareQuote, iconClass: "text-fuchsia-700 dark:text-fuchsia-300", roles: ["owner", "admin", "supervisor", "csr"] },
      { title: "Media", url: "/workspace/media", icon: Images, iconClass: "text-emerald-700 dark:text-emerald-300", roles: ["owner", "admin", "supervisor", "csr"] },
      { title: "Conversation Search", url: "/workspace/search", icon: MessagesSquare, iconClass: "text-slate-600 dark:text-slate-300", roles: ["owner", "admin", "supervisor", "csr"] },
    ],
  },
  {
    title: "Reports",
    items: [
      { title: "Reports", url: "/workspace/reports", icon: BarChart3, iconClass: "text-orange-600 dark:text-orange-300", roles: ["owner", "admin", "supervisor", "finance"] },
    ],
  },
  {
    title: "Management",
    items: [
      { title: "Team", url: "/workspace/team", icon: UsersRound, iconClass: "text-indigo-600 dark:text-indigo-300", roles: ["owner", "admin", "supervisor"] },
      { title: "Channels", url: "/workspace/channels", icon: Radio, iconClass: "text-cyan-700 dark:text-cyan-300", roles: ["owner", "admin", "supervisor"] },
      { title: "Roles", url: "/workspace/roles", icon: Shield, iconClass: "text-slate-700 dark:text-slate-300", roles: ["owner", "admin"] },
      { title: "Audit", url: "/workspace/audit", icon: ScrollText, iconClass: "text-amber-700 dark:text-amber-300", roles: ["owner", "admin", "supervisor"] },
      { title: "Workspace Settings", url: "/workspace/settings", icon: Settings, iconClass: "text-slate-600 dark:text-slate-300", roles: ["owner", "admin"] },
      { title: "Billing", url: "/workspace/billing", icon: WalletCards, iconClass: "text-indigo-600 dark:text-indigo-300", roles: ["owner", "admin", "supervisor", "finance"] },
    ],
  },
] as const satisfies ReadonlyArray<{ title: string; items: readonly WorkspaceNavItem[] }>

const sectionAccent: Record<string, string> = {
  Workspace: "from-indigo-500 to-cyan-500",
  Commerce: "from-violet-500 to-indigo-500",
  Customers: "from-sky-500 to-cyan-500",
  Knowledge: "from-fuchsia-500 to-violet-500",
  Reports: "from-orange-500 to-amber-500",
  Management: "from-slate-500 to-slate-400",
}

function NavIcon({ icon: Icon, iconClass, active }: { icon: LucideIcon; iconClass: string; active: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-white/90 dark:bg-slate-800"
          : "bg-slate-100/70 group-hover:bg-white/80 dark:bg-slate-800/60 dark:group-hover:bg-slate-800"
      }`}
    >
      <Icon aria-hidden="true" className={`h-[18px] w-[18px] ${iconClass}`} strokeWidth={1.9} />
    </span>
  )
}

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const session = getStoredSession()
  const role = (session?.user.role as WorkspaceRole | undefined) || "csr"
  const visibleNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => (item.roles as readonly string[]).includes(role)),
    }))
    .filter((section) => section.items.length > 0)
  const userName = session?.user.fullName || "Team Member"
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  const logout = () => {
    clearSession()
    document.documentElement.classList.remove("dark")
    document.documentElement.style.colorScheme = "light"
    router.push("/login")
  }

  return (
    <Sidebar collapsible="icon" className={cn("border-r border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50/90 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900", className)}>
      <SidebarHeader className="border-b border-slate-200/80 bg-white px-2 py-3 dark:border-slate-800 dark:bg-slate-950">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center space-x-2 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-900">
                <img src="/zayos-mark-light.png" alt="" className="h-8 w-8 object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-bold text-slate-950 dark:text-slate-50">ZayOS</p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">Workspace</p>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {visibleNavigation.map((section) => (
          <SidebarGroup key={section.title} className="relative py-2">
            <SidebarGroupLabel className="mb-1 flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${sectionAccent[section.title] || "from-slate-400 to-slate-500"}`} />
              {section.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    {(() => {
                      const isOrdersPage = pathname === "/workspace/orders" || pathname.startsWith("/workspace/orders/")
                      const isDeliveryFallbackActive = role === "delivery" && item.url === "/workspace/deliveries" && isOrdersPage
                      const active = pathname === item.url || (item.url !== "/workspace" && pathname.startsWith(`${item.url}/`)) || isDeliveryFallbackActive
                      return (
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="group relative h-10 rounded-lg text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-950 data-[active=true]:bg-indigo-50 data-[active=true]:font-semibold data-[active=true]:text-indigo-800 data-[active=true]:ring-1 data-[active=true]:ring-indigo-100 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-slate-50 dark:data-[active=true]:bg-indigo-500/10 dark:data-[active=true]:text-indigo-100 dark:data-[active=true]:ring-indigo-400/20"
                        >
                          <Link href={item.url}>
                            <span className={`absolute left-0 top-2 h-6 w-1 rounded-r-full bg-indigo-600 transition-opacity dark:bg-indigo-300 ${active ? "opacity-100" : "opacity-0"}`} />
                            <NavIcon icon={item.icon} iconClass={item.iconClass} active={active} />
                            <span>{item.title}</span>
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
                My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/workspace/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Workspace Settings
              </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/workspace/notifications")}>
                  <Bell className="mr-2 h-4 w-4" />
                  Notifications
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
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
