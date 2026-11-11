"use client";
import { useI18n } from "@/components/providers/i18n-provider"

import { useMemo, useState } from "react";
import { ImageIcon, MessageSquareText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaImage } from "@/hooks/use-media-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentCannedResponseDto } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Single-select saved-reply picker for the inbox composer.
 * Same contract as SendProductDialog: both footer buttons close,
 * only Select writes (append, never overwrite). All visibilities
 * shown for now — no private/public gating (product decision).
 */
export function SavedReplyDialog({
  open,
  onOpenChange,
  replies,
  loading,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replies: AgentCannedResponseDto[];
  loading: boolean;
  onSelect: (reply: AgentCannedResponseDto) => void;
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return replies;
    return replies.filter((reply) => {
      const haystack =
        `${reply.title || ""} ${reply.content || ""} ${(reply.tags || []).join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [replies, query]);

  const close = () => {
    setQuery("");
    setPickedId(null);
    onOpenChange(false);
  };

  const handleSelect = () => {
    const picked = replies.find((reply) => reply.id === pickedId);
    if (!picked) return;
    onSelect(picked);
    close();
  };

  // Set here rather than inside the card list so the description can announce
  // that selecting this reply also attaches a photo — no surprise for the agent.
  const pickedHasPhoto =
    Boolean(pickedId) &&
    Boolean(replies.find((reply) => reply.id === pickedId)?.imageMediaId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          setPickedId(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Saved replies</DialogTitle>
          <DialogDescription>
            Pick one reply to append to the composer.
            {pickedHasPhoto ? " Its photo will be attached too." : ""}
            {pickedId ? " 1 selected." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("workspace.inbox.savedReplies.search")}
            aria-label={t("workspace.inbox.savedReplies.search")}
            className="pl-9"
          />
        </div>
        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-2 pr-4">
            {filtered.length === 0 ? (
              <p className="px-1 py-6 text-sm text-slate-500 dark:text-slate-400">
                {loading ? t("workspace.inbox.savedReplies.loading") : t("workspace.inbox.savedReplies.empty")}
              </p>
            ) : (
              filtered.map((reply) => {
                const checked = pickedId === reply.id;
                return (
                  <ReplyCard
                    key={reply.id}
                    reply={reply}
                    checked={checked}
                    onPick={() => setPickedId(reply.id)}
                  />
                );
              })
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!pickedId} onClick={handleSelect}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One reply row. Replies carrying a photo get a real thumbnail rather than an
 * icon, because selecting one attaches that image to the message — the agent
 * should see what is coming before they press Select.
 *
 * The thumbnail resolves through `useMediaImage`, which mints a signed URL on
 * demand and reports `failed` for a deleted file or an expired link; that
 * degrades to a plain icon instead of a broken image.
 */
function ReplyCard({
  reply,
  checked,
  onPick,
}: {
  reply: AgentCannedResponseDto;
  checked: boolean;
  onPick: () => void;
}) {
  const image = useMediaImage(reply.imageMediaId);
  const showThumb = image.status === "ready";

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={checked}
      className={cn(
        "flex w-full gap-3 rounded-xl border p-3 text-left transition-colors",
        checked
          ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/40"
          : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900",
      )}
    >
      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
        {showThumb ? (
          // Plain <img>: this is a freshly minted signed URL, and the
          // reference token is already in the header/query, so no bearer
          // fetch wrapper is needed (unlike persisted message attachments).
          <img
            src={image.url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            {image.status === "pending" ? (
              <span className="h-3 w-3 animate-pulse rounded-full bg-slate-300 dark:bg-slate-700" />
            ) : (
              <MessageSquareText className="h-4 w-4 text-slate-400" />
            )}
          </span>
        )}
        {reply.imageMediaId && image.status === "failed" ? (
          <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 px-1 py-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-white">
            No photo
          </span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
            {reply.title}
          </span>
          {reply.imageMediaId && image.status !== "failed" ? (
            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
          ) : null}
          {reply.usageCount > 0 ? (
            <span className="ml-auto shrink-0 text-xs text-slate-400">
              ×{reply.usageCount}
            </span>
          ) : null}
        </span>
        <span className="mt-1 line-clamp-3 block whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
          {reply.content}
        </span>
      </span>
    </button>
  );
}
