import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  agentConversationsApi,
  agentNotesApi,
  type AgentConversationDto,
  type AgentConversationNoteDto,
  type AgentMessageDto,
  type AgentMessagePageDto,
  type DeliveryStatus,
  type OrderStatus,
  type PaginatedResponse,
  type PaymentStatus,
} from "@/lib/api"

// ---------------------------------------------------------------------------
// Query keys — inbox owns the conversations domain (per state-management rules)
// ---------------------------------------------------------------------------

/**
 * Server-side queue filters. Every one of these is applied by the API — the
 * frontend no longer evaluates a predicate against loaded rows, because that
 * could only ever see the pages already in memory and would silently miss
 * conversations further down the backlog.
 */
export type QueueFilters = {
  search?: string
  /** Named `filter` values the agent API has always supported. */
  filter?: "all" | "unread" | "assigned" | "team" | "hot_leads" | "vip" | "overdue" | "needs_attention"
  /** One exact conversation status. Closed and resolved are distinct. */
  status?: "open" | "pending" | "resolved" | "closed"
  /** Resolved OR closed in one request; `status` is single-valued. */
  resolvedOnly?: boolean
  unassigned?: boolean
  /** Intent buckets the API classifies server-side. */
  intent?:
    | "payment_review"
    | "complaints"
    | "delivery"
    | "order_intent"
    | "follow_up"
    | "general"
  /** Chips that map onto the caller's own identity rather than a filter. */
  mine?: boolean
  /**
   * Latest-linked-order facets. The API evaluates these against the newest
   * order linked to the conversation — the same row the chat head renders —
   * so the filtered rows and their badges cannot disagree.
   */
  orderStatus?: OrderStatus
  deliveryStatus?: DeliveryStatus
  paymentStatus?: PaymentStatus
  /**
   * One connected channel. A scope like search — chips recount inside it —
   * not a chip bucket. Empty/absent means all channels.
   */
  channelId?: string
}

export const conversationKeys = {
  all: ["conversations"] as const,
  bulk: () => [...conversationKeys.all, "bulk"] as const,
  queue: (filters: QueueFilters, pageSize: number) =>
    [...conversationKeys.all, "queue", filters, { pageSize }] as const,
  messages: (conversationId: string) =>
    [...conversationKeys.all, "messages", conversationId] as const,
  /** Staff notes for one conversation (Plan 72) — every page caches separately. */
  notes: (conversationId: string, page: number, limit: number) =>
    [...conversationKeys.all, "notes", conversationId, { page, limit }] as const,
  notesList: (conversationId: string) =>
    [...conversationKeys.all, "notes", conversationId] as const,
}

// ---------------------------------------------------------------------------
// Queue
//
// The live inbox keeps its own upserts on top of this (see
// hooks/use-agent-live-inbox.ts), so `staleTime` is short: the socket is the
// freshness mechanism and the query is the cold-load + refetch-on-focus path.
// ---------------------------------------------------------------------------

const QUEUE_STALE_TIME_MS = 15_000

// ---------------------------------------------------------------------------
// Paged queue
//
// Paginates on a *time cursor* rather than `page`/`limit`. Offset paging is
// wrong for a socket-driven list: new messages land at the top between
// requests, shifting every row, so an agent scrolling to page 2 would see
// duplicates and skipped conversations.
//
// Instead each page asks for rows at or before the oldest `lastMessageAt`
// seen so far. The backend applies `dateTo` against
// COALESCE(last_message_at, created_at) — see agent.service.ts and
// conversation-date-filter.spec.ts. That fix is load-bearing: without it
// `dateTo` is silently ignored and this loops page 1 forever.
//
// The companion risk is stale rows at the head. A conversation already on
// screen can change while the agent reads further down, and it will not be
// re-fetched. `useAgentLiveInbox` covers that in the other direction — socket
// upserts patch the queue cache directly — and the 15s staleTime refetches the
// window when the tab regains focus. Read as a triage surface this is
// acceptable; it would not be for an audit log.
// ---------------------------------------------------------------------------

