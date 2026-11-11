"use client"

import Link from "next/link";

import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Shared marketing footer, extracted from marketing-shell so it can consume
 * translations while the rest of marketing-shell stays a Server Component.
 */
export function MarketingFooter() {
  const { t } = useI18n();

  return (
    <footer className="relative z-10 mt-16 border-t border-slate-200/80 bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_68%)]" />
      <div className="relative mx-auto max-w-[1480px] px-5 py-12 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.72fr_0.72fr_0.72fr_0.72fr_1fr]">
          <div className="space-y-3 lg:pr-4">
            <div className="flex items-center gap-2">
              <img src="/zayos-mark-light.png" alt="" className="h-8 w-8" />
              <span className="text-2xl font-extrabold">ZayOS</span>
            </div>
            <p className="max-w-sm text-sm leading-7 text-slate-300">
              {t("footer.tagline")}
            </p>
          </div>
          <FooterColumn
            title={t("footer.productColumn")}
            items={[
              [t("footer.items.workspace"), "/"],
              [t("footer.items.modules"), "/product"],
              [t("footer.items.connectedTools"), "/resources"],
              [t("footer.items.updates"), "/resources"],
            ]}
          />
          <FooterColumn
            title={t("footer.useCasesColumn")}
            items={[
              [t("footer.items.onlineShops"), "/use-cases"],
              [t("footer.items.salesTeams"), "/use-cases"],
              [t("footer.items.retailDistribution"), "/use-cases"],
              [t("footer.items.localBrands"), "/use-cases"],
            ]}
          />
          <FooterColumn
            title={t("footer.companyColumn")}
            items={[
              [t("footer.contact"), "/contact"],
              [t("footer.pricing"), "/pricing"],
              [t("footer.signIn"), "/login"],
            ]}
          />
          <FooterColumn
            title={t("footer.legalColumn")}
            items={[
              [t("footer.privacyPolicy"), "/privacy-policy"],
              [t("footer.termsOfService"), "/terms-of-service"],
              [t("footer.dataDeletion"), "/data-deletion"],
            ]}
          />
          <div className="lg:pl-2">
            <p className="text-sm font-semibold text-white">{t("footer.stayUpdated")}</p>
            <p className="mt-3 max-w-sm text-sm leading-7 text-slate-300">
              {t("footer.subscribeBody")}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder={t("footer.emailPlaceholder")}
                className="h-11 border-slate-700/80 bg-slate-900/90 text-white placeholder:text-slate-500 sm:max-w-[220px]"
              />
              <Button className="h-11 bg-indigo-600 px-5 text-white shadow-[0_12px_30px_rgba(79,70,229,0.24)] hover:bg-indigo-700">
                {t("footer.subscribe")}
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t border-slate-800 pt-5 text-xs text-slate-400">
          <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: Array<[string, string]>;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2.5 text-sm text-slate-300">
        {items.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="transition-colors hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
