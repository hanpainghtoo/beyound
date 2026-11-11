import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  botTemplatesApi,
  tenantChannelSettingsApi,
  type BotTemplateFieldInput,
  type ChannelTemplateSelectionDto,
} from "@/lib/api"


export const botTemplateKeys = {
  all: ["bot-templates"] as const,
  list: () => [...botTemplateKeys.all, "list"] as const,
  detail: (id: string) => [...botTemplateKeys.all, "detail", id] as const,
  channelSelection: (channelId: string) =>
    [...botTemplateKeys.all, "channel", channelId] as const,
  channelSettings: ["tenant-channel-settings"] as const,
}

/**
 * Plan 78: the platform-level commerce switch. `undefined` means "not
 * resolved yet" so callers can avoid flashing the feature before the answer
 * arrives; it is deliberately not coerced to `false`.
 */
export function useCommerceEnabled() {
  return useQuery({
    queryKey: botTemplateKeys.channelSettings,
    queryFn: () => tenantChannelSettingsApi.get(),
    staleTime: 30_000,
  })
}

export function useBotTemplates(enabled = true) {
  return useQuery({
    queryKey: botTemplateKeys.list(),
    queryFn: () => botTemplatesApi.list(),
    enabled,
    staleTime: 60_000,
  })
}

export function useBotTemplate(id: string, enabled = true) {
  return useQuery({
    queryKey: botTemplateKeys.detail(id),
    queryFn: () => botTemplatesApi.get(id),
    enabled: enabled && id.length > 0,
    staleTime: 60_000,
  })
}

function useInvalidateTemplates() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: botTemplateKeys.all })
  }
}

export function useCreateBotTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: (data: { name: string; fields: BotTemplateFieldInput[] }) =>
      botTemplatesApi.create(data),
    onSettled: () => invalidate(),
  })
}

export function useUpdateBotTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: (args: {
      id: string
      data: { name?: string; fields?: BotTemplateFieldInput[] }
    }) => botTemplatesApi.update(args.id, args.data),
    // Detail keys nest under `botTemplateKeys.all`, so one invalidation
    // covers list + detail.
    onSettled: () => invalidate(),
  })
}

export function useDeleteBotTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: (id: string) => botTemplatesApi.remove(id),
    onSettled: () => invalidate(),
  })
}

export function useChannelTemplateSelection(
  channelId: string,
  enabled = true,
) {
  return useQuery<ChannelTemplateSelectionDto>({
    queryKey: botTemplateKeys.channelSelection(channelId),
    queryFn: () => botTemplatesApi.getChannelSelection(channelId),
    enabled: enabled && channelId.length > 0,
    staleTime: 60_000,
  })
}

export function useSetChannelTemplateSelection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      channelId: string
      data: { templateId?: string | null; useBotTemplate: boolean }
    }) => botTemplatesApi.setChannelSelection(args.channelId, args.data),
    onSettled: (_data, _error, variables) => {
      void qc.invalidateQueries({
        queryKey: botTemplateKeys.channelSelection(variables.channelId),
      })
      void qc.invalidateQueries({ queryKey: botTemplateKeys.all })
      void qc.invalidateQueries({ queryKey: ["channels"] })
    },
  })
}
