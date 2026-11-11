/**
 * Which channel `connectionStatus` values can actually carry a conversation.
 *
 * The customers list gates its chat button on this. A customer can hold a
 * `channel_id` for a channel that exists but has never finished setup: in the
 * demo tenant every channel sits at `pending_configuration`, so a button that
 * only checks for a channel id still offers a chat that nobody can answer.
 *
 * The set mirrors the "usable channel" classification on the channels page so
 * the two views never disagree about whether a channel is live.
 */

export const CHANNEL_READY_CONNECTION_STATUSES = [
  "ready",
  "connected",
  "credentials_verified",
  "awaiting_first_event",
] as const

const readyStatuses = new Set<string>(CHANNEL_READY_CONNECTION_STATUSES)

/** True only when the channel is set up well enough to send and receive. */
export function isChannelConnectionReady(connectionStatus?: string | null): boolean {
  return Boolean(connectionStatus && readyStatuses.has(connectionStatus))
}
