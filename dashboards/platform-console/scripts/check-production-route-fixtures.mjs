import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, "..")

const productionRoutes = [
  "app/platform-console/page.tsx",
  "app/platform-console/channels/page.tsx",
  "app/platform-console/operations/page.tsx",
  "app/platform-console/support-access/page.tsx",
  "app/platform-console/notifications/page.tsx",
  "app/platform-console/settings/rate-limiting/page.tsx",
  "app/platform-console/channel-templates/page.tsx",
  "app/platform-console/system-health/page.tsx",
]

const blockedImportPatterns = [
  /@\/lib\/business-ops-data/,
  /@\/lib\/platform-console-data/,
]

const blockedInlinePatterns = [
  /\bconst\s+mock[A-Z\w]*\s*[:=]/,
  /\bconst\s+(fixture|demo|sample|fake)[A-Z\w]*\s*[:=]/i,
]

const failures = []

for (const relativePath of productionRoutes) {
  const absolutePath = path.join(appRoot, relativePath)
  const contents = await readFile(absolutePath, "utf8")

  const importMatch = blockedImportPatterns.find((pattern) => pattern.test(contents))
  if (importMatch) {
    failures.push(`${relativePath}: blocked fixture import ${importMatch}`)
  }

  const inlineMatch = blockedInlinePatterns.find((pattern) => pattern.test(contents))
  if (inlineMatch) {
    failures.push(`${relativePath}: blocked inline mock pattern ${inlineMatch}`)
  }
}

if (failures.length > 0) {
  console.error("Production Platform Console fixture guard failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Verified ${productionRoutes.length} production Platform Console routes: no blocked fixture imports or inline mock declarations found.`)
