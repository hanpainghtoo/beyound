import { cn } from "@/lib/utils"

export type ProviderIconName = "messenger" | "telegram" | "tiktok" | "viber"

const providerIconSources: Record<ProviderIconName, string> = {
  messenger: "/icons/providers/messenger.svg",
  telegram: "/icons/providers/telegram.svg",
  tiktok: "/icons/providers/tiktok.png",
  viber: "/icons/providers/viber.svg",
}

const providerBadgeColors: Record<ProviderIconName, string> = {
  messenger: "#0866FF",
  telegram: "#229ED9",
  tiktok: "#161823",
  viber: "#7360F2",
}

export function ProviderIcon({ provider, className }: { provider: ProviderIconName; className?: string }) {
  return (
    <img
      src={providerIconSources[provider]}
      alt=""
      aria-hidden="true"
      className={cn("object-contain", className)}
      loading="lazy"
    />
  )
}

export function ProviderBadge({
  provider,
  className,
}: {
  provider: ProviderIconName
  className?: string
}) {
  const color = providerBadgeColors[provider]

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center border", className)}
      style={{ backgroundColor: color, borderColor: color }}
    >
      <ProviderIcon provider={provider} className="h-[60%] w-[60%]" />
    </span>
  )
}
