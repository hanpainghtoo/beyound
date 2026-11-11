/**
 * Shared inbox classification vocabulary.
 *
 * This is the single definition used by the query predicates, the returned
 * row fields, and the filter counts. It used to live only in the dashboard's
 * `getConversationIntent`, which meant the API could filter on one classifier
 * while the card coloured itself with another — two implementations of the
 * same idea that could disagree. Both now read from here.
 *
 * Classification order is significant and mirrors the original dashboard
 * implementation: the first matching bucket wins, so payment outranks
 * complaint, complaint outranks delivery, and so on. Changing the order
 * changes what agents see, so treat it as a product decision.
 */

export const CONVERSATION_INTENTS = [
  'payment_review',
  'complaints',
  'delivery',
  'order_intent',
  'follow_up',
  'general',
] as const;

export type ConversationIntent = (typeof CONVERSATION_INTENTS)[number];

export const CONVERSATION_URGENCIES = ['danger', 'warning', 'neutral'] as const;

export type ConversationUrgency = (typeof CONVERSATION_URGENCIES)[number];

/**
 * Payment statuses that mean money is uncollected and the order cannot move.
 * Deliberately excludes `failed`/`refunded` — those are terminal, not pending.
 */
export const OPEN_PAYMENT_STATUSES = [
  'pending',
  'partially_paid',
  'cod_pending',
] as const;

/** Order statuses that indicate a conversation is about delivery, not intent. */
export const DELIVERY_ORDER_STATUSES = [
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'returned',
] as const;

/** Order statuses that make a conversation a complaint regardless of wording. */
export const FAILED_DELIVERY_ORDER_STATUSES = ['failed_delivery'] as const;

/** Conversation statuses treated as settled — never urgent, never a live filter. */
export const RESOLVED_STATUSES = ['resolved', 'closed'] as const;

export const URGENT_PRIORITIES = ['urgent'] as const;
export const HOT_LEAD_PRIORITIES = ['urgent', 'high'] as const;

/**
 * Keyword sets per intent. Matched case-insensitively against the
 * conversation subject, its tags, and its message content.
 *
 * Note the semantic difference from the old dashboard classifier: that one
 * read a precomputed `searchSnippet` (effectively the latest message), whereas
 * a SQL `ILIKE` over the joined messages matches *any* message in the thread.
 * That is broader and, for a queue meant to surface unresolved asks, more
 * correct — a customer who complained last week and asked about payment today
 * should still land in payment review.
 */
export const INTENT_KEYWORDS: Record<
  Exclude<ConversationIntent, 'general'>,
  readonly string[]
> = {
  payment_review: ['payment', 'cod', 'transfer', 'kbz'],
  complaints: [
    'complaint',
    'refund',
    'angry',
    'damaged',
    'broken',
    'wrong item',
  ],
  delivery: ['delivery', 'tracking', 'dispatch', 'courier', 'ship'],
  order_intent: ['order', 'buy', 'want', 'checkout', 'cart', 'stock', 'price'],
  follow_up: ['follow up', 'followup', 'follow-up'],
};

/**
 * Weight thresholds.
 *
 * HIGH_VALUE_ORDER_THRESHOLD was 300,000 — below the observed median (345,922
 * across 112 seeded orders, p75 625,067), which flagged 54% of threads as
 * high-value and defeated triage. Set to 600,000 (top-quartile boundary of the
 * observed distribution) on 2026-10-03. Still replace with a real business
 * figure when one exists; seed data is synthetic and production orders will
 * differ. SLA_FALLBACK_MINUTES is still a guess — only 7 messages exist, so
 * no response-latency data grounds it.
 *
 * See the plan's open questions.
 */
export const HIGH_VALUE_ORDER_THRESHOLD = 600_000;
export const SLA_FALLBACK_MINUTES = 45;

/**
 * Channel types allowed to send and receive chat media.
 *
 * Telegram: inbound photo/doc/video/audio/voice, outbound sendPhoto/sendDocument.
 * Messenger: inbound `{type, payload.url}` images/files/video/audio, outbound
 * image/video/audio/file through the Attachment Upload API (our signed URLs are
 * not reachable by Meta, so bytes are uploaded rather than linked).
 *
 * Mirrored frontend-side next to `CHANNEL_META`; the two lists must stay
 * identical or the composer offers what the API rejects (and vice versa).
 */
export const MEDIA_MESSAGING_CHANNEL_TYPES = ['telegram', 'messenger'] as const;

/**
 * Conversation statuses exposed as queue chips.
 *
 * `resolved` and `closed` are deliberately separate: the domain keeps four
 * distinct statuses, and folding Closed into Resolved made a settled thread
 * indistinguishable from a closed one in both the card and the filter.
 */
export const CONVERSATION_STATUSES = [
  'open',
  'pending',
  'resolved',
  'closed',
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** Row counts are needed for every chip, including `all`. */
export const COUNTABLE_FILTERS = [
  'all',
  'unread',
  'unassigned',
  'mine',
  'hot_leads',
  'vip',
  'overdue',
  'payment_review',
  'complaints',
  'delivery',
  'follow_up',
  'open',
  'pending',
  'resolved',
  'closed',
  'needs_attention',
] as const;

export type CountableFilter = (typeof COUNTABLE_FILTERS)[number];

/**
 * List envelope for the agent conversation queue.
 *
 * Extends the shared `PaginatedResult` with the fields the inbox needs and no
 * other workspace list carries: per-filter counts, so the chip counts stay
 * honest once filtering happens server-side, and the resolved intent/urgency on
 * each row, so the card renders a decision the API already made instead of
 * recomputing one.
 *
 * Declared here rather than in `common/interfaces` because it is inbox-specific
 * and widening the shared interface would push optional queue fields onto every
 * other domain.
 */
export interface ConversationListResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  /**
   * Per-chip counts, or null when the aggregate failed.
   *
   * Null rather than zeros on purpose: zeros are indistinguishable from a real
   * result, and a chip showing a confident `0` when the query errored is worse
   * than a chip showing nothing. See `getConversationFilterCounts`.
   */
  counts: Record<CountableFilter, number> | null;
}

/** Fields the queue attaches per row, on top of the stored entity. */
export type ConversationLatestOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: Date | string;
  totalAmount?: number | string;
};

export type ConversationQueueFields = {
  intent: ConversationIntent;
  urgency: ConversationUrgency;
  /** Relative triage weight. Higher = handle sooner. Recency is the tiebreak. */
  score: number;
  /**
   * The conversation's newest linked order, by persisted `createdAt`.
   *
   * Order, delivery and payment indicators must come from this ONE row — the
   * card previously had no server-owned selection, so a client-side scan could
   * mix signals from different orders. Null when the thread has no order.
   */
  latestOrder: ConversationLatestOrder | null;
};

/**
 * Relative triage weights for `score`.
 *
 * These are guesses inherited from the dashboard implementation, not measured
 * policy — see HIGH_VALUE_ORDER_THRESHOLD. They are deliberately additive and
 * separated so that correcting them is a one-place change. What matters for
 * correctness is the *ordering* (payment and complaints above routine), not the
 * exact magnitudes.
 */
export const SCORE_WEIGHTS = {
  paymentReview: 1000,
  orderIntent: 800,
  overdue: 700,
  highValueOrder: 600,
  complaint: 500,
  urgentPriority: 220,
  unread: 160,
  unassigned: 120,
  highPriority: 120,
  /** Wait time is added up to this ceiling so a week-old row cannot dominate. */
  maxWaitMinutes: 600,
} as const;