/**
 * Default rows per page, drawn from the same options the orders and customers
 * lists offer. The queue used to hardcode 100, which made the first screen
 * taller than the viewport on any laptop and buried the fold.
 */
export const QUEUE_PAGE_SIZE_OPTIONS = [15, 30, 50, 100] as const
export const DEFAULT_QUEUE_PAGE_SIZE = 30

export function useConversationQueueInfinite(
  filters: QueueFilters = {},
  pageSize: number = DEFAULT_QUEUE_PAGE_SIZE,
  agentId: string | null = null,
) {
  const query = useInfiniteQuery({
    queryKey: [...conversationKeys.queue(filters, pageSize), "infinite"],
    queryFn: ({ pageParam }) =>
      agentConversationsApi.listPaginated({
        ...toRequestFilters(filters, agentId),
        limit: pageSize,
        // pageParam is undefined on the first page.
        ...(pageParam ? { dateTo: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasNext) return undefined
      const rows = lastPage.data
      if (rows.length === 0) return undefined
      // Walk back past any rows sharing the oldest timestamp, otherwise the
      // next page re-requests them and the agent sees duplicates.
      const oldest = rows.reduce((min, row) => {
        const value = row.lastMessageAt || row.updatedAt
        if (!value) return min
        return !min || value < min ? value : min
      }, "" as string)
      return oldest || undefined
    },
    placeholderData: keepPreviousData,
    staleTime: QUEUE_STALE_TIME_MS,
  })

  const pages = query.data?.pages ?? []
  const seen = new Set<string>()
  const rows: AgentConversationDto[] = []
  for (const page of pages) {
    for (const row of page.data) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      rows.push(row)
    }
  }

  // Both of these come from the API, not from the rows in hand:
  //  - `total` is the size of the whole filtered set, so the footer can say
  //    "30 of 2,410" instead of implying the queue ends at what has loaded.
  //  - `counts` is per-chip, for the same reason: a client that only holds the
  //    active filter's rows cannot know what any other chip would return.
  const first = pages[0]

  return {
    ...query,
    rows,
    total: typeof first?.total === "number" ? first.total : null,
    counts: first?.counts ?? null,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  }
}

/**
 * Drop empty values so the query key and the request stay stable.
 *
 * `mine` is a UI concept with no backend filter of its own — it resolves to
 * `assignedAgentId` for the caller, which is why the agent id is needed here.
 */
function toRequestFilters(
  filters: QueueFilters,
  agentId: string | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (key === "mine") {
      if (value && agentId) out.assignedAgentId = agentId
      continue
    }
    if (value === undefined || value === "" || value === "all") continue
    out[key] = value
  }
  return out
}

// ---------------------------------------------------------------------------
// Bulk conversations — single cache entry shared by cross-domain consumers
// (customers page enrichment). Distinct from the queue: this one is a plain
// first-N scan, not the paged queue above.
// ---------------------------------------------------------------------------

