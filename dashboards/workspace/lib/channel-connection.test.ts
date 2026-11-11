import test from "node:test"
import assert from "node:assert/strict"

import { CHANNEL_READY_CONNECTION_STATUSES, isChannelConnectionReady } from "./channel-connection.ts"

test("isChannelConnectionReady accepts the statuses that can actually deliver a message", () => {
  for (const status of ["ready", "connected", "credentials_verified", "awaiting_first_event"]) {
    assert.equal(isChannelConnectionReady(status), true, `expected ${status} to be ready`)
  }
})

test("isChannelConnectionReady rejects a channel that has never been configured", () => {
  // The state every channel in the demo tenant is in — a customer pointed at
  // one of these has a channel that exists but cannot be chatted on.
  assert.equal(isChannelConnectionReady("pending_configuration"), false)
})

test("isChannelConnectionReady rejects in-flight and broken states", () => {
  assert.equal(isChannelConnectionReady("webhook_registering"), false)
  assert.equal(isChannelConnectionReady("error"), false)
  assert.equal(isChannelConnectionReady("disabled"), false)
})

test("isChannelConnectionReady treats missing or unknown status as not ready", () => {
  assert.equal(isChannelConnectionReady(null), false)
  assert.equal(isChannelConnectionReady(undefined), false)
  assert.equal(isChannelConnectionReady(""), false)
  assert.equal(isChannelConnectionReady("something_new"), false)
})

test("the ready set matches the statuses the channels page classifies as usable", () => {
  assert.deepEqual([...CHANNEL_READY_CONNECTION_STATUSES].sort(), [
    "awaiting_first_event",
    "connected",
    "credentials_verified",
    "ready",
  ])
})
