"use client"

import { useI18n } from "@/components/providers/i18n-provider"
import { cn } from "@/lib/utils";

/** Dashed placeholder for an empty queue or an unreachable one. */
export function QueueEmptyState({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-[var(--workspace-border)] bg-[var(--workspace-surface-strong)] p-8 text-center text-sm text-[var(--workspace-text-muted)] dark:bg-[var(--workspace-surface-muted)]",
        className,
      )}
    >
      {label}
    </div>
  )
}

/**
 * Five placeholder rows so the queue keeps its height while fetching.
 *
 * This is the queue's only loading indicator, and it deliberately covers filter
 * changes as well as the cold load: `keepPreviousData` holds the *previous*
 * filter's rows, so without this the pane would silently display them as if
 * they were the new answer. Loading further pages is not placeholder data, so
 * infinite scroll does not blank the list.
 */
export function QueueSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className="flex items-start gap-3 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-3 dark:bg-[var(--workspace-surface-strong)]"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-[var(--workspace-surface-muted)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="h-3 w-32 animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
              <div className="h-3 w-12 animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
            </div>
            <div className="h-3 w-full animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Slim end-of-list loader for infinite scroll. The full QueueSkeleton blanks
 * the list, which is wrong mid-scroll; this appends two quiet placeholder
 * rows below the loaded cards while the next page fetches, so a slow
 * connection reads as loading rather than finished.
 */
export function QueueNextPageLoader() {
  const { t } = useI18n()
  return (
    <div className="space-y-2 pt-2" aria-label={t("workspace.inbox.queue.loadingOlder")}>
      {[0, 1].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex items-start gap-3 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-3 opacity-70 dark:bg-[var(--workspace-surface-strong)]"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-[var(--workspace-surface-muted)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
            <div className="h-3 w-full animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
          </div>
        </div>
      ))}
    </div>
  )
}