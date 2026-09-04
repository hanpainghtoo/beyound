import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleCheck,
  Image,
  MessageSquareText,
  PackageCheck,
  Settings2,
  ShoppingBag,
  Truck,
  UserRound,
  Users,
  Headset,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  MarketingShell,
  MiniIconRow,
  ProductWorkspaceHero,
  SectionHeading,
  ServiceLogo,
  WebsiteChatIcon,
} from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Product",
  description:
    "Explore the ZayOS Commerce Workspace for conversations, orders, deliveries, products, customers, media, saved replies, and performance.",
};

const connectedChannels = [
  {
    label: "Facebook",
    description: "Page inbox",
    icon: <ServiceLogo src="/brand/facebook.svg" alt="Facebook logo" />,
  },
  {
    label: "Messenger",
    description: "Direct chat",
    icon: <ServiceLogo src="/brand/messenger.svg" alt="Messenger logo" />,
  },
  {
    label: "Viber",
    description: "Business chat",
    icon: <ServiceLogo src="/brand/viber.svg" alt="Viber logo" />,
  },
  {
    label: "Telegram",
    description: "Bot messages",
    icon: <ServiceLogo src="/brand/telegram.svg" alt="Telegram logo" />,
  },
  {
    label: "TikTok",
    description: "Lead messages",
    icon: <ServiceLogo src="/brand/tiktok.svg" alt="TikTok logo" />,
  },
  {
    label: "Website Chat",
    description: "Site widget",
    icon: <WebsiteChatIcon className="h-5 w-5" />,
  },
];

const struggleItems = [
  ["Messages are split across channels", "/figma/workflow-messages.svg"],
  ["Orders are still handled manually", "/figma/workflow-orders.svg"],
  ["Follow-ups are easy to miss", "/figma/workflow-followups.svg"],
  ["Business insights are missing", "/figma/workflow-insights.svg"],
] as const;

const workflowItems = [
  [
    "Conversation",
    "Bring every message together",
    "/figma/flow-conversation.svg",
  ],
  ["Order", "Turn chats into orders", "/figma/flow-order.svg"],
  ["Delivery", "Keep progress visible", "/figma/flow-delivery.svg"],
  ["Customer", "Build customer context", "/figma/flow-customer.svg"],
  ["Report", "See what moves sales", "/figma/flow-report.svg"],
] as const;

const modules = [
  {
    title: "Inbox",
    description: "Conversations across channels.",
    icon: MessageSquareText,
    accent: "bg-[#F0EEFF] text-[#5E4BCE]",
  },
  {
    title: "Orders",
    description: "Convert chat into confirmed sales.",
    icon: ShoppingBag,
    accent: "bg-[#FFF4E8] text-[#BD5409]",
  },
  {
    title: "Deliveries",
    description: "Track dispatch and handoff.",
    icon: Truck,
    accent: "bg-[#E8F8F1] text-[#158663]",
  },
  {
    title: "Customers",
    description: "History, tags, and context.",
    icon: UserRound,
    accent: "bg-[#EAF6FF] text-[#0069A8]",
  },
  {
    title: "Products",
    description: "Catalog ready for replies.",
    icon: PackageCheck,
    accent: "bg-[#FCEAF7] text-[#A60278]",
  },
  {
    title: "Media Library",
    description: "Photos, video, and files.",
    icon: Image,
    accent: "bg-[#FFF0F2] text-[#C90A3E]",
  },
  {
    title: "Reports",
    description: "Sales, delivery, and payment visibility.",
    icon: BarChart3,
    accent: "bg-[#EEF2FF] text-[#1C3174]",
  },
  {
    title: "Settings",
    description: "Workspace controls and setup.",
    icon: Settings2,
    accent: "bg-slate-100 text-slate-700",
  },
] as const;

const benefits = [
  [
    "Faster replies",
    "Give the team context and reusable answers in seconds.",
    MessageSquareText,
  ],
  [
    "Fewer mistakes",
    "Keep customers, products, and orders in one shared workflow.",
    CircleCheck,
  ],
  [
    "Better visibility",
    "See what needs attention without chasing updates across tools.",
    BarChart3,
  ],
  [
    "Organized teamwork",
    "Make ownership and the next step clear for everyone.",
    Users,
  ],
] as const;

