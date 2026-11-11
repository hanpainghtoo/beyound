import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  tenantChannelsApi,
  type TelegramWebhookHealthDto,
  type TenantChannelDto,
} from "@/lib/api"

// ---------------------------------------------------------------------------
// Query keys — single dropdown cache entry shared by every channel selector
// ---------------------------------------------------------------------------

export const channelKeys = {
  all: ["channels"] as const,
  options: () => [...channelKeys.all, "options"] as const,
  telegramHealth: (channelId: string) =>
    [...channelKeys.all, "telegram-health", channelId] as const,
}

// ---------------------------------------------------------------------------
// Dropdown options — plain array endpoint; single cache entry shared across
// orders page filter, customers create form, and dashboard setup counts.
// 5-minute cache — channels change infrequently.
// ---------------------------------------------------------------------------

export function useChannelOptions() {
  return useQuery<TenantChannelDto[]>({
    queryKey: channelKeys.options(),
    queryFn: () => tenantChannelsApi.list(),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Telegram ops (Plan 73, Phase 4b) — shop toggles, webhook re-register,
// live health readout. Mutations invalidate the whole channels cache so the
// details dialog (prop-driven) refreshes on next open.
// ---------------------------------------------------------------------------

export function useTelegramHealth(channelId: string, enabled = true) {
  return useQuery<TelegramWebhookHealthDto>({
    queryKey: channelKeys.telegramHealth(channelId),
    queryFn: () => tenantChannelsApi.telegramHealth(channelId),
    enabled: enabled && channelId.length > 0,
    staleTime: 30_000,
  })
}

export function useUpdateShopSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      channelId: string
      data: { shopEnabled?: boolean; orderingEnabled?: boolean }
    }) => tenantChannelsApi.setShopSettings(args.channelId, args.data),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: channelKeys.all })
    },
  })
}
