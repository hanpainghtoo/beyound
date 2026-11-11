"use client";

import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Video player for message attachments and media library entries.
 *
 * Deliberately a styled wrapper around native `<video controls>` rather than
 * a custom control bar. Fullscreen, picture-in-picture, keyboard seeking and
 * screen-reader semantics come from the browser and are correct on every
 * engine; rebuilding them is a large surface to own for very little gain. The
 * craft here is the frame, the caption, and the download escape hatch.
 *
 * `playsInline` matters more than it looks: without it, iOS Safari hijacks
 * playback into its own fullscreen player the moment an agent taps a video in
 * a thread, which loses the surrounding conversation entirely.
 *
 * `preload="metadata"` for the same reason as the audio player — show duration
 * and a scrubbable bar without pulling megabytes the agent may never play.
 */
export function VideoPlayer({
  url,
  label,
  sizeLabel,
  downloadName,
  dark = false,
  className,
}: {
  url: string;
  label?: string;
  sizeLabel?: string;
  downloadName?: string;
  /** True inside a blue outgoing bubble, where text is already inverted. */
  dark?: boolean;
  className?: string;
}) {
  if (!url) {
    return (
      <p className={cn("text-xs opacity-70", className)}>
        Video unavailable.
      </p>
    );
  }

  const fileName = downloadName || label;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <video
        controls
        playsInline
        preload="metadata"
        src={url}
        className="max-h-64 w-full max-w-[320px] rounded-xl bg-slate-900 object-contain"
      >
        <track kind="captions" />
      </video>
      <div className="flex min-w-0 max-w-[320px] items-center gap-2">
        {fileName ? (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              dark ? "text-blue-100" : "text-slate-500 dark:text-slate-400",
            )}
          >
            {sizeLabel ? `${fileName} · ${sizeLabel}` : fileName}
          </span>
        ) : null}
        {fileName ? (
          <a
            href={url}
            download={fileName}
            aria-label={`Download ${fileName}`}
            className={cn(
              "shrink-0 rounded-full p-1 transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              dark
                ? "text-blue-100 hover:bg-white/20 focus-visible:ring-white/60 focus-visible:ring-offset-transparent"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-blue-500 focus-visible:ring-offset-white dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950",
            )}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
    </div>
  );
}