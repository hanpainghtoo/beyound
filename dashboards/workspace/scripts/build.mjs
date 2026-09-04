import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import nextEnv from "@next/env"

const { loadEnvConfig } = nextEnv
const workspaceDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = path.resolve(workspaceDirectory, "../..")

const { combinedEnv } = loadEnvConfig(repositoryRoot)
Object.assign(process.env, combinedEnv)

if (!process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
  throw new Error("Missing required environment variable: NEXT_PUBLIC_SITE_URL. Add it to the repository root .env file.")
}

const nextBinary = path.join(workspaceDirectory, "node_modules", "next", "dist", "bin", "next")
const child = spawn(process.execPath, [nextBinary, "build"], {
  cwd: workspaceDirectory,
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
  stdio: "inherit",
})

child.on("error", (error) => {
  throw error
})

const exitCode = await new Promise((resolve) => {
  child.on("exit", (code) => resolve(code ?? 1))
})

process.exitCode = exitCode
