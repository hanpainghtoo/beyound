"use client"

import { Lock } from "lucide-react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"
import { getApiErrorMessage, getStoredSession } from "@/lib/api"
import { useSetTenantFeature, useTenantFeatures } from "@/lib/queries/features"
import { useI18n } from "@/components/providers/i18n-provider"

/** Plan 55: modules whose API is blocked when switched off. */
const GATED_MODULES = new Set(["orders", "deliveries"])

/**
 * Plan 55: per-tenant feature toggles.
 *
 * Owner/admin only (mirrors the backend `@Roles('owner','admin')`). Locked
 * modules render an "Always on" badge and an inert switch. Deliveries stays
 * inert while Orders is off, since disabling Orders cascades to it.
 */
export function FeatureTogglesSection() {
  // `translate` for the module name/description: those are authored in the
  // Platform Console as English sentences, the same shape as plan.name. `t` for
  // our own chrome.
  const { t, translate } = useI18n()
  const featuresQuery = useTenantFeatures()
  const setFeature = useSetTenantFeature()
  const role = getStoredSession()?.user.role
  const canManage = role === "owner" || role === "admin"

  const features = (featuresQuery.data ?? []).filter((feature) =>
    GATED_MODULES.has(feature.key)
  )

  if (!canManage) return null

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          {t("workspace.features.title")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("workspace.features.description")}
        </p>
      </header>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {features.length === 0
          ? Array.from({ length: GATED_MODULES.size }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse bg-slate-50 dark:bg-slate-900/60" />
            ))
          : features.map((feature) => {
              const locked = !feature.isLockable
              const inert = feature.canDisable === false
              const pendingKey = setFeature.isPending ? feature.key : null

              return (
                <div key={feature.key} className="flex items-start gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-50">
                        {translate(feature.displayName)}
                      </p>
                      {locked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <Lock className="h-3 w-3" />
                          {t("workspace.features.alwaysOn")}
                        </span>
                      ) : null}
                    </div>
                    {feature.description ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {translate(feature.description)}
                      </p>
                    ) : null}
                    {!locked && inert && !feature.isEnabled ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        {t("workspace.features.ordersFirstHint")}
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    checked={feature.isEnabled}
                    disabled={locked || inert || pendingKey === feature.key}
                    aria-label={t("workspace.features.toggleAria", { name: translate(feature.displayName) })}
                    onCheckedChange={(checked) => {
                      setFeature.mutate(
                        { key: feature.key, isEnabled: checked },
                        {
                          onSuccess: () =>
                            // Two keys rather than one template: Burmese has
                            // no spaces and no fixed word order, so
                            // "{name} {enabled}" cannot place the state
                            // correctly around the noun.
                            toast.success(
                              checked
                                ? t("workspace.features.enabledToast", {
                                    name: translate(feature.displayName),
                                  })
                                : t("workspace.features.disabledToast", {
                                    name: translate(feature.displayName),
                                  })
                            ),
                          onError: (error) =>
                            toast.error(getApiErrorMessage(error)),
                        }
                      )
                    }}
                  />
                </div>
              )
            })}
      </div>
    </section>
  )
}