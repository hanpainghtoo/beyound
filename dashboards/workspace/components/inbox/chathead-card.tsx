"use client";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSenderAvatar } from "@/components/inbox/use-sender-avatar";
import { cn } from "@/lib/utils";
import { formatAgo, formatWait, humanize, initialsOf } from "@/lib/format";
import { useI18n } from "@/components/providers/i18n-provider";
import { ChannelMark, supportsSenderAvatar } from "@/components/inbox/channel-icon";
import {
  deliveryStatusBadgeClass,
  orderStatusBadgeClass,
  paymentBadgeClass,
  statusBadgeClass,
} from "@/lib/inbox-badges";
import { ShoppingBag, Truck, User, Wallet } from "lucide-react";
import type { ConversationRecord } from "@/components/inbox/types";

/**
 * One row in the inbox queue.
 *
 * Four lines, deliberately:
 *   1. who, and how long they have been waiting (or since we replied)
 *   2. the latest message, prefixed "You:" when it is the agent's own
 *   3. the latest linked order — order number, order status, delivery status
 *      and payment status, all from the same server-selected order row
 *   4. provenance — channel, owner, unread, and the conversation's own status
 *
 * Colour on the order/status pills identifies the field and its state; the
 * wait text remains the urgency signal. The latest-order line is omitted
 * entirely when the thread has no order — an empty pill row would imply data
 * that does not exist.
 *
 * The order reference used to sit on the provenance line, but that line only
 * carried one order slot and could not express delivery/payment separately.
 *
 * Every truncating child carries `min-w-0`. Without it `truncate` is a no-op on
 * a flex item (they default to `min-width: auto` and refuse to shrink), which
 * made rows overflow the pane rather than ellipsise.
 */
