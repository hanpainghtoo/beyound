"use client";

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
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { HeroOrbit } from "@/components/hero-orbit";

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
    labelKey: "home.flowSteps.conversation.label",
    detailKey: "home.flowSteps.conversation.detail",
    src: "/figma/flow-conversation.svg",
  },
  {
    labelKey: "home.flowSteps.order.label",
    detailKey: "home.flowSteps.order.detail",
    src: "/figma/flow-order.svg",
  },
  {
    labelKey: "home.flowSteps.delivery.label",
    detailKey: "home.flowSteps.delivery.detail",
    src: "/figma/flow-delivery.svg",
  },
  {
    labelKey: "home.flowSteps.customer.label",
    detailKey: "home.flowSteps.customer.detail",
    src: "/figma/flow-customer.svg",
  },
  {
    labelKey: "home.flowSteps.report.label",
    detailKey: "home.flowSteps.report.detail",
    src: "/figma/flow-report.svg",
  },
] as const;

type PainItem = {
  labelKey: string;
  src: string;
};

const struggleItems: PainItem[] = [
  { labelKey: "home.struggles.messages", src: "/figma/workflow-messages.svg" },
  { labelKey: "home.struggles.orders", src: "/figma/workflow-orders.svg" },
  {
    labelKey: "home.struggles.followUps",
    src: "/figma/workflow-followups.svg",
  },
  { labelKey: "home.struggles.insights", src: "/figma/workflow-insights.svg" },
];

const heroChannels: Array<{
  label: string;
  labelKey?: string;
  src?: string;
  headset?: boolean;
}> = [
  { label: "Facebook", src: "/brand/facebook.svg" },
  { label: "Messenger", src: "/brand/messenger.svg" },
  { label: "Viber", src: "/brand/viber.svg" },
  { label: "Telegram", src: "/brand/telegram.svg" },
  { label: "TikTok", src: "/brand/tiktok.svg" },
  {
    label: "Website Chat",
    labelKey: "home.channels.websiteChat",
    headset: true,
  },
];

type IntegrationTickerItem = {
  id: string;
  /** Brand/channel name. Deliberately untranslated (Messenger, Telegram, ...). */
  label: string;
  /** i18n key for the non-brand channel name ("Website Chat"). */
  labelKey?: string;
  detailKey: string;
  src?: string;
  headset?: boolean;
  dot: string;
  iconBackground: string;
};

// Retained only for the commented-out integration ticker below. Deleting it
// would make restoring the ticker a rewrite rather than an uncomment.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const integrationTicker: IntegrationTickerItem[] = [
  {
    id: "1",
    label: "Telegram",
    detailKey: "product.channels.botMessages",
    src: "/brand/telegram.svg",
    dot: tokens.cta,
    iconBackground: "#E8F6FD",
  },
  {
    id: "2",
    label: "TikTok",
    detailKey: "product.channels.leadMessages",
    src: "/brand/tiktok.svg",
    dot: tokens.cta,
    iconBackground: "#F1F5F9",
  },
  {
    id: "3",
    label: "Website Chat",
    labelKey: "home.channels.websiteChat",
    detailKey: "product.channels.siteWidget",
    headset: true,
    dot: tokens.cta,
    iconBackground: "#F0EEFF",
  },
  {
    id: "4",
    label: "Facebook",
    detailKey: "product.channels.pageInbox",
    src: "/brand/facebook.svg",
    dot: tokens.cta,
    iconBackground: "#EAF3FF",
  },
  {
    id: "5",
    label: "Messenger",
    detailKey: "product.channels.directChat",
    src: "/brand/messenger.svg",
    dot: tokens.cta,
    iconBackground: "#EAF1FF",
  },
  {
    id: "6",
    label: "Viber",
    detailKey: "product.channels.businessChat",
    src: "/brand/viber.svg",
    dot: tokens.cta,
    iconBackground: "#F0EEFF",
  },
  {
    id: "7",
    label: "Telegram",
    detailKey: "product.channels.botMessages",
    src: "/brand/telegram.svg",
    dot: tokens.cta,
    iconBackground: "#E8F6FD",
  },
  {
    id: "8",
    label: "TikTok",
    detailKey: "product.channels.leadMessages",
    src: "/brand/tiktok.svg",
    dot: tokens.cta,
    iconBackground: "#F1F5F9",
  },
  {
    id: "9",
    label: "Website Chat",
    labelKey: "home.channels.websiteChat",
    detailKey: "product.channels.siteWidget",
    headset: true,
    dot: tokens.cta,
    iconBackground: "#F0EEFF",
  },
  {
    id: "10",
    label: "Facebook",
    detailKey: "product.channels.pageInbox",
    src: "/brand/facebook.svg",
    dot: tokens.cta,
    iconBackground: "#EAF3FF",
  },
  {
    id: "11",
    label: "Messenger",
    detailKey: "product.channels.directChat",
    src: "/brand/messenger.svg",
    dot: tokens.cta,
    iconBackground: "#EAF1FF",
  },
  {
    id: "12",
    label: "Viber",
    detailKey: "product.channels.businessChat",
    src: "/brand/viber.svg",
    dot: tokens.cta,
    iconBackground: "#F0EEFF",
  },
];

