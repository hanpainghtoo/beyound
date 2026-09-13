import Link from "next/link";
import type { CSSProperties } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import {
  ArrowRight,
  ArrowUp,
  BellRing,
  CreditCard,
  Headset,
  MessageSquareReply,
  PackageCheck,
  Repeat2,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  UsersRound,
} from "lucide-react";

import { MarketingHeader } from "./marketing-header";
import { Button } from "@/components/ui/button";

// Design tokens pulled from Figma node 674-25 ("KME Solutions — Landing Page").
const tokens = {
  cta: "#5E4BCE",
  accentPink: "#FB2C53",
  accentGreen: "#158663",
  cardStroke: "#816EF7",
  cardStrokeDivider: "rgba(129, 110, 247, 0.4)",
  heading: "#000000",
  body: "rgba(0, 0, 0, 0.7)",
  white: "#FFFFFF",
  heroGradient:
    "linear-gradient(219deg, rgba(228,241,252,1) 6%, rgba(221,226,252,1) 52%, rgba(236,238,254,1) 75%, rgba(243,245,253,1) 98%)",
  sectionGradient:
    "linear-gradient(180deg, rgba(228,241,252,0.3) 0%, rgba(221,226,252,0.3) 100%)",
  footerNav: "#0B1120",
};

// fontSize values are clamp(min, preferred, max) strings so text scales
// smoothly between mobile and desktop instead of being fixed at desktop
// sizes on small screens (inline styles would otherwise override the
// responsive Tailwind classes).
const type = {
  // hHero deliberately has no fontSize: the h1 uses Tailwind's
  // text-3xl sm:text-4xl lg:text-5xl for responsive sizing.
  hHero: {
    fontWeight: 700,
    lineHeight: 1.15,
  },
  hSection: {
    fontWeight: 700,
    fontSize: "clamp(24px, 3.2vw, 32px)",
    textAlign: "center" as const,
  },
  hCard: {
    fontWeight: 700,
    fontSize: "clamp(18px, 2.4vw, 20px)",
    lineHeight: 1.25,
    textAlign: "left" as const,
  },
  subLabel: {
    fontWeight: 700,
    fontSize: "clamp(12px, 1.7vw, 14px)",
    lineHeight: 1.2,
    textAlign: "left" as const,
  },
  featureLabel: {
    fontWeight: 600,
    fontSize: "clamp(12px, 1.7vw, 14px)",
    lineHeight: 1.2,
    textAlign: "center" as const,
  },
  flowLabel: {
    fontWeight: 700,
    fontSize: "clamp(11px, 1.5vw, 12px)",
    lineHeight: 1.15,
    textAlign: "center" as const,
  },
  bodyLarge: {
    fontWeight: 500,
    fontSize: "clamp(16px, 2.3vw, 20px)",
    lineHeight: 1.6,
  },
  body: {
    fontWeight: 500,
    fontSize: "clamp(13px, 1.7vw, 15px)",
    lineHeight: 1.35,
  },
  cta: { fontWeight: 400, fontSize: "clamp(16px, 2.2vw, 20px)" },
};

const flowSteps = [
  {
    label: "Conversation",
    detail: "Bring every message together",
    src: "/figma/flow-conversation.svg",
  },
  {
    label: "Order",
    detail: "Turn chats into orders",
    src: "/figma/flow-order.svg",
  },
  {
    label: "Delivery",
    detail: "Keep progress visible",
    src: "/figma/flow-delivery.svg",
  },
  {
    label: "Customer",
    detail: "Build customer context",
    src: "/figma/flow-customer.svg",
  },
  {
    label: "Report",
    detail: "See what moves sales",
    src: "/figma/flow-report.svg",
  },
] as const;

type PainItem = {
  label: string;
  src: string;
};

const struggleItems: PainItem[] = [
  {
    label: "Messages are split\nacross channels",
    src: "/figma/workflow-messages.svg",
  },
  {
    label: "Orders are still handled manually",
    src: "/figma/workflow-orders.svg",
  },
  {
    label: "Missed Follow-Ups",
    src: "/figma/workflow-followups.svg",
  },
  {
    label: "Business Insights Are Missing",
    src: "/figma/workflow-insights.svg",
  },
];

