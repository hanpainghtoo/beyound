"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PanelLeft,
  PanelRight,
  Pencil,
  Pin,
  Search,
  ShoppingCart,
  Trash2,
  Users,
} from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { MediaPicker } from "@/components/media-picker"
import { WorkspacePage } from "@/components/workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Virtuoso } from "react-virtuoso"
import { useAgentLiveInbox } from "@/hooks/use-agent-live-inbox"
import {
  agentConversationsApi,
  agentCustomersApi,
  agentMediaApi,
  getApiErrorMessage,
  tenantPaymentMethodsApi,
  getStoredSession,
  type AgentConversationDto,
  type AgentConversationNoteDto,
  type AgentCustomerDto,
  type AgentMessageDto,
  type AgentMediaFileDto,
  type AgentOrderDto,
  type DeliveryStatus,
  type OrderStatus,
  type PaymentStatus,
  type WorkspacePaymentSettings,
} from "@/lib/api"
import { CreateOrderDialog } from "@/components/orders/create-order-dialog"
import { useCannedResponseOptions } from "@/lib/queries/canned"
import { useProductCategories, useProductOptions } from "@/lib/queries/products"
import { useChannelOptions } from "@/lib/queries/channels"
import { useTeamOptions } from "@/lib/queries/team"
import { useOrdersBulk, useCustomerOrders } from "@/lib/queries/orders"
import { useCustomerDeliveries } from "@/lib/queries/deliveries"
import {
  appendThreadMessage,
  conversationKeys,
  patchConversations,
  patchThreadMessages,
  replaceNewestThreadPage,
  scheduleQueueCountsRefresh,
  THREAD_PAGE_SIZE,
  useAssignConversation,
  useConversationMessagesInfinite,
  useConversationNotes,
  useConversationQueueInfinite,
  useCreateConversationNote,
  useDeleteConversationNote,
  useSendConversationMessage,
  useRetryConversationMessage,
  useSetConversationRead,
  useUpdateConversation,
  useUpdateConversationNote,
  type QueueFilters,
} from "@/lib/queries/inbox"
import { useInboxStore, type ContextTab, type QueueFilter, type QueueStatusFilter } from "@/lib/stores/inbox-store"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  customerStatusBadgeClass,
  intentBadgeClass,
  paymentBadgeClass,
  statusBadgeClass,
} from "@/lib/inbox-badges"
import { AssignDialog } from "@/components/inbox/assign-dialog"
import { SavedReplyDialog } from "@/components/inbox/saved-reply-dialog"
import { SendProductDialog, formatProductsForComposer } from "@/components/inbox/send-product-dialog"
import { PaymentMethodsPicker } from "@/components/inbox/payment-methods-picker"
import { ChatheadCard } from "@/components/inbox/chathead-card"
import type { ConversationRecord } from "@/components/inbox/types"
import { useI18n } from "@/components/providers/i18n-provider"
import { ChannelMark, isMediaMessagingChannel } from "@/components/inbox/channel-icon"
import { MessageBubble } from "@/components/inbox/message-bubble"
import { MessageComposer } from "@/components/inbox/message-composer"
import { QueueEmptyState, QueueNextPageLoader, QueueSkeleton } from "@/components/inbox/queue-states"
import {
  formatCurrencyPlain as formatCurrency,
  formatDate as formatDate,
  formatDateTimeShort as formatDateTime,
  formatDayDividerLabel,
  formatLocation as formatLocation,
  humanize as toTitle,
  isSameLocalDay,
} from "@/lib/format"

/**
 * The three context tabs (Plan 72). Customer info lives in the panel header,
 * not a tab; Timeline is gone and payment folds into the Order List as pills.
 *
 * These are module-scope so they hold translation KEYS, not translated text —
 * `useI18n()` is a hook and cannot run here. Keys are resolved with `t()` at
 * render time. Because `check-keys.mjs` only validates literal translation
 * calls, these dynamic keys are verified by
 * `scripts/check-dynamic-i18n-keys.mjs` instead.
 */
const CONTEXT_TABS: Array<{ value: ContextTab; labelKey: string }> = [
  { value: "orders", labelKey: "workspace.inbox.contextTab.orders" },
  { value: "deliveries", labelKey: "workspace.inbox.contextTab.deliveries" },
  { value: "notes", labelKey: "workspace.inbox.contextTab.notes" },
]

/**
 * Status chips. These are the four real conversation statuses plus All, and
 * each one is its own API request (`status=<value>`). Closed deliberately gets
 * its own chip: it used to share the Resolved bucket, so two distinct workflow
 * states produced identical results and the card labelled both "Resolved".
 */
const STATUS_FILTERS: Array<{ value: QueueStatusFilter; labelKey: string }> = [
  { value: "all", labelKey: "workspace.inbox.filter.all" },
  { value: "open", labelKey: "workspace.inbox.status.open" },
  { value: "pending", labelKey: "workspace.inbox.status.pending" },
  { value: "resolved", labelKey: "workspace.inbox.status.resolved" },
  { value: "closed", labelKey: "workspace.inbox.status.closed" },
]

const PRIMARY_FILTERS: Array<{ value: QueueFilter; labelKey: string }> = [
  { value: "unread", labelKey: "workspace.inbox.filter.unread" },
  { value: "mine", labelKey: "workspace.inbox.filter.mine" },
  { value: "unassigned", labelKey: "workspace.inbox.filter.unassigned" },
  { value: "overdue", labelKey: "workspace.inbox.filter.overdue" },
  { value: "needs_attention", labelKey: "workspace.inbox.filter.needsAttention" },
]

/**
 * Latest-linked-order facets. These replace the old intent dropdown: an agent
 * filtering "Payment review" was really asking for the order's payment state,
 * and the card now shows that state from the newest linked order. The backend
 * applies the same newest-order predicate the card projects.
 */
const ORDER_STATUS_OPTIONS: Array<{ value: OrderStatus; labelKey: string }> = [
  { value: "pending", labelKey: "workspace.ordersPage.orderStatus.pending" },
  { value: "confirmed", labelKey: "workspace.ordersPage.orderStatus.confirmed" },
  { value: "rejected", labelKey: "workspace.ordersPage.orderStatus.rejected" },
  { value: "cancelled", labelKey: "workspace.ordersPage.orderStatus.cancelled" },
]

const DELIVERY_STATUS_OPTIONS: Array<{ value: DeliveryStatus; labelKey: string }> = [
  { value: "packed", labelKey: "workspace.deliveries.state.packed" },
  { value: "out_for_delivery", labelKey: "workspace.deliveries.state.out_for_delivery" },
  { value: "delivered", labelKey: "workspace.deliveries.state.delivered" },
  { value: "failed_delivery", labelKey: "workspace.deliveries.state.failed_delivery" },
  { value: "returned", labelKey: "workspace.deliveries.state.returned" },
]

const PAYMENT_STATUS_OPTIONS: Array<{ value: PaymentStatus; labelKey: string }> = [
  { value: "unpaid", labelKey: "workspace.ordersPage.unpaid" },
  { value: "partially_paid", labelKey: "workspace.orders.paymentPartiallyPaid" },
  { value: "paid", labelKey: "workspace.ordersPage.paid" },
]

/**
 * Chip → the API request that backs it.
 *
 * Every chip is a request. The browser used to evaluate these against loaded
 * rows, which could only ever see pages already in memory — so "Payment
 * review" silently missed every payment review beyond the first page. The
 * values here line up one-for-one with the keys the API returns in `counts`,
 * so a chip's number and the rows it produces cannot disagree.
 */
const queueFilterRequest: Record<QueueFilter, QueueFilters> = {
  all: {},
  unread: { filter: "unread" },
  unassigned: { unassigned: true },
  mine: { mine: true },
  overdue: { filter: "overdue" },
  needs_attention: { filter: "needs_attention" },
}

const mapConversation = (conversation: AgentConversationDto): ConversationRecord => ({
  id: conversation.id,
  customerId: conversation.customerId,
  assignedAgentId: conversation.assignedAgentId,
  customerName: conversation.customer?.fullName || conversation.subject || "Customer",
  customerAvatar: conversation.customer?.avatarUrl,
  channelName: conversation.channel?.displayName || conversation.channel?.channelName || "Channel",
  channelType: conversation.channel?.channelType || "unknown",
  latestMessage: conversation.searchSnippet || conversation.subject || null,
  latestIsAgent: conversation.latestSenderType === "agent",
  customerWaiting:
    !!conversation.lastCustomerMessageAt &&
    conversation.lastCustomerMessageAt >= (conversation.lastMessageAt || ""),
  latestAt: conversation.lastMessageAt || conversation.updatedAt,
  waitingSince: conversation.lastCustomerMessageAt || conversation.lastMessageAt || conversation.updatedAt,
  unread: conversation.metadata?.inboxUnread === true,
  unreadCount: typeof conversation.metadata?.inboxUnreadCount === "number" ? conversation.metadata.inboxUnreadCount : null,
  priority: conversation.priority,
  status: conversation.status,
  subject: conversation.subject,
  email: conversation.customer?.email,
  phone: conversation.customer?.phone,
  location: formatLocation(conversation.customer?.location),
  tags: [...(conversation.tags || []), ...(conversation.customer?.tags || [])],
  slaDueAt: conversation.slaDueAt,
  intent: conversation.intent ?? "general",
  urgency: conversation.urgency ?? "neutral",
  score: conversation.score ?? 0,
  shoppingStage: conversation.metadata?.shoppingStage ?? null,
  needsAttention: conversation.metadata?.needsAttention === true,
  latestOrder: conversation.latestOrder ?? null,
  raw: conversation,
})

const mapMessage = (message: AgentMessageDto) => ({
  ...message,
  content: message.content || "",
})

type ThreadItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; message: AgentMessageDto }

/** Agent-visible activity entries (bot taps, order events): system senders
 *  with a systemEvent marker — mirrors MessageBubble's internal check. */
function isActivityMessage(message: AgentMessageDto) {
  return (
    message.senderType === "system" &&
    message.messageType === "system_event" &&
    (message.metadata as { systemEvent?: unknown } | null)?.systemEvent ===
      true
  )
}

/** Thread rows interleaved with Today/Yesterday date dividers. Derived from
 *  the full loaded list, so fetching an older page merges its dividers in
 *  without any extra bookkeeping. `content` stays nullable here — the bubble
 *  already falls back for empty content, and `mapMessage` normalises the
 *  socket/send/retry writes on their way in. */
