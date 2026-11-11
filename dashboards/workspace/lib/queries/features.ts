import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { tenantFeaturesApi, type TenantFeatureDto } from "@/lib/api"

// Query keys — feature toggles for the current tenant.
export const featureKeys = {
  all: ["tenant-features"] as const,
  list: () => [...featureKeys.all, "list"] as const,
}

// List query — the resolved catalog for the signed-in tenant.
export function useTenantFeatures() {
  return useQuery<TenantFeatureDto[]>({
    queryKey: featureKeys.list(),
    queryFn: async () => {
      const response = await tenantFeaturesApi.list()
      return response.features ?? []
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// Mutation — flipping one toggle. Invalidating the list key re-renders the
// sidebar and every gate at once, so the change is visible immediately.
export function useSetTenantFeature() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, isEnabled }: { key: string; isEnabled: boolean }) =>
      tenantFeaturesApi.setEnabled(key, isEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featureKeys.all })
    },
  })
}

/**
 * Resolve one toggle for gating. Falls back to `true` while the query is in
 * flight so navigation never flashes hidden before the answer arrives.
 */
export function useFeatureEnabled(key?: string): boolean {
  const query = useTenantFeatures()
  if (!key) return true
  const match = (query.data ?? []).find((feature) => feature.key === key)
  return match ? match.isEnabled : true
}

/** Locked modules (e.g. Inbox) can never be switched off. */
export function useFeatureLockable(key?: string): boolean {
  const query = useTenantFeatures()
  if (!key) return true
  const match = (query.data ?? []).find((feature) => feature.key === key)
  return match ? match.isLockable : true
}