const heroChannels: Array<{ label: string; src?: string; headset?: boolean }> =
  [
    { label: "Facebook", src: "/brand/facebook.svg" },
    { label: "Messenger", src: "/brand/messenger.svg" },
    { label: "Viber", src: "/brand/viber.svg" },
    { label: "Telegram", src: "/brand/telegram.svg" },
    { label: "TikTok", src: "/brand/tiktok.svg" },
    { label: "Website Chat", headset: true },
  ];

type IntegrationTickerItem = {
  id: string;
  label: string;
  detail: string;
  src?: string;
  headset?: boolean;
  dot: string;
  iconBackground: string;
};

const integrationTicker: IntegrationTickerItem[] = [
  {
    id: "1",
    label: "Telegram",
    detail: "Bot messages",
    src: "/brand/telegram.svg",
    dot: tokens.cta,
    iconBackground: "#E8F6FD",
  },
  {
    id: "2",
    label: "TikTok",
    detail: "Lead messages",
    src: "/brand/tiktok.svg",
    dot: tokens.cta,
    iconBackground: "#F1F5F9",
  },
  {
    id: "3",
    label: "Website Chat",
    detail: "Site widget",
    headset: true,
    dot: tokens.cta,
    iconBackground: "#F0EEFF",
  },
  {
    id: "4",
    label: "Facebook",
    detail: "Page inbox",
    src: "/brand/facebook.svg",
    dot: tokens.cta,
    iconBackground: "#EAF3FF",
  },
  {
    id: "5",
    label: "Messenger",
    detail: "Direct chat",
    src: "/brand/messenger.svg",
    dot: tokens.cta,
    iconBackground: "#EAF1FF",
  },
  {
    id: "6",
    label: "Viber",
    detail: "Business chat",
    src: "/brand/viber.svg",
    dot: tokens.cta,
    iconBackground: "#F0EEFF",
  },
  {
    id: "7",
    label: "Telegram",
    detail: "Bot messages",
    src: "/brand/telegram.svg",
    dot: tokens.cta,
    iconBackground: "#E8F6FD",
  },
  {
    id: "8",
    label: "TikTok",
    detail: "Lead messages",
    src: "/brand/tiktok.svg",
    dot: tokens.cta,
    iconBackground: "#F1F5F9",
  },
  {
    id: "9",
    label: "Website Chat",
    detail: "Site widget",
    headset: true,
    dot: tokens.cta,
    iconBackground: "#F0EEFF",
  },
  {
    id: "10",
    label: "Facebook",
    detail: "Page inbox",
    src: "/brand/facebook.svg",
    dot: tokens.cta,
    iconBackground: "#EAF3FF",
  },
  {
    id: "11",
    label: "Messenger",
    detail: "Direct chat",
    src: "/brand/messenger.svg",
    dot: tokens.cta,
    iconBackground: "#EAF1FF",
  },
  {
    id: "12",
    label: "Viber",
    detail: "Business chat",
    src: "/brand/viber.svg",
    dot: tokens.cta,
    iconBackground: "#F0EEFF",
  },
];

function TickerItem({ item }: { item: IntegrationTickerItem }) {
  return (
    <li className="flex min-h-[64px] min-w-[190px] shrink-0 items-center gap-3 rounded-full border border-slate-100 bg-white px-4 py-2 shadow-md shadow-slate-100/80">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: item.iconBackground }}
      >
        {item.headset ? (
          <Headset className="h-4 w-4" style={{ color: item.dot }} />
        ) : (
          <img src={item.src} alt="" className="h-6 w-6 object-contain" />
        )}
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-xs font-bold leading-4 text-slate-900">
          {item.label}
        </span>
        <span className="block truncate text-[10px] leading-4 text-slate-400">
          {item.detail}
        </span>
      </span>
      <span
        className="ml-auto h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: item.dot }}
        aria-hidden="true"
      />
    </li>
  );
}

type SalesCycleStep = {
  title: string;
  detail: string;
  icon: typeof MessageSquareReply;
  width: number;
  borderColor: string;
  backgroundColor: string;
  accentBackground: string;
  accentColor: string;
};

