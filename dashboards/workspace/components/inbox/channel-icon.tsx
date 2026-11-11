"use client";

import { cn } from "@/lib/utils";
import { humanize } from "@/lib/format";

/**
 * Channel icon + display name, shared by the inbox queue and anywhere else a
 * conversation's origin shows.
 *
 * Source of truth is the channels page (`app/workspace/channels/page.tsx`):
 * same asset paths, same labels — including "Tiktok", which is the channels
 * page's spelling and stays so here rather than drifting into two names for
 * one channel. Unknown types fall back to a humanized text label so nothing
 * renders blank when a new provider is added before its icon.
 */
/**
 * Channel types allowed to send and receive chat media. Telegram and Messenger
 * both do; the lists must stay in step with the backend list in
 * `conversation-intent.ts` (`MEDIA_MESSAGING_CHANNEL_TYPES`): if the two drift,
 * the composer offers what the API rejects, or hides what it accepts.
 */
export const MEDIA_MESSAGING_CHANNEL_TYPES = ['telegram', 'messenger'] as const;

export function isMediaMessagingChannel(
  channelType: string | null | undefined,
): boolean {
  return !!channelType && (MEDIA_MESSAGING_CHANNEL_TYPES as readonly string[]).includes(channelType.toLowerCase());
}

/**
 * Providers whose sender profile picture the API can resolve. Kept separate
 * from the media list because the two capabilities are independent — a channel
 * can accept media without exposing an avatar (or the reverse).
 */
export const SENDER_AVATAR_CHANNEL_TYPES = ['telegram', 'messenger'] as const;

export function supportsSenderAvatar(
  channelType: string | null | undefined,
): boolean {
  return !!channelType && (SENDER_AVATAR_CHANNEL_TYPES as readonly string[]).includes(channelType.toLowerCase());
}

const CHANNEL_META: Record<string, { iconSrc: string; label: string }> = {
  messenger: { iconSrc: "/icons/channels/messenger.svg", label: "Messenger" },
  telegram: { iconSrc: "/icons/channels/telegram.svg", label: "Telegram" },
  viber: { iconSrc: "/icons/channels/viber.svg", label: "Viber" },
  tiktok: { iconSrc: "/icons/channels/tiktok.png", label: "Tiktok" },
};

export function channelMeta(channelType: string | null | undefined): {
  iconSrc: string | null;
  label: string;
} {
  if (!channelType) return { iconSrc: null, label: "Unknown" };
  const meta = CHANNEL_META[channelType.toLowerCase()];
  if (meta) return meta;
  return { iconSrc: null, label: humanize(channelType) };
}

export function ChannelMark({
  channelType,
  name,
  className,
}: {
  channelType: string | null | undefined;
  /**
   * The connected channel's own display name ("Mingalar Mobile"). Wins over
   * the provider-family label whenever present; blank/placeholder falls back
   * to the family label, then to humanized type. The queue record defaults
   * missing names to "Channel", which counts as absent here.
   */
  name?: string | null;
  className?: string;
}) {
  const { iconSrc, label: familyLabel } = channelMeta(channelType);
  const label =
    name && name.trim() !== "" && name !== "Channel" ? name : familyLabel;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-3.5 w-3.5 shrink-0 rounded-[4px] object-contain"
        />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
