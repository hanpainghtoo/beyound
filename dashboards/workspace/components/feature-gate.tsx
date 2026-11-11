"use client"

import type { ReactNode } from "react"

import { FeatureDisabledDialog } from "@/components/feature-disabled-dialog"
import { getStoredSession } from "@/lib/api"
import { useTenantFeatures } from "@/lib/queries/features"

type FeatureGateProps = {
  /** Feature category key, e.g. `orders`. */
  featureKey: string
  /** Human-readable name shown in the blocked-state dialog. */
  featureName: string
  children: ReactNode
}

/**
 * Plan 55: wraps a workspace page that belongs to a toggleable module.
 *
 * While the toggle query is loading the page renders normally (the backend
 * `FeatureGuard` is the real enforcement). Once resolved, a disabled module
 * shows the alert dialog instead of the page.
 */
export function FeatureGate({
  featureKey,
  featureName,
  children,
}: FeatureGateProps) {
  const featuresQuery = useTenantFeatures()
  const match = (featuresQuery.data ?? []).find(
    (feature) => feature.key === featureKey
  )
  const isEnabled = match ? match.isEnabled : true
  const role = getStoredSession()?.user.role
  const canManage = role === "owner" || role === "admin"

  return (
    <>
      {isEnabled ? children : null}
      <FeatureDisabledDialog
        open={!isEnabled}
        featureName={featureName}
        canManage={canManage}
      />
    </>
  )
}