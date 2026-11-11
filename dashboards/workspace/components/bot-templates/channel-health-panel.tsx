"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useTelegramHealth } from "@/lib/queries/channels"
import { cn } from "@/lib/utils"
import type { TelegramWebhookHealthDto } from "@/lib/api"

type Props = {
  channelId: string
}

type Health = TelegramWebhookHealthDto

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Request failed."
}

/**
 * A single verdict, so the merchant does not have to read four rows and judge.
 * "Unknown" is deliberately distinct from "broken": an unreadable field is a
 * gap in our visibility, not a fault, and conflating the two is what made this
 * panel report a dead bot while the bot was working.
 */
type HealthState = "healthy" | "busy" | "degraded" | "broken" | "unknown"

type Verdict = {
  state: HealthState
  label: string
  hint: string
}

const VERDICT_TONE: Record<HealthState, string> = {
  // Same class strings as the channel badges in app/workspace/channels.
  healthy:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  busy: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  degraded:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  broken: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200",
  unknown:
    "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
}

function evaluate(health: Health): Verdict {
  if (!health.tokenOk) {
    return {
      state: "broken",
      label: "Bot connection problem",
      hint: "Telegram rejected this bot's credentials. Reconnect the channel.",
    }
  }
  if (!health.webhook) {
    return {
      state: "unknown",
      label: "Status unavailable",
      hint: "Telegram did not report its webhook state, so these checks are unknown.",
    }
  }
  if (!health.webhook.urlMatches) {
    return {
      state: "degraded",
      label: "Needs attention",
      hint: "This bot is registered to a different webhook, so messages may not reach this workspace.",
    }
  }
  if (!health.webhook.hasCallbackQuery) {
    return {
      state: "degraded",
      label: "Needs attention",
      hint: "Telegram is not sending button taps, so menu buttons will not respond.",
    }
  }
  if ((health.webhook.pendingUpdateCount ?? 0) > 0) {
    return {
      state: "busy",
      label: "Messages are catching up",
      hint: "Some messages are still queued at Telegram. This usually clears on its own.",
    }
  }
  return {
    state: "healthy",
    label: "All systems operational",
    hint: "",
  }
}

type RowTone = "ok" | "warn" | "bad" | "unknown"

function RowIcon({ tone }: { tone: RowTone }) {
  if (tone === "ok") return <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
  if (tone === "bad") return <X className="h-4 w-4 text-red-600 dark:text-red-400" />
  if (tone === "warn")
    return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
  return <CircleHelp className="h-4 w-4 text-slate-400 dark:text-slate-500" />
}

function HealthRow({
  tone,
  label,
  detail,
}: {
  tone: RowTone
  label: string
  detail: string
}) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <RowIcon tone={tone} />
      <span className="text-slate-700 dark:text-slate-200">{label}</span>
      <span className="ml-auto truncate text-right text-slate-500 dark:text-slate-400">
        {detail}
      </span>
    </li>
  )
}

// Live Telegram health, rewritten from a raw diagnostic dump into a verdict
// plus plain-language rows. Raw Telegram values are kept one click away for
// support, but they are not what a merchant should have to read.
export function ChannelHealthPanel({ channelId }: Props) {
  const healthQuery = useTelegramHealth(channelId)
  const health = healthQuery.data
  const verdict = health ? evaluate(health) : null
  // Start closed when everything is fine; open up when something needs a
  // human. Kept as real state (rather than a forced override) so the user can
  // still collapse it after a failure.
  const [detailsOpen, setDetailsOpen] = useState(false)
  const verdictState = verdict?.state
  useEffect(() => {
    if (!verdictState) return
    setDetailsOpen(verdictState !== "healthy" && verdictState !== "busy")
  }, [verdictState])

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
          Telegram health
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={healthQuery.isFetching}
          onClick={() => void healthQuery.refetch()}
        >
          <RefreshCw
            className={cn(
              "mr-1 h-3.5 w-3.5",
              healthQuery.isFetching && "animate-spin",
            )}
          />
          Refresh
        </Button>
      </div>

      {healthQuery.isPending ? (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your bot…
        </p>
      ) : healthQuery.isError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-red-800 dark:text-red-200">
            Could not check your bot: {messageOf(healthQuery.error)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => void healthQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : health && verdict ? (
        <div className="space-y-3">
          <div
            className={cn(
              "rounded-md border px-3 py-2",
              VERDICT_TONE[verdict.state],
            )}
          >
            <p className="text-sm font-medium">{verdict.label}</p>
            {verdict.hint ? (
              <p className="mt-0.5 text-xs opacity-90">{verdict.hint}</p>
            ) : null}
          </div>

          <ul className="space-y-2">
            <HealthRow
              tone={health.tokenOk ? "ok" : "bad"}
              label="Bot connected"
              detail={
                health.tokenOk
                  ? health.tokenUsername
                    ? `@${health.tokenUsername}`
                    : "Verified"
                  : "Token rejected"
              }
            />
            <HealthRow
              tone={
                !health.webhook
                  ? "unknown"
                  : health.webhook.urlMatches
                    ? "ok"
                    : "bad"
              }
              label="Webhook connected"
              detail={
                !health.webhook
                  ? "Could not be read"
                  : health.webhook.urlMatches
                    ? "Receiving messages"
                    : "Registered elsewhere"
              }
            />
            <HealthRow
              tone={
                !health.webhook || health.webhook.allowedUpdates === null
                  ? "unknown"
                  : health.webhook.hasCallbackQuery
                    ? "ok"
                    : "bad"
              }
              label="Menu buttons working"
              detail={
                !health.webhook || health.webhook.allowedUpdates === null
                  ? "Could not be read"
                  : health.webhook.hasCallbackQuery
                    ? "Taps are delivered"
                    : "Not subscribed"
              }
            />
            <HealthRow
              tone={
                health.webhook === null
                  ? "unknown"
                  : (health.webhook.pendingUpdateCount ?? 0) > 0
                    ? "warn"
                    : "ok"
              }
              label="Message queue"
              detail={
                health.webhook === null
                  ? "Could not be read"
                  : (health.webhook.pendingUpdateCount ?? 0) === 0
                    ? "Nothing waiting"
                    : `${health.webhook.pendingUpdateCount} waiting`
              }
            />
          </ul>

          {health.webhook?.lastErrorMessage ? (
            <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {health.webhook.lastErrorMessage}
            </p>
          ) : null}

          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  detailsOpen && "rotate-180",
                )}
              />
              Technical details
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="mt-2 space-y-1 rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-900/70">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-slate-500 dark:text-slate-400">
                    Updates subscribed
                  </dt>
                  <dd className="min-w-0 break-all text-slate-700 dark:text-slate-200">
                    {health.webhook?.allowedUpdates?.join(", ") ?? "unknown"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 text-slate-500 dark:text-slate-400">
                    Webhook URL
                  </dt>
                  <dd className="min-w-0 break-all text-slate-700 dark:text-slate-200">
                    {health.webhook?.url ?? health.webhookUrl ?? "unknown"}
                  </dd>
                </div>
                {health.webhookError ? (
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-slate-500 dark:text-slate-400">
                      Reported error
                    </dt>
                    <dd className="min-w-0 break-all text-slate-700 dark:text-slate-200">
                      {health.webhookError}
                    </dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="shrink-0 text-slate-500 dark:text-slate-400">
                    Last checked
                  </dt>
                  <dd className="text-slate-700 dark:text-slate-200">
                    {new Date(health.checkedAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
    </div>
  )
}