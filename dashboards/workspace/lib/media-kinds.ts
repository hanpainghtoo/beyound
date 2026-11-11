/**
 * Attachment classification and size formatting.
 *
 * Deliberately free of React and JSX so the rules are readable and reusable
 * by any surface that has to decide how to present a file — the thread bubble,
 * the media library, the composer chip. Both of those were previously deciding
 * independently from the same attachment record, which is how a voice note
 * ended up rendered by a component that only knew about images.
 */

/** How a message attachment should be presented. */
export type AttachmentKind = "image" | "audio" | "video" | "file";

export type AttachmentView = {
  kind: AttachmentKind;
  label: string;
  sizeBytes?: number;
};

function firstText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

/**
 * Maps an attachment to the surface that renders it.
 *
 * Order is load-bearing: audio and video are matched on their MIME prefix
 * before the extension fallbacks, and image is matched first overall so an
 * `.mp4` never reaches the generic branch. Anything unrecognised stays `file`
 * rather than being guessed at — a download row for an unknown type is a small
 * disappointment, whereas handing an unsupported blob to a player is a
 * visibly broken bubble.
 */
export function classifyAttachment(
  attachment: Record<string, unknown>,
): AttachmentView {
  const label = firstText(attachment, ["fileName", "name", "title"]) || "Attachment";
  const sizeBytes =
    typeof attachment.sizeBytes === "number" && attachment.sizeBytes > 0
      ? attachment.sizeBytes
      : undefined;
  const contentType = firstText(attachment, [
    "contentType",
    "mimeType",
    "mime_type",
  ]).toLowerCase();
  const declared = firstText(attachment, ["type", "messageType", "kind"]).toLowerCase();
  const lowerLabel = label.toLowerCase();
  const haystack = `${contentType} ${declared} ${lowerLabel}`;

  if (
    contentType.startsWith("image/") ||
    declared === "image" ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lowerLabel)
  ) {
    return { kind: "image", label, sizeBytes };
  }

  if (
    contentType.startsWith("video/") ||
    declared === "video" ||
    /\.(mp4|webm|m4v|mov)$/.test(lowerLabel)
  ) {
    return { kind: "video", label, sizeBytes };
  }

  if (
    contentType.startsWith("audio/") ||
    ["audio", "voice", "voice_note"].includes(declared) ||
    haystack.includes("voice") ||
    /\.(mp3|ogg|oga|wav|m4a|opus)$/.test(lowerLabel)
  ) {
    return { kind: "audio", label, sizeBytes };
  }

  return { kind: "file", label, sizeBytes };
}

/** Human-readable byte size, or "" when the record carries none. */
export function formatAttachmentSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}