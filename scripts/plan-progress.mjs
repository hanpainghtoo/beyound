import { readFileSync } from "node:fs"
import path from "node:path"

// Prints done/total checkbox counts for a plan markdown file, grouped by
// section heading. Counts are always computed from the file, never stored.
const target =
  process.argv[2] ??
  path.join("docs", "tenant_settings", "plan_task.md")

const text = readFileSync(target, "utf8")

const sections = []
let current = { name: "(no section)", done: 0, total: 0, dropped: 0 }
sections.push(current)

for (const line of text.split("\n")) {
  const heading = line.match(/^#{2,3}\s+(.*)\s*$/)
  if (heading) {
    current = { name: heading[1].trim(), done: 0, total: 0, dropped: 0 }
    sections.push(current)
    continue
  }
  const box = line.match(/^\s*-\s*\[([ xX~])\]/)
  if (box) {
    // [~] = superseded: excluded from done/total entirely.
    if (box[1] === "~") {
      current.dropped += 1
      continue
    }
    current.total += 1
    if (box[1].toLowerCase() === "x") current.done += 1
  }
}

const done = sections.reduce((n, s) => n + s.done, 0)
const total = sections.reduce((n, s) => n + s.total, 0)
const dropped = sections.reduce((n, s) => n + s.dropped, 0)
const pct = total === 0 ? "n/a" : `${((done / total) * 100).toFixed(1)}%`
console.log(`${target}: ${done}/${total} done (${pct})${dropped > 0 ? `, ${dropped} superseded (excluded)` : ""}`)
for (const s of sections) {
  if (s.total === 0) continue
  console.log(`  ${s.done}/${s.total} ${s.name}`)
}