// Retained only for the commented-out integration ticker below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TickerItem({ item }: { item: IntegrationTickerItem }) {
  const { t } = useI18n();
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
          {item.labelKey ? t(item.labelKey) : item.label}
        </span>
        {/* line-clamp-2, not truncate: the ticker pill is a fixed-width chip, but
            the Burmese detail strings run far wider than their English source
            ("ဝယ်ယူနိုင်ခြေရှိသူ မက်ဆေ့ချ်များ" is ~207px in a 168px column), and
            truncation silently ate them. The pill's min-h still holds two lines. */}
        <span className="block line-clamp-2 text-[10px] leading-4 text-slate-400">
          {t(item.detailKey)}
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
  titleKey: string;
  detailKey: string;
  icon: typeof MessageSquareReply;
  width: number;
  borderColor: string;
  backgroundColor: string;
  accentBackground: string;
  accentColor: string;
};

// Retained only for the commented-out Sales Workflow block in
// HeroConversationalFlow.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const salesCycleSteps: SalesCycleStep[] = [
  {
    titleKey: "home.cycle.inbox.title",
    detailKey: "home.cycle.inbox.detail",
    icon: MessageSquareReply,
    width: 151,
    borderColor: "rgba(129, 110, 247, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "#F3F1FF",
    accentColor: tokens.cta,
  },
  {
    titleKey: "home.cycle.productReply.title",
    detailKey: "home.cycle.productReply.detail",
    icon: Store,
    width: 135,
    borderColor: "rgba(0, 105, 168, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(0, 105, 168, 0.12)",
    accentColor: "#0069A8",
  },
  {
    titleKey: "home.cycle.createOrder.title",
    detailKey: "home.cycle.createOrder.detail",
    icon: PackageCheck,
    width: 139,
    borderColor: "rgba(189, 84, 9, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(189, 84, 9, 0.15)",
    accentColor: "#BD5409",
  },
  {
    titleKey: "home.cycle.payment.title",
    detailKey: "home.cycle.payment.detail",
    icon: CreditCard,
    width: 123,
    borderColor: "rgba(28, 49, 116, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "#EEF2FF",
    accentColor: "#1C3174",
  },
  {
    titleKey: "home.cycle.delivery.title",
    detailKey: "home.cycle.delivery.detail",
    icon: Truck,
    width: 150,
    borderColor: "rgba(21, 134, 99, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(21, 134, 99, 0.15)",
    accentColor: "#158663",
  },
  {
    titleKey: "home.cycle.customerUpdate.title",
    detailKey: "home.cycle.customerUpdate.detail",
    icon: BellRing,
    width: 155,
    borderColor: "rgba(237, 59, 107, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(201, 10, 62, 0.15)",
    accentColor: "#C90A3E",
  },
  {
    titleKey: "home.cycle.repeatSale.title",
    detailKey: "home.cycle.repeatSale.detail",
    icon: Repeat2,
    width: 145,
    borderColor: "rgba(166, 2, 120, 0.5)",
    backgroundColor: "#FCFDFF",
    accentBackground: "rgba(166, 2, 120, 0.15)",
    accentColor: "#A60278",
  },
];

