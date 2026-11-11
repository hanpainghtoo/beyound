import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  agentDeliveriesApi,
  type AgentDeliveryDto,
  type AgentDeliveryListOptions,
  type PaginatedResponse,
} from "@/lib/api"
import { deliveryKeys, orderKeys } from "./keys"
import { invalidateConversationQueue } from "./inbox"

// Shared with orders.ts so either domain can invalidate the other.
export { deliveryKeys } from "./keys"

// ---------------------------------------------------------------------------
// List query — server paginates/filters; stale rows kept while refetching.
// Delivery writes go through the orders lifecycle API, so pages invalidate
// this key after saving (see deliveries/page.tsx).
// ---------------------------------------------------------------------------

export function useDeliveriesList(filters: AgentDeliveryListOptions) {
  return useQuery<PaginatedResponse<AgentDeliveryDto>>({
    queryKey: deliveryKeys.list(filters),
    queryFn: () => agentDeliveriesApi.list(filters),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Customer-scoped list — the inbox Delivery List pages this newest-first
// (Plan 72). Same reasoning as `useCustomerOrders` in queries/orders.ts.
// ---------------------------------------------------------------------------

export function useCustomerDeliveries(
  customerId: string | null | undefined,
  page = 1,
  limit = 15,
) {
  return useQuery<PaginatedResponse<AgentDeliveryDto>>({
    queryKey: deliveryKeys.list({ customerId: customerId ?? "none", page, limit }),
    queryFn: () =>
      agentDeliveriesApi.list({
        customerId: customerId ?? "",
        page,
        limit,
        sortBy: "createdAt",
        sortOrder: "DESC",
      }),
    enabled: Boolean(customerId),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Single delivery — the inbox deep link (`?delivery=`) may point at a row that
// is not on the deliveries page's current page or filter, so it is fetched by
// id instead of being silently dropped.
// ---------------------------------------------------------------------------

export function useDelivery(id: string | null | undefined) {
  return useQuery<AgentDeliveryDto>({
    queryKey: deliveryKeys.detail(id ?? "none"),
    queryFn: () => agentDeliveriesApi.get(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mutations — delivery edits also change fields mirrored on the order
// (status, assignee, date, shipping address), so the order lists must refresh
// too: the inbox context Order List and the main Order List read those fields.
// ---------------------------------------------------------------------------

export function useUpdateDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof agentDeliveriesApi.update>[1]
    }) => agentDeliveriesApi.update(id, data),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: deliveryKeys.all })
      void qc.invalidateQueries({ queryKey: orderKeys.all })
      // Delivery status and assignee are mirrored onto the order that backs
      // the chat head's order indicators.
      invalidateConversationQueue(qc)
    },
  })
}