export function useConversationsBulk() {
  return useQuery<AgentConversationDto[]>({
    queryKey: conversationKeys.bulk(),
    queryFn: () => agentConversationsApi.list({ filter: "all" }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Thread messages — newest page first, older pages behind the cursor.
//
// Mirrors the queue's time-cursor design: page 0 is the newest 15, and each
// older page is fetched with `before` = the oldest `createdAt` seen so far.
// The backend cursor is exclusive, so consecutive pages can never overlap —
// but realtime appends still dedupe by id, because a socket message can race
// a page fetch and land in both.
// ---------------------------------------------------------------------------

/** Thread page size, matching the backend default. */
export const THREAD_PAGE_SIZE = 15

export function useConversationMessagesInfinite(conversationId: string | null) {
  const query = useInfiniteQuery({
    queryKey: [...conversationKeys.messages(conversationId ?? "none"), "infinite"],
    queryFn: ({ pageParam }) =>
      agentConversationsApi.messages(conversationId as string, {
        limit: THREAD_PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: !!conversationId,
    staleTime: 5_000,
    // The old manual fetch never refetched on window focus; a focus refetch
    // re-runs every page and reshuffles Virtuoso's measured sizes for no
    // user-visible benefit.
    refetchOnWindowFocus: false,
  })

  const pages = query.data?.pages ?? []
  const seen = new Set<string>()
  const rows: AgentMessageDto[] = []
  // Pages arrive newest-first but each page reads oldest-first; walk from the
  // oldest page so the thread renders in chronological order.
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    for (const row of pages[index]?.data ?? []) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      rows.push(row)
    }
  }

  return {
    ...query,
    rows,
    hasOlderPage: query.hasNextPage ?? false,
    isFetchingOlderPage: query.isFetchingNextPage,
    fetchOlderPage: query.fetchNextPage,
  }
}

/**
 * Append one message to the newest thread page, deduplicated.
 *
 * No-op when the thread has no cached pages (a message for a conversation
 * the agent is not reading must not materialise a cache entry — the queue
 * patch already carries its unread state) or when the id is already present.
 */
export function appendThreadMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  message: AgentMessageDto,
) {
  queryClient.setQueriesData(
    { queryKey: [...conversationKeys.messages(conversationId), "infinite"] },
    (cached: ThreadInfiniteShape | undefined) => {
      if (!cached || !Array.isArray(cached.pages) || cached.pages.length === 0)
        return cached
      const newest = cached.pages[0]
      if (!newest || newest.data.some((row) => row.id === message.id))
        return cached
      return {
        ...cached,
        pages: [{ ...newest, data: [...newest.data, message] }, ...cached.pages.slice(1)],
      }
    },
  )
}

/**
 * Replace the newest thread page with a fresh server fetch.
 *
 * Used when a socket upsert reports new activity: only page 0 is refetched,
 * so older pages the agent already loaded — and their scroll position — are
 * untouched. Locally-appended rows missing from the fetch (a send racing the
 * refetch) are kept and the merged page is re-sorted oldest-first.
 */
export function replaceNewestThreadPage(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  fresh: AgentMessageDto[],
) {
  queryClient.setQueriesData(
    { queryKey: [...conversationKeys.messages(conversationId), "infinite"] },
    (cached: ThreadInfiniteShape | undefined) => {
      if (!cached || !Array.isArray(cached.pages) || cached.pages.length === 0)
        return cached
      const newest = cached.pages[0]
      const freshIds = new Set(fresh.map((row) => row.id))
      const merged = [
        ...fresh,
        ...((newest?.data ?? []).filter((row) => !freshIds.has(row.id))),
      ].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      return {
        ...cached,
        pages: [{ ...(newest ?? { hasMore: false, nextCursor: null }), data: merged }, ...cached.pages.slice(1)],
      }
    },
  )
}

type ThreadInfiniteShape = {
  pages: Array<AgentMessagePageDto | undefined>;
  pageParams: unknown[];
}

/**
 * Patch the thread cache for one conversation in place.
 *
 * Targets the `messages` key prefix, so it reaches the infinite thread list
 * without disturbing any other conversation's pages. The updater receives the
 * rows of each page separately — callers that only touch one message (retry)
 * or one end (realtime append) work the same on every page.
 */
export function patchThreadMessages(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  updater: (rows: AgentMessageDto[]) => AgentMessageDto[],
) {
  queryClient.setQueriesData(
    { queryKey: conversationKeys.messages(conversationId) },
    (cached: ThreadInfiniteShape | undefined) => {
      if (!cached || !Array.isArray(cached.pages)) return cached
      return {
        ...cached,
        pages: cached.pages.map((page) =>
          page && page.data ? { ...page, data: updater(page.data) } : page,
        ),
      }
    },
  )
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Marks a conversation read/unread.
 *
 * `setReadState` existed on the API client with zero callers, so reading a
 * thread never cleared it — counts only moved as a side effect of sending a
 * reply. On success we patch the queue cache rather than refetching, which
 * keeps a read from triggering a full queue reload.
 */
export function useSetConversationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, unread }: { conversationId: string; unread: boolean }) =>
      agentConversationsApi.setReadState(conversationId, unread),
    onSuccess: (_result, { conversationId }) => {
      patchConversations(queryClient, (rows) =>
        rows.map((row) =>
          row.id === conversationId
            ? {
                ...row,
                metadata: { ...(row.metadata || {}), inboxUnread: false, inboxUnreadCount: 0 },
              }
            : row,
        ),
      )
      invalidateQueueCounts(queryClient)
    },
  })
}

