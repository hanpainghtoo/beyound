import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { tenantAgentsApi, type TenantAgentDto } from "@/lib/api"

// ---------------------------------------------------------------------------
// Query keys — single dropdown cache entry shared by team selectors
// ---------------------------------------------------------------------------

export const teamKeys = {
  all: ["team"] as const,
  options: (activeOnly: boolean) =>
    [...teamKeys.all, "options", activeOnly ? "active" : "all"] as const,
}

// ---------------------------------------------------------------------------
// Dropdown options — plain array endpoint; single cache entry shared across
// inbox assignment labels and dashboard setup counts. activeOnly=true
// preserves the existing inbox behavior (active Agents only).
// 5-minute cache — team rosters change infrequently.
// ---------------------------------------------------------------------------

export function useTeamOptions(activeOnly = true) {
  return useQuery<TenantAgentDto[]>({
    queryKey: teamKeys.options(activeOnly),
    queryFn: async () => {
      const rows = await tenantAgentsApi.list()
      return activeOnly ? rows.filter((member) => member.status === "active") : rows
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}
