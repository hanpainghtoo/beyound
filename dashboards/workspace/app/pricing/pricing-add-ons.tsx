"use client"

import Link from "next/link"
import { AlertCircle, Check, Download, HardDrive, Hash, Package, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/providers/i18n-provider"
import type { DisplayAddOnProduct } from "@/lib/public-add-on-products"

const componentIcons = {
  inbound_messages: Download,
  outbound_messages: Send,
  channel_slots: Hash,
  storage_gb: HardDrive,
} as const

export function PricingAddOns({ products, loadError }: { products: DisplayAddOnProduct[]; loadError?: string }) {
  const { t } = useI18n()

  return (
    <section className="pb-16 bg-slate-50/50 pt-16 mt-8 border-t border-slate-100">
      <div className="mx-auto max-w-4xl px-5 text-center sm:px-8 lg:px-10">
        <h2 className="text-4xl font-bold text-slate-950">{t("pricing.addOns.title")}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-7 text-slate-600">
          {t("pricing.addOnsSubtitle")}
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-4xl px-5 sm:px-8 lg:px-10">
        {loadError ? (
          <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{t("pricing.addOns.unavailableTitle")}</p>
              <p className="mt-1">{loadError}</p>
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-indigo-200 bg-white p-8 text-center">
            <p className="text-base font-semibold text-slate-950">{t("pricing.needMoreCapacity")}</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
              {t("pricing.addOnTailorBody")}
            </p>
            <Button asChild className="mt-6 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:from-indigo-600 hover:to-cyan-600">
              <Link href="/contact?intent=sales&source=pricing">{t("pricing.addOns.talkToTeam")}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {products.map((product, index) => {
              const Icon = product.componentList[0]
                ? componentIcons[product.componentList[0].componentType]
                : Package

              return (
                <article
                  key={product.id}
                  className={`flex flex-col rounded-3xl border bg-gradient-to-b p-6 shadow-sm sm:p-8 ${
                    index % 2 === 0
                      ? "border-indigo-200 from-indigo-50/50 to-white"
                      : "border-slate-200 from-white to-white"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-950">{product.name}</h3>
                  </div>

                  <p className="mt-3 pl-14 text-sm text-slate-600">{product.description}</p>

                  {product.componentList.length > 0 ? (
                    <ul className="mt-6 flex-1 space-y-3 border-t border-indigo-100 pt-6">
                      {product.componentList.map((component) => (
                        <li key={component.id} className="flex items-start gap-3">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                          <span className="text-sm font-medium text-slate-700">
                            <strong>{component.displayQuantity}</strong> {component.label.toLowerCase()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-6 flex-1 border-t border-indigo-100 pt-6" />
                  )}

                  <div className="mt-8 flex flex-col items-center justify-center">
                    <span className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">{t("pricing.addOns.oneTimeTopUp")}</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-indigo-600">{product.priceDisplay}</span>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export function PricingAddOnsSkeleton() {
  const { t } = useI18n()

  return (
    <section className="mt-8 border-t border-slate-100 bg-slate-50/50 pb-16 pt-16" aria-label={t("pricing.addonsLoading")}>
      <div className="mx-auto max-w-4xl px-5 sm:px-8 lg:px-10">
        <div className="mx-auto h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="mx-auto mt-4 h-5 w-full max-w-xl animate-pulse rounded bg-slate-100" />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div key={item} className="h-80 animate-pulse rounded-3xl border border-slate-200 bg-white p-8">
              <div className="h-10 w-10 rounded-full bg-slate-100" />
              <div className="mt-5 h-6 w-2/3 rounded bg-slate-100" />
              <div className="mt-3 h-4 w-full rounded bg-slate-50" />
              <div className="mt-8 h-8 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
