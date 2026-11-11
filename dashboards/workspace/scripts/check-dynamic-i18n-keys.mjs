// check-keys.mjs validates literal t("...") calls only. Keys held in
// module-scope arrays (filter chips, context tabs) and resolved via
// t(item.labelKey) are therefore invisible to it. This scans for those
// dynamic key literals and asserts each exists in the catalogs.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const SCAN_DIRS = ["app", "components", "lib", "hooks"]

function flatten(node, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object") flatten(value, path, out)
    else out.add(path)
  }
  return out
}

const en = flatten(JSON.parse(readFileSync(join(ROOT, "i18n_translation/en.json"), "utf8")))
const my = flatten(JSON.parse(readFileSync(join(ROOT, "i18n_translation/my.json"), "utf8")))

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full)
  }
  return files
}

const sources = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
// labelKey: "..." / key: "..." — keys stored in data and resolved dynamically.
const patterns = [
  /(?:labelKey|translationKey|i18nKey|messageKey|key):\s*"([a-zA-Z0-9_.]+)"/g,
]

const problems = []
for (const file of sources) {
  const text = readFileSync(file, "utf8")
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const key = match[1]
      if (!key.includes(".")) continue
      if (!en.has(key)) problems.push(`unknown en.json key "${key}" used in ${file.replace(ROOT, "")}`)
      if (!my.has(key)) problems.push(`unknown my.json key "${key}" used in ${file.replace(ROOT, "")}`)
    }
  }
}

if (problems.length > 0) {
  console.error("✗ dynamic i18n key check failed:")
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`✓ dynamic i18n key check passed — ${sources.length} source files scanned.`)