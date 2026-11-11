import fs from "node:fs"
import path from "node:path"

export const rootDir = path.resolve(new URL("..", import.meta.url).pathname)

export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const env = {}
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const index = line.indexOf("=")
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "")
    env[key] = value
  }
  return env
}

export function loadCiEnv(overrides = process.env) {
  const envFile = overrides.CI_ENV_FILE || path.join(rootDir, ".env.ci.example")
  return {
    ...parseEnvFile(envFile),
    ...overrides,
  }
}

export function redactEnvValue(key, value) {
  if (!value) return value
  if (/secret|token|key|password|credential/i.test(key)) return "[REDACTED]"
  return value
}