function ScreenshotFrame({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.16)] ${className}`}
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-slate-200 bg-white px-3">
        <span className="h-2 w-2 rounded-full bg-[#FB2C53]/70" />
        <span className="h-2 w-2 rounded-full bg-[#F2C94C]/80" />
        <span className="h-2 w-2 rounded-full bg-[#158663]/70" />
        <span className="ml-2 h-2 w-24 rounded-full bg-slate-100" />
      </div>
      <img src={src} alt={alt} className="block h-auto w-full" />
    </div>
  );
}
type IntegrationTickerItem = {
  id: string;
  label: string;
  detail: string;
  src?: string;
  headset?: boolean;
  dot: string;
  iconBackground: string;
};
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
export default function ProductPage() {
  return (
    <MarketingShell
      footerVariant="compact"
      background="flat"
      primaryCtaTone="brand"
    >
      <section className="overflow-hidden bg-[linear-gradient(219deg,#E4F1FC_6%,#DDE2FC_52%,#ECEEFE_75%,#F3F5FD_98%)]">
        <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14 lg:px-0 lg:pt-20">
          <div className="max-w-[620px]">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#5E4BCE]">
              ZayOS Commerce Workspace
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.12] tracking-tight text-black sm:text-5xl lg:text-[58px]">
              One Workspace for
              <span className="block text-[#5E4BCE]">
                Conversational Commerce
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base font-medium leading-8 text-black/70 sm:text-lg">
              Manage chats, customers, products, orders, deliveries, media,
              replies, performance, settings, and notifications, all in one
              place.
            </p>
            <div className="mt-8">
              <Button
                asChild
                className="h-12 rounded-full bg-[#5E4BCE] px-6 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(94,75,206,0.28)] hover:bg-[#6a5acd]"
              >
                <Link href="/trial" className="gap-2">
                  7 Days Free Trial <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[720px] lg:mt-4">
            <div
              className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#816EF7]/15 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-[#38BDF8]/15 blur-3xl"
              aria-hidden="true"
            />
            <ProductWorkspaceHero />
          </div>
        </div>
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
        <div className="border-t border-white/70 bg-white/35 py-5">
          <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-0">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-black/50">
              Connected chat channels
            </p>
            <MiniIconRow
              items={connectedChannels}
              align="center"
              scrollOnMobile
            />
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,rgba(228,241,252,0.3),rgba(221,226,252,0.3))] py-16 sm:py-20">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-0">
          <SectionHeading
            align="center"
            title="Turn Every Customer Conversation into a Complete Workflow"
            description="With ZayOS, every conversation flows into a connected process—from orders and payments to deliveries and customer history, all in one workspace."
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-2 lg:gap-7">
            <div className="flex flex-col rounded-[28px] border border-rose-200 bg-gradient-to-b from-rose-50/75 to-white p-6 sm:p-8">
              <p className="w-fit rounded-full bg-rose-100 px-3 py-1 text-xs font-bold leading-tight text-rose-700">
                What Teams Struggle With
              </p>
              <h2 className="mt-4 text-2xl font-bold leading-tight text-slate-950">
                More chat orders, more operational gaps.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Daily work around messages, orders, and follow-ups quickly
                becomes difficult to manage.
              </p>
              <div className="mt-6 grid flex-1 auto-rows-fr grid-cols-2 gap-3">
                {struggleItems.map(([label, src]) => (
                  <div
                    key={label}
                    className="flex h-full min-h-[108px] flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-white/85 p-4 text-center shadow-sm"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100/80">
                      <img src={src} alt="" className="h-7 w-7" />
                    </span>
                    <p className="text-xs font-bold leading-5 text-slate-900">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col rounded-[28px] border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 via-indigo-50/30 to-white p-6 sm:p-8">
              <p className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold leading-tight text-emerald-800">
                What Changes with ZayOS
              </p>
              <h2 className="mt-4 text-2xl font-bold leading-tight text-slate-950">
                One Platform for Your Entire Operation.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                More than a chat inbox—turn conversations into organized,
                trackable workflows your team can manage.
              </p>
              <div className="mt-6 grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
                {workflowItems.map(([title, detail, src]) => (
                  <div
                    key={title}
                    className="flex min-h-[108px] flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-white/85 p-3 text-center shadow-sm"
                  >
                    <img src={src} alt="" className="h-9 w-9" />
                    <p className="mt-3 text-xs font-bold text-slate-900">
                      {title}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-0">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#5E4BCE]">
              Built for chat-led selling
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
              Keep the customer journey moving without switching tools.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              A shared workspace gives your team the context to answer well, act
              quickly, and follow every sale through delivery.
            </p>
            <ul className="mt-7 space-y-4">
              {[
                "Every channel enters one unified workflow",
                "Orders and deliveries stay visible to the team",
                "Customer history makes the next reply more useful",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm font-semibold text-slate-800"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#158663]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <ScreenshotFrame
            src="/figma/more-than-inbox-screenshot.png"
            alt="ZayOS unified inbox and conversation workflow"
          />
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#F8FAFF 0%,#F3F5FD 100%)] py-16 sm:py-20">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-0">
          <SectionHeading
            align="center"
            title="Everything your team needs to sell and serve"
            description="A connected set of modules for the work that happens before, during, and after every conversation."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(({ title, description, icon: Icon, accent }) => (
              <article
                key={title}
                className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(15,23,42,0.09)]"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-base font-bold text-slate-950">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#F3F5FD_0%,#FFFFFF_100%)] py-16 sm:py-20">
        <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-0">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#5E4BCE]">
              Built for businesses that sell through chat
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
              A polished customer experience without heavy ERP software.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              Whether you are running an online shop, growing a sales team, or
              coordinating retail and distribution, ZayOS keeps the work
              practical and connected.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                ["Online shops", "Respond faster and reduce missed orders."],
                [
                  "Growing sales teams",
                  "Assign ownership and keep follow-up clear.",
                ],
                [
                  "Retail & distribution",
                  "Organize orders, payments, and delivery.",
                ],
                ["Local brands", "Deliver service that feels professional."],
              ].map(([title, description]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-sm font-bold text-slate-950">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <ScreenshotFrame
            src="/figma/chat-businesses-screenshot.png"
            alt="ZayOS workflows for businesses selling through chat"
          />
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-0">
          <ScreenshotFrame
            src="/figma/workflow-screenshot.png"
            alt="ZayOS connected sales workflow"
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#5E4BCE]">
              Designed for real operations
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
              One clear workflow from first reply to repeat sale.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              ZayOS makes the next action obvious, so your team can spend less
              time coordinating and more time serving customers.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {benefits.map(([title, description, Icon]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <Icon className="h-5 w-5 text-[#5E4BCE]" />
                  <p className="mt-3 text-sm font-bold text-slate-950">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#5E4BCE] px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto flex max-w-[1080px] flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/75">
              Ready to simplify your sales operation?
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              Turn every chat into a better way to sell.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/80">
              See how ZayOS helps online businesses connect conversations,
              orders, deliveries, and customer history.
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
      </section>
    </MarketingShell>
  );
}
