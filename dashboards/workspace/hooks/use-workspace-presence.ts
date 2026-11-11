"use client"

import { useEffect, useSyncExternalStore } from "react"
import { getSocketBaseUrl, getStoredSession } from "@/lib/api"

type PresencePayload = { userId: string; isOnline: boolean }
type PresenceSnapshot = { userIds: string[] }

type PresenceSocket = {
  emit: (event: string, data?: unknown, callback?: (payload: PresenceSnapshot) => void) => void
  on: {
    (event: "connect" | "disconnect" | "connect_error", callback: () => void): void
    (event: "presence_changed", callback: (payload: PresencePayload) => void): void
  }
  disconnect: () => void
}

export type WorkspaceRealtimeStatus = "connecting" | "online" | "offline"

/**
 * Presence is held in a single module-scoped socket shared by every consumer.
 *
 * Previously each component that called this hook opened its own socket and
 * disconnected on unmount, so navigating between team list and team member
 * detail tore the connection down and immediately rebuilt it. During that gap
 * `realtimeStatus` read "offline" and every member read as offline, which made
 * live presence look unreliable. Consumers are now reference counted: the
 * socket stays up until the last one unmounts (or `disconnectWorkspacePresence`
 * is called explicitly on logout).
 */
let sharedSocket: PresenceSocket | null = null
let startPromise: Promise<void> | null = null
let consumerCount = 0

// Snapshots must keep a stable identity between changes for useSyncExternalStore.
let onlineUserIds: ReadonlySet<string> = new Set<string>()
let realtimeStatus: WorkspaceRealtimeStatus = "connecting"

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getOnlineUserIds() {
  return onlineUserIds
}

function getRealtimeStatus() {
  return realtimeStatus
}

function publish() {
  for (const listener of listeners) listener()
}

function setOnlineUserIds(next: ReadonlySet<string>) {
  if (next === onlineUserIds) return
  onlineUserIds = next
  publish()
}

function setRealtimeStatus(next: WorkspaceRealtimeStatus) {
  if (next === realtimeStatus) return
  realtimeStatus = next
  publish()
}

function closeSocket() {
  sharedSocket?.disconnect()
  sharedSocket = null
  startPromise = null
}

function resetPresence() {
  onlineUserIds = new Set<string>()
  realtimeStatus = "offline"
  publish()
}

function applyPresenceChange(payload: PresencePayload) {
  if (onlineUserIds.has(payload.userId) === payload.isOnline) return
  const next = new Set(onlineUserIds)
  if (payload.isOnline) next.add(payload.userId)
  else next.delete(payload.userId)
  setOnlineUserIds(next)
}

export function disconnectWorkspacePresence() {
  consumerCount = 0
  closeSocket()
  resetPresence()
}

async function startSocket() {
  const session = getStoredSession()
  const socketBaseUrl = getSocketBaseUrl()

  if (!session?.accessToken || !socketBaseUrl) {
    setRealtimeStatus("offline")
    return
  }

  setRealtimeStatus("connecting")

  try {
    const { io } = await import("socket.io-client")
    const socket = io(`${socketBaseUrl}/conversations`, {
      auth: { token: session.accessToken },
      transports: ["websocket", "polling"],
    }) as unknown as PresenceSocket

    // A concurrent consumer may have disconnected while the chunk loaded.
    if (consumerCount === 0) {
      socket.disconnect()
      return
    }

    sharedSocket = socket

    socket.on("connect", () => {
      setRealtimeStatus("online")
      socket.emit("get_presence", {}, (snapshot) => {
        setOnlineUserIds(new Set(snapshot?.userIds ?? []))
      })
    })
    socket.on("disconnect", () => setRealtimeStatus("offline"))
    socket.on("connect_error", () => setRealtimeStatus("offline"))
    socket.on("presence_changed", applyPresenceChange)
  } catch {
    setRealtimeStatus("offline")
  }
}

function acquire() {
  consumerCount += 1
  if (sharedSocket || startPromise) return
  startPromise = startSocket().finally(() => {
    startPromise = null
  })
}

function release() {
  consumerCount = Math.max(0, consumerCount - 1)
  if (consumerCount === 0) {
    closeSocket()
    resetPresence()
  }
}

export function useWorkspacePresence() {
  useEffect(() => {
    acquire()
    return release
  }, [])

  const onlineUserIds = useSyncExternalStore(
    subscribe,
    getOnlineUserIds,
    getOnlineUserIds,
  )
  const realtimeStatus = useSyncExternalStore(
    subscribe,
    getRealtimeStatus,
    getRealtimeStatus,
  )

  return { onlineUserIds, realtimeStatus }
}