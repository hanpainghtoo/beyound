"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSenderAvatar } from "@/lib/api";

const urlCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Resolve a conversation's sender avatar through the core API.
 *
 * The provider credential never reaches the browser: core fetches the picture
 * (Telegram `file_id`, Messenger `profile_pic`) and streams the bytes, so this
 * only ever handles an opaque object URL. One request per conversation is
 * shared by the queue card, the thread bubble and the customer list.
 */
export function useSenderAvatar(conversationId: string, enabled = true) {
  return useQuery({
    queryKey: ["sender-avatar", conversationId],
    queryFn: async () => {
      const cached = urlCache.get(conversationId);
      if (cached !== undefined) return cached;
      const pending = inflight.get(conversationId);
      if (pending) return pending;
      const task = fetchSenderAvatar(conversationId).then((url) => {
        urlCache.set(conversationId, url);
        inflight.delete(conversationId);
        return url;
      });
      inflight.set(conversationId, task);
      return task;
    },
    enabled: enabled && conversationId.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