type PaginatedShape = {
  data: Array<AgentConversationDto & { metadata?: Record<string, unknown> }>
}

type InfiniteShape = {
  pages: Array<PaginatedShape | undefined>;
  pageParams: unknown[];
}

/**
 * Patch every cached conversation read/write in one place.
 *
 * Targets `conversationKeys.all`, so it reaches the paginated queue envelope,
 * the INFINITE queue (whose data is `{ pages: [...] }`, not `{ data }` — a
 * previous version only handled the envelope and silently no-opped on the
 * infinite list, which is why socket upserts never moved chatheads), and the
 * plain array behind `useConversationsBulk`. Handles all three shapes because
 * they share a key prefix.
 */
export function patchConversations(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (rows: AgentConversationDto[]) => AgentConversationDto[],
) {
  queryClient.setQueriesData(
    { queryKey: conversationKeys.all },
    (
      cached:
        | PaginatedShape
        | InfiniteShape
        | AgentConversationDto[]
        | undefined,
    ) => {
      if (!cached) return cached
      if (Array.isArray(cached)) return updater(cached)
      if (Array.isArray((cached as InfiniteShape).pages)) {
        const infinite = cached as InfiniteShape
        return {
          ...infinite,
          pages: infinite.pages.map((page) =>
            page && page.data ? { ...page, data: updater(page.data) } : page,
          ),
        }
      }
      if (!(cached as PaginatedShape).data) return cached
      return { ...(cached as PaginatedShape), data: updater((cached as PaginatedShape).data) }
    },
  )
}

const countsTimers = new WeakMap<object, number>()

/**
 * Debounced queue invalidation for chip-count freshness.
 *
 * Counts ride the list envelope, so they freeze between refetches while cards
 * move live on socket patches. Callers reschedule a 3s trailing invalidation:
 * a rush burst of fifty messages costs one refetch, not fifty. The queue
 * prefix covers all filter variants, and every list response carries the full
 * counts object, so all pills re-sync together. Module-level timer per client
 * so socket handlers and mutation callbacks share one schedule. Local +1 math
 * was rejected: the moment intent, assignment, or resolved state moves a row
 * between buckets, client-side arithmetic confidently reports wrong numbers.
 */
/**
 * Immediate queue invalidation for deliberate user actions (open, send,
 * assign, resolve). Unlike socket bursts these are rare, so no debounce:
 * counts re-sync within a breath of the click instead of lagging it.
 */
export function invalidateQueueCounts(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const prev = countsTimers.get(queryClient)
  if (prev) {
    window.clearTimeout(prev)
    countsTimers.delete(queryClient)
  }
  invalidateConversationQueue(queryClient)
}

/**
 * Invalidate every cached conversation queue variant.
 *
 * Order, delivery and payment mutations call this: the chat head's
 * `latestOrder` indicators are server-derived, so a linked order change must
 * refresh the conversation cache too — otherwise the card keeps showing the
 * pre-mutation status until the next socket event or focus refetch.
 */
export function invalidateConversationQueue(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({
    queryKey: [...conversationKeys.all, "queue"],
  })
}

