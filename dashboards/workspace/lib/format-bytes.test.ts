import test from "node:test"
import assert from "node:assert/strict"

import { formatBytes } from "./format-bytes.ts"

test("formatBytes renders sub-MB usage in KB, never 0GB", () => {
  assert.equal(formatBytes(0), "0KB")
  assert.equal(formatBytes(2048), "2KB")
})

test("formatBytes renders MB-scale usage with two decimals", () => {
  assert.equal(formatBytes(1024 * 1024), "1MB")
  // Tenant YHS snapshot: 1,076,826 bytes must not collapse to 0GB.
  assert.equal(formatBytes(1076826), "1.03MB")
})

test("formatBytes renders GB-scale usage with two decimals", () => {
  assert.equal(formatBytes(2 * 1024 ** 3), "2GB")
  assert.equal(formatBytes(2.5 * 1024 ** 3), "2.5GB")
})

test("formatBytes guards non-finite input", () => {
  assert.equal(formatBytes(Number.NaN), "0KB")
  assert.equal(formatBytes(-100), "0KB")
})
