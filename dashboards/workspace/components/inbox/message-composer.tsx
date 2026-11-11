"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CreditCard, Loader2, MessageSquareText, Music, Package, Paperclip, Send, Video } from "lucide-react";
import type { AgentMediaFileDto } from "@/lib/api";
import { useI18n } from "@/components/providers/i18n-provider";

/**
 * The reply composer: saved-reply picker, product picker, payment-method
 * picker, attachment chip, textarea, send.
 *
 * Held as a controlled component so the inbox page is not the owner of draft
 * state it does not otherwise care about. Enter sends, Shift+Enter newlines.
 *
 * Layout switches on CONTAINER width, not viewport width. The thread pane is
 * ~700px in normal mode but ~250px in rush mode at the same 1280px viewport,
 * so `sm:`/`lg:` breakpoints put the composer side-by-side in a pane it
 * cannot fit in — the textarea crushed to a vertical letter-strip. Below
 * 26rem the composer stacks (textarea full width, actions below), exactly the
 * mobile arrangement; at and above it lays out in one row. The root carries
 * `@container` to establish the query context.
 *
 * `blocked` is the channel-capability case. TikTok is inbound-only here, so the
 * textarea, the attach button and send are all disabled — but the saved-reply
 * picker stays live on purpose, because staff still need the wording to copy
 * into the approved TikTok surface. Disabling everything would remove the one
 * useful thing an agent can do on that channel.
 */
export function MessageComposer({
  messageText,
  onMessageTextChange,
  cannedLoading,
  cannedCount,
  onOpenSavedReplies,
  onOpenProducts,
  onOpenPaymentMethods,
  selectedMedia,
  mediaFresh,
  onRemoveMedia,
  onAttach,
  onSend,
  sending,
  blocked,
  mediaCapable,
}: {
  messageText: string
  onMessageTextChange: (value: string) => void
  cannedLoading: boolean
  cannedCount: number
  onOpenSavedReplies: () => void
  onOpenProducts?: () => void
  onOpenPaymentMethods?: () => void
  selectedMedia: AgentMediaFileDto | null
  /** True when the attachment was just uploaded (now a library entry). */
  mediaFresh: boolean
  onRemoveMedia: () => void
  onAttach: () => void
  onSend: () => void
  sending: boolean
  blocked: boolean
  /**
   * False on channels outside the media-messaging allowlist: the attach
   * button stays hidden rather than offering sends the API will reject.
   */
  mediaCapable: boolean
}) {
  const { t } = useI18n()
  const canSend =
    !blocked && !sending && (messageText.trim().length > 0 || selectedMedia !== null)
  const attachDisabled = blocked || !mediaCapable
  const previewImage =
    selectedMedia?.contentType.startsWith("image/") &&
    selectedMedia.download?.url
      ? selectedMedia.download.url
      : null
  // No embedded player in the composer: this pane is ~250px wide in rush mode
  // and a transport bar there would crush the textarea. An icon plus the size
  // is enough to confirm what is about to be sent.
  const MediaBadgeIcon = selectedMedia?.contentType.startsWith("video/")
    ? Video
    : selectedMedia?.contentType.startsWith("audio/")
      ? Music
      : null
  const sizeLabel =
    selectedMedia && selectedMedia.sizeBytes > 0
      ? selectedMedia.sizeBytes < 1024 * 1024
        ? `${Math.round(selectedMedia.sizeBytes / 1024)} KB`
        : `${(selectedMedia.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : ""

  return (
    <div className="@container sticky bottom-0 z-10 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
      {selectedMedia ? (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-500/20 dark:bg-blue-500/10">
          {previewImage ? (
            <img
              src={previewImage}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          ) : MediaBadgeIcon ? (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200">
              <MediaBadgeIcon className="h-6 w-6" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-blue-950 dark:text-blue-100">
              {selectedMedia.fileName}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-200">
              {selectedMedia.contentType}
              {sizeLabel ? ` · ${sizeLabel}` : ""}
              {mediaFresh ? ` · ${t("workspace.inbox.composer.savedToLibrary")}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onRemoveMedia}>
            {t("workspace.inbox.composer.remove")}
          </Button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="justify-start font-normal" onClick={onOpenSavedReplies}>
          <MessageSquareText className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {cannedLoading ? t("workspace.inbox.composer.loading") : cannedCount > 0 ? t("workspace.inbox.composer.savedRepliesCount", { count: cannedCount }) : t("workspace.inbox.composer.savedReplies")}
          </span>
        </Button>
        {onOpenProducts ? (
          <Button variant="outline" className="justify-start font-normal" onClick={onOpenProducts}>
            <Package className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{t("workspace.inbox.action.sendProduct")}</span>
          </Button>
        ) : null}
        {onOpenPaymentMethods ? (
          <Button variant="outline" className="justify-start font-normal" onClick={onOpenPaymentMethods}>
            <CreditCard className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{t("workspace.inbox.composer.paymentMethods")}</span>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 @min-[26rem]:flex-nowrap @min-[26rem]:gap-3">
        <Button
          variant="outline"
          size="icon"
          aria-label={t("workspace.inbox.composer.attachMedia")}
          title={
            attachDisabled && !blocked
              ? t("workspace.inbox.composer.mediaNotEnabled")
              : undefined
          }
          className="self-end"
          onClick={onAttach}
          disabled={attachDisabled}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          value={messageText}
          onChange={(event) => onMessageTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              if (canSend) onSend()
            }
          }}
          placeholder={
            blocked
              ? "TikTok replies are blocked in ZayOS. Use notes, orders, and delivery tools here instead."
              : "Reply with order, payment, or delivery guidance…"
          }
          disabled={blocked}
          aria-label={t("workspace.inbox.composer.replyMessage")}
          className="order-first min-h-[72px] w-full flex-none resize-none @min-[26rem]:order-none @min-[26rem]:min-h-[104px] @min-[26rem]:w-auto @min-[26rem]:flex-1"
        />
        <Button
          className="ml-auto self-end @min-[26rem]:ml-0"
          disabled={!canSend}
          onClick={onSend}
        >
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {blocked ? t("workspace.inbox.composer.unavailable") : t("workspace.inbox.composer.send")}
        </Button>
      </div>
    </div>
  )
}