export function ChatheadCard({
  conversation,
  assignedName,
  active,
  compactSnippet,
  onSelect,
}: {
  conversation: ConversationRecord
  assignedName: string
  active: boolean
  /** Focus mode trades the second snippet line for height. */
  compactSnippet?: boolean
  onSelect: (conversationId: string) => void
}) {
  const { t } = useI18n()
  const urgency = conversation.urgency
  const latestOrder = conversation.latestOrder
  const { data: senderAvatarUrl } = useSenderAvatar(
    conversation.id,
    supportsSenderAvatar(conversation.channelType),
  )
  const avatarSrc = senderAvatarUrl ?? conversation.customerAvatar
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative block w-full cursor-pointer overflow-hidden rounded-xl border py-3 pl-4 pr-3 text-left transition-colors",
        active
          ? "border-[var(--workspace-accent)] bg-[var(--workspace-accent-soft)]"
          : "border-[var(--workspace-border)] bg-[var(--workspace-surface)] hover:bg-[var(--workspace-surface-muted)] dark:bg-[var(--workspace-surface-strong)] dark:hover:bg-[var(--workspace-surface-muted)]",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0 rounded-lg">
          <AvatarImage src={avatarSrc || undefined} alt={conversation.customerName} />
          <AvatarFallback className="rounded-lg bg-[var(--workspace-surface-muted)] text-xs font-semibold text-[var(--workspace-text-muted)] dark:bg-[var(--workspace-surface)]">
            {initialsOf(conversation.customerName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            {/* Unread names are bold full-text; read ones recede to semibold
                muted. Weight plus colour together — colour alone is missed at
                a glance, weight alone is missed in peripheral vision. */}
            <p
              className={cn(
                "min-w-0 truncate text-sm",
                conversation.unread
                  ? "font-bold text-[var(--workspace-text)]"
                  : "font-semibold text-[var(--workspace-text-muted)]",
              )}
            >
              {conversation.customerName}
            </p>
            {/* Reply-aware slot: red waiting only ever means a customer is
                actually waiting. When the agent replied last, a muted reply
                age instead — the wait that isn't one. */}
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium tabular-nums",
                conversation.customerWaiting && urgency === "danger"
                  ? "text-[var(--commerceos-danger)]"
                  : "text-[var(--workspace-text-soft)]",
              )}
            >
              {conversation.customerWaiting
                ? formatWait(conversation.waitingSince)
                : t("workspace.inbox.chathead.replied", { when: formatAgo(conversation.latestAt) })}
            </span>
          </div>

          {/* Latest message. Status lives only on the order line below — the
              old intent/shopping-stage pills sat right beside the order chips
              and read as duplicate state, so the preview is text only. */}
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-sm text-[var(--workspace-text-muted)]",
                compactSnippet && "line-clamp-1",
              )}
            >
              {conversation.latestMessage
                ? conversation.latestIsAgent
                  ? `You: ${conversation.latestMessage}`
                  : conversation.latestMessage
                : t("workspace.inbox.chathead.noMessages")}
            </p>
          </div>

          {/* Latest linked order — server-selected by createdAt, so order,
              delivery and payment indicators always describe the same row.
              Icons name the category without three extra word labels; the
              title attribute carries the full readable status. */}
          {latestOrder ? (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px]">
              {latestOrder.orderNumber ? (
                <span className="shrink-0 font-semibold text-[var(--workspace-text-muted)]">
                  {latestOrder.orderNumber}
                </span>
              ) : null}
              {latestOrder.status ? (
                <Badge
                  title={`Order: ${humanize(latestOrder.status)}`}
                  className={cn(orderStatusBadgeClass(latestOrder.status), "shrink-0 text-[10px]")}
                >
                  <ShoppingBag aria-hidden="true" />
                  {humanize(latestOrder.status)}
                </Badge>
              ) : null}
              {latestOrder.deliveryStatus ? (
                <Badge
                  title={`Delivery: ${humanize(latestOrder.deliveryStatus)}`}
                  className={cn(deliveryStatusBadgeClass(latestOrder.deliveryStatus), "shrink-0 text-[10px]")}
                >
                  <Truck aria-hidden="true" />
                  {humanize(latestOrder.deliveryStatus)}
                </Badge>
              ) : null}
              {latestOrder.paymentStatus ? (
                <Badge
                  title={`Payment: ${humanize(latestOrder.paymentStatus)}`}
                  className={cn(paymentBadgeClass(latestOrder.paymentStatus), "shrink-0 text-[10px]")}
                >
                  <Wallet aria-hidden="true" />
                  {humanize(latestOrder.paymentStatus)}
                </Badge>
              ) : null}
            </div>
          ) : null}

          {/* Provenance only: channel, owner, status. The order reference used
              to sit here; it now lives on the dedicated order line above. */}
          <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden text-[11px] text-[var(--workspace-text-soft)]">
            <ChannelMark channelType={conversation.channelType} name={conversation.channelName} />
            <span aria-hidden="true">·</span>
            <User className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{assignedName}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {conversation.priority === "urgent" ? (
                <span className="font-semibold text-[var(--commerceos-danger)]">
                  Urgent
                </span>
              ) : null}
              {conversation.unreadCount && conversation.unreadCount > 0 ? (
                <span className="rounded-full bg-[var(--workspace-accent-soft)] px-1.5 font-semibold tabular-nums text-[var(--workspace-accent-strong)] dark:text-[var(--workspace-accent)]">
                  {conversation.unreadCount}
                </span>
              ) : conversation.unread ? (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--workspace-accent)]"
                  aria-label={t("workspace.inbox.chathead.unread")}
                />
              ) : null}
              {conversation.needsAttention ? (
                <span className="rounded-full bg-amber-100 px-1.5 font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                  Attention
                </span>
              ) : null}
              {/* Actual conversation status: all four are distinct, so Closed
                  must never render as Resolved. */}
              <Badge className={cn(statusBadgeClass(conversation.status), "text-[10px]")}>
                {humanize(conversation.status)}
              </Badge>
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
