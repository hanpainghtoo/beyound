"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Banknote,
  Building2,
  ClipboardList,
  CreditCard,
  FileStack,
  Gauge,
  MessageSquareText,
  Package,
  Settings2,
  LayoutDashboard,
  LogOut,
  Truck,
  Shield,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/sidebar";
import { clearSession, getStoredSession } from "@/lib/api";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  roles: readonly string[];
};

const navigation = [
  {
    title: "Platform",
    items: [
      {
        title: "Overview",
        href: "/platform-console",
        icon: LayoutDashboard,
        roles: ["super_admin", "ops_admin", "it_admin", "finance_viewer"],
      },
      {
        title: "Overview",
        href: "/platform-console",
        icon: LayoutDashboard,
        roles: ["support_viewer", "read_only"],
      },
      {
        title: "Leads",
        href: "/platform-console/leads",
        icon: Bell,
        roles: ["super_admin", "ops_admin"],
      },
      {
        title: "Merchants",
        href: "/platform-console/merchants",
        icon: Building2,
        roles: [
          "super_admin",
          "ops_admin",
          "it_admin",
          "finance_viewer",
          "support_viewer",
          "read_only",
        ],
      },
      {
        title: "Conversations",
        href: "/platform-console/conversations",
        icon: MessageSquareText,
        roles: [
          "super_admin",
          "ops_admin",
          "it_admin",
          "support_viewer",
          "read_only",
        ],
      },
      {
        title: "Sales & Orders",
        href: "/platform-console/sales-orders",
        icon: ClipboardList,
        roles: [
          "super_admin",
          "ops_admin",
          "it_admin",
          "finance_viewer",
          "support_viewer",
          "read_only",
        ],
      },
      {
        title: "Deliveries",
        href: "/platform-console/deliveries",
        icon: Truck,
        roles: [
          "super_admin",
          "ops_admin",
          "it_admin",
          "support_viewer",
          "read_only",
        ],
      },
      {
        title: "Products",
        href: "/platform-console/products",
        icon: Package,
        roles: [
          "super_admin",
          "ops_admin",
          "it_admin",
          "support_viewer",
          "read_only",
        ],
      },
      {
        title: "Billing",
        href: "/platform-console/billing",
        icon: CreditCard,
        roles: ["super_admin", "ops_admin", "finance_viewer", "read_only"],
      },
      {
        title: "Usage & Capacity",
        href: "/platform-console/usage",
        icon: Gauge,
        roles: [
          "super_admin",
          "ops_admin",
          "it_admin",
          "finance_viewer",
          "support_viewer",
          "read_only",
        ],
      },
      {
        title: "Reports",
        href: "/platform-console/reports",
        icon: Banknote,
        roles: ["super_admin", "ops_admin", "finance_viewer", "read_only"],
      },
      {
        title: "Plans",
        href: "/platform-console/subscription-plans",
        icon: FileStack,
        roles: [
          "super_admin",
          "ops_admin",
          "finance_viewer",
          "support_viewer",
          "read_only",
        ],
      },
      {
        title: "Add On Packages",
        href: "/platform-console/add-on-products",
        icon: Package,
        roles: [
          "super_admin",
          "ops_admin",
          "finance_viewer",
          "support_viewer",
          "read_only",
        ],
      },
      {
        title: "Settings",
        href: "/platform-console/settings",
        icon: Settings2,
        roles: ["super_admin", "ops_admin", "it_admin"],
      },
    ],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  items: readonly NavItem[];
}>;

function NavIcon({
  icon: Icon,
  active,
}: {
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
        active
          ? "bg-sky-500 text-slate-950"
          : "bg-white/5 text-slate-300 group-hover:bg-white/10 group-hover:text-white"
      }`}
    >
      <Icon
        aria-hidden="true"
        className="h-[18px] w-[18px]"
        strokeWidth={1.9}
      />
    </span>
  );
}

export function PlatformConsoleSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = getStoredSession();
  const role = session?.user.role || "read_only";
  const visibleNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        (item.roles as readonly string[]).includes(role),
      ),
    }))
    .filter((section) => section.items.length > 0);
  const userName = (session?.user.fullName || "ZayOS Operator").replace(
    /zayos/gi,
    "ZayOS",
  );
  const roleLabel =
    role === "super_admin"
      ? "Super Admin"
      : role === "ops_admin"
        ? "Operations Admin"
        : role === "it_admin"
          ? "IT Admin"
          : role === "finance_viewer"
            ? "Finance Viewer"
            : role === "support_viewer"
              ? "Support Viewer"
              : "Read-Only Viewer";
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/10 bg-[#07101d] text-slate-100"
    >
      <SidebarHeader className="border-b border-white/10 bg-[#07101d] px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950/60 ring-1 ring-white/10">
                <img
                  src="/zayos-mark-light.png"
                  alt=""
                  className="h-8 w-8 object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  ZayOS
                </p>
                <p className="truncate text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  Platform Console
                </p>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="bg-[#07101d] px-2">
        {visibleNavigation.map((section) => (
          <SidebarGroup key={section.title} className="py-2">
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {section.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {section.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="group relative h-11 rounded-2xl text-slate-300 transition-all hover:bg-white/10 hover:text-white data-[active=true]:bg-sky-500/15 data-[active=true]:font-semibold data-[active=true]:text-white"
                      >
                        <Link
                          href={item.href}
                          className="flex items-center gap-3"
                        >
                          <NavIcon icon={item.icon} active={active} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/10 bg-[#07101d] p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:bg-white/10">
              <Avatar className="h-9 w-9 rounded-xl">
                <AvatarImage alt={userName} />
                <AvatarFallback className="rounded-xl bg-slate-800 text-slate-100">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {userName}
                </p>
                <p className="truncate text-xs text-slate-400">{roleLabel}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem>
              <Shield className="mr-2 h-4 w-4" />
              Console profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Bell className="mr-2 h-4 w-4" />
              Notification preferences
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
