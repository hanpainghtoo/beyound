import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  agentOrdersApi,
  type AgentOrderDto,
  type AgentOrderListOptions,
  type PaginatedResponse,
} from "@/lib/api"
import { deliveryKeys, orderKeys } from "./keys"
import { invalidateConversationQueue } from "./inbox"

// Query keys live in one module so delivery mutations can invalidate orders
// (and vice versa) without importing each other.
export { orderKeys } from "./keys"

// ---------------------------------------------------------------------------
// List query — server paginates/filters; stale rows kept while refetching.
// Orders change often (lifecycle writes), so the cache goes stale fast.
// ---------------------------------------------------------------------------

export function useOrdersList(filters: AgentOrderListOptions) {
  return useQuery<PaginatedResponse<AgentOrderDto>>({
    queryKey: orderKeys.list(filters),
    queryFn: () => agentOrdersApi.list({ sortBy: "createdAt", sortOrder: "DESC", ...filters }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Customer-scoped lists — the inbox context panel pages these newest-first
// (Plan 72). The `customerId` predicate runs server-side: the old bulk scan
// filtered the first 100 rows client-side and silently dropped anything
// past it while reporting wrong totals. The conversation-linked row is
// highlighted client-side (match on `conversationId`), so the list stays a
// real list even when this chat holds one of many orders.
// ---------------------------------------------------------------------------

export const CONTEXT_LIST_PAGE_SIZE = 15

export function useCustomerOrders(
  customerId: string | null | undefined,
  page = 1,
  limit = CONTEXT_LIST_PAGE_SIZE,
) {
  return useQuery<PaginatedResponse<AgentOrderDto>>({
    queryKey: orderKeys.list({ customerId: customerId ?? "none", page, limit }),
    queryFn: () =>
      agentOrdersApi.list({
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
// Bulk orders — first-100 scan shared by cross-domain consumers (customers
// enrichment, inbox order panels, dashboard activity). Single cache entry.
// ---------------------------------------------------------------------------

export function useOrdersBulk() {
  return useQuery<AgentOrderDto[]>({
    queryKey: orderKeys.bulk(),
    queryFn: async () => (await agentOrdersApi.list({ sortBy: "createdAt", sortOrder: "DESC" })).data,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutations — invalidate lists plus the affected detail
// ---------------------------------------------------------------------------

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof agentOrdersApi.create>[0]) =>
      agentOrdersApi.create(data),
    // Await the refresh: the inbox context Order List must already contain the
    // new row when the dialog closes, not on the next render after an
    // unawaited background refetch.
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: orderKeys.all })
      // A new order can become the conversation's latest order, which drives
      // the chat head's order/delivery/payment indicators.
      invalidateConversationQueue(qc)
    },
  })
}

export function useUpdateOrderDetails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof agentOrdersApi.updateDetails>[1]
    }) => agentOrdersApi.updateDetails(id, data),
    onSettled: (_data, _error, variables) => {
      void qc.invalidateQueries({ queryKey: orderKeys.all })
      void qc.invalidateQueries({ queryKey: orderKeys.detail(variables.id) })
      // Delivery edits mirror status/assignee onto the order the chat head
      // summarises, so refresh the conversation queue as well.
      invalidateConversationQueue(qc)
    },
  })
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: Parameters<typeof agentOrdersApi.updateStatus>[1]; reason?: string }) =>
      agentOrdersApi.updateStatus(id, status, reason),
    onSettled: (_data, _error, variables) => {
      void qc.invalidateQueries({ queryKey: orderKeys.all })
      void qc.invalidateQueries({ queryKey: orderKeys.detail(variables.id) })
      // Delivery lists only contain confirmed orders, so confirming or
      // cancelling an order adds/removes it from those lists too.
      void qc.invalidateQueries({ queryKey: deliveryKeys.all })
      // Order/lifecycle status feeds the chat head's order indicator.
      invalidateConversationQueue(qc)
    },
  })
}

export function useUpdateOrderPaymentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, reason, attachmentReference }: {
      id: string
      status: Parameters<typeof agentOrdersApi.updatePaymentStatus>[1]
      reason?: string
      attachmentReference?: string
    }) => agentOrdersApi.updatePaymentStatus(id, status, reason, attachmentReference),
    onSettled: (_data, _error, variables) => {
      void qc.invalidateQueries({ queryKey: orderKeys.all })
      void qc.invalidateQueries({ queryKey: orderKeys.detail(variables.id) })
      void qc.invalidateQueries({ queryKey: orderKeys.payments(variables.id) })
      invalidateConversationQueue(qc)
    },
  })
}

// ---------------------------------------------------------------------------
// Payment ledger — transactions are append-only, so the detail response is
// authoritative. Mutations invalidate both the order detail and the ledger.
// ---------------------------------------------------------------------------

export function useOrderPayments(orderId: string | null | undefined) {
  return useQuery({
    queryKey: orderKeys.payments(orderId ?? "none"),
    queryFn: () => agentOrdersApi.listPayments(orderId as string),
    enabled: Boolean(orderId),
    staleTime: 10_000,
  })
}

export function useSubmitOrderPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & Parameters<typeof agentOrdersApi.submitPayment>[1]) =>
      agentOrdersApi.submitPayment(id, input),
    onSettled: (_data, _error, variables) => {
      void qc.invalidateQueries({ queryKey: orderKeys.all })
      void qc.invalidateQueries({ queryKey: orderKeys.detail(variables.id) })
      void qc.invalidateQueries({ queryKey: orderKeys.payments(variables.id) })
      invalidateConversationQueue(qc)
    },
  })
}

export function useMarkOrderUnpaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      reason,
      idempotencyKey,
    }: {
      id: string
      reason: string
      idempotencyKey?: string
    }) => agentOrdersApi.markUnpaid(id, reason, idempotencyKey),
    onSettled: (_data, _error, variables) => {
      void qc.invalidateQueries({ queryKey: orderKeys.all })
      void qc.invalidateQueries({ queryKey: orderKeys.detail(variables.id) })
      void qc.invalidateQueries({ queryKey: orderKeys.payments(variables.id) })
      invalidateConversationQueue(qc)
    },
  })
}

export function useUpdateOrderDeliveryStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, reason }: {
      id: string
      status: Parameters<typeof agentOrdersApi.updateDeliveryStatus>[1]
      reason?: string
    }) => agentOrdersApi.updateDeliveryStatus(id, status, reason),
    onSettled: (_data, _error, variables) => {
      void qc.invalidateQueries({ queryKey: orderKeys.all })
      void qc.invalidateQueries({ queryKey: orderKeys.detail(variables.id) })
      void qc.invalidateQueries({ queryKey: deliveryKeys.all })
      // Delivery status is one of the chat head's three order indicators.
      invalidateConversationQueue(qc)
    },
  })
}
