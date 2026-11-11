import { create } from "zustand"
import { devtools, persist } from "zustand/middleware"
import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/lib/api"

export type InboxMode = "queue" | "focus"
export type MobilePane = "queue" | "conversation" | "context"
/**
 * Workflow chips. Status (All/Open/Pending/Resolved/Closed) is its own facet
 * below, so an agent can combine e.g. "Unassigned + Open".
 *
 * The intent buckets (payment review, delivery, complaints, follow-up) and the
 * lead segments (hot leads, VIP) are no longer chips: the queue now carries the
 * linked order's real order/delivery/payment state, which is what agents were
 * actually trying to filter on.
 */
export type QueueFilter =
  | "all"
  | "unread"
  | "unassigned"
  | "mine"
  | "overdue"
  | "needs_attention"
/**
 * Conversation status facet, independent of `QueueFilter`.
 *
 * Status and workflow (unread, unassigned, mine …) are separate dimensions:
 * an agent can legitimately want "unassigned + open". Keeping them in one
 * union meant picking a status silently discarded the assignment filter.
 */
export type QueueStatusFilter = "all" | "open" | "pending" | "resolved" | "closed"
export type ContextTab = "orders" | "deliveries" | "notes"

/**
 * Client-only inbox UI state (per state-management-rules.md:24).
 *
 * Deliberately NOT here: conversation rows, messages, customer
 * profile, orders. Those are server state and belong in
 * `lib/queries/inbox.ts` — keeping them out of here is the whole point of the
 * split.
 *
 * Deliberately NOT here either: `mode` and `rushMode`. Both are driven by the
 * `?mode=` / `?rush=` URL params, so they are URL state rather than UI state
 * and the page owns them alongside `useSearchParams`.
 */
type InboxState = {
  queueFilter: QueueFilter
  queueStatus: QueueStatusFilter
  /**
   * Latest-linked-order facets. Each is applied server-side against the same
   * newest order the chat head renders, so the rows and the badges on them
   * can never describe different orders.
   */
  queueOrderStatus: OrderStatus | "all"
  queueDeliveryStatus: DeliveryStatus | "all"
  queuePaymentStatus: PaymentStatus | "all"
  queueChannelId: string | null
  conversationSearch: string
  selectedConversationId: string | null
  mobilePane: MobilePane
  contextTab: ContextTab
  /**
   * Desktop pane visibility, toggled from the thread header (xl and up only).
   * Persisted to localStorage (see `persist` below): first visit lands on
   * queue-open / context-hidden, and whatever the user leaves is what they
   * get back — across page changes and full reloads alike. Only the view
   * booleans below persist; filter, selection, search, and tab stay
   * session-only so a return never reopens a stale conversation or filter.
   */
  showQueue: boolean
  showContext: boolean
  /**
   * Whether bot-menu taps and order events render inline in the thread
   * (Plan 75). A view preference, not an action, so it persists with the
   * pane toggles instead of resetting on every reload.
   */
  showActivity: boolean

  setQueueFilter: (filter: QueueFilter) => void
  setQueueStatus: (status: QueueStatusFilter) => void
  setQueueOrderStatus: (status: OrderStatus | "all") => void
  setQueueDeliveryStatus: (status: DeliveryStatus | "all") => void
  setQueuePaymentStatus: (status: PaymentStatus | "all") => void
  setQueueChannelId: (channelId: string | null) => void
  setConversationSearch: (value: string) => void
  selectConversation: (conversationId: string | null) => void
  setMobilePane: (pane: MobilePane) => void
  setContextTab: (tab: ContextTab) => void
  setShowQueue: (show: boolean) => void
  setShowContext: (show: boolean) => void
  setShowActivity: (show: boolean) => void
}

export const useInboxStore = create<InboxState>()(
  devtools(
    persist(
      (set) => ({
      queueFilter: "all",
      queueStatus: "all",
      queueOrderStatus: "all",
      queueDeliveryStatus: "all",
      queuePaymentStatus: "all",
      queueChannelId: null,
      conversationSearch: "",
      selectedConversationId: null,
      mobilePane: "queue",
      contextTab: "orders",
      showQueue: true,
      showContext: false,
      showActivity: true,

      setQueueFilter: (queueFilter) => set({ queueFilter }),
      setQueueStatus: (queueStatus) => set({ queueStatus }),
      setQueueOrderStatus: (queueOrderStatus) => set({ queueOrderStatus }),
      setQueueDeliveryStatus: (queueDeliveryStatus) => set({ queueDeliveryStatus }),
      setQueuePaymentStatus: (queuePaymentStatus) => set({ queuePaymentStatus }),
      setQueueChannelId: (queueChannelId) => set({ queueChannelId }),
      setConversationSearch: (conversationSearch) => set({ conversationSearch }),
      selectConversation: (selectedConversationId) => set({ selectedConversationId }),
      setMobilePane: (mobilePane) => set({ mobilePane }),
      setContextTab: (contextTab) => set({ contextTab }),
      setShowQueue: (showQueue) => set({ showQueue }),
      setShowContext: (showContext) => set({ showContext }),
      setShowActivity: (showActivity) => set({ showActivity }),
      }),
      {
        name: "zayos-inbox-panes",
        version: 1,
        // Persist the view toggles only. A return visit must never reopen a
        // stale conversation, filter, or search, so everything else stays
        // session-only by exclusion here.
        partialize: (state) => ({
          showQueue: state.showQueue,
          showContext: state.showContext,
          showActivity: state.showActivity,
        }),
        // Corrupt or foreign stored JSON falls back to the landing defaults
        // instead of wedging the layout with non-boolean values.
        merge: (persisted, current) => {
          const stored = (persisted ?? {}) as Partial<
            Pick<InboxState, "showQueue" | "showContext" | "showActivity">
          >
          return {
            ...current,
            showQueue:
              typeof stored.showQueue === "boolean" ? stored.showQueue : true,
            showContext:
              typeof stored.showContext === "boolean"
                ? stored.showContext
                : false,
            showActivity:
              typeof stored.showActivity === "boolean"
                ? stored.showActivity
                : true,
          }
        },
      },
    ),
    { name: "InboxStore" },
  ),
)
