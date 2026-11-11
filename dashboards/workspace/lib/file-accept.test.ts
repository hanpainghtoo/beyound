import test from "node:test"
import assert from "node:assert/strict"

import { matchesFileAccept } from "./file-accept.ts"

test("matchesFileAccept defaults to accepting everything when no accept is given", () => {
  assert.equal(matchesFileAccept({ type: "video/mp4", name: "clip.mp4" }), true)
  assert.equal(matchesFileAccept({ type: "", name: "odd" }, ""), true)
  assert.equal(matchesFileAccept({ type: "", name: "odd" }, "   "), true)
})

test("matchesFileAccept honours image/* wildcards", () => {
  const accept = "image/*"
  assert.equal(matchesFileAccept({ type: "image/png", name: "a.png" }, accept), true)
  assert.equal(matchesFileAccept({ type: "image/jpeg", name: "a.jpg" }, accept), true)
  // `image/*` must not leak other media families through.
  assert.equal(matchesFileAccept({ type: "video/mp4", name: "a.mp4" }, accept), false)
  assert.equal(matchesFileAccept({ type: "application/pdf", name: "a.pdf" }, accept), false)
  // Prefix has to be complete: slice to "image/", never a bare "image" —
  // a bare prefix would wrongly accept an unrelated "images/x" type.
  assert.equal(matchesFileAccept({ type: "images/x", name: "a" }, accept), false)
  assert.equal(matchesFileAccept({ type: "imag", name: "a" }, accept), false)
})

test("matchesFileAccept supports exact MIME types", () => {
  const accept = "image/png"
  assert.equal(matchesFileAccept({ type: "image/png", name: "a.png" }, accept), true)
  assert.equal(matchesFileAccept({ type: "image/jpeg", name: "a.jpg" }, accept), false)
})

test("matchesFileAccept supports extension entries, case-insensitively", () => {
  const accept = ".PDF"
  assert.equal(matchesFileAccept({ type: "", name: "report.pdf" }, accept), true)
  assert.equal(matchesFileAccept({ type: "", name: "report.PDF" }, accept), true)
  assert.equal(matchesFileAccept({ type: "", name: "report.txt" }, accept), false)
  // Extension must match the tail, not a substring of the stem.
  assert.equal(matchesFileAccept({ type: "", name: "reportpdf" }, accept), false)
})

test("matchesFileAccept treats a comma list as a union of alternatives", () => {
  const accept = "image/*,.pdf"
  assert.equal(matchesFileAccept({ type: "image/webp", name: "a.webp" }, accept), true)
  assert.equal(matchesFileAccept({ type: "", name: "doc.pdf" }, accept), true)
  assert.equal(matchesFileAccept({ type: "text/plain", name: "a.txt" }, accept), false)
})

test("matchesFileAccept rejects typeless files when only a MIME wildcard is allowed", () => {
  // Conservative: an unknown declared type does not satisfy "image/*".
  assert.equal(matchesFileAccept({ type: "", name: "mystery" }, "image/*"), false)
})
