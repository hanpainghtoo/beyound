#!/usr/bin/env node
/**
 * Development-time translation integrity check.
 *
 * 1. en.json and my.json must expose exactly the same key structure.
 * 2. No value in my.json may be empty.
 * 3. Every static `t("...")` key used in source must exist in en.json.
 *
 * Dynamic keys built at runtime (e.g. template strings) cannot be checked and
 * are ignored; a leading `!` opts a key out of the static scan.
 *
 * Run with: npm run i18n:check
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const packageRoot = join(here, "..")

const en = JSON.parse(readFileSync(join(here, "en.json"), "utf8"))
const my = JSON.parse(readFileSync(join(here, "my.json"), "utf8"))

const flatten = (node, prefix = "") =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === "object" && value !== null ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )

const enKeys = new Set(flatten(en))
const myKeys = new Set(flatten(my))

const problems = []

for (const key of enKeys) {
  if (!myKeys.has(key)) problems.push(`missing in my.json: ${key}`)
}
for (const key of myKeys) {
  if (!enKeys.has(key)) problems.push(`extra in my.json: ${key}`)
}

// my.json must not ship empty strings.
const readValue = (root, path) => path.split(".").reduce((node, part) => node?.[part], root)
for (const key of enKeys) {
  if (typeof readValue(my, key) !== "string" || readValue(my, key).trim() === "") {
    problems.push(`empty value in my.json: ${key}`)
  }
}

// my.json values must be NFC-normalised Unicode. Myanmar text is built from
// base letters plus combining marks (e.g. U+1037 dot-below + U+103A asat), and
// the canonical order of those marks is fixed by their combining class. A value
// like `…1004 103A 1037…` looks identical to the canonical `…1004 1037 103A…`
// but is a distinct codepoint sequence — the two render differently and can
// fail exact-match lookups. The gate here is the one thing that would have
// caught the 92c6976 meta-title reversal, which slipped past every other check.
for (const key of enKeys) {
  const value = readValue(my, key)
  if (typeof value === "string" && value.trim() !== "" && value !== value.normalize("NFC")) {
    problems.push(`non-NFC value in my.json (normalise it): ${key}`)
  }
}

// Static key usage scan across the app source.
const SCAN_DIRS = ["app", "components", "lib", "hooks"]
const SCAN_EXT = new Set([".ts", ".tsx"])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue
      yield* walk(full)
    } else if (SCAN_EXT.has(full.slice(full.lastIndexOf(".")))) {
      yield full
    }
  }
}

const keyPattern = /\bt\(\s*"(?!!)([a-zA-Z0-9_.]+)"/g
let scanned = 0

for (const dir of SCAN_DIRS) {
  const abs = join(packageRoot, dir)
  let files
  try {
    files = [...walk(abs)]
  } catch {
    continue
  }
  for (const file of files) {
    scanned += 1
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(keyPattern)) {
      if (!enKeys.has(match[1])) {
        problems.push(`unknown key "${match[1]}" used in ${relative(packageRoot, file)}`)
      }
    }

    // useI18n() is a client hook. Calling it from a Server Component fails at
    // runtime with "Attempted to call useI18n() from the server", and only when
    // that branch actually renders — so catch it at build time instead.
    if (/\buseI18n\s*\(/.test(source) && !/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/m.test(source)) {
      problems.push(
        `useI18n() called without a "use client" directive in ${relative(packageRoot, file)}`,
      )
    }
  }
}

if (problems.length > 0) {
  console.error(`✗ i18n check failed (${problems.length} problem${problems.length === 1 ? "" : "s"}):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`✓ i18n check passed — ${enKeys.size} keys, identical structure, ${scanned} source files scanned.`)
