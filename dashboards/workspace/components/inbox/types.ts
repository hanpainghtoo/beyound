import type { AgentConversationDto, AgentOrderDto } from "@/lib/api";

/**
 * View model for one row in the inbox queue.
 *
 * Produced by `mapConversation` from the raw API DTO. It exists because the
 * queue reads from several places at once — the conversation, its customer, its
 * channel — and normalising those once is cheaper and safer than re-deriving
 * them at each call site.
 *
 * `intent`, `urgency` and `score` come **from the API**, not from this codebase.
 * They used to be computed client-side, which meant the filter and the card ran
 * two implementations of the same classifier and could disagree. They are
 * carried through here so no component is tempted to recompute them.
 */
export type ConversationRecord = {
  id: string
  customerId: string
  assignedAgentId?: string | null
  customerName: string
  customerAvatar?: string | null
  channelName: string
  channelType: NonNullable<AgentConversationDto["channel"]>["channelType"] | "unknown"
  /** Newest message text, or null when the thread has no messages yet. */
  latestMessage: string | null
  /** True when the newest message is the agent's own — card prefixes "You:". */
  latestIsAgent: boolean
  /**
   * True when the customer's message is the latest activity. False means the
   * agent replied last (or nothing was ever said) — the card shows reply age
   * instead of a wait, because nobody is waiting on us.
   */
  customerWaiting: boolean
  latestAt: string | null
  waitingSince: string | null
  unread: boolean
  unreadCount: number | null
  priority: AgentConversationDto["priority"]
  status: AgentConversationDto["status"]
  subject?: string | null
  email?: string | null
  phone?: string | null
  location: string
  tags: string[]
  slaDueAt?: string | null
  intent: string
  urgency: "danger" | "warning" | "neutral"
  score: number
  shoppingStage?: "browsing" | "checkout" | null
  needsAttention?: boolean
  /** Newest linked order — server-selected; all order indicators read this. */
  latestOrder?: AgentConversationDto["latestOrder"]
  raw: AgentConversationDto
};

/** Urgency accent token name. One edge, one meaning. */
export type QueueUrgency = ConversationRecord["urgency"];

export type QueueOrder = AgentOrderDto | null;
