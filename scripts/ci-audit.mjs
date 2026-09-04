import { spawnSync } from "node:child_process"
import path from "node:path"

import { rootDir } from "./ci-env.mjs"

const packages = [
  "backend-core-service",
  "dashboards/workspace",
  "dashboards/platform-console",
  "services/chat-ingestion-service",
  "services/webhook-handler-service",
  "services/integration-service",
  "services/file-storage-service",
  "services/media-processing-service",
]

let failed = false

for (const packagePath of packages) {
  console.log(`\n==> npm audit --omit=dev --audit-level=high (${packagePath})`)
  const result = spawnSync("npm", ["audit", "--omit=dev", "--audit-level=high", "--json"], {
    cwd: path.join(rootDir, packagePath),
    encoding: "utf8",
  })

  let parsed
  try {
    parsed = JSON.parse(result.stdout || "{}")
  } catch {
    parsed = null
  }

  const vulnerabilities = parsed?.metadata?.vulnerabilities
  if (vulnerabilities) {
    console.log(
      JSON.stringify(
        {
          packagePath,
          vulnerabilities,
        },
        null,
        2,
      ),
    )
  } else {
    process.stdout.write(result.stdout)
  }

  if (result.status !== 0) {
    failed = true
    const advisories = Object.entries(parsed?.vulnerabilities || {})
      .filter(([, advisory]) => ["high", "critical"].includes(advisory?.severity))
      .map(([name, advisory]) => `${name} (${advisory.severity})`)
    if (advisories.length > 0) {
      console.error(`High/critical production advisories in ${packagePath}:`)
      for (const advisory of advisories) console.error(`- ${advisory}`)
    } else {
      process.stderr.write(result.stderr)
    }
  }
}

if (failed) {
  console.error("\nDependency audit gate failed. Address in ZAY-P0-005 or add reviewed, expiring exceptions.")
  process.exit(1)
}

console.log("\nDependency audit gate passed.")