function toThreadItems(rows: AgentMessageDto[]): ThreadItem[] {
  const items: ThreadItem[] = []
  let previousCreatedAt: string | null = null
  for (const message of rows) {
    if (previousCreatedAt === null || !isSameLocalDay(previousCreatedAt, message.createdAt)) {
      // Date-only key, deliberately: when an older page prepends, the
      // boundary divider merges into a longer same-day run instead of being
      // replaced — so its key (and the virtualizer's anchor) must not depend
      // on which message happened to be first.
      const day = new Date(message.createdAt)
      items.push({
        kind: "day",
        key: `day-${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`,
        label: formatDayDividerLabel(message.createdAt),
      })
    }
    items.push({ kind: "message", message })
    previousCreatedAt = message.createdAt
  }
  return items
}

/** Stable virtualizer keys: message ids are unique; day keys are date-only
 *  (see toThreadItems) so boundary dividers survive prepends. */
function threadItemKey(_index: number, item: ThreadItem): string {
  return item.kind === "day" ? item.key : item.message.id
}

function ThreadDayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-1" aria-label={label}>
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
      <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {label}
      </span>
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
    </div>
  )
}

/** Base index: Virtuoso counts down from here as older pages prepend, so
 *  every stable item keeps its index and the viewport never moves. */
const THREAD_FIRST_INDEX = 100_000
/** The next commerce action for the context panel — order-state driven, so it
 *  stays on the client; unlike intent/urgency it is not a filter. */
