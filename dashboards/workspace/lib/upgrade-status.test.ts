import test from "node:test";
import assert from "node:assert/strict";

import {
  carryoverSummary,
  upgradeStatusLabel,
  upgradeStatusTone,
} from "./upgrade-status.ts";

test("upgradeStatusLabel renders upgrade states with an Upgrade prefix", () => {
  assert.equal(upgradeStatusLabel("requested"), "Upgrade requested");
  assert.equal(upgradeStatusLabel("approved"), "Upgrade approved");
  assert.equal(upgradeStatusLabel("rejected"), "Upgrade rejected");
  assert.equal(upgradeStatusLabel("stale"), "Upgrade expired");
  assert.equal(upgradeStatusLabel("cancelled"), "Upgrade cancelled");
});

test("upgradeStatusLabel maps pending payment without an Upgrade prefix", () => {
  assert.equal(upgradeStatusLabel("pending_payment"), "Payment pending");
});

test("upgradeStatusLabel falls back to a humanized unknown status", () => {
  assert.equal(upgradeStatusLabel("pending_approval"), "Pending Approval");
});

test("upgradeStatusTone classifies approved, terminal, and pending states", () => {
  assert.equal(upgradeStatusTone("approved"), "active");
  assert.equal(upgradeStatusTone("rejected"), "muted");
  assert.equal(upgradeStatusTone("stale"), "muted");
  assert.equal(upgradeStatusTone("cancelled"), "muted");
  assert.equal(upgradeStatusTone("requested"), "pending");
  assert.equal(upgradeStatusTone("pending_payment"), "pending");
});

test("carryoverSummary lists only positive, labelled carryover dimensions", () => {
  assert.equal(
    carryoverSummary({
      inbound_messages: 120,
      outbound_messages: 0,
      api_requests: 30,
    }),
    "Inbound +120 · API +30",
  );
});

test("carryoverSummary returns null for missing, empty, or zero-only carryover", () => {
  assert.equal(carryoverSummary(null), null);
  assert.equal(carryoverSummary(undefined), null);
  assert.equal(carryoverSummary({}), null);
  assert.equal(carryoverSummary({ inbound_messages: 0 }), null);
});
