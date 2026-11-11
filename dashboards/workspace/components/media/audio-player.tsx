"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

/**
 * Audio player for message attachments and media library entries.
 *
 * Built on a real `<audio>` element with `preload="metadata"`, so duration and
 * seeking work without pulling the whole file down. Never autoplays: an agent
 * scrolling a thread should not start hearing every voice note in it.
 *
 * Speed control is here rather than on the native element because voice notes
 * are mostly listened to at 1.5x–2x, and the native `controls` chrome cannot be
 * themed into the dark workspace palette.
 *
 * Single active playback is enforced through a module-level registry of
 * currently-playing elements instead of shared state: a thread can mount a
 * dozen of these, and two voice notes talking over each other is worse than
 * either one playing. Registering on `play` and unregistering on pause/end
 * keeps the set small without a store.
 */

const SPEEDS = [1, 1.5, 2] as const;

/** Currently-playing elements, so starting one can silence the others. */
const activePlayers = new Set<HTMLAudioElement>();

function pauseOthers(current: HTMLAudioElement) {
  for (const element of activePlayers) {
    if (element === current) continue;
    element.pause();
  }
}

function isPlayable(url: string) {
  return Boolean(url);
}

export function AudioPlayer({
  url,
  label,
  downloadName,
  dark = false,
  className,
  compact = false,
}: {
  url: string;
  /** Filename or short description shown beside the controls. */
  label?: string;
  /** `download` attribute; falls back to `label`. */
  downloadName?: string;
  /** True inside a blue outgoing bubble, where text is already inverted. */
  dark?: boolean;
  className?: string;
  /** Tighter layout for the 250px rush-mode pane. */
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const speed = SPEEDS[speedIndex];
  const usable = isPlayable(url);

  // Reset transport state when the source changes — otherwise a previous
  // attachment's duration and playhead leak onto the next one, which is very
  // visible when flipping between two voice notes.
  useEffect(() => {
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
  }, [url]);

  useEffect(() => {
    const element = audioRef.current;
    if (element) element.playbackRate = speed;
  }, [speed, url]);

  // Pause when the component unmounts, otherwise a detached element keeps
  // playing audio over an agent who has scrolled away from the thread.
  useEffect(() => {
    const element = audioRef.current;
    return () => {
      if (element) {
        element.pause();
        activePlayers.delete(element);
      }
    };
  }, []);

  const toggle = useCallback(() => {
    const element = audioRef.current;
    if (!element) return;
    if (element.paused) {
      pauseOthers(element);
      void element.play().catch(() => {
        // Autoplay policy or a torn-down element: reflect reality rather than
        // leaving the button showing a play state that is already active.
        setIsPlaying(false);
      });
    } else {
      element.pause();
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeedIndex((current) => (current + 1) % SPEEDS.length);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const element = audioRef.current;
    if (!element) return;
    const total = Number.isFinite(element.duration) ? element.duration : 0;
    const next = Math.min(Math.max(0, element.currentTime + delta), total);
    element.currentTime = next;
    setPosition(next);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const element = audioRef.current;
    if (element && Number.isFinite(element.duration)) setDuration(element.duration);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const element = audioRef.current;
    if (element) setPosition(element.currentTime);
  }, []);

  const onEnded = useCallback(() => {
    setIsPlaying(false);
    setPosition(0);
  }, []);

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const fileName = downloadName || label;

  if (!usable) {
    return (
      <p className={cn("text-xs opacity-70", className)}>
        Audio unavailable.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl",
        compact ? "max-w-[220px]" : "max-w-[300px]",
        className,
      )}
    >
      <audio
        ref={audioRef}
        preload="metadata"
        src={url}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => {
          pauseOthers(audioRef.current as HTMLAudioElement);
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        className="hidden"
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? `Pause ${label || "audio"}` : `Play ${label || "audio"}`}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          dark
            ? "bg-white/20 text-white hover:bg-white/30 focus-visible:ring-white/60 focus-visible:ring-offset-transparent"
            : "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 focus-visible:ring-offset-white dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950",
        )}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" aria-hidden />
        ) : (
          <Play className="ml-0.5 h-4 w-4" aria-hidden />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Seek ${label || "audio"}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatDuration(position)} of ${formatDuration(duration)}`}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              seekBy(5);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              seekBy(-5);
            } else if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              toggle();
            }
          }}
          onClick={(event) => {
            // Click-to-seek, measured against the track rather than the
            // element so the click target can be padded for a bigger hit area.
            const track = event.currentTarget;
            const rect = track.getBoundingClientRect();
            if (rect.width <= 0 || duration <= 0) return;
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const element = audioRef.current;
            if (element) {
              element.currentTime = ratio * duration;
              setPosition(ratio * duration);
            }
          }}
          className={cn(
            "group relative h-4 w-full cursor-pointer touch-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            dark
              ? "focus-visible:ring-white/60 focus-visible:ring-offset-transparent"
              : "focus-visible:ring-blue-500 focus-visible:ring-offset-white dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950",
          )}
        >
          <span
            className={cn(
              "absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full",
              dark ? "bg-white/25" : "bg-slate-200 dark:bg-slate-700",
            )}
          />
          <span
            className={cn(
              "absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full",
              dark ? "bg-white" : "bg-blue-600 dark:bg-blue-400",
            )}
            style={{ width: `${progress}%` }}
          />
          <span
            className={cn(
              "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100",
              dark ? "bg-white" : "bg-blue-600 dark:bg-blue-400",
            )}
            style={{ left: `${progress}%` }}
            aria-hidden
          />
        </div>
        <div
          className={cn(
            "mt-0.5 flex items-center justify-between text-[11px] tabular-nums",
            dark ? "text-blue-100/80" : "text-slate-500 dark:text-slate-400",
          )}
        >
          <span>
            {formatDuration(position)} / {formatDuration(duration)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label={`Playback speed ${speed}x, click to change`}
          className={cn(
            "min-w-[2.25rem] rounded-full px-1.5 py-1 text-[11px] font-semibold tabular-nums transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            dark
              ? "bg-white/20 text-white hover:bg-white/30 focus-visible:ring-white/60 focus-visible:ring-offset-transparent"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-blue-500 focus-visible:ring-offset-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950",
          )}
        >
          {speed}x
        </button>
        {fileName ? (
          <a
            href={url}
            download={fileName}
            aria-label={`Download ${fileName}`}
            className={cn(
              "rounded-full p-1.5 transition",
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