export default function InboxPage() {
  const { t } = useI18n()
  const session = getStoredSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedConversationId = searchParams.get("conversation")
  const requestedCustomerId = searchParams.get("customer")
  const sessionUserId = session?.user.id || ""
  const sessionRole = session?.user.role || "agent"
  // Rows per page. Fixed at 12: the per-page selector is gone (pure infinite
  // scroll has no footer). Twelve rows fill a laptop queue pane without
  // scrolling, and smaller pages keep each socket-triggered refetch cheap.
  const queuePageSize = 12

  // Client UI state lives in the store (per state-management-rules.md:24);
  // the queue itself is server state and lives in the query cache.
  const queueFilter = useInboxStore((state) => state.queueFilter)
  const setQueueFilter = useInboxStore((state) => state.setQueueFilter)
  const queueStatus = useInboxStore((state) => state.queueStatus)
  const setQueueStatus = useInboxStore((state) => state.setQueueStatus)
  const queueOrderStatus = useInboxStore((state) => state.queueOrderStatus)
  const setQueueOrderStatus = useInboxStore((state) => state.setQueueOrderStatus)
  const queueDeliveryStatus = useInboxStore((state) => state.queueDeliveryStatus)
  const setQueueDeliveryStatus = useInboxStore((state) => state.setQueueDeliveryStatus)
  const queuePaymentStatus = useInboxStore((state) => state.queuePaymentStatus)
  const setQueuePaymentStatus = useInboxStore((state) => state.setQueuePaymentStatus)
  const queueChannelId = useInboxStore((state) => state.queueChannelId)
  const setQueueChannelId = useInboxStore((state) => state.setQueueChannelId)
  const channelOptions = useChannelOptions()
  const activeChannel = (channelOptions.data ?? []).find((c) => c.id === queueChannelId) ?? null
  const conversationSearch = useInboxStore((state) => state.conversationSearch)
  const setConversationSearch = useInboxStore((state) => state.setConversationSearch)
  // Search runs server-side: the backend matches 9 fields including order
  // number, email, phone and payment notes, none of which the client-side
  // `includes` over four concatenated fields could reach. Debounced at 300ms to
  // match the orders/customers/products pages.
  const [debouncedSearch, setDebouncedSearch] = useState("")
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(conversationSearch.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [conversationSearch])
  const selectedConversationId = useInboxStore((state) => state.selectedConversationId)
  const selectConversation = useInboxStore((state) => state.selectConversation)
  const mobilePane = useInboxStore((state) => state.mobilePane)
  const setMobilePane = useInboxStore((state) => state.setMobilePane)
  const contextTab = useInboxStore((state) => state.contextTab)
  const setContextTab = useInboxStore((state) => state.setContextTab)
  const showQueue = useInboxStore((state) => state.showQueue)
  const setShowQueue = useInboxStore((state) => state.setShowQueue)
  const showContext = useInboxStore((state) => state.showContext)
  const setShowContext = useInboxStore((state) => state.setShowContext)
  const showActivity = useInboxStore((state) => state.showActivity)
  const setShowActivity = useInboxStore((state) => state.setShowActivity)

  const queryClient = useQueryClient()
  const setConversationRead = useSetConversationRead()
  const sendConversationMessage = useSendConversationMessage()
  const retryConversationMessage = useRetryConversationMessage()
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null)
  const assignConversation = useAssignConversation()
  const updateConversation = useUpdateConversation()

  const queueFiltersRequest = useMemo<QueueFilters>(
    () => ({
      ...queueFilterRequest[queueFilter],
      // Status is its own facet: selecting Open must not discard an active
      // Unassigned/Mine/Unread workflow filter, or vice versa.
      ...(queueStatus !== "all" ? { status: queueStatus } : {}),
      // Order facets are applied server-side against the newest linked order,
      // the same row the chat head renders.
      ...(queueOrderStatus !== "all" ? { orderStatus: queueOrderStatus } : {}),
      ...(queueDeliveryStatus !== "all" ? { deliveryStatus: queueDeliveryStatus } : {}),
      ...(queuePaymentStatus !== "all" ? { paymentStatus: queuePaymentStatus } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      // Channel scope joins search above: chips recount inside it, and the
      // query key changes with it, so switching channels refetches cleanly.
      ...(queueChannelId ? { channelId: queueChannelId } : {}),
    }),
    [
      queueFilter,
      queueStatus,
      queueOrderStatus,
      queueDeliveryStatus,
      queuePaymentStatus,
      debouncedSearch,
      queueChannelId,
    ],
  )
  const queueQuery = useConversationQueueInfinite(
    queueFiltersRequest,
    queuePageSize,
    sessionUserId || null,
  )
  const queueRows = queueQuery.rows
  // Cache holds raw server DTOs; the page works in mapped records.
  const conversations = useMemo(
    () => queueRows.map(mapConversation),
    [queueRows],
  )
  // Read by the conversation-context effect, which must not re-run when the
  // queue changes underneath it. Synced in an effect declared before that
  // consumer so the ref is current when the context effect runs.
  const conversationsRef = useRef(conversations)
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])
  // Total rows the server holds. Greater than `conversations.length` means
  // conversations exist that we have not loaded.
  const queueTotal = typeof queueQuery.total === "number" ? queueQuery.total : null
  /**
   * Skeleton while the queue has nothing real to show.
   *
   * `isPending` covers the cold load. `isPlaceholderData` covers a filter or
   * search change: `keepPreviousData` holds the *previous* filter's rows so the
   * list doesn't collapse, which meant `isPending` stayed false and the pane
   * silently displayed the previous filter's conversations as if they were the
   * new answer. Loading more pages is not placeholder data, so infinite scroll
   * does not blank the list.
   */
  const loadingQueue = queueQuery.isPending || queueQuery.isPlaceholderData
  const queueLoadFailed = queueQuery.isError
  // Flips false -> true once the queue query settles. Used as a one-shot signal
  // that rows are available, without depending on the rows themselves.
  const queueReady = !queueQuery.isPending

  /** Socket upserts and optimistic writes patch the cache in place — neither
   *  goes through a mutation, so they share the library's patch helper rather
   *  than reimplementing it. */
  const patchQueueCache = useCallback(
    (updater: (rows: AgentConversationDto[]) => AgentConversationDto[]) =>
      patchConversations(queryClient, updater),
    [queryClient],
  )

  /**
   * Chip counts ride the list envelope (see `scheduleQueueCountsRefresh`):
   * socket events reschedule a shared debounced invalidation.
   */
  const scheduleCountsRefresh = useCallback(() => {
    scheduleQueueCountsRefresh(queryClient)
  }, [queryClient])

  const reloadQueue = useCallback(async () => {
    await queueQuery.refetch()
  }, [queueQuery])

  // Orders — cached bulk scan shared with customers page/orders/dashboard.
  const ordersBulkQuery = useOrdersBulk()
  const allOrders = useMemo(() => ordersBulkQuery.data ?? [], [ordersBulkQuery.data])
  // Thread messages are server state (newest page first, older pages behind
  // the cursor) — see lib/queries/inbox.ts. The key follows the selection, so
  // switching conversations refetches and the loading skeleton returns.
  const threadQuery = useConversationMessagesInfinite(selectedConversationId)
  const messages = threadQuery.rows
  const loadingMessages = threadQuery.isPending
  const [customerProfile, setCustomerProfile] = useState<AgentCustomerDto | null>(null)
  // Dropdown options — cached across inbox + order surfaces (active-only
  // products preserved, active-only team for role-gated assignment labels).
  const cannedQuery = useCannedResponseOptions()
  const productsQuery = useProductOptions(true)
  const categoriesQuery = useProductCategories()
  const teamQuery = useTeamOptions(true)
  const cannedResponses = cannedQuery.data ?? []
  const products = productsQuery.data ?? []
  const productCategories = categoriesQuery.data ?? []
  const teamOptions = teamQuery.data ?? []
  const canViewTeam = ["owner", "admin", "supervisor"].includes(sessionRole)
  const teamMembers = useMemo(
    () => (canViewTeam ? teamOptions : []),
    // teamOptions identity changes only when the cached query data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canViewTeam, teamQuery.data],
  )
  const [messageText, setMessageText] = useState("")
  const [selectedReplyId, setSelectedReplyId] = useState<string>("")
  const [savedReplyDialogOpen, setSavedReplyDialogOpen] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<AgentMediaFileDto | null>(null)
  const [selectedMediaFresh, setSelectedMediaFresh] = useState(false)
  // Guards the async photo resolve in handleSelectSavedReply: two quick picks
  // can resolve out of order, and a stale response must not clobber the newer
  // selection's preview.
  const replyPhotoRequestRef = useRef(0)
  const handleSelectSavedReply = useCallback(
    async (reply: (typeof cannedResponses)[number]) => {
      setSelectedReplyId(reply.id)
      setMessageText((current) =>
        current.trim() ? `${current.replace(/\s+$/, "")}\n${reply.content}` : reply.content,
      )

      const requestId = replyPhotoRequestRef.current + 1
      replyPhotoRequestRef.current = requestId

      if (!reply.imageMediaId) return

      // A saved-reply photo behaves exactly like a freshly picked one from
      // here on: the id is what the library stores, and the signed URL is
      // minted for this send. `mediaFresh` stays false — this file was saved
      // long ago, so the composer's "Saved to media library" tag would lie.
      try {
        const { file, download } = await agentMediaApi.download(reply.imageMediaId)
        if (replyPhotoRequestRef.current !== requestId) return
        setSelectedMedia({ ...file, download })
        setSelectedMediaFresh(false)
      } catch (error) {
        if (replyPhotoRequestRef.current !== requestId) return
        // Missing file or an expired signed link: keep the text, drop the
        // photo, and say so rather than sending an empty preview.
        setSelectedMedia(null)
        setSelectedMediaFresh(false)
        toast.error(getApiErrorMessage(error, t("workspace.inbox.error.savedReplyPhotoUnavailable")))
      }
    },
    [t],
  )
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [submittingAction, setSubmittingAction] = useState<string | null>(null)
  const [createOrderOpen, setCreateOrderOpen] = useState(false)
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<WorkspacePaymentSettings["methods"]>([])
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false)
  useEffect(() => {
    if (!paymentMethodsOpen || paymentMethodsLoaded) return
    void tenantPaymentMethodsApi.get().then((data) => {
      setPaymentMethods(data.methods || [])
      setPaymentMethodsLoaded(true)
    }).catch(() => setPaymentMethodsLoaded(true))
  }, [paymentMethodsOpen, paymentMethodsLoaded])
  const handleSelectProducts = useCallback(
    async (selected: typeof products) => {
      if (selected.length === 0) return
      const block = formatProductsForComposer(selected)
      setMessageText((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n${block}` : block))
      // Task 20: when sending a single product that has an image, also attach
      // its photo so it goes out with the message (mirrors saved-reply photos).
      if (selected.length === 1) {
        const image = selected[0].primaryImageUrl || selected[0].imageUrls?.[0] || selected[0].images?.[0]
        if (image) {
          try {
            const response = await fetch(image)
            if (!response.ok) throw new Error("fetch failed")
            const blob = await response.blob()
            const file = new File([blob], selected[0].name || "product.jpg", { type: blob.type || "image/jpeg" })
            const uploaded = await agentMediaApi.upload(file, "media-library")
            setSelectedMedia({ ...uploaded.file, download: uploaded.download })
            setSelectedMediaFresh(true)
          } catch {
            // Image fetch/upload failed (CORS, network, etc.) — keep the text-only send.
          }
        }
      }
    },
    [],
  )

  const queueSentinelRef = useRef<HTMLDivElement | null>(null)
  const latestAtRef = useRef<Record<string, string>>({})
  // `lastEventAt` is deliberately not destructured: it only fed the "Updated
  // <time>" label, which the user asked to remove. The hook still tracks it.
  const { isLive, liveError } = useAgentLiveInbox({
    enabled: true,
    onConversationUpsert: (conversation) => {
      patchQueueCache((current) => [
        conversation,
        ...current.filter((item) => item.id !== conversation.id),
      ])
      scheduleCountsRefresh()
      if (selectedConversationId === conversation.id && conversation.lastMessageAt) {
        const prev = latestAtRef.current[conversation.id]
        if (prev !== conversation.lastMessageAt) {
          latestAtRef.current[conversation.id] = conversation.lastMessageAt
          // Newest page only: older pages the agent already loaded — and their
          // scroll position — survive the refresh.
          agentConversationsApi
            .messages(conversation.id, { limit: THREAD_PAGE_SIZE })
            .then((page) =>
              replaceNewestThreadPage(
                queryClient,
                conversation.id,
                page.data.map(mapMessage),
              ),
            )
            .catch(() => {})
        }
      }
    },
    onMessageCreated: (conversationId, message) => {
      const mapped = mapMessage(message)
      // The pill count rides with the boolean: a new inbound message on a
      // conversation the agent is NOT reading increments both, so the count
      // never lags the dot until the next refetch.
      const isOpen = selectedConversationId === conversationId
      patchQueueCache((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                searchSnippet: mapped.content || conversation.searchSnippet,
                latestSenderType: mapped.senderType,
                lastMessageAt: mapped.createdAt,
                lastCustomerMessageAt:
                  mapped.senderType === "customer"
                    ? mapped.createdAt
                    : conversation.lastCustomerMessageAt,
                metadata: {
                  ...(conversation.metadata || {}),
                  inboxUnread: !isOpen,
                  inboxUnreadCount: isOpen
                    ? 0
                    : (typeof conversation.metadata?.inboxUnreadCount === "number"
                        ? conversation.metadata.inboxUnreadCount + 1
                        : 1),
                },
              }
            : conversation,
        ),
      )
      if (selectedConversationId !== conversationId) return
      appendThreadMessage(queryClient, conversationId, mapped)
      scheduleCountsRefresh()
    },
  })


  // Deep link from another surface (`?conversation=<id>`). The queue query owns
// fetching now, so this only seeds the selection once rows have arrived.
  useEffect(() => {
    if (requestedConversationId) selectConversation(requestedConversationId)
  }, [requestedConversationId, selectConversation])

  useEffect(() => {
    if (queueQuery.isError) {
      toast.error(getApiErrorMessage(queueQuery.error, t("workspace.inbox.error.loadQueue")))
    }
  }, [queueQuery.isError, queueQuery.error, t])

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  )

  const handleSendPaymentMethod = useCallback(async (method: WorkspacePaymentSettings["methods"][number]) => {
    if (!selectedConversation) return
    const lines = [
      method.name || "Payment method",
      method.accountName ? `Account: ${method.accountName}` : null,
      method.accountNumber ? `Account no: ${method.accountNumber}` : null,
    ].filter(Boolean).join("\n")
    let attachment: { fileId: string; fileName: string; contentType: string; sizeBytes: number; url: string; role: "message_attachment" } | undefined
    if (method.image?.downloadUrl) {
      try {
        const response = await fetch(method.image.downloadUrl)
        if (response.ok) {
          const blob = await response.blob()
          const file = new File([blob], `${method.name || "payment"}.jpg`, { type: blob.type || "image/jpeg" })
          const uploaded = await agentMediaApi.upload(file, "media-library")
          attachment = {
            fileId: uploaded.file.id,
            fileName: uploaded.file.fileName,
            contentType: uploaded.file.contentType,
            sizeBytes: uploaded.file.sizeBytes,
            url: uploaded.download.url,
            role: "message_attachment",
          }
        }
      } catch {
        // ignore; send text only
      }
    }
    const messageType = attachment?.contentType.startsWith("image/") ? "image" : "text"
    setSubmittingAction("send")
    try {
      await sendConversationMessage.mutateAsync({
        conversationId: selectedConversation.id,
        content: lines,
        messageType,
        attachments: attachment ? [attachment] : [],
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.inbox.error.sendMessage")))
    } finally {
      setSubmittingAction(null)
    }
  }, [selectedConversation, sendConversationMessage, t])


  const ordersByConversation = useMemo(() => {
    const map = new Map<string, AgentOrderDto[]>()
    for (const order of allOrders) {
      if (!order.conversationId) continue
      const current = map.get(order.conversationId) || []
      current.push(order)
      map.set(order.conversationId, current)
    }
    return map
  }, [allOrders])

  // Context panel lists — server-side customer pages, newest first (Plan 72).
  // Pages reset on conversation switch; `placeholderData: keepPreviousData`
  // (in each hook) keeps the old rows up while the next page loads. Customer
  // scope, not conversation scope: a one-row "list" always reads as a detail
  // view, and the conversation-linked row is highlighted in place instead.
  const [ordersPage, setOrdersPage] = useState(1)
  const [deliveriesPage, setDeliveriesPage] = useState(1)
  useEffect(() => {
    setOrdersPage(1)
    setDeliveriesPage(1)
  }, [selectedConversationId])
  const selectedCustomerId = selectedConversation?.customerId ?? null
  const customerOrdersQuery = useCustomerOrders(selectedCustomerId, ordersPage)
  const customerOrders = useMemo(
    () => customerOrdersQuery.data?.data ?? [],
    [customerOrdersQuery.data],
  )
  const customerDeliveriesQuery = useCustomerDeliveries(selectedCustomerId, deliveriesPage)
  const customerDeliveries = useMemo(
    () => customerDeliveriesQuery.data?.data ?? [],
    [customerDeliveriesQuery.data],
  )

  const currentOrder = useMemo(() => {
    if (!selectedConversation) return null
    // Server truth first: the customer's newest page usually holds this
    // chat's order, and the bulk scan is only a fallback for rows past it.
    const serverMatch = customerOrders.find((order) => order.conversationId === selectedConversation.id)
    if (serverMatch) return serverMatch
    const related = ordersByConversation.get(selectedConversation.id) || []
    if (!related.length) return null
    return [...related].sort((a, b) => {
      const aActive = a.status !== "cancelled" && a.deliveryStatus !== "delivered" && a.deliveryStatus !== "returned" ? 1 : 0
      const bActive = b.status !== "cancelled" && b.deliveryStatus !== "delivered" && b.deliveryStatus !== "returned" ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })[0]
  }, [customerOrders, ordersByConversation, selectedConversation])

  const selectedConversationSendBlocked = selectedConversation?.channelType === "tiktok"

  useEffect(() => {
    if (!selectedConversationId) {
      setCustomerProfile(null)
      return
    }

    // `conversations` is read through a ref, never a dep: depending on it made
    // every socket upsert tear this effect down and re-run 3 parallel fetches
    // plus the order-items load. The context for a conversation only changes
    // when the *selected id* changes — live upserts already patch messages
    // directly through the socket handler.
    //
    // `queueReady` is the one extra dep, and it is load-bearing: on a deep link
    // the selected id is known before the queue query resolves, so this effect
    // runs once against an empty list and must run again when rows land.
    const conversation = conversationsRef.current.find((c) => c.id === selectedConversationId)
    if (!conversation) return

    if (conversation.latestAt) {
      latestAtRef.current[selectedConversationId] = conversation.latestAt
    }

    setLoadingProfile(true)
    setCustomerProfile(null)

    const loadConversationContext = async () => {
      // The thread query owns messages (see above); the order/delivery/note
      // tabs own their rows through TanStack Query. Only the profile still
      // loads imperatively here.
      try {
        const profile = await agentCustomersApi.get(conversation.customerId)
        setCustomerProfile(profile)
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("workspace.inbox.error.loadConversation")))
        setCustomerProfile(null)
      } finally {
        setLoadingProfile(false)
      }
    }

    loadConversationContext()
  }, [selectedConversationId, queueReady, t])

  useEffect(() => {
    if (requestedConversationId) return
    if (!requestedCustomerId) return

    let cancelled = false
    const loadProfile = async () => {
      setLoadingProfile(true)
      try {
        const profile = await agentCustomersApi.get(requestedCustomerId)
        if (cancelled) return
        setCustomerProfile(profile)
      } catch (error) {
        if (cancelled) return
        toast.error(getApiErrorMessage(error, t("workspace.inbox.error.loadCustomer")))
      } finally {
        if (!cancelled) {
          setLoadingProfile(false)
        }
      }
    }

    void loadProfile()
    return () => { cancelled = true }
  }, [requestedCustomerId, requestedConversationId, t])

  // Thread virtualization state: the flattened item list (messages +
  // day dividers, oldest first) plus firstItemIndex, which starts at
  // THREAD_FIRST_INDEX and decreases by exactly the number of prepended DOM
  // nodes whenever an older page arrives. Appends (new messages) and
  // in-place patches (retry) never touch it. Reset per conversation — the
  // Virtuoso below also remounts on conversation key, and the thread cache
  // is dropped on switch (see below), so a fresh mount always starts clean.
  // Activity filter: bot taps + order events render inline in the thread
  // (Plan 75). Hidden entries never leave the cache — the toggle only
  // narrows the derived item list, so lengths flow through the existing
  // index bookkeeping and the list stays bottom-anchored. The toggle itself
  // lives in the More actions menu and persists in the inbox store.
  const threadItems = useMemo(
    () =>
      toThreadItems(
        showActivity
          ? messages
          : messages.filter((message) => !isActivityMessage(message)),
      ),
    [messages, showActivity],
  )
  // Shown beside the menu item so the agent knows how much the filter is
  // hiding before turning it off. Loaded pages only — same scope as the list.
  const activityCount = useMemo(
    () => messages.filter(isActivityMessage).length,
    [messages],
  )
  const threadPages = threadQuery.data?.pages.length ?? 0
  // Corrected in useLayoutEffect (not during render, not in a passive
  // effect): Virtuoso needs the new index before paint, otherwise one frame
  // renders with a stale index and the list visibly jumps — and passive
  // effects run after paint, which is exactly the flash we are removing.
  // setState is only called when the index actually changes, so steady-state
  // commits (composer keystrokes, socket patches) bail out with no extra
  // render. Inputs only ever advance per conversation — pages grow
  // monotonically, same-page growth (appends) leaves the index untouched —
  // so the bookkeeping cannot corrupt across renders.
  const [firstItemIndex, setFirstItemIndex] = useState(THREAD_FIRST_INDEX)
  const threadIndexRef = useRef({
    convId: null as string | null,
    pages: 0,
    flat: 0,
    first: THREAD_FIRST_INDEX,
  })
  useLayoutEffect(() => {
    const prev = threadIndexRef.current
    if (prev.convId !== selectedConversationId) {
      threadIndexRef.current = {
        convId: selectedConversationId,
        pages: threadPages,
        flat: threadItems.length,
        first: THREAD_FIRST_INDEX,
      }
      setFirstItemIndex((current) =>
        current === THREAD_FIRST_INDEX ? current : THREAD_FIRST_INDEX,
      )
      return
    }
    if (threadPages > prev.pages) {
      const next = prev.first - (threadItems.length - prev.flat)
      threadIndexRef.current = {
        convId: prev.convId,
        pages: threadPages,
        flat: threadItems.length,
        first: next,
      }
      setFirstItemIndex(next)
      return
    }
    threadIndexRef.current = { ...prev, flat: threadItems.length }
  }, [selectedConversationId, threadPages, threadItems.length])

  // Drop the previous conversation's thread cache on switch/unmount: a fresh
  // mount always starts from page 0 with firstItemIndex at base, exactly like
  // the old clear-and-refetch behaviour, and no stale pages linger.
  useEffect(() => {
    const id = selectedConversationId
    return () => {
      if (id) queryClient.removeQueries({ queryKey: conversationKeys.messages(id) })
    }
  }, [selectedConversationId, queryClient])

  // One stable retry handler for the whole thread (MessageBubble is memoized —
  // an inline closure per item would re-render every bubble on each keystroke).
  const handleRetryMessage = useCallback(
    (messageId: string) => {
      if (!selectedConversationId) return
      const targetId = selectedConversationId
      setRetryingMessageId(messageId)
      retryConversationMessage
        .mutateAsync(messageId)
        .then((retried) => {
          patchThreadMessages(queryClient, targetId, (current) =>
            current.map((row) => (row.id === messageId ? mapMessage(retried) : row)),
          )
        })
        .catch((error) => {
          toast.error(getApiErrorMessage(error, t("workspace.inbox.error.retrySend")))
        })
        .finally(() => {
          setRetryingMessageId(null)
        })
    },
    [selectedConversationId, retryConversationMessage, queryClient, t],
  )

  const renderThreadItem = useCallback(
    (_index: number, item: ThreadItem) => {
      if (item.kind === "day") return <ThreadDayDivider key={item.key} label={item.label} />
      return (
        <div key={item.message.id} className="px-4 pb-4">
          <MessageBubble
            message={item.message}
            retrying={retryingMessageId === item.message.id}
            onRetry={handleRetryMessage}
          />
        </div>
      )
    },
    [retryingMessageId, handleRetryMessage],
  )

  // Older pages load only when the list actually reaches the top — with one
  // exception filtered below. Guarded by the query flags so it cannot
  // double-fire.
  // Mutable wrapper (React 18 types make useRef<T | null> readonly).
  const scrollerRef = useRef<{ node: HTMLDivElement | null }>({ node: null })
  // Virtuoso v4 takes a callback ref: a RefObject is a type error.
  const setScrollerRef = useCallback((el: HTMLElement | Window | null) => {
    scrollerRef.current.node = el instanceof HTMLDivElement ? el : null
  }, [])
  const userScrolledRef = useRef(false)
  // Re-attached as items arrive, not just per conversation: on landing the
  // Virtuoso mounts only after page 0 resolves, so a conversation-keyed
  // effect runs while the scroller node is still absent, returns early, and
  // never records scrolling again (the same mount-timing trap as the old
  // scroll tracker). Re-attaching per item-count change is cheap
  // (add/removeEventListener) and always lands on the live node.
  useEffect(() => {
    userScrolledRef.current = false
  }, [selectedConversationId])
  useEffect(() => {
    const el = scrollerRef.current.node
    if (!el) return
    const onScroll = () => {
      userScrolledRef.current = true
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [selectedConversationId, threadItems.length])
  const handleThreadAtTopChange = useCallback(
    (atTop: boolean) => {
      if (!atTop || !threadQuery.hasOlderPage || threadQuery.isFetchingOlderPage) return
      // Mount artifact: Virtuoso reports atTop on first render before jumping
      // to initialTopMostItemIndex. A genuine top always follows a real
      // scroll; short threads (nothing to scroll) are filled by the effect
      // below instead, so this handler needs no overflow exception.
      if (!userScrolledRef.current) return
      void threadQuery.fetchOlderPage()
    },
    [threadQuery],
  )

  // Fill short threads from measured height, not from render timing: when
  // everything loaded fits in the viewport there is no scrollable top to
  // reach, so atTop alone cannot drive the fill-up. Virtuoso reports the
  // true total list height post-commit, so there is no layout race — keep
  // pulling while the measured height fits and older pages remain.
  // Terminates because each fetch either overflows the viewport or exhausts
  // the thread (the limit+1 probe guarantees non-empty pages while hasMore).
  const handleThreadTotalHeightChanged = useCallback(
    (height: number) => {
      const viewportHeight = scrollerRef.current.node?.clientHeight ?? 0
      // MIN_ROW_PX guards the mount phase: Virtuoso first reports an
      // estimated total (here: 448px for 15 real bubbles) before measuring,
      // which looks exactly like a short thread. No bubble renders under ~40px
      // (padding + timestamp alone exceed it), so a list whose item count
      // alone guarantees overflow cannot be genuinely short — skip it.
      if (
        height > 0 &&
        height <= viewportHeight &&
        threadItems.length * 40 <= viewportHeight &&
        threadQuery.hasOlderPage &&
        !threadQuery.isFetchingOlderPage
      ) {
        void threadQuery.fetchOlderPage()
      }
    },
    [threadQuery, threadItems.length],
  )

  // Auto-load the next page when the queue is scrolled toward the bottom.
  // The manual load button is gone (pure infinite scroll has no footer), so
  // the trigger zone is generous: loading starts 600px before the end, which
  // covers fast scrolls that a tight observer would miss.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = queueQuery
  useEffect(() => {
    const sentinel = queueSentinelRef.current
    if (!sentinel || !hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextPage()
        }
      },
      { rootMargin: "600px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const teamNameById = useMemo(
    () =>
      Object.fromEntries(
        teamMembers.map((member) => [member.id, member.fullName || member.email || member.phone || t("workspace.inbox.assignedStaff")]),
      ),
    [teamMembers, t],
  )

  /**
   * The rows to render, newest activity first.
   *
   * No filtering happens here any more: the API applied the chip's filter and
   * the search, so whatever it returned is the answer. The order is local
   * recency over loaded pages; the count and the filter are still whole-queue.
   */
  const visibleConversations = useMemo(
    () =>
      // Recency, full stop: newest activity tops the list, exactly the order
      // the API pages in. An earlier revision sorted by the urgency score
      // first with recency as tiebreak, which left fresh replies buried under
      // older high-scored threads. Urgency still shows (stripe, badges,
      // chips); it no longer positions rows.
      [...conversations].sort(
        (a, b) =>
          new Date(b.latestAt || b.raw.updatedAt).getTime() -
          new Date(a.latestAt || a.raw.updatedAt).getTime(),
      ),
    [conversations],
  )

  useEffect(() => {
    // Only auto-pick when nothing is open. Deliberately does NOT re-pick when the
    // selection falls outside the current filter — the thread pane falls back to
    // `selectedConversation`, so an agent narrowing a filter never loses the
    // thread they were reading.
    if (!loadingQueue && !selectedConversationId && visibleConversations[0]) {
      selectConversation(visibleConversations[0].id)
    }
  }, [loadingQueue, visibleConversations, selectedConversationId, selectConversation, t])

  /**
   * Opening a thread clears its unread state. `setReadState` existed on the API
   * client with zero callers, so unread counts only ever cleared as a side
   * effect of sending a reply — reading a conversation left it marked unread.
   */
  const handleSelectConversation = (conversationId: string) => {
    selectConversation(conversationId)
    setMobilePane("conversation")

    const conversation = conversations.find((row) => row.id === conversationId)
    if (!conversation?.unread) return

    // Optimistic: the queue must drop the badge immediately, not after a round
    // trip. Reverted below if the write fails.
    patchQueueCache((current) =>
      current.map((row) =>
        row.id === conversationId
          ? { ...row, metadata: { ...(row.metadata || {}), inboxUnread: false, inboxUnreadCount: 0 } }
          : row,
      ),
    )
    setConversationRead.mutate(
      { conversationId, unread: false },
      {
        onError: (error) => {
          patchQueueCache((current) =>
            current.map((row) =>
              row.id === conversationId
                ? { ...row, metadata: { ...(row.metadata || {}), inboxUnread: true } }
                : row,
            ),
          )
          toast.error(getApiErrorMessage(error, t("workspace.inbox.error.markRead")))
        },
      },
    )
  }

  const visibleSelectedConversation =
    visibleConversations.find((conversation) => conversation.id === selectedConversationId) ||
    selectedConversation

  /**
   * Chip counts come from the API response.
   *
   * A client holding only the active filter's rows cannot know what any other
   * chip would return, so counting locally was only ever correct while the
   * whole backlog fitted in memory. `null` means the aggregate failed and the
   * chips render "—" rather than a confident zero.
   */
  const queueCounts = queueQuery.counts

  const handleSendMessage = async () => {
    if (!selectedConversation || (!messageText.trim() && !selectedMedia)) return
    if (selectedConversation.channelType === "tiktok") {
      toast.error(t("workspace.inbox.error.tiktokInboundOnly"))
      return
    }
    setSubmittingAction("send")
    try {
      const reply = cannedResponses.find((item) => item.id === selectedReplyId)
      const attachment = selectedMedia?.download ? {
        fileId: selectedMedia.id,
        fileName: selectedMedia.fileName,
        contentType: selectedMedia.contentType,
        sizeBytes: selectedMedia.sizeBytes,
        url: selectedMedia.download.url,
        role: "message_attachment",
      } : undefined
      const messageType = selectedMedia?.contentType.startsWith("image/")
        ? "image"
        : selectedMedia?.contentType.startsWith("video/")
          ? "video"
          : selectedMedia?.contentType.startsWith("audio/")
            ? "audio"
            : selectedMedia
              ? "file"
              : "text"
      // Queue cache patching lives in the mutation (lib/queries/inbox.ts), so the
      // write and the cache update cannot drift apart.
      const sent = await sendConversationMessage.mutateAsync({
        conversationId: selectedConversation.id,
        // Media-only sends carry an empty caption: the text (if any) is the
        // caption, never the filename. MessageBubble renders the attachment
        // alone when content is empty, and the Telegram send path only adds
        // a caption for non-empty content — so image.jpg no longer leaks
        // into the customer's chat as caption text.
        content: messageText.trim() || (selectedMedia ? "" : "Attachment"),
        messageType,
        attachments: attachment ? [attachment] : [],
        cannedResponseId: reply && reply.content === messageText.trim() ? reply.id : undefined,
      })
      appendThreadMessage(queryClient, selectedConversation.id, mapMessage(sent))
      setMessageText("")
      setSelectedReplyId("")
      setSelectedMedia(null)
      setSelectedMediaFresh(false)
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.inbox.error.sendMessage")))
    } finally {
      setSubmittingAction(null)
    }
  }

  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const handleAssign = async (agentId: string | null) => {
    if (!selectedConversation) return
    setSubmittingAction("assign")
    try {
      await assignConversation.mutateAsync({
        conversationId: selectedConversation.id,
        agentId,
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.inbox.error.assignConversation")))
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleUpdateConversationStatus = async (status: AgentConversationDto["status"]) => {
    if (!selectedConversation) return
    setSubmittingAction(`status-${status}`)
    try {
      await updateConversation.mutateAsync({
        conversationId: selectedConversation.id,
        data: { status },
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.inbox.error.updateStatus")))
    } finally {
      setSubmittingAction(null)
    }
  }

  // Pane visibility drives the grid, not a mode switcher. Each side
  // collapses independently and keeps its own width; the thread is always the
  // flexible column that fills whatever remains. Four cases, not three: with
  // two panes visible the fixed 22rem must land on the surviving side pane —
  // a shared two-column template would pin it on the thread and squeeze the
  // messages while the context panel eats the freed space. Hidden panes stay
  // mounted (see section classNames), so selection, socket patches, scroll,
  // and drafts survive the toggle.
  const layoutColumns =
    showQueue && showContext
      ? "xl:grid-cols-[22rem_minmax(0,1fr)_22rem]"
      : showQueue
        ? "xl:grid-cols-[22rem_minmax(0,1fr)]"
        : showContext
          ? "xl:grid-cols-[minmax(0,1fr)_22rem]"
          : "xl:grid-cols-[minmax(0,1fr)]"

  return (
    <>
      <div className={cn(mobilePane === "queue" ? "block" : "hidden", "xl:block")}>
        <WorkspaceHeader
          compact
          navKey="inbox"
          realtimeStatus={liveError ? "connecting" : isLive ? "online" : "offline"}
          title={t("workspace.inbox.title")}
          description="Run high-volume commerce conversations with queue priority, order context, and payment follow-up in one place."
          eyebrow={t("workspace.inbox.eyebrow")}
        />
      </div>

      <WorkspacePage
        className="pb-4 xl:h-[calc(100svh-4rem)] xl:overflow-hidden"
        containerClassName="xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:gap-4 xl:space-y-0 max-w-[1600px]"
      >

        {liveError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            {t("workspace.inbox.liveUpdatesPaused", { error: liveError })}
          </div>
        ) : null}

        <div className={cn("grid min-w-0 gap-3 xl:min-h-0 xl:flex-1", layoutColumns)}>
          <section aria-label={t("workspace.inbox.queue.ariaLabel")} className={cn("h-[calc(100svh-11rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 xl:h-auto xl:min-h-0", mobilePane === "queue" ? "flex" : "hidden", showQueue ? "xl:flex" : "xl:hidden")}>
            {/* Container query, not viewport query: the queue pane is only
                ~22rem wide even on a large screen, so `sm:`/`lg:` cannot tell
                us how much room the filter controls actually have. */}
            <div className="@container border-b border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {/* The "Updated <time>" label was removed at the user's request;
                      the row it occupied now goes to the search field, which was
                      the part actually in use. `lastEventAt` stays on the socket
                      hook and still drives nothing visible. */}
                  <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    value={conversationSearch}
                    onChange={(event) => setConversationSearch(event.target.value)}
                    placeholder={t("workspace.inbox.queue.searchPlaceholder")}
                    className="pl-9"
                  />
                </div>
                {/* Channel scope: one connected channel, or all. A scope like
                    search — the chips recount inside it. Options reuse the
                    channels cache, so no extra endpoint or fetch. */}
                <Select
                  value={queueChannelId ?? "all"}
                  onValueChange={(value) => setQueueChannelId(value === "all" ? null : value)}
                >
                  <SelectTrigger
                    aria-label={t("workspace.inbox.queue.filterByChannel")}
                    className="w-[9.5rem] shrink-0 [&>span]:truncate"
                  >
                    <SelectValue>
                      {activeChannel ? (
                        <ChannelMark
                          channelType={activeChannel.channelType}
                          name={activeChannel.displayName || activeChannel.channelName}
                        />
                      ) : (
                        t("workspace.inbox.queue.allChannels")
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("workspace.inbox.queue.allChannels")}</SelectItem>
                    {(channelOptions.data ?? []).map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        <ChannelMark
                          channelType={channel.channelType}
                          name={channel.displayName || channel.channelName}
                        />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-2 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] @[34rem]:flex-wrap @[34rem]:overflow-visible">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setQueueStatus(filter.value)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                      queueStatus === filter.value
                        ? "border-[var(--workspace-accent)] bg-[var(--workspace-accent-soft)] text-[var(--workspace-accent-strong)] dark:text-[var(--workspace-accent)]"
                        : "border-[var(--workspace-border)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:bg-[var(--workspace-surface-strong)] hover:text-[var(--workspace-text)] dark:bg-[var(--workspace-surface-strong)]",
                    )}
                  >
                    {t(filter.labelKey)}
                    <span
                      className={cn(
                        "tabular-nums",
                        queueStatus === filter.value
                          ? "text-[var(--workspace-accent-strong)] dark:text-[var(--workspace-accent)]"
                          : "text-[var(--workspace-text-soft)]",
                      )}
                    >
                      {queueCounts ? (queueCounts[filter.value] ?? 0) : "—"}
                    </span>
                  </button>
                ))}

                {/* Status and workflow are separate facets but one visual
                    group: a single scroll row on a narrow pane, wrapping only
                    when the container is actually wide enough. */}
                <span
                  aria-hidden="true"
                  className="mx-0.5 h-5 w-px shrink-0 bg-[var(--workspace-border)]"
                />

                {PRIMARY_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    // Clicking the active workflow chip clears it. The old
                    // "More filters → Clear filter" item is gone, so without
                    // this toggle an applied chip would have no way back.
                    onClick={() =>
                      setQueueFilter(queueFilter === filter.value ? "all" : filter.value)
                    }
                    aria-pressed={queueFilter === filter.value}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                      queueFilter === filter.value
                        ? "border-[var(--workspace-accent)] bg-[var(--workspace-accent-soft)] text-[var(--workspace-accent-strong)] dark:text-[var(--workspace-accent)]"
                        : "border-[var(--workspace-border)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:bg-[var(--workspace-surface-strong)] hover:text-[var(--workspace-text)] dark:bg-[var(--workspace-surface-strong)]",
                    )}
                  >
                    {t(filter.labelKey)}
                    <span
                      className={cn(
                        "tabular-nums",
                        queueFilter === filter.value
                          ? "text-[var(--workspace-accent-strong)] dark:text-[var(--workspace-accent)]"
                          : "text-[var(--workspace-text-soft)]",
                      )}
                    >
                      {/* `null` means the server aggregate failed. Showing 0 there would be a lie
                          the agent cannot distinguish from a real empty filter. */}
                      {queueCounts ? (queueCounts[filter.value] ?? 0) : "—"}
                    </span>
                  </button>
                ))}
              </div>

              {/* Latest-linked-order facets, replacing the old "More filters"
                  dropdown. Each select is independent, so order, delivery and
                  payment state combine with the status/workflow chips and with
                  each other. The backend matches them against the same newest
                  linked order the card renders. */}
              <div className="mt-1.5 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] @[34rem]:flex-wrap @[34rem]:overflow-visible">
                <Select
                  value={queueOrderStatus}
                  onValueChange={(value) =>
                    setQueueOrderStatus(value as OrderStatus | "all")
                  }
                >
                  <SelectTrigger
                    className="h-8 w-[9.5rem] shrink-0 text-xs [&>span]:truncate"
                    aria-label={t("workspace.inbox.filter.orderStatus")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("workspace.inbox.filter.allOrderStatuses")}
                    </SelectItem>
                    {ORDER_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={queueDeliveryStatus}
                  onValueChange={(value) =>
                    setQueueDeliveryStatus(value as DeliveryStatus | "all")
                  }
                >
                  <SelectTrigger
                    className="h-8 w-[10rem] shrink-0 text-xs [&>span]:truncate"
                    aria-label={t("workspace.inbox.filter.deliveryStatus")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("workspace.inbox.filter.allDeliveryStatuses")}
                    </SelectItem>
                    {DELIVERY_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={queuePaymentStatus}
                  onValueChange={(value) =>
                    setQueuePaymentStatus(value as PaymentStatus | "all")
                  }
                >
                  <SelectTrigger
                    className="h-8 w-[9.5rem] shrink-0 text-xs [&>span]:truncate"
                    aria-label={t("workspace.inbox.filter.paymentStatus")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("workspace.inbox.filter.allPaymentStatuses")}
                    </SelectItem>
                    {PAYMENT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {queueTotal !== null && queueTotal > conversations.length && !queueQuery.hasNextPage ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] px-3 py-2 text-xs text-[var(--workspace-text-muted)] dark:bg-[var(--workspace-surface-strong)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--commerceos-warning)]" />
                  <span>
                    {t("workspace.inbox.queue.showingOf", {
                      shown: conversations.length,
                      total: queueTotal,
                    })}{" "}
                    <span className="text-[var(--workspace-text-soft)]">
                      {t("workspace.inbox.queue.couldNotPageFurther")}
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-3">
                {loadingQueue ? (
                  <QueueSkeleton />
                ) : queueLoadFailed ? (
                  <div className="rounded-xl border border-dashed border-[var(--workspace-border)] bg-[var(--workspace-surface-strong)] p-8 text-center dark:bg-[var(--workspace-surface-muted)]">
                    <p className="text-sm text-[var(--workspace-text-muted)]">{t("workspace.inbox.queue.loadFailed")}</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => void reloadQueue()}>{t("workspace.inbox.retry")}</Button>
                  </div>
                ) : visibleConversations.length === 0 ? (
                  <QueueEmptyState label={t("workspace.inbox.queue.noConversationsMatch")} />
                ) : (
                  visibleConversations.map((conversation) => (
                    <ChatheadCard
                      key={conversation.id}
                      conversation={conversation}
                      assignedName={
                        conversation.assignedAgentId
                          ? teamNameById[conversation.assignedAgentId] || t("workspace.inbox.queue.assigned")
                          : t("workspace.inbox.queue.unassigned")
                      }
                      active={conversation.id === visibleSelectedConversation?.id}
                      onSelect={handleSelectConversation}
                    />
                  ))
                )}

                {queueQuery.hasNextPage ? (
                  <>
                    <div ref={queueSentinelRef} aria-hidden="true" className="h-px" />
                    {queueQuery.isFetchingNextPage ? <QueueNextPageLoader /> : null}
                  </>
                ) : (
                  conversations.length > 0 && (
                    <p className="pt-2 text-center text-[11px] text-[var(--workspace-text-soft)]">
                      You&apos;re caught up.
                    </p>
                  )
                )}
              </div>
            </ScrollArea>

          </section>

          <section className={cn("h-[calc(100svh-1.5rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 xl:flex xl:h-auto xl:min-h-0", mobilePane === "conversation" ? "flex" : "hidden")}>
            {visibleSelectedConversation ? (
              <>
                <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800 sm:px-4">
                  <div className="mb-2 flex items-center justify-between gap-2 xl:hidden">
                    <Button size="sm" variant="ghost" onClick={() => setMobilePane("queue")}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      {t("workspace.inbox.mobile.conversations")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMobilePane("context")}>
                      {t("workspace.inbox.mobile.customerContext")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-start gap-3">
                    <Button
                      size="icon"
                      variant="outline"
                      className="mt-0.5 shrink-0 max-xl:hidden"
                      aria-pressed={showQueue}
                      aria-label={showQueue ? t("workspace.inbox.pane.hideQueue") : t("workspace.inbox.pane.showQueue")}
                      title={showQueue ? t("workspace.inbox.pane.hideQueue") : t("workspace.inbox.pane.showQueue")}
                      onClick={() => setShowQueue(!showQueue)}
                    >
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-48 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{visibleSelectedConversation.customerName}</h2>
                        <Badge className={statusBadgeClass(visibleSelectedConversation.status)}>{toTitle(visibleSelectedConversation.status)}</Badge>
                        <Badge className={intentBadgeClass(visibleSelectedConversation.intent)}>
                          {toTitle(visibleSelectedConversation.intent)}
                        </Badge>
                        {currentOrder ? <Badge className={paymentBadgeClass(currentOrder.paymentStatus)}>{toTitle(currentOrder.paymentStatus)}</Badge> : null}
                      </div>
                      {/* Single truncated line: the full address lives in the
                          context tab. Wrapping to three lines here starves the
                          message list in narrow panes. */}
                      <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                        {visibleSelectedConversation.channelName} • {visibleSelectedConversation.phone || t("workspace.inbox.noPhone")} • {visibleSelectedConversation.location}
                      </p>
                    </div>
                    {/* Single row that never wraps: at 572px panes any wrap
                        costs the message list a full row. The select keeps a
                        fixed compact width instead of going full-width. */}
                    <div className="flex flex-nowrap items-center gap-2">
                      <Button size="sm" variant="outline" disabled={submittingAction === "assign"} onClick={() => setAssignDialogOpen(true)}>
                        {submittingAction === "assign" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                        {visibleSelectedConversation.assignedAgentId
                          ? visibleSelectedConversation.assignedAgentId === sessionUserId
                            ? t("workspace.inbox.thread.assignedToYou")
                            : t("workspace.inbox.thread.assignedTo", {
                                name: teamNameById[visibleSelectedConversation.assignedAgentId] || t("workspace.inbox.staff"),
                              })
                          : t("workspace.inbox.thread.assign")}
                      </Button>
                      <Select
                        value={visibleSelectedConversation.status}
                        onValueChange={(value) => handleUpdateConversationStatus(value as AgentConversationDto["status"])}
                      >
                        <SelectTrigger className="w-[7.5rem] shrink-0 max-xl:hidden">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">{t("workspace.inbox.status.open")}</SelectItem>
                          <SelectItem value="pending">{t("workspace.inbox.status.pending")}</SelectItem>
                          <SelectItem value="resolved">{t("workspace.inbox.status.resolved")}</SelectItem>
                          <SelectItem value="closed">{t("workspace.inbox.status.closed")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="outline"
                        className="shrink-0 max-xl:hidden"
                        aria-pressed={showContext}
                        aria-label={showContext ? t("workspace.inbox.pane.hideContext") : t("workspace.inbox.pane.showContext")}
                        title={showContext ? t("workspace.inbox.pane.hideContext") : t("workspace.inbox.pane.showContext")}
                        onClick={() => setShowContext(!showContext)}
                      >
                        <PanelRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800 sm:px-4 sm:py-3">
                  <div className="flex flex-wrap gap-2">
                    <ActionButton label={t("workspace.inbox.action.createOrder")} icon={ShoppingCart} onClick={() => setCreateOrderOpen(true)} />
                    {/* A view toggle, not an action: accent fill mirrors the
                        queue's active filter chip, and the count says how many
                        bot taps / order events the thread is carrying. */}
                    <Button
                      size="sm"
                      variant="outline"
                      aria-pressed={showActivity}
                      title={showActivity ? t("workspace.inbox.pane.hideActivity") : t("workspace.inbox.pane.showActivity")}
                      onClick={() => setShowActivity(!showActivity)}
                      className={cn(
                        "gap-2 transition-colors",
                        // The outline variant's own hover is accent-coloured,
                        // which is exactly our "on" look — so the off state
                        // overrides it to stay visibly off while hovered.
                        showActivity
                          ? "border-[var(--workspace-accent)] bg-[var(--workspace-accent-soft)] text-[var(--workspace-accent-strong)] dark:text-[var(--workspace-accent)]"
                          : "text-[var(--workspace-text-muted)] hover:border-[var(--workspace-border)] hover:bg-[var(--workspace-surface-strong)] hover:text-[var(--workspace-text)]",
                      )}
                    >
                      <Activity className="h-4 w-4" />
                      {t("workspace.inbox.action.activity")}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-4 tabular-nums",
                          showActivity
                            ? "bg-white/70 text-[var(--workspace-accent-strong)] dark:bg-white/10 dark:text-[var(--workspace-accent)]"
                            : "bg-[var(--workspace-surface-muted)] text-[var(--workspace-text-soft)]",
                        )}
                      >
                        {activityCount}
                      </span>
                    </Button>
                  </div>
                </div>

                <div className="relative min-h-0 flex-1 bg-slate-50/70 dark:bg-slate-900/60">
                  {loadingMessages ? (
                    <div className="h-full overflow-hidden p-4">
                      <QueueEmptyState label={t("workspace.inbox.thread.loadingMessages")} />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full overflow-hidden p-4">
                      <QueueEmptyState label={t("workspace.inbox.thread.noMessages")} />
                    </div>
                  ) : (
                    <Virtuoso
                      key={selectedConversationId}
                      style={{ height: "100%" }}
                      className="thread-virtuoso"
                      scrollerRef={setScrollerRef}
                      data={threadItems}
                      firstItemIndex={firstItemIndex}
                      initialTopMostItemIndex={firstItemIndex + threadItems.length - 1}
                      computeItemKey={threadItemKey}
                      itemContent={renderThreadItem}
                      atTopStateChange={handleThreadAtTopChange}
                      totalListHeightChanged={handleThreadTotalHeightChanged}
                      followOutput={(isAtBottom: boolean) => (isAtBottom ? "auto" : false)}
                      alignToBottom
                      increaseViewportBy={{ top: 300, bottom: 200 }}
                    />
                  )}
                  {threadQuery.isFetchingOlderPage ? (
                    <p className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center text-xs text-slate-400 dark:text-slate-500">
                      {t("workspace.inbox.thread.loadingOlder")}
                    </p>
                  ) : null}
                </div>

                <MessageComposer
                  messageText={messageText}
                  onMessageTextChange={setMessageText}
                  cannedLoading={cannedQuery.isLoading && !cannedQuery.data}
                  cannedCount={cannedResponses.length}
                  onOpenSavedReplies={() => setSavedReplyDialogOpen(true)}
                  onOpenProducts={() => setProductDialogOpen(true)}
                  onOpenPaymentMethods={() => setPaymentMethodsOpen(true)}
                  selectedMedia={selectedMedia}
                  mediaFresh={selectedMediaFresh}
                  onRemoveMedia={() => {
                    setSelectedMedia(null)
                    setSelectedMediaFresh(false)
                  }}
                  onAttach={() => setMediaPickerOpen(true)}
                  onSend={handleSendMessage}
                  sending={submittingAction === "send"}
                  blocked={selectedConversationSendBlocked}
                  mediaCapable={isMediaMessagingChannel(selectedConversation?.channelType)}
                />
              </>
            ) : (
              <QueueEmptyState label={t("workspace.inbox.thread.selectConversation")} className="m-6" />
            )}
          </section>

          <MediaPicker
            open={mediaPickerOpen}
            onOpenChange={setMediaPickerOpen}
            onSelect={(file, fresh) => {
              setSelectedMedia(file)
              setSelectedMediaFresh(fresh === true)
            }}
          />
          <SavedReplyDialog
            open={savedReplyDialogOpen}
            onOpenChange={setSavedReplyDialogOpen}
            replies={cannedResponses}
            loading={cannedQuery.isLoading && !cannedQuery.data}
            onSelect={handleSelectSavedReply}
          />
          <AssignDialog
            open={assignDialogOpen}
            onOpenChange={setAssignDialogOpen}
            customerName={visibleSelectedConversation?.customerName || t("workspace.inbox.thread.defaultName")}
            assignedAgentId={visibleSelectedConversation?.assignedAgentId ?? null}
            assignedAgentName={
              (visibleSelectedConversation?.assignedAgentId &&
                teamNameById[visibleSelectedConversation.assignedAgentId]) ||
              "staff"
            }
            currentUserId={sessionUserId}
            teamMembers={teamMembers}
            assigning={submittingAction === "assign"}
            onAssign={handleAssign}
          />

          <section aria-label={t("workspace.inbox.context.ariaLabel")} className={cn(
            "h-[calc(100svh-1.5rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 xl:h-auto xl:min-h-0",
            mobilePane === "context" ? "flex" : "hidden",
            showContext ? "xl:flex" : "xl:hidden",
          )}>
            <div className="border-b border-slate-200 p-2 dark:border-slate-800 xl:hidden">
              <Button size="sm" variant="ghost" onClick={() => setMobilePane("conversation")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("workspace.inbox.mobile.backToConversation")}
              </Button>
            </div>
            <Tabs value={contextTab} onValueChange={(value) => setContextTab(value as ContextTab)} className="min-h-0 flex-1">
              {/* Customer header: the old Customer Info tab folded into a
                  theme-aware header (no forced dark slab), so the profile is
                  visible on every tab without spending one on it. */}
              <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                {loadingProfile ? (
                  <QueueEmptyState label={t("workspace.inbox.context.loadingCustomer")} />
                ) : visibleSelectedConversation ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-slate-950 dark:text-slate-50">
                          {customerProfile?.fullName || visibleSelectedConversation.customerName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {[
                            customerProfile?.phone || visibleSelectedConversation.phone,
                            customerProfile ? formatLocation(customerProfile.location) : visibleSelectedConversation.location,
                            customerProfile ? t("workspace.inbox.context.since", { date: formatDate(customerProfile.createdAt) }) : null,
                          ].filter((part) => part && part !== "Not provided").join("  •  ") || t("workspace.inbox.context.noContactDetails")}
                        </p>
                      </div>
                      {currentOrder ? (
                        <Badge className={cn("shrink-0", paymentBadgeClass(currentOrder.paymentStatus))}>{currentOrder.orderNumber}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {/* Only when the profile actually loaded: the old
                          `|| "active"` fallback rendered a confident "Active"
                          for a customer whose fetch had just failed. */}
                      {customerProfile ? (
                        <Badge className={customerStatusBadgeClass(customerProfile.status)}>
                          {t(`workspace.customers.${customerProfile.status}`)}
                        </Badge>
                      ) : null}
                      <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        {customerOrdersQuery.data?.total ?? 0} {(customerOrdersQuery.data?.total ?? 0) === 1 ? t("workspace.inbox.context.orderOne") : t("workspace.inbox.context.orderMany")}
                      </span>
                      {currentOrder ? (
                        <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
                          {formatCurrency(currentOrder.totalAmount, currentOrder.currency)}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Select a conversation to see its customer.</p>
                )}
              </div>
              <div className="border-b border-slate-200 p-3 dark:border-slate-800">
                {/* One row of three: a grid, never scrollable, so every tab is
                    always visible at this pane width. */}
                <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-slate-50 p-1 dark:bg-slate-900">
                  {CONTEXT_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="whitespace-nowrap px-1 text-[13px]"
                    >
                      {t(tab.labelKey)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="orders" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-4">
                    {!selectedConversation ? (
                      <QueueEmptyState label={t("workspace.inbox.context.ordersEmpty")} className="m-4" />
                    ) : customerOrdersQuery.isPending ? (
                      <QueueEmptyState label={t("workspace.inbox.context.loadingOrders")} />
                    ) : customerOrdersQuery.isError ? (
                      <QueueEmptyState label={t("workspace.inbox.context.failedOrders")} className="m-4" />
                    ) : customerOrders.length === 0 ? (
                      <QueueEmptyState label={t("workspace.inbox.context.noOrdersYet")} className="m-4" />
                    ) : (
                      <>
                        {customerOrders.map((order) => {
                          // No active indicator: the list is customer-scoped,
                          // so "this row is the conversation's order" is not a
                          // real per-row state. Each card simply opens the
                          // order on the orders page, selected by `?order=`.
                          return (
                            <button
                              type="button"
                              key={order.id}
                              onClick={() => router.push(`/workspace/orders?order=${order.id}`)}
                              className="w-full cursor-pointer rounded-2xl border border-slate-200 p-3 text-left transition-colors hover:border-[var(--workspace-accent)] hover:bg-[var(--workspace-accent-soft)] dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-[var(--workspace-accent-soft)]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{order.orderNumber}</p>
                                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(order.createdAt)}</p>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <Badge className={statusBadgeClass(order.status)}>{toTitle(order.status)}</Badge>
                                <Badge className={paymentBadgeClass(order.paymentStatus)}>{toTitle(order.paymentStatus)}</Badge>
                              </div>
                              <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {t("workspace.inbox.context.paid", { amount: formatCurrency(order.paidAmount, order.currency) })}
                                </span>
                                <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(order.totalAmount, order.currency)}</span>
                              </div>
                            </button>
                          )
                        })}
                        {(customerOrdersQuery.data?.totalPages ?? 1) > 1 ? (
                          <div className="flex items-center justify-between pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={ordersPage <= 1}
                              onClick={() => setOrdersPage((page) => Math.max(page - 1, 1))}
                            >
                              {t("common.previous")}
                            </Button>
                            <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                              {t("workspace.inbox.common.pageOf", { page: customerOrdersQuery.data?.page ?? ordersPage, total: customerOrdersQuery.data?.totalPages ?? 1 })}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!customerOrdersQuery.data?.hasNext}
                              onClick={() => setOrdersPage((page) => page + 1)}
                            >
                              {t("common.next")}
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="deliveries" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-4">
                    {!selectedConversation ? (
                      <QueueEmptyState label={t("workspace.inbox.context.deliveriesEmpty")} className="m-4" />
                    ) : customerDeliveriesQuery.isPending ? (
                      <QueueEmptyState label={t("workspace.inbox.context.loadingDeliveries")} />
                    ) : customerDeliveriesQuery.isError ? (
                      <QueueEmptyState label={t("workspace.inbox.context.failedDeliveries")} className="m-4" />
                    ) : customerDeliveries.length === 0 ? (
                      <QueueEmptyState label={t("workspace.inbox.context.noDeliveriesYet")} className="m-4" />
                    ) : (
                      <>
                        {customerDeliveries.map((delivery) => {
                          const failed = delivery.status === "failed_delivery"
                          return (
                            <button
                              type="button"
                              key={delivery.id}
                              onClick={() => router.push(`/workspace/deliveries?delivery=${delivery.id}`)}
                              className={cn(
                                "w-full cursor-pointer rounded-2xl border border-slate-200 p-3 text-left transition-colors dark:border-slate-800 dark:bg-slate-900/60",
                                // Failed deliveries keep their red identity on hover;
                                // everything else uses the same accent as order cards.
                                failed
                                  ? "border-red-200 hover:border-red-300 hover:bg-red-50 dark:border-red-500/30 dark:hover:border-red-500/50 dark:hover:bg-red-500/10"
                                  : "hover:border-[var(--workspace-accent)] hover:bg-[var(--workspace-accent-soft)] dark:hover:bg-[var(--workspace-accent-soft)]",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{delivery.orderNumber}</p>
                                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(delivery.createdAt)}</p>
                                </div>
                                <Badge className={cn("shrink-0", failed ? "rounded-full border border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200" : statusBadgeClass(delivery.status))}>
                                  {toTitle(delivery.status)}
                                </Badge>
                              </div>
                              <DeliveryStageLine status={delivery.status} />
                              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                <p className="truncate">
                                  {delivery.deliveryAssigneeName || t("workspace.inbox.context.notAssigned")}
                                </p>
                              </div>
                              {failed ? (
                                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs leading-5 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                  {t("workspace.inbox.context.deliveryFailedNote")}
                                </p>
                              ) : null}
                            </button>
                          )
                        })}
                        {(customerDeliveriesQuery.data?.totalPages ?? 1) > 1 ? (
                          <div className="flex items-center justify-between pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={deliveriesPage <= 1}
                              onClick={() => setDeliveriesPage((page) => Math.max(page - 1, 1))}
                            >
                              {t("common.previous")}
                            </Button>
                            <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                              {t("workspace.inbox.common.pageOf", { page: customerDeliveriesQuery.data?.page ?? deliveriesPage, total: customerDeliveriesQuery.data?.totalPages ?? 1 })}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!customerDeliveriesQuery.data?.hasNext}
                              onClick={() => setDeliveriesPage((page) => page + 1)}
                            >
                              {t("common.next")}
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="notes" className="min-h-0 flex-1">
                <ConversationNotesPanel
                  key={selectedConversationId ?? "none"}
                  conversationId={selectedConversationId}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <CreateOrderDialog
          mode="conversation"
          open={createOrderOpen}
          onOpenChange={setCreateOrderOpen}
          customerId={visibleSelectedConversation?.customerId || ""}
          conversationId={visibleSelectedConversation?.id || ""}
          lockedCustomerName={visibleSelectedConversation?.customerName}
          // The create mutation already invalidates `orderKeys.all`, which
          // covers this conversation's customer-scoped Order List (and the
          // bulk scan behind `currentOrder`). Just reveal the refreshed tab.
          onCreated={() => setContextTab("orders")}
        />

        <PaymentMethodsPicker
          open={paymentMethodsOpen}
          onOpenChange={setPaymentMethodsOpen}
          methods={paymentMethods}
          onSelect={(method) => void handleSendPaymentMethod(method)}
        />

        <SendProductDialog
          open={productDialogOpen}
          onOpenChange={setProductDialogOpen}
          products={products}
          categories={productCategories}
          loading={productsQuery.isLoading && !productsQuery.data}
          onSelect={handleSelectProducts}
        />
      </WorkspacePage>
    </>
  )
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string
  icon: typeof ShoppingCart
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button size="sm" variant="outline" disabled={disabled} onClick={onClick}>
      <Icon className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}

const DELIVERY_STAGES = ["packed", "out_for_delivery", "delivered"] as const

/** Four-segment fulfilment line: filled up to the current stage, red when the
 *  delivery terminally failed, was cancelled, or was returned. */
function DeliveryStageLine({ status }: { status: string }) {
  const terminalBad = status === "failed_delivery" || status === "cancelled" || status === "returned"
  const current = DELIVERY_STAGES.indexOf(status as (typeof DELIVERY_STAGES)[number])
  return (
    <div className="mt-2.5 flex items-center gap-1" role="img" aria-label={`Delivery stage: ${toTitle(status)}`}>
      {DELIVERY_STAGES.map((stage, index) => {
        const reached = !terminalBad && current >= 0 && index <= current
        return (
          <span
            key={stage}
            title={toTitle(stage)}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              reached
                ? "bg-cyan-500"
                : terminalBad
                  ? "bg-red-200 dark:bg-red-500/30"
                  : "bg-slate-200 dark:bg-slate-700",
            )}
          />
        )
      })}
    </div>
  )
}

/**
 * Note List tab, mounted with `key={conversationId}` so composer drafts,
 * edit state, and the page reset on every conversation switch. Reads and
 * writes go through the conversation-note endpoints only — the old
 * `customer.notes` textarea path is gone, so a note can never be mistaken
 * for a customer field.
 */
function ConversationNotesPanel({ conversationId }: { conversationId: string | null }) {
  // Must be called before the early return below: this component is defined in
  // the same "use client" module as the page, so it can use the hook directly.
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const notesQuery = useConversationNotes(conversationId, page)
  const notes = useMemo(() => notesQuery.data?.data ?? [], [notesQuery.data])
  const createNote = useCreateConversationNote(conversationId ?? "")
  const updateNote = useUpdateConversationNote(conversationId ?? "")
  const deleteNote = useDeleteConversationNote(conversationId ?? "")
  const [draft, setDraft] = useState("")
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  if (!conversationId) {
    return <QueueEmptyState label={t("workspace.inbox.notes.selectConversation")} className="m-4" />
  }

  const runWrite = async (id: string, work: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    setPendingId(id)
    try {
      await work()
      return true
    } catch (error) {
      toast.error(getApiErrorMessage(error, fallback))
      return false
    } finally {
      setPendingId(null)
    }
  }

  const handleCreate = async () => {
    const content = draft.trim()
    if (!content || pendingId) return
    if (await runWrite("new", () => createNote.mutateAsync({ content }), t("workspace.inbox.error.addNote"))) {
      setDraft("")
      setComposerOpen(false)
      setPage(1)
    }
  }

  const handleTogglePin = (note: AgentConversationNoteDto) =>
    runWrite(note.id, () => updateNote.mutateAsync({ noteId: note.id, data: { isPinned: !note.isPinned } }), t("workspace.inbox.error.updateNote"))

  const handleToggleResolve = (note: AgentConversationNoteDto) =>
    runWrite(note.id, () => updateNote.mutateAsync({ noteId: note.id, data: { isResolved: !note.isResolved } }), t("workspace.inbox.error.updateNote"))

  const handleSaveEdit = async (note: AgentConversationNoteDto) => {
    const content = editDraft.trim()
    if (!content || content === note.content) {
      setEditingId(null)
      return
    }
    if (await runWrite(note.id, () => updateNote.mutateAsync({ noteId: note.id, data: { content } }), t("workspace.inbox.error.updateNote"))) {
      setEditingId(null)
    }
  }

  const handleDelete = async (note: AgentConversationNoteDto) => {
    if (confirmDeleteId !== note.id) {
      setConfirmDeleteId(note.id)
      return
    }
    setConfirmDeleteId(null)
    await runWrite(note.id, () => deleteNote.mutateAsync(note.id), t("workspace.inbox.error.deleteNote"))
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {/* The composer stays behind the pen button: the list is the tab's
            default view, and the box appears only on demand. */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
            {notesQuery.data?.total ?? 0} {(notesQuery.data?.total ?? 0) === 1 ? "note" : "notes"}
          </p>
          <Button
            size="sm"
            variant={composerOpen ? "secondary" : "outline"}
            className="h-8 gap-1.5 px-2.5 text-xs"
            aria-expanded={composerOpen}
            aria-label={composerOpen ? t("workspace.inbox.notes.closeComposer") : t("workspace.inbox.notes.writeANote")}
            onClick={() => setComposerOpen((open) => !open)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {composerOpen ? t("workspace.inbox.notes.close") : t("workspace.inbox.notes.newNote")}
          </Button>
        </div>
        {composerOpen ? (
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <Label htmlFor="conversation-note-composer">Add a note</Label>
            <Textarea
              id="conversation-note-composer"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("workspace.inbox.notes.placeholder")}
              className="mt-2 min-h-[88px] resize-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] leading-4 text-slate-400 dark:text-slate-500">Staff only — never sent to the customer.</p>
              <Button size="sm" disabled={!draft.trim() || pendingId !== null} onClick={() => void handleCreate()}>
                {pendingId === "new" ? t("workspace.inbox.common.saving") : t("workspace.inbox.notes.addNote")}
              </Button>
            </div>
          </div>
        ) : null}

        {notesQuery.isPending ? (
          <QueueEmptyState label={t("workspace.inbox.notes.loading")} />
        ) : notesQuery.isError ? (
          <QueueEmptyState label={t("workspace.inbox.notes.failed")} className="m-4" />
        ) : notes.length === 0 ? (
          <QueueEmptyState label={t("workspace.inbox.notes.empty")} className="m-4" />
        ) : (
          notes.map((note) => {
            const busy = pendingId === note.id
            // Resolved notes collapse to one row: the follow-up is done, but
            // the record stays visible and reversible.
            if (note.isResolved && editingId !== note.id) {
              return (
                <div key={note.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 transition-colors hover:bg-[var(--workspace-surface-muted)] dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-[var(--workspace-surface-muted)]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">{note.content}</p>
                  <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={() => void handleToggleResolve(note)}>
                    Reopen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn("h-7 shrink-0 px-2 text-xs", confirmDeleteId === note.id ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400")}
                    disabled={busy}
                    onClick={() => void handleDelete(note)}
                  >
                    {confirmDeleteId === note.id ? t("workspace.inbox.notes.confirmDelete") : t("workspace.inbox.notes.delete")}
                  </Button>
                </div>
              )
            }
            return (
              <div
                key={note.id}
                className={cn(
                  "rounded-2xl border border-slate-200 p-3 transition-colors hover:bg-[var(--workspace-surface-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-[var(--workspace-surface-muted)]",
                  note.isPinned && "border-amber-200 dark:border-amber-500/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {note.authorName || t("workspace.inbox.staff")}
                      {note.edited ? <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">• edited</span> : null}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{formatDateTime(note.createdAt)}</p>
                  </div>
                  {note.isPinned ? <Pin className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" /> : null}
                </div>
                {editingId === note.id ? (
                  <div className="mt-2">
                    <Textarea
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      className="min-h-[72px] resize-none"
                    />
                    <div className="mt-2 flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-7 px-2.5 text-xs" disabled={busy || !editDraft.trim()} onClick={() => void handleSaveEdit(note)}>
                        {busy ? t("workspace.inbox.common.saving") : t("workspace.inbox.notes.save")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{note.content}</p>
                )}
                {editingId === note.id ? null : (
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => void handleTogglePin(note)}>
                      <Pin className="h-3.5 w-3.5" />
                      {note.isPinned ? t("workspace.inbox.notes.unpin") : t("workspace.inbox.notes.pin")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => void handleToggleResolve(note)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(note.id)
                        setEditDraft(note.content)
                        setConfirmDeleteId(null)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn("h-7 gap-1 px-2 text-xs", confirmDeleteId === note.id ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400")}
                      disabled={busy}
                      onClick={() => void handleDelete(note)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmDeleteId === note.id ? t("workspace.inbox.notes.confirmDelete") : t("workspace.inbox.notes.delete")}
                    </Button>
                  </div>
                )}
              </div>
            )
          })
        )}

        {(notesQuery.data?.totalPages ?? 1) > 1 ? (
          <div className="flex items-center justify-between pt-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
              {t("common.previous")}
            </Button>
            <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {t("workspace.inbox.common.pageOf", { page: notesQuery.data?.page ?? page, total: notesQuery.data?.totalPages ?? 1 })}
            </p>
            <Button size="sm" variant="outline" disabled={!notesQuery.data?.hasNext} onClick={() => setPage((current) => current + 1)}>
              {t("common.next")}
            </Button>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  )
}