const salesCycleSteps: SalesCycleStep[] = [
  {
    title: "Unified Inbox",
    detail: "Bring every message into one place.",
    icon: MessageSquareReply,
    width: 151,
    borderColor: "rgba(129, 110, 247, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "#F3F1FF",
    accentColor: tokens.cta,
  },
  {
    title: "Product Reply",
    detail: "Share the right product quickly.",
    icon: Store,
    width: 135,
    borderColor: "rgba(0, 105, 168, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(0, 105, 168, 0.12)",
    accentColor: "#0069A8",
  },
  {
    title: "Create Order",
    detail: "Turn the chat into a confirmed order.",
    icon: PackageCheck,
    width: 139,
    borderColor: "rgba(189, 84, 9, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(189, 84, 9, 0.15)",
    accentColor: "#BD5409",
  },
  {
    title: "Payment",
    detail: "Track payment status clearly.",
    icon: CreditCard,
    width: 123,
    borderColor: "rgba(28, 49, 116, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "#EEF2FF",
    accentColor: "#1C3174",
  },
  {
    title: "Delivery",
    detail: "Keep delivery progress visible.",
    icon: Truck,
    width: 150,
    borderColor: "rgba(21, 134, 99, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(21, 134, 99, 0.15)",
    accentColor: "#158663",
  },
  {
    title: "Customer Update",
    detail: "Send updates without switching tools.",
    icon: BellRing,
    width: 155,
    borderColor: "rgba(237, 59, 107, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(201, 10, 62, 0.15)",
    accentColor: "#C90A3E",
  },
  {
    title: "Repeat Sale",
    detail: "Use customer history to sell again.",
    icon: Repeat2,
    width: 145,
    borderColor: "rgba(166, 2, 120, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(166, 2, 120, 0.15)",
    accentColor: "#A60278",
  },
];

