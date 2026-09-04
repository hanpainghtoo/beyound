"use client";

import { useEffect, useRef, useState } from "react";
import {
  csrConversationsApi,
  getSocketBaseUrl,
  getStoredSession,
  type CsrConversationDto,
  type CsrMessageDto,
} from "@/lib/api";

type LiveInboxEvent =
  | {
      type: "conversation.created" | "conversation.updated";
      conversation: CsrConversationDto;
    }
  | {
      type: "message.created";
      conversationId: string;
      message: CsrMessageDto;
    };

type LiveInboxState = {
  isLive: boolean;
  lastEventAt: Date | null;
  liveError: string | null;
};

type SocketLike = {
  disconnect: () => void;
  on: {
    (event: "connect", callback: () => void): void;
    (event: "connect_error", callback: () => void): void;
    (event: "disconnect", callback: () => void): void;
    (
      event: "conversation.created" | "conversation.updated",
      callback: (conversation: CsrConversationDto) => void,
    ): void;
    (
      event: "message.created" | "new_message",
      callback: (payload: {
        conversationId: string;
        message: CsrMessageDto;
      }) => void,
    ): void;
    (
      event: "conversation_updated",
      callback: (payload: {
        conversationId: string;
        update: Record<string, unknown>;
      }) => void,
    ): void;
  };
  off: SocketLike["on"];
};

type SocketFactory = (
  url: string,
  options: {
    auth: { token: string };
    transports: string[];
  },
) => SocketLike;

type WindowWithSocketTestFactory = Window &
  typeof globalThis & {
    __ZAYOS_SOCKET_IO_FACTORY__?: SocketFactory;
  };

export function useCsrLiveInbox({
  enabled,
  onConversationUpsert,
  onMessageCreated,
}: {
  enabled: boolean;
  onConversationUpsert: (conversation: CsrConversationDto) => void;
  onMessageCreated: (conversationId: string, message: CsrMessageDto) => void;
}): LiveInboxState {
  const [state, setState] = useState<LiveInboxState>({
    isLive: false,
    lastEventAt: null,
    liveError: null,
  });
  const callbacksRef = useRef({ onConversationUpsert, onMessageCreated });

  callbacksRef.current = { onConversationUpsert, onMessageCreated };

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    let pollTimer: number | undefined;
    let socket: SocketLike | null = null;

    const startPollingFallback = () => {
      if (pollTimer) return;

      pollTimer = window.setInterval(async () => {
        try {
          const conversations = await csrConversationsApi.list();
          conversations.forEach(callbacksRef.current.onConversationUpsert);
          if (isMounted) {
            setState((current) => ({
              ...current,
              lastEventAt: new Date(),
              liveError: null,
            }));
          }
        } catch (error) {
          if (isMounted) {
            setState((current) => ({
              ...current,
              liveError:
                error instanceof Error
                  ? error.message
                  : "Failed to refresh inbox",
            }));
          }
        }
      }, 10000);
    };

    const startSocket = async () => {
      const session = getStoredSession();
      if (!session?.accessToken) {
        startPollingFallback();
        return;
      }

      try {
        const socketBaseUrl = getSocketBaseUrl();
        if (!socketBaseUrl) throw new Error("Socket base URL is unavailable");
        const socketUrl = `${socketBaseUrl}/csrs`;
        const socketOptions = {
          auth: { token: session.accessToken },
          transports: ["websocket", "polling"] as string[],
        };
        const testFactory = (window as WindowWithSocketTestFactory)
          .__ZAYOS_SOCKET_IO_FACTORY__;
        if (testFactory) {
          socket = testFactory(socketUrl, socketOptions);
        } else {
          const { io } = await import("socket.io-client");
          socket = io(socketUrl, socketOptions);
        }

        socket.on("connect", () => {
          if (!isMounted) return;
          setState({ isLive: true, lastEventAt: new Date(), liveError: null });
        });

        socket.on("connect_error", () => {
          if (!isMounted) return;
          setState((current) => ({
            ...current,
            isLive: false,
            liveError: "Live inbox connection failed; refreshing periodically",
          }));
          startPollingFallback();
        });

        socket.on("disconnect", () => {
          if (!isMounted) return;
          setState((current) => ({ ...current, isLive: false }));
          startPollingFallback();
        });

        const handlePayload = (payload: LiveInboxEvent) => {
          if (!isMounted) return;

          if (
            payload.type === "conversation.created" ||
            payload.type === "conversation.updated"
          ) {
            callbacksRef.current.onConversationUpsert(payload.conversation);
          }

          if (payload.type === "message.created") {
            callbacksRef.current.onMessageCreated(
              payload.conversationId,
              payload.message,
            );
          }

          setState((current) => ({
            ...current,
            lastEventAt: new Date(),
            liveError: null,
          }));
        };

        socket.on("conversation.created", (conversation: CsrConversationDto) =>
          handlePayload({ type: "conversation.created", conversation }),
        );
        socket.on("conversation.updated", (conversation: CsrConversationDto) =>
          handlePayload({ type: "conversation.updated", conversation }),
        );
        socket.on(
          "message.created",
          (payload: { conversationId: string; message: CsrMessageDto }) =>
            handlePayload({ type: "message.created", ...payload }),
        );
        socket.on(
          "new_message",
          (payload: { conversationId: string; message: CsrMessageDto }) =>
            handlePayload({ type: "message.created", ...payload }),
        );
        socket.on(
          "conversation_updated",
          async (payload: {
            conversationId: string;
            update: Record<string, unknown>;
          }) => {
            try {
              const conversation = await csrConversationsApi.get(
                payload.conversationId,
              );
              callbacksRef.current.onConversationUpsert(conversation);
              if (isMounted) {
                setState((current) => ({
                  ...current,
                  lastEventAt: new Date(),
                  liveError: null,
                }));
              }
            } catch (error) {
              if (isMounted) {
                setState((current) => ({
                  ...current,
                  liveError:
                    error instanceof Error
                      ? error.message
                      : "Failed to refresh conversation update",
                }));
              }
            }
          },
        );
      } catch {
        startPollingFallback();
        setState((current) => ({
          ...current,
          isLive: false,
          liveError:
            "Live inbox connection is unavailable; refreshing periodically",
        }));
      }
    };

    startSocket();

    return () => {
      isMounted = false;
      socket?.disconnect();
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [enabled]);

  return state;
}