// This component is retained with the intentionally disabled workflow markup.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function HeroConversationalFlow() {
  const { t } = useI18n();
  // Retained only for the commented-out Sales Workflow block below.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const renderWorkflowCard = (step: SalesCycleStep) => {
    const Icon = step.icon;

    return (
      <div
        key={step.titleKey}
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
            {t(step.titleKey)}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] font-medium leading-[12px] text-[rgba(0,0,0,0.6)] lg:mt-0">
          {t(step.detailKey)}
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
      {/* Second decorative blur. Its top-[478px] placed it inside the Sales
          Workflow block; with that block gone it now sits in empty space at the
          bottom of the shorter card, so it is repositioned to the lower-left of
          the remaining content. Purely decorative and aria-hidden. */}
      <div
        className="pointer-events-none absolute left-[577px] top-[232px] z-0 h-[281px] w-[341px] rotate-[89.52deg] rounded-full bg-[rgba(234,232,255,0.8)] blur-[50px]"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col">
        <p className="text-[14px] font-bold leading-[17px] text-[#5E4BCE]">
          {t("home.flow.commerceFlowLabel")}
        </p>
        <h3 className="mt-2 text-[22px] font-bold leading-[28px] text-black sm:text-[24px] sm:leading-[29px]">
          {t("home.flow.cycleTitle")}
        </h3>

        {/* Responsive Badge */}
        <div className="mt-3 flex">
          <span className="inline-flex max-w-full items-center justify-center rounded-full border border-[#5E4BCE] bg-white px-4 py-1.5 text-center text-[12px] font-bold leading-normal text-[#5E4BCE] shadow-[0_2px_4px_rgba(0,0,0,0.25)]">
            {t("home.flow.cycleBadge")}
          </span>
        </div>

        {/* Connected Chat Channels */}
        <div className="relative mt-5 rounded-[25px] border border-[rgba(0,0,0,0.25)] bg-white p-4 sm:p-5">
          <div className="flex flex-col">
            <p className="text-[14px] font-bold leading-[17px] text-black">
              {t("home.flow.channelsTitle")}
            </p>
            <p className="mt-2 text-[12px] font-bold leading-[16px] text-[rgba(0,0,0,0.6)]">
              {t("home.flow.channelsBody")}
            </p>
            <div
              className="mt-4 flex w-full flex-wrap items-center justify-center gap-2 sm:justify-start lg:flex-nowrap lg:gap-[10px]"
              aria-label={t("product.connectedChannelsLabel")}
            >
              {heroChannels.map((channel, index) => (
                <span
                  key={channel.label}
                  className="flex shrink-0 items-center gap-2 lg:gap-[10px]"
                >
                  <span
                    role="img"
                    aria-label={
                      channel.labelKey ? t(channel.labelKey) : channel.label
                    }
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

        {/* Sales Workflow — intentionally hidden on request. Restoring it means
            re-enabling this block AND retuning the card height: the outer
            wrapper reserves a fixed px budget for the card and scales it from a
            divisor derived from the full two-block content height, both of which
            were measured with the workflow cards present. With the block gone
            those constants now over-reserve, which is the empty gap that was
            fixed alongside the removal. `salesCycleSteps` and
            `renderWorkflowCard` are kept in place for the same reason.
        <div className="relative mt-5 rounded-[25px] border border-[rgba(0,0,0,0.25)] bg-white p-8 sm:p-5">
          <div className="flex flex-col">
            <p className="text-[14px] font-bold leading-[17px] text-black">
              {t("home.flow.salesWorkflowTitle")}
            </p>
            <p className="mt-2 text-[12px] font-bold leading-[16px] text-[rgba(0,0,0,0.6)]">
              {t("home.flow.salesWorkflowBody")}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:flex lg:flex-wrap lg:gap-[12px]">
              {salesCycleSteps.slice(0, 4).map(renderWorkflowCard)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-[14px]">
              {salesCycleSteps.slice(4).map(renderWorkflowCard)}
            </div>
          </div>
        </div> */}
      </div>
    </div>
  );
}

const chatBusinessCases = [
  {
    titleKey: "footer.items.onlineShops",
    detailKey: "home.cases.onlineShops.detail",
    icon: ShoppingBag,
    color: "#5E4BCE",
    background: "#F0EEFF",
  },
  {
    titleKey: "home.cases.growingSalesTeams.title",
    detailKey: "home.cases.growingSalesTeams.detail",
    icon: UsersRound,
    color: "#0069A8",
    background: "#EAF6FF",
  },
  {
    titleKey: "footer.items.retailDistribution",
    detailKey: "home.cases.retail.detail",
    icon: Store,
    color: "#158663",
    background: "#E8F8F1",
  },
  {
    titleKey: "footer.items.localBrands",
    detailKey: "home.cases.localBrands.detail",
    icon: Sparkles,
    color: "#A60278",
    background: "#FCEAF7",
  },
] as const;

function BuiltForChatComponent() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-[70px] sm:px-8 lg:px-0">
      <CenterSectionHeader
        title={t("home.builtFor.title")}
        description={t("home.builtFor.description")}
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {chatBusinessCases.map(
          ({ titleKey, detailKey, icon: Icon, color, background }) => (
            <article
              key={titleKey}
              className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition-transform hover:-translate-y-1"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ color, backgroundColor: background }}
              >
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-[18px] font-bold text-slate-950">
                {t(titleKey)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t(detailKey)}
              </p>
              <span
                className="mt-5 inline-flex items-center gap-1 text-xs font-bold"
                style={{ color }}
              >
                {t("home.cases.cardTag")} <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </article>
          ),
        )}
      </div>
    </div>
  );
}

