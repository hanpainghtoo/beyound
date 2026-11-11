"use client";
import { useI18n } from "@/components/providers/i18n-provider"

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTimeShort, humanize } from "@/lib/format";
import { MessageAttachment } from "@/components/inbox/message-attachment";
import { useSenderAvatar } from "@/components/inbox/use-sender-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memo } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import type { AgentMessageDto } from "@/lib/api";

/**
 * One message bubble in the conversation thread.
 *
 * Outgoing bubbles carry a delivery status and a timestamp; incoming ones carry
 * only a timestamp. Failed outgoing bubbles surface the provider's own failure
 * text rather than a generic "failed" badge — an agent cannot act on "failed",
 * but they can act on "This channel does not accept images; send a link instead".
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Human-readable reason a send failed, read from the provider's own delivery
 * metadata. Prefers the actionable `nextStep`, then the error description,
 * then the raw error, so the most useful message wins.
 */
function getMessageFailureDetails(message: AgentMessageDto): string | null {
  const providerDelivery = asRecord(message.metadata?.providerDelivery)
  if (!providerDelivery || message.status !== "failed") return null

  const providerStatus =
    typeof providerDelivery.providerStatus === "string"
      ? providerDelivery.providerStatus
      : ""
  const providerError = asRecord(providerDelivery.providerError)
  const fallbackError =
    typeof providerDelivery.error === "string" ? providerDelivery.error : ""
  const nextStep =
    typeof providerDelivery.nextStep === "string" ? providerDelivery.nextStep : ""

  // TikTok and similar providers reject whole message types, so the next step
  // is the only thing that tells the agent what to do differently.
  if (providerStatus === "unsupported_message_type" && nextStep) {
    return nextStep
  }

  if (
    typeof providerError?.description === "string" &&
    providerError.description.trim()
  ) {
    return providerError.description
  }

  if (fallbackError) return fallbackError
  if (nextStep) return nextStep
  return null
}

/**
 * Messenger cannot attach text to an attachment message, so a media caption
 * travels as a second send. If that second send fails the image still arrived;
 * this surfaces the loss without turning the message into a retryable failure
 * (retrying would deliver the image again).
 */
function getCaptionFailure(message: AgentMessageDto): string | null {
  if (message.senderType !== "agent") return null
  const providerDelivery = asRecord(message.metadata?.providerDelivery)
  const delivery = asRecord(providerDelivery?.delivery)
  const caption = asRecord(delivery?.caption)
  if (caption?.delivered !== false) return null
  return typeof caption.error === "string" ? caption.error : ""
}

/**
 * Retry is offered iff the failure record recommends it
 * (`providerDelivery.retry.recommended`, set on network/ambiguous failures).
 * Validation rejections, blocks, and unsupported types keep error text only —
 * retrying those would fail identically, so the button would be a lie.
 */
function isRetryRecommended(message: AgentMessageDto): boolean {
  if (!message || message.senderType !== "agent") return false;
  if (message.status !== "failed" && message.status !== "delivery_unknown") {
    return false;
  }
  const providerDelivery = asRecord(message.metadata?.providerDelivery);
  const retry = asRecord(providerDelivery?.retry);
  return retry?.recommended === true;
}

/**
 * Memoized: the thread renders through a virtualizer, so every item must
 * re-render only when its own message object changes. Callers must pass a
 * stable `onRetry` (one useCallback for the whole thread, keyed by id) —
 * an inline closure per item would defeat the memo on every parent render
 * (e.g. each composer keystroke).
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  onRetry,
  retrying,
}: {
  message: AgentMessageDto;
  onRetry?: (messageId: string) => void;
  retrying?: boolean;
}) {
  const { t } = useI18n()
  const outgoing = message.senderType === "agent"
  const incomingCustomer = message.senderType === "customer"
  const failed = message.status === "failed"
  // Provider-supplied reasons pass through untouched; the generic fallback
  // is ours, so it is translated here rather than in the module-scope helper.
  //
  // The fallback must stay behind the same `failed` guard as the helper: it
  // returns null for anything that is not failed, and a bare `||` turned that
  // null into the fallback string, so every bubble rendered "Provider delivery
  // failed." regardless of its status or direction.
  const failureDetails =
    outgoing && failed
      ? (getMessageFailureDetails(message) ??
        t("workspace.inbox.providerDeliveryFailed"))
      : null
  const internal = message.senderType === "system" && message.messageType === "system_event" && message.metadata?.systemEvent === true
  const { data: senderAvatarUrl } = useSenderAvatar(
    incomingCustomer ? message.conversationId : "",
    incomingCustomer,
  )
  const attachments = Array.isArray(message.attachments)
    ? (message.attachments as Record<string, unknown>[])
    : []
  const showRetry = isRetryRecommended(message) && onRetry !== undefined
  const captionFailure = getCaptionFailure(message)

  return (
    <div className={cn("flex items-end gap-2", internal ? "justify-center" : outgoing ? "justify-end" : "justify-start")}>
      {incomingCustomer ? (
        <Avatar className="h-7 w-7 shrink-0 self-end">
          {senderAvatarUrl ? (
            <AvatarImage src={senderAvatarUrl} alt="sender" />
          ) : null}
          <AvatarFallback className="text-[10px]">?</AvatarFallback>
        </Avatar>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
          internal && "border-dashed bg-slate-50 text-slate-500 shadow-none dark:bg-slate-900/60",
          outgoing
            ? failed
              ? "border border-red-200 bg-red-50 text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100"
              : "bg-blue-600 text-white dark:bg-blue-500"
            : message.senderType === "system"
              ? "border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              : "border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
        )}
      >
<p className={cn("whitespace-pre-wrap text-sm leading-6", internal && "font-medium italic text-slate-600 dark:text-slate-300")}>
          {/* Media-only sends carry empty content so the attachment filename
              never leaks out as caption text; the bubble renders the attachment
              alone in that case. */}
          {message.content || (attachments.length > 0 ? "" : "Attachment")}
        </p>

        {attachments.map((attachment, index) => (
          <MessageAttachment
            key={`${message.id}:${index}`}
            messageId={message.id}
            index={index}
            attachment={attachment}
            dark={outgoing && !failed}
          />
        ))}

        {outgoing ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "rounded-full text-[10px]",
                failed
                  ? "border-red-300 text-red-700 dark:border-red-400/30 dark:text-red-100"
                  : "border-white/20 text-white dark:border-white/20 dark:text-white",
              )}
            >
              {humanize(message.status)}
            </Badge>
            <p
              className={cn(
                "text-[11px]",
                failed
                  ? "text-red-700 dark:text-red-200"
                  : "text-blue-100 dark:text-blue-50/80",
              )}
            >
              {formatDateTimeShort(message.createdAt)}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            {formatDateTimeShort(message.createdAt)}
          </p>
        )}

        {failureDetails ? (
          <p className="mt-2 text-xs leading-5 text-red-700 dark:text-red-200">
            {failureDetails}
          </p>
        ) : null}

        {captionFailure !== null ? (
          <p className="mt-2 text-xs leading-5 text-amber-100">
            {t("workspace.inbox.captionDeliveryFailed")}
            {captionFailure ? ` — ${captionFailure}` : ""}
          </p>
        ) : null}

        {showRetry ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={retrying}
            onClick={() => onRetry?.(message.id)}
          >
            {retrying ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
            )}
            Retry send
          </Button>
        ) : null}
      </div>
    </div>
  )
});
