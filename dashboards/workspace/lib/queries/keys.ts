import type {
  AgentDeliveryListOptions,
  AgentOrderListOptions,
} from "@/lib/api"

// ---------------------------------------------------------------------------
// Shared query keys
//
// Order and delivery caches are coupled: confirming/cancelling an order changes
// which rows exist in the delivery lists, and delivery edits mirror status and
// assignee fields back onto orders. Keeping both key definitions here lets
// either mutation module invalidate the other's cache without a circular import.
// ---------------------------------------------------------------------------

export const orderKeys = {
  all: ["orders"] as const,
  list: (filters: AgentOrderListOptions) =>
    [...orderKeys.all, "list", filters] as const,
  detail: (orderId: string) => [...orderKeys.all, "detail", orderId] as const,
  bulk: () => [...orderKeys.all, "bulk"] as const,
  payments: (orderId: string) =>
    [...orderKeys.all, "payments", orderId] as const,
}

export const deliveryKeys = {
  all: ["deliveries"] as const,
  list: (filters: AgentDeliveryListOptions) =>
    [...deliveryKeys.all, "list", filters] as const,
  detail: (id: string) => [...deliveryKeys.all, "detail", id] as const,
}