function HeroConversationalFlow() {
  const renderWorkflowCard = (step: SalesCycleStep) => {
    const Icon = step.icon;

    return (
      <div
        key={step.title}
        className="flex min-w-0 flex-col rounded-[10px] border p-3 shadow-none lg:min-h-[72px] lg:w-[var(--workflow-card-width)] lg:shrink-0 lg:gap-[10px] lg:p-[12px] lg:shadow-[0_2px_2px_rgba(0,0,0,0.25)]"
        style={
          {
            "--workflow-card-width": `${step.width}px`,
            borderColor: step.borderColor,
            backgroundColor: step.backgroundColor,
          } as CSSProperties
        }
      >
        <div className="flex min-w-0 items-center gap-1 lg:h-5">
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: step.accentBackground,
              color: step.accentColor,
            }}
          >
            <Icon className="h-[14px] w-[14px]" />
          </span>
          <span className="text-[12px] font-bold leading-[15px] text-black">
            {step.title}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] font-medium leading-[12px] text-[rgba(0,0,0,0.6)] lg:mt-0">
          {step.detail}
        </p>
      </div>
    );
  };

  return (
    <div className="relative w-full overflow-hidden rounded-[25px] border-0 bg-[#FCFCFF] p-5 shadow-[0_4px_4px_rgba(0,0,0,0.25)] sm:p-6 lg:w-[705px] lg:p-8">
      <div
        className="pointer-events-none absolute left-[117px] top-[-140px] z-0 h-[281px] w-[341px] rounded-full bg-[#EAE8FF] blur-[50px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-[577px] top-[478px] z-0 h-[281px] w-[341px] rotate-[89.52deg] rounded-full bg-[rgba(234,232,255,0.8)] blur-[50px]"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col">
        <p className="text-[14px] font-bold leading-[17px] text-[#5E4BCE]">
          Conversational Commerce Flow
        </p>
        <h3 className="mt-2 text-[22px] font-bold leading-[28px] text-black sm:text-[24px] sm:leading-[29px]">
          Every sales step, connected in one cycle
        </h3>

        {/* Responsive Badge */}
        <div className="mt-3 flex">
          <span className="inline-flex max-w-full items-center justify-center rounded-full border border-[#5E4BCE] bg-white px-4 py-1.5 text-center text-[12px] font-bold leading-normal text-[#5E4BCE] shadow-[0_2px_4px_rgba(0,0,0,0.25)]">
            Messages to repeat sales
          </span>
        </div>

        {/* Connected Chat Channels */}
        <div className="relative mt-5 rounded-[25px] border border-[rgba(0,0,0,0.25)] bg-white p-4 sm:p-5">
          <div className="flex flex-col">
            <p className="text-[14px] font-bold leading-[17px] text-black">
              Connected Chat Channels
            </p>
            <p className="mt-2 text-[12px] font-bold leading-[16px] text-[rgba(0,0,0,0.6)]">
              Bring every customer conversation into one unified workflow; from
              chat to delivery.
            </p>
            <div
              className="mt-4 flex w-full flex-wrap items-center justify-center gap-2 sm:justify-start lg:flex-nowrap lg:gap-[10px]"
              aria-label="Connected chat channels"
            >
              {heroChannels.map((channel, index) => (
                <span
                  key={channel.label}
                  className="flex shrink-0 items-center gap-2 lg:gap-[10px]"
                >
                  <span
                    role="img"
                    aria-label={channel.label}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F1FF] sm:h-12 sm:w-12 lg:h-[60px] lg:w-[60px]"
                  >
                    {channel.headset ? (
                      <Headset
                        className="h-5 w-5 sm:h-7 sm:w-7 lg:h-10 lg:w-10"
                        style={{ color: tokens.cta }}
                      />
                    ) : (
                      <img
                        src={channel.src}
                        alt=""
                        className="h-6 w-6 object-contain sm:h-8 sm:w-8 lg:h-10 lg:w-10"
                      />
                    )}
                  </span>
                  {index < heroChannels.length - 1 ? (
                    <ArrowUp
                      className="h-4 w-4 shrink-0 rotate-90 text-[rgba(0,0,0,0.25)] sm:h-5 sm:w-5 lg:h-6 lg:w-6"
                      aria-hidden="true"
                    />
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Sales Workflow */}
        <div className="relative mt-5 rounded-[25px] border border-[rgba(0,0,0,0.25)] bg-white p-8 sm:p-5">
          <div className="flex flex-col">
            <p className="text-[14px] font-bold leading-[17px] text-black">
              Sales Workflow
            </p>
            <p className="mt-2 text-[12px] font-bold leading-[16px] text-[rgba(0,0,0,0.6)]">
              One clear workflow for your team, from first conversation to
              repeat purchase.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:flex lg:flex-wrap lg:gap-[12px]">
              {salesCycleSteps.slice(0, 4).map(renderWorkflowCard)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-[14px]">
              {salesCycleSteps.slice(4).map(renderWorkflowCard)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const chatBusinessCases = [
  {
    title: "Online Shops",
    detail: "Respond faster and reduce missed orders.",
    icon: ShoppingBag,
    color: "#5E4BCE",
    background: "#F0EEFF",
  },
  {
    title: "Growing Sales Teams",
    detail: "Assign ownership and track follow-up clearly.",
    icon: UsersRound,
    color: "#0069A8",
    background: "#EAF6FF",
  },
  {
    title: "Retail & Distribution",
    detail: "Organize orders, products, payments, and delivery.",
    icon: Store,
    color: "#158663",
    background: "#E8F8F1",
  },
  {
    title: "Local Brands",
    detail: "Deliver professional customer service without heavy ERP software.",
    icon: Sparkles,
    color: "#A60278",
    background: "#FCEAF7",
  },
] as const;

function BuiltForChatComponent() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-[70px] sm:px-8 lg:px-0">
      <CenterSectionHeader
        title="Built for businesses that sell through chat"
        description="Give your team the structure to respond, sell, and follow up wherever customers start the conversation."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {chatBusinessCases.map(
          ({ title, detail, icon: Icon, color, background }) => (
            <article
              key={title}
              className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition-transform hover:-translate-y-1"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ color, backgroundColor: background }}
              >
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-[18px] font-bold text-slate-950">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
              <span
                className="mt-5 inline-flex items-center gap-1 text-xs font-bold"
                style={{ color }}
              >
                Built for your workflow <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </article>
          ),
        )}
      </div>
    </div>
  );
}

function DemoCtaComponent() {
  return (
    <div className="relative overflow-hidden bg-[#5E4BCE] px-5 py-16 text-white sm:px-8 sm:py-20">
      <div
        className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full border-[42px] border-white/10"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 left-[-5rem] h-80 w-80 rounded-full border-[42px] border-white/10"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-[1080px] flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/75">
            Ready to simplify your sales operation?
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            Turn every chat into a better way to sell.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/80">
            See how ZayOS helps online businesses connect conversations, orders,
            deliveries, and customer history.
          </p>
        </div>
        <Button
          asChild
          className="h-auto shrink-0 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-[#5E4BCE] shadow-lg shadow-[#392a99]/25 hover:bg-white/90"
        >
          <Link href="/trial" className="gap-2">
            7 Days Free Trial <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

const footerColumns = [
  {
    title: "Product",
    links: [
      ["Workspace", "/"],
      ["Modules", "/product"],
      ["Resources", "/resources"],
    ],
  },
  {
    title: "Use Cases",
    links: [
      ["Online Shops", "/use-cases"],
      ["Sales Teams", "/use-cases"],
      ["Retail & Distribution", "/use-cases"],
    ],
  },
  {
    title: "Company",
    links: [
      ["Contact", "/contact"],
      ["Pricing", "/pricing"],
      ["Sign In", "/login"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy Policy", "/privacy-policy"],
      ["Terms of Service", "/terms-of-service"],
      ["Data Deletion", "/data-deletion"],
    ],
  },
] as const;

function LandingFooterComponent() {
  return (
    <footer className="bg-[#0B1120] px-5 py-12 text-white sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1320px]">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5E4BCE] text-sm font-bold">
                Z
              </span>
              <span className="text-2xl font-bold">ZayOS</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-7 text-slate-400">
              Manage conversations, orders, deliveries, products, customers, and
              reports in one operating workspace.
            </p>
          </div>
          {footerColumns.map(({ title, links }) => (
            <div key={title}>
              <h2 className="text-sm font-bold text-white">{title}</h2>
              <nav className="mt-4 space-y-3" aria-label={`${title} links`}>
                {links.map(([label, href]) => (
                  <Link
                    key={label}
                    href={href}
                    className="block text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} ZayOS. All rights reserved.</span>
          <span>Commerce operations, connected.</span>
        </div>
      </div>
    </footer>
  );
}

function CenterSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1132px] text-center">
      <h2 style={{ ...type.hSection, color: tokens.heading }} className="m-0">
        {title}
      </h2>
      {description ? (
        <p style={{ ...type.bodyLarge, color: tokens.body }} className="mt-6">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function MarketingLandingFigma() {
  return (
    <div className="w-full bg-white text-black antialiased">
      <MarketingHeader primaryCtaTone="brand" />

      {/* Hero section */}
      <section
        className="overflow-x-clip pb-6"
        style={{ background: tokens.heroGradient }}
      >
        {/* The row switch and the card's scaled sizing both activate at lg
            (1024px) so the hero layout never straddles two breakpoints. */}
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-8 px-4 pt-4 sm:px-6 sm:pt-6 lg:flex-row lg:gap-12 lg:px-8 lg:pt-8 pb-10 mb-8">
          <div className="w-full min-w-0 max-w-[800px] my-5 py-5">
            <h1
              style={{
                fontWeight: type.hHero.fontWeight,
                lineHeight: type.hHero.lineHeight,
                color: tokens.heading,
              }}
              className="m-0 text-3xl font-bold leading-[1.15] text-slate-950 sm:text-4xl lg:text-5xl"
            >
              Manage Online Sales from{" "}
              <span className="text-[#5E4BCE]">Chat to Delivery</span>
            </h1>
            <p
              style={{ ...type.bodyLarge }}
              className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:mt-8 sm:text-lg lg:text-xl"
            >
              Turn chats into organized Orders, Payment, Deliveries &amp;
              Customer history.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-center">
              <Button
                asChild
                variant="outline"
                className="h-auto w-full rounded-xl border border-[#5E4BCE] bg-white px-7 py-3.5 text-base font-semibold text-[#5E4BCE] transition-all hover:bg-[#F3F1FF] hover:-translate-y-0.5 sm:w-auto"
              >
                <Link href="/contact?intent=demo" className="gap-2">
                  Product Demo
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>

              <div className="w-full max-w-[400px] shrink-0 sm:w-[260px] sm:max-w-none">
                <DotLottieReact
                  src="/animations/7days_animation.json"
                  loop
                  autoplay
                  style={{
                    width: "100%",
                    height: "100%",
                    aspectRatio: "640 / 200",
                  }}
                />
              </div>
            </div>
          </div>

          <div
            className="w-full min-w-0 max-w-xl lg:h-[calc(700px*var(--hero-card-scale))] lg:w-[605px] lg:max-w-[605px] lg:shrink-0"
            style={
              {
                "--hero-card-scale":
                  "clamp(0.76, calc((100vh - 202px) / 731px), 0.858)",
              } as CSSProperties
            }
          >
            <div className="lg:origin-top-left lg:scale-[var(--hero-card-scale)]">
              <HeroConversationalFlow />
            </div>
          </div>
        </div>

        {/* NOTE: This is an infinite marquee ticker. The duplicated list
            creates a seamless loop, and it pauses on hover. If the ticker
            looks static during testing, first check your OS/browser "reduce
            motion" setting before assuming this is a bug. */}
        {/* Integration Ticker Section */}
        <div className="group relative w-full overflow-hidden py-2">
          {/* Left & Right Gradient Fades */}
          <span
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#f3f5fd] to-transparent sm:w-24 lg:w-32"
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#dfe6fc] to-transparent sm:w-24 lg:w-32"
            aria-hidden="true"
          />

          {/* Infinite Marquee Track */}
          <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
            {/* First List */}
            <ul
              className="flex shrink-0 items-center gap-4 py-4 pr-4"
              aria-label="Connected sales channels"
            >
              {integrationTicker.map((item) => (
                <TickerItem key={item.id} item={item} />
              ))}
            </ul>

            {/* Duplicate List for Seamless Infinite Loop */}
            <ul
              className="flex shrink-0 items-center gap-4 py-4 pr-4"
              aria-hidden="true"
            >
              {integrationTicker.map((item) => (
                <TickerItem key={`${item.id}-dup`} item={item} />
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Workflow section */}
      <section
        className="min-h-[843px]"
        style={{ background: tokens.sectionGradient }}
      >
        <div className="mx-auto max-w-[1320px] px-5 pb-[70px] pt-[70px] sm:px-8 lg:px-0">
          <div className="flex flex-col items-center">
            <h2
              style={{ ...type.hSection, color: tokens.heading }}
              className="m-0 max-w-[1132px]"
            >
              Turn Every Customer Conversation into a Complete Workflow
            </h2>
            <p
              style={{ ...type.bodyLarge, color: tokens.body }}
              className="mt-6 max-w-[1132px] whitespace-pre-line text-center"
            >
              With ZAYOS, every customer conversation flows into a complete
              workflow;{"\n"}
              from orders and payments to deliveries and customer history—all in
              one workspace.
            </p>

            <div className="mt-4 grid w-full grid-cols-1 items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
              <div className="flex h-full flex-col rounded-3xl border border-rose-200 bg-gradient-to-b from-rose-50/40 to-slate-50/50 p-6 shadow-sm sm:p-8">
                <p className="w-fit rounded-full bg-rose-100/80 px-3 py-1 text-xs font-bold leading-tight text-rose-700">
                  What Teams Struggle With
                </p>
                <h3 className="mt-3 text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
                  More chat orders, more operational gaps.
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Daily work around orders, payments, and deliveries quickly
                  becomes hard to manage.
                </p>

                <div className="mt-5 grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:gap-4">
                  {struggleItems.map((item) => (
                    <div
                      key={item.label}
                      className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100/60 bg-white/80 p-4 text-center shadow-2xs"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100/70 text-rose-600">
                        <img src={item.src} alt="" className="h-7 w-7" />
                      </span>
                      <p className="whitespace-pre-line text-xs font-semibold leading-tight text-slate-900">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex h-full flex-col rounded-3xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 via-indigo-50/20 to-white p-6 shadow-sm sm:p-8">
                <p className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold leading-tight text-emerald-800">
                  What Changes with ZayOS
                </p>
                <h3 className="mt-3 text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
                  One Platform for Your Entire Operation.
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  More than chat inbox, turn customer conversations into
                  organized, trackable workflows your whole team can manage.
                </p>

                <div className="mt-5 grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
                  {flowSteps.map((step) => (
                    <div
                      key={step.label}
                      className="flex min-h-[108px] flex-col items-center justify-center rounded-2xl border border-emerald-100/80 bg-white/80 p-3 text-center shadow-2xs"
                    >
                      <img src={step.src} alt="" className="h-9 w-9 shrink-0" />
                      <span className="mt-2 text-xs font-bold leading-tight text-slate-900">
                        {step.label}
                      </span>
                      <span className="mt-1 text-[10px] leading-4 text-slate-500">
                        {step.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Built for businesses that sell through chat */}
      <section
        aria-label="Built for businesses that sell through chat"
        style={{ background: tokens.sectionGradient }}
      >
        <BuiltForChatComponent />
      </section>

      <section aria-label="Request a ZayOS demo">
        <DemoCtaComponent />
      </section>

      <section aria-label="ZayOS footer">
        <LandingFooterComponent />
      </section>
    </div>
  );
}
