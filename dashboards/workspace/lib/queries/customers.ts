import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  agentCustomersApi,
  agentCustomerTagsApi,
  type AgentCustomerDto,
  type AgentCustomerListOptions,
  type AgentTimelineEventDto,
  type CustomerTagDto,
  type PaginatedResponse,
} from "@/lib/api"

// ---------------------------------------------------------------------------
// Query keys — every filter combo caches separately + shared dropdown options
// ---------------------------------------------------------------------------

export const customerKeys = {
  all: ["customers"] as const,
  list: (filters: AgentCustomerListOptions) =>
    [...customerKeys.all, "list", filters] as const,
  options: (activeOnly: boolean) =>
    [...customerKeys.all, "options", activeOnly ? "active" : "all"] as const,
  timeline: (customerId: string) =>
    [...customerKeys.all, "timeline", customerId] as const,
  // Written as a literal (not via customerKeys.all) — a self-referencing
  // entry inside the initializer would make the whole object's type circular.
  tags: ["customers", "tags"] as const,
}

// ---------------------------------------------------------------------------
// List query — server paginates/filters; stale rows kept while refetching
// ---------------------------------------------------------------------------

export function useCustomersList(filters: AgentCustomerListOptions) {
  return useQuery<PaginatedResponse<AgentCustomerDto>>({
    queryKey: customerKeys.list(filters),
    queryFn: () => agentCustomersApi.list(filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Dropdown options — single cache entry shared across every customer selector.
// activeOnly=true preserves dialog behavior (active-only); orders page filter
// passes false to keep showing customers of every status.
// ---------------------------------------------------------------------------

export function useCustomerOptions(activeOnly = true) {
  return useQuery<AgentCustomerDto[]>({
    queryKey: customerKeys.options(activeOnly),
    queryFn: async () => {
      const page = await agentCustomersApi.list({ limit: 100 })
      const rows = page.data
      return activeOnly ? rows.filter((customer) => customer.status === "active") : rows
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

/**
 * Customer activity timeline — per-customer, server-paginated newest-first
 * (30-second cache). The page/limit are part of the query key so each page is
 * fetched once and cached separately.
 */
export function useCustomerTimeline(
  customerId: string | null | undefined,
  page = 1,
  limit = 10,
) {
  return useQuery<PaginatedResponse<AgentTimelineEventDto>>({
    queryKey: [...customerKeys.timeline(customerId || "none"), page, limit] as const,
    queryFn: () => {
      if (!customerId) {
        return Promise.resolve<PaginatedResponse<AgentTimelineEventDto>>({
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        })
      }
      return agentCustomersApi.timeline(customerId, { page, limit })
    },
    enabled: Boolean(customerId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutations — precise invalidation of customer lists only
// ---------------------------------------------------------------------------

/**
 * Shared tag vocabulary (create/rename/delete via the Manage Tag dialog).
 * Kept at 60s staleness so the dialog and the new-customer picker see
 * teammates' edits without constant refetching.
 */
export function useCustomerTags() {
  return useQuery<CustomerTagDto[]>({
    queryKey: customerKeys.tags,
    queryFn: () => agentCustomerTagsApi.list(),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof agentCustomersApi.create>[0]) =>
      agentCustomersApi.create(data),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: customerKeys.all })
    },
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof agentCustomersApi.update>[1]
    }) => agentCustomersApi.update(id, data),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: customerKeys.all })
    },
  })
}