export function scheduleQueueCountsRefresh(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const prev = countsTimers.get(queryClient)
  if (prev) window.clearTimeout(prev)
  countsTimers.set(
    queryClient,
    window.setTimeout(() => {
      countsTimers.delete(queryClient)
      queryClient.invalidateQueries({
        queryKey: [...conversationKeys.all, "queue"],
      })
    }, 3000),
  )
}

/** Replace one conversation wherever it is cached, ignoring it if absent. */
function replaceConversation(
  queryClient: ReturnType<typeof useQueryClient>,
  updated: AgentConversationDto,
) {
  patchConversations(queryClient, (rows) =>
    rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
  )
}

export function useSendConversationMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof agentConversationsApi.sendMessage>[0]) =>
      agentConversationsApi.sendMessage(data),
    onSuccess: (sent) => {
      patchConversations(queryClient, (rows) =>
        rows.map((row) =>
          row.id === sent.conversationId
            ? {
                ...row,
                searchSnippet: sent.content || row.searchSnippet,
                latestSenderType: "agent",
                lastMessageAt: sent.createdAt,
                metadata: { ...(row.metadata || {}), inboxUnread: false },
              }
            : row,
        ),
      )
      invalidateQueueCounts(queryClient)
    },
  })
}

/**
 * Re-dispatch a failed message as the SAME message (no duplicate).
 * Server rejects anything but failed/delivery_unknown, so settled traffic
 * cannot double-send. Refreshes the queue like any other write.
 */
export function useRetryConversationMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) =>
      agentConversationsApi.retryMessage(messageId),
    onSuccess: (retried) => {
      patchConversations(queryClient, (rows) =>
        rows.map((row) =>
          row.id === retried.conversationId
            ? {
                ...row,
                lastMessageAt: retried.createdAt,
              }
            : row,
        ),
      )
      invalidateQueueCounts(queryClient)
    },
  })
}

export function useAssignConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversationId,
      agentId,
    }: {
      conversationId: string
      agentId: string | null
    }) => agentConversationsApi.assign(conversationId, agentId),
    onSuccess: (updated) => {
      replaceConversation(queryClient, updated)
      invalidateQueueCounts(queryClient)
    },
  })
}

export function useUpdateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversationId,
      data,
    }: {
      conversationId: string
      data: Parameters<typeof agentConversationsApi.update>[1]
    }) => agentConversationsApi.update(conversationId, data),
    onSuccess: (updated) => {
      replaceConversation(queryClient, updated)
      invalidateQueueCounts(queryClient)
    },
  })
}

// ---------------------------------------------------------------------------
// Conversation notes (Plan 72) — internal-only staff notes, one paged list per
// conversation. The server returns pinned-first-then-newest, so the query
// takes pages verbatim: no client re-sorting, which would break page counts.
// ---------------------------------------------------------------------------

export const CONVERSATION_NOTES_PAGE_SIZE = 15

export function useConversationNotes(
  conversationId: string | null | undefined,
  page = 1,
  limit = CONVERSATION_NOTES_PAGE_SIZE,
) {
  return useQuery<PaginatedResponse<AgentConversationNoteDto>>({
    queryKey: conversationKeys.notes(conversationId ?? "none", page, limit),
    queryFn: () => agentNotesApi.list(conversationId ?? "", { page, limit }),
    enabled: Boolean(conversationId),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

function invalidateConversationNotes(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: conversationKeys.notesList(conversationId),
  })
}

export function useCreateConversationNote(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof agentNotesApi.create>[1]) =>
      agentNotesApi.create(conversationId, data),
    onSettled: () => invalidateConversationNotes(queryClient, conversationId),
  })
}

export function useUpdateConversationNote(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      noteId,
      data,
    }: {
      noteId: string
      data: Parameters<typeof agentNotesApi.update>[1]
    }) => agentNotesApi.update(noteId, data),
    onSettled: () => invalidateConversationNotes(queryClient, conversationId),
  })
}

export function useDeleteConversationNote(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) => agentNotesApi.remove(noteId),
    onSettled: () => invalidateConversationNotes(queryClient, conversationId),
  })
}
