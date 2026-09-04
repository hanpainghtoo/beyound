"use client"

import { useRef, useEffect } from "react"
import { AlertCircle, AlertTriangle } from "lucide-react"
import {
  useWorkspaceWarnings,
  type WorkspaceWarning,
  type QuotaUsageWarning,
  type SubscriptionExpiryWarning,
} from "@/lib/queries/billing"
import { useUIStore } from "@/lib/stores/ui-store"
import { cn } from "@/lib/utils"

const severityStyles = {
  warning: {
    wrapper: "border-[var(--banner-border-warning)] bg-[var(--banner-bg-warning)] text-[var(--banner-text-warning)]",
    icon: "text-[var(--banner-text-warning)]",
    link: "text-[var(--banner-link-warning)] hover:opacity-80",
  },
  critical: {
    wrapper: "border-[var(--banner-border-danger)] bg-[var(--banner-bg-danger)] text-[var(--banner-text-danger)]",
    icon: "text-[var(--banner-text-danger)]",
    link: "text-[var(--banner-link-danger)] hover:opacity-80",
  },
} as const

function UsageWarning({
  warning,
  onDismiss,
}: {
  warning: QuotaUsageWarning
  onDismiss: (id: string) => void
}) {
  const isBlocked = warning.rows.some((r) => r.blocked)
  const isCritical = warning.severity === "critical"
  const styles = severityStyles[warning.severity]
  const lead = isCritical ? "You're near your limits" : "Approaching your limits"

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3.5 py-2 text-[13px] leading-snug",
        styles.wrapper,
      )}
    >
      {isCritical ? (
        <AlertCircle className={cn("h-4 w-4 shrink-0", styles.icon)} />
      ) : (
        <AlertTriangle className={cn("h-4 w-4 shrink-0", styles.icon)} />
      )}

      <span className="font-medium">{lead}</span>

      <span className="text-black/40 dark:text-white/40">—</span>

      {warning.rows.map((row, i) => (
        <span key={row.dimension} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-black/30 dark:text-white/30">·</span>
          )}
          <span
            className="font-medium"
            style={{
              color: row.severity === "critical"
                ? "var(--banner-text-danger)"
                : "var(--banner-text-warning)",
            }}
          >
            {row.label} {row.percent}%
          </span>
        </span>
      ))}

      <a
        href={warning.ctaHref}
        className={cn(
          "ml-1 font-medium underline underline-offset-2",
          styles.link,
        )}
      >
        {warning.ctaLabel}
      </a>

      {!isBlocked && (
        <button
          onClick={() => onDismiss(warning.id)}
          className="ml-auto shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}

function SubscriptionWarning({
  warning,
  onDismiss,
}: {
  warning: SubscriptionExpiryWarning
  onDismiss: (id: string) => void
}) {
  const styles = severityStyles[warning.severity]

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3.5 py-2 text-[13px] leading-snug",
        styles.wrapper,
      )}
    >
      {warning.severity === "critical" ? (
        <AlertCircle className={cn("h-4 w-4 shrink-0", styles.icon)} />
      ) : (
        <AlertTriangle className={cn("h-4 w-4 shrink-0", styles.icon)} />
      )}

      <span>{warning.message}</span>

      <a
        href={warning.ctaHref}
        className={cn(
          "ml-1 font-medium underline underline-offset-2",
          styles.link,
        )}
      >
        {warning.ctaLabel}
      </a>

      <button
        onClick={() => onDismiss(warning.id)}
        className="ml-auto shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

function WarningBanner({
  warning,
  onDismiss,
}: {
  warning: WorkspaceWarning
  onDismiss: (id: string) => void
}) {
  switch (warning.type) {
    case "quota_usage":
      return <UsageWarning warning={warning} onDismiss={onDismiss} />
    case "subscription_expiry":
      return <SubscriptionWarning warning={warning} onDismiss={onDismiss} />
  }
}

export function WorkspaceWarningBanner() {
  const warnings = useWorkspaceWarnings()
  const dismissed = useUIStore((s) => s.dismissedWarningIds)
  const dismiss = useUIStore((s) => s.dismissWarning)
  const ref = useRef<HTMLDivElement>(null)

  const visible = warnings.filter((w) => !dismissed.includes(w.id))

  useEffect(() => {
    const height = ref.current?.offsetHeight ?? 0
    document.documentElement.style.setProperty("--banner-height", `${height}px`)
    return () => {
      document.documentElement.style.setProperty("--banner-height", "0px")
    }
  }, [visible])

  if (!visible.length) return null

  return (
    <div ref={ref} className="w-full space-y-1.5 px-4 pt-2">
      {visible.map((w) => (
        <WarningBanner key={w.id} warning={w} onDismiss={dismiss} />
      ))}
    </div>
  )
}
