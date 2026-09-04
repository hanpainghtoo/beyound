"use client"

import { AlertCircle, Ban } from "lucide-react"

import { ConsolePage, ConsoleSection } from "@/components/platform-console-shell"
import { Button } from "@/components/ui/button"

export function PlatformConsoleStateMessage({
  title,
  message,
  destructive = false,
}: {
  title: string
  message: string
  destructive?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${destructive ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 opacity-80">{message}</p>
      </div>
    </div>
  )
}

export function PlatformConsoleUnavailableState({
  title,
  description,
  reason,
  onRetry,
}: {
  title: string
  description: string
  reason: string
  onRetry?: () => void
}) {
  return (
    <ConsolePage>
      <ConsoleSection title="Not available in this release" description={description}>
        <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6 text-amber-50">
          <div className="flex items-start gap-4">
            <span className="rounded-2xl bg-amber-400/20 p-3 text-amber-100">
              <Ban className="h-5 w-5" />
            </span>
            <div className="space-y-3">
              <div>
                <p className="text-lg font-semibold">{title}</p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/85">{reason}</p>
              </div>
              {onRetry ? <Button variant="outline" onClick={onRetry} className="border-amber-200/30 bg-transparent text-amber-50 hover:bg-amber-50/10">Retry availability check</Button> : null}
            </div>
          </div>
        </div>
      </ConsoleSection>
    </ConsolePage>
  )
}
