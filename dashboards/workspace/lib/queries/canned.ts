import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { agentCannedResponsesApi, type AgentCannedResponseDto } from "@/lib/api"

// ---------------------------------------------------------------------------
// Query keys — single dropdown cache entry shared by canned-reply selectors
// ---------------------------------------------------------------------------

export const cannedKeys = {
  all: ["canned-responses"] as const,
  options: () => [...cannedKeys.all, "options"] as const,
}

// ---------------------------------------------------------------------------
// Dropdown options — plain array endpoint; single cache entry shared across
// the inbox fast-reply selector (and any other canned picker).
// 5-minute cache — replies change infrequently.
// ---------------------------------------------------------------------------

export function useCannedResponseOptions() {
  return useQuery<AgentCannedResponseDto[]>({
    queryKey: cannedKeys.options(),
    queryFn: () => agentCannedResponsesApi.list(),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}
