import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BellRing,
  BookOpenText,
  CreditCard,
  FileCheck2,
  Headset,
  LineChart,
  MessageSquareReply,
  PackageCheck,
  ShoppingBag,
  Repeat2,
  Sparkles,
  Store,
  Truck,
  UsersRound,
} from "lucide-react";

import { MarketingHeader } from "@/components/marketing-header";
import { Button } from "@/components/ui/button";
import { MarketingFooter } from "@/components/marketing-footer";
import { cn } from "@/lib/utils";
export { MarketingFaqAccordion } from "@/components/marketing-faq-accordion";

export const marketingPrimaryButtonClass =
  "h-12 rounded-2xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(79,70,229,0.22)] hover:bg-indigo-700 active:bg-indigo-800 focus-visible:ring-indigo-300 disabled:bg-indigo-300 disabled:text-white";

export const marketingSecondaryButtonClass =
  "h-12 rounded-2xl border border-indigo-200 bg-white px-6 text-sm font-semibold text-indigo-700 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 active:bg-indigo-100 focus-visible:ring-indigo-200 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400";

export const marketingFinalCtaSecondaryButtonClass =
  "h-12 rounded-2xl border border-white/65 bg-white/12 px-6 text-sm font-semibold text-white shadow-sm hover:border-white hover:bg-white hover:text-indigo-700 active:bg-indigo-50 focus-visible:ring-white/60 disabled:border-white/20 disabled:bg-white/10 disabled:text-white/50";

export type FaqItem = {
  question: string;
  answer: ReactNode;
};

export type ChannelItem = {
  label: string;
  icon: ReactNode;
  description?: string;
};

export function MarketingShell({
  children,
  background = "gradient",
  // The header's primary CTA is shared with every other marketing page so the
  // nav bar is byte-for-byte identical everywhere. Page-specific copy such as
  // "7 Days Free Trial" belongs to the page's own hero button, not the header:
  // the header has a hard width budget (at a 1200px viewport the action group
  // gets 375px, and Sign In + CTA + language switcher already use 361px), and
  // the long label overflowed it and wrapped the switcher onto a second row.
  primaryCta = { labelKey: "navigation.tryItFree", href: "/trial" },
  primaryCtaTone = "indigo",
}: {
  children: ReactNode;
  /** Retained for call-site compatibility; both variants share one footer. */
  footerVariant?: "default" | "compact";
  background?: "gradient" | "flat";
  primaryCta?: {
    /** Translation key; preferred over `label`. */
    labelKey?: string;
    /** Raw English label; used only when `labelKey` is absent. */
    label?: string;
    href: string;
  };
  primaryCtaTone?: "indigo" | "brand";
}) {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden text-slate-950",
        background === "flat"
          ? "bg-[#FBFBFE]"
          : "bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.10),transparent_28%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_24%),linear-gradient(180deg,#f8faff_0%,#f5f7fc_44%,#f8faff_100%)]",
      )}
    >
      {background !== "flat" ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[34rem] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_42%)]" />
          <div className="pointer-events-none absolute left-[-6rem] top-40 z-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.08),transparent_72%)] blur-3xl" />
          <div className="pointer-events-none absolute right-[-6rem] top-80 z-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.07),transparent_72%)] blur-3xl" />
        </>
      ) : null}

      <MarketingHeader
        primaryCta={primaryCta}
        primaryCtaTone={primaryCtaTone}
      />

      <main className="relative z-10">{children}</main>

      <MarketingFooter />
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700 shadow-sm ring-1 ring-indigo-50">
      <Sparkles className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

export function SectionHeading({
  label,
  title,
  description,
  align = "left",
}: {
  label?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}
    >
      {label ? (
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
          {label}
        </p>
      ) : null}
      <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-7 text-slate-600">{description}</p>
      ) : null}
    </div>
  );
}

export function GradientPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-100">
      {children}
    </span>
  );
}

