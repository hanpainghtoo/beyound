"use client"

import {
  BellRing,
  Image as ImageIcon,
  LayoutDashboard,
  MessageSquareReply,
  PackageCheck,
  Settings2,
} from "lucide-react";

import { useI18n } from "@/components/providers/i18n-provider";

/**
 * Product page workspace preview.
 *
 * Extracted from marketing-shell (a Server Component) so it can consume
 * useI18n(). marketing-shell re-exports this symbol, so existing imports are
 * unchanged. `id` is deliberately separate from the translated `titleKey`
 * because the progress-bar widths compare against it.
 */
const workspaceModules = [
  {
    id: "products",
    titleKey: "product.workspaceHero.modules.products.title",
    detailKey: "product.workspaceHero.modules.products.detail",
    detail: "Catalog ready for replies",
    icon: PackageCheck,
    accent: "bg-[#F0EEFF] text-[#5E4BCE]",
    progress: true,
  },
  {
    id: "media",
    titleKey: "product.workspaceHero.modules.media.title",
    detailKey: "product.workspaceHero.modules.media.detail",
    detail: "Photos, video, and files",
    icon: ImageIcon,
    accent: "bg-[#FFF0F2] text-[#C90A3E]",
    progress: true,
  },
  {
    id: "savedReplies",
    titleKey: "product.workspaceHero.modules.savedReplies.title",
    detailKey: "product.workspaceHero.modules.savedReplies.detail",
    detail: "Fast repeatable responses",
    icon: MessageSquareReply,
    accent: "bg-[#F0EEFF] text-[#5E4BCE]",
    progress: true,
  },
  {
    id: "reports",
    titleKey: "product.workspaceHero.modules.reports.title",
    detailKey: "product.workspaceHero.modules.reports.detail",
    detail: "Sales, delivery, product, and...",
    icon: LayoutDashboard,
    accent: "bg-[#EEF2FF] text-[#1C3174]",
    progress: false,
  },
  {
    id: "notifications",
    titleKey: "product.workspaceHero.modules.notifications.title",
    detailKey: "product.workspaceHero.modules.notifications.detail",
    detail: "Important updates surfaced",
    icon: BellRing,
    accent: "bg-[#FFF4E8] text-[#BD5409]",
    progress: false,
  },
  {
    id: "settings",
    titleKey: "product.workspaceHero.modules.settings.title",
    detailKey: "product.workspaceHero.modules.settings.detail",
    detail: "Workspace controls and setup",
    icon: Settings2,
    accent: "bg-slate-100 text-slate-700",
    progress: false,
  },
] as const;

export function ProductWorkspaceHero() {
  const { t } = useI18n();
  return (
    <div className="relative mx-auto w-full max-w-[720px] px-1 pb-5 sm:px-3">
      <div className="relative min-h-[390px] aspect-auto overflow-visible rounded-xl border border-[#1D2027] bg-[linear-gradient(145deg,#2A2A2A_0%,#202328_46%,#17191E_100%)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_30px_60px_-12px_rgba(11,16,32,0.25)] sm:min-h-0 sm:aspect-[13/10] sm:rounded-2xl sm:p-2">        <div className="pointer-events-none absolute left-1/2 top-1.5 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-[#0E1014] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" aria-hidden="true" />

        <div className="h-full overflow-hidden rounded-[14px] bg-[#F8F9FF] ring-1 ring-black/30">
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#5E4BCE]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {t("product.workspaceHero.badge")}
              </span>
            </div>
            <span className="text-[9px] font-semibold text-slate-400">
              ZayOS
            </span>
          </div>
          <div className="p-4 sm:p-5 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5E4BCE]">
                  {t("product.workspaceHero.kicker")}
                </p>
                <h3 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl lg:text-[28px]">
                  {t("product.workspaceHero.title")}
                </h3>
              </div>
              <div className="rounded-full border border-[#5E4BCE]/25 bg-white px-3 py-1.5 text-[9px] font-semibold text-slate-600 shadow-sm sm:px-4 sm:text-[10px]">
                {t("product.workspaceHero.system")}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {workspaceModules.map((module) => {
                const Icon = module.icon;
                return (
                  <div
                    key={module.id}
                    className="relative rounded-[14px] border border-slate-200/90 bg-white p-3.5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
                  >
                    <div
                      className={`inline-flex rounded-xl p-2.5 ${module.accent}`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <p className="mt-3 text-xs font-bold text-slate-950">
                      {t(module.titleKey)}
                    </p>
                    {/* Not `truncate`: the card is fixed-width but the Burmese
                        detail strings run far wider than their English source
                        ("မြန်ဆန်စွာ ထပ်မံသုံးနိုင်သော အကြောင်းပြန" is ~207px in a
                        160px column) and truncation silently ate them. */}
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      {t(module.detailKey)}
                    </p>
                    {module.progress ? (
                      <div className="mt-3 h-1 rounded-full bg-slate-100">
                        <div
                          className="h-1 rounded-full bg-[linear-gradient(90deg,#5E4BCE_0%,#38BDF8_100%)]"
                          style={{
                            width:
                              module.id === "products"
                                ? "78%"
                                : module.id === "media"
                                  ? "64%"
                                  : "72%",
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-10 mx-auto -mt-px h-4 w-[108%] -translate-x-[4%] rounded-b-xl border-t border-white/20 bg-gradient-to-b from-[#2C2F36] to-[#1E2026] shadow-[0_10px_18px_rgba(0,0,0,0.2)] sm:h-3.5" aria-hidden="true">
        <div className="absolute left-1/2 top-0 h-1 w-16 -translate-x-1/2 rounded-b-sm bg-black/35" />
        <div className="absolute -bottom-1 left-[16%] h-1 w-8 rounded-sm bg-black/30 shadow-sm" />
        <div className="absolute -bottom-1 right-[16%] h-1 w-8 rounded-sm bg-black/30 shadow-sm" />
      </div>
    </div>
  );
}