function DemoCtaComponent() {
  const { t } = useI18n();
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
            {t("home.demo.eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            {t("home.demo.title")}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/80">
            {t("home.demo.body")}
          </p>
        </div>
        <Button
          asChild
          className="h-auto shrink-0 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-[#5E4BCE] shadow-lg shadow-[#392a99]/25 hover:bg-white/90"
        >
          <Link href="/trial" className="gap-2">
            {t("pricing.heroCta")} <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

const footerColumns = [
  {
    titleKey: "footer.productColumn",
    links: [
      ["footer.items.workspace", "/"],
      ["footer.items.modules", "/product"],
      ["navigation.resources", "/resources"],
    ],
  },
  {
    titleKey: "footer.useCasesColumn",
    links: [
      ["footer.items.onlineShops", "/use-cases"],
      ["footer.items.salesTeams", "/use-cases"],
      ["footer.items.retailDistribution", "/use-cases"],
    ],
  },
  {
    titleKey: "footer.companyColumn",
    links: [
      ["footer.contact", "/contact"],
      ["footer.pricing", "/pricing"],
      ["footer.signIn", "/login"],
    ],
  },
  {
    titleKey: "footer.legalColumn",
    links: [
      ["footer.privacyPolicy", "/privacy-policy"],
      ["footer.termsOfService", "/terms-of-service"],
      ["footer.dataDeletion", "/data-deletion"],
    ],
  },
] as const;

function LandingFooterComponent() {
  const { t } = useI18n();
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
              {t("home.footer.tagline")}
            </p>
          </div>
          {footerColumns.map(({ titleKey, links }) => (
            <div key={titleKey}>
              <h2 className="text-sm font-bold text-white">{t(titleKey)}</h2>
              <nav
                className="mt-4 space-y-3"
                aria-label={t("footer.linksGroupLabel", { title: t(titleKey) })}
              >
                {links.map(([labelKey, href]) => (
                  <Link
                    key={labelKey}
                    href={href}
                    className="block text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {t(labelKey)}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </span>
          <span>{t("home.footer.baseline")}</span>
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
  const { t } = useI18n();

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
          <div className="w-full min-w-0 max-w-[800px] my-5 py-5 lg:flex-1">
            {" "}
            <h1
              style={{
                fontWeight: type.hHero.fontWeight,
                lineHeight: type.hHero.lineHeight,
                color: tokens.heading,
              }}
              className="m-0 text-3xl font-bold leading-[1.15] text-slate-950 sm:text-4xl lg:text-5xl"
            >
              {t("home.hero.titlePrefix")}{" "}
              <span className="text-[#5E4BCE]">
                {t("home.hero.titleAccent")}
              </span>
            </h1>
            <p
              style={{ ...type.bodyLarge }}
              className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:mt-8 sm:text-lg lg:text-xl"
            >
              {t("home.hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-center">
              <Button
                asChild
                variant="outline"
                className="h-auto w-full rounded-xl border border-[#5E4BCE] bg-white px-7 py-3.5 text-base font-semibold text-[#5E4BCE] transition-all hover:bg-[#F3F1FF] hover:-translate-y-0.5 sm:w-auto"
              >
                <Link href="/contact?intent=demo" className="gap-2">
                  {t("navigation.productDemo")}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>

              <div className="w-full max-w-[400px] shrink-0 sm:w-[260px] sm:max-w-none">
                <Link href="/trial">
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
                </Link>
              </div>
            </div>
          </div>
          <div className="w-full min-w-0 max-w-xl lg:w-[46%] lg:max-w-[560px] lg:shrink-0">
            <HeroOrbit />
          </div>
        </div>

        {/* NOTE: This is an infinite marquee ticker. The duplicated list
            creates a seamless loop, and it pauses on hover. If the ticker
            looks static during testing, first check your OS/browser "reduce
            motion" setting before assuming this is a bug.

            Hidden on request: the ticker is the only element on this page that
            travels right-to-left (globals.css `marquee` translates X from 0%
            to -50%). Markup is retained below so it can be switched back on;
            `integrationTicker` and `TickerItem` stay for the same reason.
            Inner comments were dropped because a JSX comment cannot nest.

        <div className="group relative w-full overflow-hidden py-2">
          <span
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#f3f5fd] to-transparent sm:w-24 lg:w-32"
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#dfe6fc] to-transparent sm:w-24 lg:w-32"
            aria-hidden="true"
          />

          <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
            <ul
              className="flex shrink-0 items-center gap-4 py-4 pr-4"
              aria-label={t("product.connectedSalesChannels")}
            >
              {integrationTicker.map((item) => (
                <TickerItem key={item.id} item={item} />
              ))}
            </ul>

            <ul
              className="flex shrink-0 items-center gap-4 py-4 pr-4"
              aria-hidden="true"
            >
              {integrationTicker.map((item) => (
                <TickerItem key={`${item.id}-dup`} item={item} />
              ))}
            </ul>
          </div>
        </div> */}
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
              {t("home.workflow.title")}
            </h2>
            <p
              style={{ ...type.bodyLarge, color: tokens.body }}
              className="mt-6 max-w-[1132px] whitespace-pre-line text-center"
            >
              {t("home.workflow.bodyLine1")}
              {"\n"}
              {t("home.workflow.bodyLine2")}
            </p>

            <div className="mt-4 grid w-full grid-cols-1 items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
              <div className="flex h-full flex-col rounded-3xl border border-rose-200 bg-gradient-to-b from-rose-50/40 to-slate-50/50 p-6 shadow-sm sm:p-8">
                <p className="w-fit rounded-full bg-rose-100/80 px-3 py-1 text-xs font-bold leading-tight text-rose-700">
                  {t("home.workflow.strugglesLabel")}
                </p>
                <h3 className="mt-3 text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
                  {t("home.workflow.strugglesTitle")}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {t("home.workflow.strugglesBody")}
                </p>

                <div className="mt-5 grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:gap-4">
                  {struggleItems.map((item) => (
                    <div
                      key={item.labelKey}
                      className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100/60 bg-white/80 p-4 text-center shadow-2xs"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100/70 text-rose-600">
                        <img src={item.src} alt="" className="h-7 w-7" />
                      </span>
                      <p className="whitespace-pre-line text-xs font-semibold leading-tight text-slate-900">
                        {t(item.labelKey)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex h-full flex-col rounded-3xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 via-indigo-50/20 to-white p-6 shadow-sm sm:p-8">
                <p className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold leading-tight text-emerald-800">
                  {t("home.whatChanges")}
                </p>
                <h3 className="mt-3 text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
                  {t("home.onePlatformTitle")}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {t("home.onePlatformBody")}
                </p>

                <div className="mt-5 grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
                  {flowSteps.map((step) => (
                    <div
                      key={step.labelKey}
                      className="flex min-h-[108px] flex-col items-center justify-center rounded-2xl border border-emerald-100/80 bg-white/80 p-3 text-center shadow-2xs"
                    >
                      <img src={step.src} alt="" className="h-9 w-9 shrink-0" />
                      <span className="mt-2 text-xs font-bold leading-tight text-slate-900">
                        {t(step.labelKey)}
                      </span>
                      <span className="mt-1 text-[10px] leading-4 text-slate-500">
                        {t(step.detailKey)}
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
        aria-label={t("home.builtFor.title")}
        style={{ background: tokens.sectionGradient }}
      >
        <BuiltForChatComponent />
      </section>

      <section aria-label={t("home.demoRequestAria")}>
        <DemoCtaComponent />
      </section>

      <section aria-label={t("home.footerAria")}>
        <LandingFooterComponent />
      </section>
    </div>
  );
}