export function MarketingFinalCta({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  variant = "indigo",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  primaryAction: { label: string; href: string };
  secondaryAction: { label: string; href: string };
  variant?: "indigo" | "brand";
}) {
  const isBrand = variant === "brand";
  return (
    <div
      className={cn(
        "rounded-[28px] px-6 py-8 text-white sm:px-8 sm:py-10 md:flex md:items-center md:justify-between md:gap-8",
        isBrand
          ? "bg-[#5E4BCE] shadow-[0_24px_70px_rgba(129,110,247,0.30)]"
          : "bg-indigo-600 shadow-[0_24px_70px_rgba(79,70,229,0.28)]",
      )}
    >
      <div className="max-w-2xl">
        <p
          className={cn(
            "text-sm font-semibold uppercase tracking-[0.18em]",
            isBrand ? "text-white/80" : "text-indigo-100",
          )}
        >
          {eyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-extrabold">{title}</h2>
        {description ? (
          <p
            className={cn(
              "mt-3 text-sm leading-7",
              isBrand ? "text-white/85" : "text-indigo-100",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      <div className="mt-6 flex flex-wrap gap-3 md:mt-0 md:justify-end">
        <Button
          asChild
          className={cn(
            "h-12 rounded-2xl bg-white px-6 font-semibold hover:bg-white/95 focus-visible:ring-white/60",
            isBrand
              ? "text-[#5E4BCE] active:bg-white/80"
              : "text-indigo-700 active:bg-indigo-50",
          )}
        >
          <Link href={primaryAction.href}>{primaryAction.label}</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className={marketingFinalCtaSecondaryButtonClass}
        >
          <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
        </Button>
      </div>
    </div>
  );
}

export function DemoPanel() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.12)]">
      <div className="flex h-11 items-center gap-2 border-b border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-violet-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-indigo-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
      </div>
      <div className="grid min-h-[520px] grid-cols-[88px_minmax(0,1fr)] md:grid-cols-[192px_minmax(0,1fr)_320px]">
        <aside className="border-r border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fafbff_100%)] p-3">
          <div className="flex items-center gap-2 px-2 py-2">
            <img src="/zayos-mark-light.png" alt="" className="h-7 w-7" />
            <div className="hidden md:block">
              <p className="text-sm font-bold">ZayOS</p>
              <p className="text-[10px] text-slate-500">Workspace</p>
            </div>
          </div>
          <div className="mt-4 space-y-1">
            {[
              "Dashboard",
              "Inbox",
              "Orders",
              "Deliveries",
              "Products",
              "Customers",
              "Media Library",
              "Saved Replies",
              "Reports",
              "Notifications",
              "Settings",
            ].map((item, index) => (
              <div
                key={item}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-medium text-slate-600 transition",
                  index === 0 &&
                    "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    index === 0 ? "bg-indigo-600" : "bg-slate-300",
                  )}
                />
                <span className="hidden md:block">{item}</span>
              </div>
            ))}
          </div>
        </aside>
        <div className="min-w-0 border-r border-slate-200/80 bg-[linear-gradient(180deg,#fafbff_0%,#f3f6ff_100%)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-slate-950">Dashboard</p>
              <p className="text-xs text-slate-500">This Week</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-200" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["New Conversations", "128", "+18%"],
              ["Orders Created", "56", "+24%"],
              ["Deliveries", "42", "+16%"],
              ["Response Time", "28m", "-12%"],
            ].map(([label, value, delta]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm"
              >
                <p className="text-[11px] text-slate-500">{label}</p>
                <div className="mt-2 flex items-end gap-2">
                  <p className="text-2xl font-bold text-slate-950">{value}</p>
                  <span className="text-[11px] font-semibold text-emerald-600">
                    {delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-950">
                Sales Overview
              </p>
              <p className="text-xs text-slate-400">Mon - Sun</p>
            </div>
            <div className="flex h-44 items-end gap-2">
              {[34, 56, 62, 41, 69, 58, 82].map((height, index) => (
                <div
                  key={index}
                  className="flex-1 rounded-t-full bg-[linear-gradient(180deg,#93c5fd_0%,#4f46e5_100%)]"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
        <aside className="hidden bg-[linear-gradient(180deg,#ffffff_0%,#fafbff_100%)] p-4 lg:block">
          <p className="text-sm font-bold text-slate-950">Reply preview</p>
          <div className="mt-4 space-y-3">
            {["Nandar Hlaing", "Ko Hein", "Ei Phyu", "May Thu"].map(
              (name, index) => (
                <div
                  key={name}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm"
                >
                  <div
                    className={cn(
                      "h-9 w-9 rounded-full",
                      [
                        "bg-sky-200",
                        "bg-indigo-200",
                        "bg-rose-200",
                        "bg-amber-200",
                      ][index],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-950">
                      {name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      Team message preview
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    10:{24 + index} AM
                  </span>
                </div>
              ),
            )}
          </div>
          <div className="mt-4 rounded-2xl bg-indigo-50 p-4 ring-1 ring-indigo-100">
            <p className="text-sm font-semibold text-indigo-800">
              View all conversations
            </p>
            <p className="mt-1 text-xs leading-6 text-indigo-700/80">
              Track orders, customers, and delivery updates in one place.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

const heroChannels = [
  {
    label: "Facebook",
    icon: (
      <ServiceLogo
        src="/icons/channels/facebook.svg"
        alt="Facebook logo"
        className="h-6 w-6"
      />
    ),
  },
  {
    label: "Messenger",
    icon: (
      <ServiceLogo
        src="/icons/channels/messenger.svg"
        alt="Messenger logo"
        className="h-6 w-6"
      />
    ),
  },
  {
    label: "Viber",
    icon: (
      <ServiceLogo
        src="/icons/channels/viber.svg"
        alt="Viber logo"
        className="h-6 w-6"
      />
    ),
  },
  {
    label: "Telegram",
    icon: (
      <ServiceLogo
        src="/icons/channels/telegram.svg"
        alt="Telegram logo"
        className="h-6 w-6"
      />
    ),
  },
  {
    label: "TikTok",
    icon: (
      <ServiceLogo
        src="/icons/channels/tiktok.svg"
        alt="TikTok logo"
        className="h-6 w-6"
      />
    ),
  },
  { label: "Website Chat", icon: <WebsiteChatIcon className="h-5 w-5" /> },
];

const salesCycleSteps: Array<{
  title: string;
  detail: string;
  icon: LucideIcon;
  accent: string;
}> = [
  {
    title: "Unified Inbox",
    detail: "Bring every message into one place.",
    icon: MessageSquareReply,
    accent: "bg-indigo-50 text-indigo-700",
  },
  {
    title: "Product Reply",
    detail: "Share the right product quickly.",
    icon: Store,
    accent: "bg-sky-50 text-sky-700",
  },
  {
    title: "Create Order",
    detail: "Turn the chat into a confirmed order.",
    icon: PackageCheck,
    accent: "bg-amber-50 text-amber-700",
  },
  {
    title: "Payment",
    detail: "Track payment status clearly.",
    icon: CreditCard,
    accent: "bg-violet-50 text-violet-700",
  },
  {
    title: "Delivery",
    detail: "Keep delivery progress visible.",
    icon: Truck,
    accent: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "Customer Update",
    detail: "Send updates without switching tools.",
    icon: BellRing,
    accent: "bg-rose-50 text-rose-700",
  },
  {
    title: "Repeat Sale",
    detail: "Use customer history to sell again.",
    icon: Repeat2,
    accent: "bg-fuchsia-50 text-fuchsia-700",
  },
] as const;

export function HeroSalesFlow() {
  const topRowSteps = salesCycleSteps.slice(0, 4);
  const bottomRowSteps = salesCycleSteps.slice(4);

  return (
    <div className="relative overflow-hidden rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f7f8ff_100%)] p-4 shadow-[0_30px_100px_rgba(15,23,42,0.12)] sm:p-5 lg:p-7">
      <div className="absolute inset-x-10 top-0 h-24 rounded-b-[44px] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.17),transparent_72%)] sm:h-28" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
              Conversational Commerce Flow
            </p>
            <h3 className="mt-2 text-[22px] font-extrabold text-slate-950 sm:text-[32px]">
              Every sales step, connected in one cycle
            </h3>
          </div>
          <div className="rounded-full border border-indigo-100 bg-white px-3 py-2 text-[11px] font-semibold text-indigo-700 shadow-sm sm:px-4 sm:text-xs">
            Messages to repeat sales
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-indigo-100 bg-white/90 p-4 shadow-sm sm:mt-6 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Connected chat channels
            </p>
            <span className="hidden text-xs text-slate-400 sm:inline">
              Channel messages enter one workflow
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-2 xl:grid-cols-3">
            {heroChannels.map((channel, index) => (
              <div
                key={channel.label}
                className="relative flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-indigo-600 ring-1 ring-slate-100">
                  {channel.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {channel.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    Customer conversations arrive here
                  </p>
                </div>
                {index < heroChannels.length - 1 ? (
                  <span className="absolute -right-1 top-1/2 hidden -translate-y-1/2 xl:block">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-indigo-300 ring-1 ring-slate-200">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Sales workflow
            </p>
            <span className="hidden text-xs text-slate-400 lg:inline">
              Clear steps for the team from first reply to next purchase
            </span>
          </div>
          <div className="mt-4 hidden gap-4 lg:grid">
            <div className="grid gap-3 xl:grid-cols-4">
              {topRowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="relative">
                    <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fafbff_100%)] p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div
                          className={`inline-flex rounded-2xl p-3 ${step.accent}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-950">
                            {step.title}
                          </p>
                          <p className="mt-1 text-xs leading-6 text-slate-600">
                            {step.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                    {index < topRowSteps.length - 1 ? (
                      <div className="absolute -right-6 top-1/2 z-10 hidden -translate-y-1/2 xl:flex">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-indigo-300 shadow-sm ring-1 ring-slate-200">
                          <ArrowRight className="h-4.5 w-4.5" />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center">
              <div className="grid w-full max-w-[82%] gap-3 xl:grid-cols-3">
                {bottomRowSteps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.title} className="relative">
                      <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fafbff_100%)] p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div
                            className={`inline-flex rounded-2xl p-3 ${step.accent}`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-950">
                              {step.title}
                            </p>
                            <p className="mt-1 text-xs leading-6 text-slate-600">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      </div>
                      {index < bottomRowSteps.length - 1 ? (
                        <div className="absolute -right-6 top-1/2 z-10 hidden -translate-y-1/2 xl:flex">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-indigo-300 shadow-sm ring-1 ring-slate-200">
                            <ArrowRight className="h-4.5 w-4.5" />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-center">
              <div className="flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-xs font-semibold text-indigo-700">
                <Repeat2 className="h-3.5 w-3.5" />
                Repeat sales come from better visibility and customer history
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3 lg:hidden">
            {salesCycleSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title}>
                  <div className="rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fafbff_100%)] p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div
                        className={`inline-flex rounded-2xl p-3 ${step.accent}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-950">
                          {step.title}
                        </p>
                        <p className="mt-1 text-xs leading-6 text-slate-600">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                  {index < salesCycleSteps.length - 1 ? (
                    <div className="flex justify-center py-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-indigo-300 shadow-sm ring-1 ring-slate-200">
                        <ArrowDown className="h-4 w-4" />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResourcesHeroPreview() {
  const cards = [
    {
      label: "Guide",
      title: "Getting Started",
      detail:
        "Learn the workspace flow for conversations, orders, and deliveries.",
      icon: BookOpenText,
      accent: "bg-indigo-50 text-indigo-700",
    },
    {
      label: "Checklist",
      title: "Channel Setup",
      detail: "Configure channels, roles, and saved replies before go-live.",
      icon: FileCheck2,
      accent: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Playbook",
      title: "Daily Operations",
      detail:
        "Run follow-up, delivery updates, and reporting with clear handoffs.",
      icon: LineChart,
      accent: "bg-sky-50 text-sky-700",
    },
  ] as const;

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7f9ff_100%)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-6">
      <div className="absolute inset-x-10 top-0 h-24 rounded-b-[42px] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.16),transparent_70%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
              Resource Library
            </p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-950 sm:text-[30px]">
              Guides, checklists, and rollout playbooks
            </h3>
          </div>
          <div className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm sm:block">
            Learn → Configure → Operate
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {cards.map((card, index) => {
            const Icon = card.icon;

            return (
              <div
                key={card.title}
                className={cn(
                  "relative rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm",
                  index > 0 && "sm:ml-6",
                  index > 1 && "sm:ml-12",
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn("inline-flex rounded-2xl p-3", card.accent)}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {card.label}
                    </p>
                    <p className="mt-1 text-base font-bold text-slate-950">
                      {card.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {card.detail}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
          {[
            ["Learn", "Product and setup guides"],
            ["Configure", "Checklists for channels and teams"],
            ["Operate", "Playbooks for daily workflows"],
          ].map(([title, detail]) => (
            <div
              key={title}
              className="rounded-2xl bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-950">{title}</p>
              <p className="mt-1 text-xs leading-6 text-slate-600">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ProductWorkspaceHero is a Client Component (it consumes useI18n) but stays
// exported from here so existing imports keep working.
export { ProductWorkspaceHero } from "@/components/product-workspace-hero";

const useCaseScenarios = [
  {
    title: "Online Shops",
    detail: "Respond faster and reduce missed orders.",
    icon: ShoppingBag,
    stat: "Faster replies and fewer missed orders",
    accent: "bg-indigo-50 text-indigo-700",
  },
  {
    title: "Growing Sales Teams",
    detail: "Assign ownership and track follow-up clearly.",
    icon: UsersRound,
    stat: "Clear ownership for every conversation",
    accent: "bg-sky-50 text-sky-700",
  },
  {
    title: "Retail & Distribution",
    detail: "Organize orders, products, payments, and delivery.",
    icon: Store,
    stat: "Operations stay organized end to end",
    accent: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "Local Brands",
    detail: "Professional customer service without heavy ERP software.",
    icon: Sparkles,
    stat: "Lean setup with a polished customer experience",
    accent: "bg-violet-50 text-violet-700",
  },
] as const;

export function UseCasesHero() {
  return (
    <div className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8f9ff_100%)] p-5 shadow-[0_30px_100px_rgba(15,23,42,0.12)] sm:p-6 lg:p-7">
      <div className="absolute inset-x-10 top-0 h-28 rounded-b-[44px] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.16),transparent_72%)]" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
              Business Fit
            </p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-950 sm:text-[32px]">
              Built for the teams selling through chat
            </h3>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm">
            Audience and outcomes
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {useCaseScenarios.map((scenario) => {
            const Icon = scenario.icon;
            return (
              <div
                key={scenario.title}
                className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className={`inline-flex rounded-2xl p-3 ${scenario.accent}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-4 text-lg font-bold text-slate-950">
                  {scenario.title}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {scenario.detail}
                </p>
                {/* <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outcome</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{scenario.stat}</p>
                </div> */}
              </div>
            );
          })}
        </div>
        {/* 
        <div className="mt-5 rounded-[26px] border border-indigo-100 bg-[linear-gradient(90deg,#f8f9ff_0%,#ffffff_100%)] p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr] md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">What changes</p>
              <h4 className="mt-2 text-xl font-extrabold text-slate-950">From scattered chat selling to a repeatable sales operation</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Before", "Manual follow-up"],
                ["With ZayOS", "Structured workspace"],
                ["Outcome", "Faster repeat sales"],
              ].map(([title, text]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div> */}
      </div>
    </div>
  );
}

export function MiniIconRow({
  items,
  align = "left",
  scrollOnMobile = false,
}: {
  items: ChannelItem[];
  align?: "left" | "center";
  scrollOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-3",
        scrollOnMobile
          ? "-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          : "flex-wrap",
        align === "center"
          ? "justify-start sm:justify-center"
          : "justify-start",
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-h-[60px] min-w-[168px] shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50/40"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-indigo-600 ring-1 ring-slate-100">
            {item.icon}
          </span>
          <div className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">
              {item.label}
            </span>
            {item.description ? (
              <span className="block text-xs text-slate-500">
                {item.description}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ServiceLogo({
  src,
  alt,
  className = "h-5 w-5",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn("object-contain", className)}
      loading="lazy"
    />
  );
}

export function WebsiteChatIcon({
  className = "h-4.5 w-4.5",
}: {
  className?: string;
}) {
  return <Headset className={className} />;
}
