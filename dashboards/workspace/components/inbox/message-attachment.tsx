"use client";
import { useI18n } from "@/components/providers/i18n-provider"

import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { fetchMessageAttachmentBlob } from "@/lib/api";
import { AudioPlayer } from "@/components/media/audio-player";
import { VideoPlayer } from "@/components/media/video-player";
import { classifyAttachment, formatAttachmentSize } from "@/lib/media-kinds";

/**
 * Object-URL cache for message attachment binaries.
 *
 * Two constraints force this shape: plain <img>/<audio> tags cannot send the
 * bearer token, and persisted attachment URLs rot (signed, expiring,
 * localhost-bound), so every render resolves through the authenticated
 * content endpoint. Module-level so re-renders and re-mounts of the same
 * thread share one fetch; entries live for the session (threads hold a
 * handful of attachments, so this is bounded by design, not by accident).
 */
const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cacheKey(messageId: string, index: number) {
  return `${messageId}:${index}`;
}

async function resolveAttachmentUrl(
  messageId: string,
  index: number,
): Promise<string> {
  const key = cacheKey(messageId, index);
  const cached = urlCache.get(key);
  if (cached) return cached;
  const ongoing = inflight.get(key);
  if (ongoing) return ongoing;
  const pending = fetchMessageAttachmentBlob(messageId, index).then((blob) => {
    const url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    inflight.delete(key);
    return url;
  });
  inflight.set(key, pending);
  return pending;
}

export function useMessageAttachmentUrl(
  messageId: string,
  index: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["message-attachment", messageId, index],
    queryFn: () => resolveAttachmentUrl(messageId, index),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
    enabled,
  });
}

/**
 * One attachment inside a message bubble: inline image, audio player, video
 * player, or a download row. Plain playback for voice — no transcription, per
 * product.
 */
export function MessageAttachment({
  messageId,
  index,
  attachment,
  dark,
}: {
  messageId: string;
  index: number;
  attachment: Record<string, unknown>;
  dark?: boolean;
}) {
  const { t } = useI18n()
  const { data: url, isPending, isError } = useMessageAttachmentUrl(
    messageId,
    index,
  );
  const view = classifyAttachment(attachment);

  if (isPending) {
    // Images decode to an unknown natural size, which the attachment record
    // does not carry — so reserve the same box the loaded image will fill
    // (h-64, matching the img below). Without this the bubble grows when the
    // bytes arrive and every row beneath it shifts, which a virtualized list
    // cannot absorb without a visible jump.
    if (view.kind === "image") {
      return (
        <span className="mt-2 flex h-64 w-full items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-label={t("workspace.inbox.attachment.loadingImage")} />
        </span>
      );
    }
    return (
      <span className="mt-2 flex items-center gap-2 text-xs opacity-70">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading attachment…
      </span>
    );
  }

  if (isError || !url) {
    return (
      <span className="mt-2 text-xs opacity-70">
        Attachment unavailable.
      </span>
    );
  }

  if (view.kind === "image") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block overflow-hidden rounded-xl"
      >
        <img
          src={url}
          alt={view.label}
          loading="lazy"
          className="max-h-64 w-auto max-w-full object-contain"
        />
      </a>
    );
  }

  if (view.kind === "audio") {
    return (
      <AudioPlayer
        url={url}
        label={view.label}
        downloadName={view.label}
        dark={dark}
        className="mt-2"
      />
    );
  }

  if (view.kind === "video") {
    return (
      <VideoPlayer
        url={url}
        label={view.label}
        sizeLabel={formatAttachmentSize(view.sizeBytes)}
        downloadName={view.label}
        dark={dark}
        className="mt-2"
      />
    );
  }

  return (
    <a
      href={url}
      download={view.label}
      className="mt-2 flex items-center gap-2 text-xs font-medium underline-offset-2 hover:underline"
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">{view.label}</span>
      {formatAttachmentSize(view.sizeBytes) ? (
        <span className="shrink-0 opacity-60">{formatAttachmentSize(view.sizeBytes)}</span>
      ) : null}
    </a>
  );
}
