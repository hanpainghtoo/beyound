import { spawnSync } from "node:child_process"
import path from "node:path"

import { rootDir } from "./ci-env.mjs"

function git(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`)
  }
  return result.stdout.trim()
}

function changedFiles() {
  const explicitBase = process.env.CI_BASE_REF || process.env.GITHUB_BASE_REF
  if (explicitBase) {
    const baseRef = explicitBase.startsWith("origin/") ? explicitBase : `origin/${explicitBase}`
    try {
      git(["rev-parse", "--verify", baseRef])
      return git(["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`])
    } catch {
      return git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])
    }
  }

  return git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])
}

const files = changedFiles()
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => file.startsWith("backend-core-service/"))
  .filter((file) => file.endsWith(".ts"))
  .filter((file) => !file.includes("/dist/"))

if (files.length === 0) {
  console.log("No changed backend TypeScript files to lint.")
  process.exit(0)
}

console.log("Linting changed backend TypeScript files:")
for (const file of files) console.log(`- ${file}`)

const result = spawnSync(
  "npx",
  ["eslint", ...files.map((file) => path.relative(path.join(rootDir, "backend-core-service"), path.join(rootDir, file)))],
  {
    cwd: path.join(rootDir, "backend-core-service"),
    env: process.env,
    stdio: "inherit",
  },
)

process.exit(result.status ?? 1)
