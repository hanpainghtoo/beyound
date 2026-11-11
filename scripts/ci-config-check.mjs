import { createRequire } from "node:module"
import path from "node:path"

import { loadCiEnv, redactEnvValue, rootDir } from "./ci-env.mjs"

const require = createRequire(import.meta.url)

const env = loadCiEnv()

for (const [key, value] of Object.entries(env)) {
  if (value !== undefined) process.env[key] = value
}

const requiredPublicKeys = ["NEXT_PUBLIC_SITE_URL"]

const requiredBrowserConfigKeys = [
  "META_APP_ID",
  "PLATFORM_CONSOLE_URL",
  "TIKTOK_CLIENT_KEY",
  "WS_BASE_URL",
]

const requiredPrivateKeys = [
  "CORE_API_URL",
  "DB_HOST",
  "DB_PORT",
  "DB_USERNAME",
  "DB_PASSWORD",
  "DB_NAME",
  "REDIS_HOST",
  "REDIS_PORT",
  "JWT_SECRET",
  "INTERNAL_SERVICE_TOKEN_ISSUER",
  "INTERNAL_SERVICE_TOKEN_SIGNING_KEY",
  "LOCAL_STORAGE_SIGNING_SECRET",
  "META_APP_SECRET",
  "TELEGRAM_MANAGER_BOT_TOKEN",
  "TELEGRAM_MANAGER_BOT_USERNAME",
  "TELEGRAM_MANAGER_WEBHOOK_SECRET",
  "TELEGRAM_MANAGER_WEBHOOK_URL",
  "TELEGRAM_MERCHANT_WEBHOOK_BASE_URL",
  "TELEGRAM_TOKEN_ENCRYPTION_KEY",
]

const errors = []

for (const key of [...requiredPublicKeys, ...requiredBrowserConfigKeys, ...requiredPrivateKeys]) {
  if (!env[key]?.trim()) errors.push(`${key} is required for CI.`)
}

for (const key of [...requiredPublicKeys, ...requiredBrowserConfigKeys]) {
  const value = env[key] || ""
  if (/secret|token|password|credential|internal/i.test(value)) {
    errors.push(`${key} must not contain private secret material.`)
  }
}

for (const [key, minimumLength] of [
  ["JWT_SECRET", 32],
  ["JWT_REFRESH_SECRET", 32],
  ["INTERNAL_SERVICE_TOKEN_SIGNING_KEY", 32],
  ["LOCAL_STORAGE_SIGNING_SECRET", 32],
  ["META_APP_SECRET", 32],
  ["TELEGRAM_MANAGER_WEBHOOK_SECRET", 32],
  ["TELEGRAM_TOKEN_ENCRYPTION_KEY", 32],
]) {
  if ((env[key] || "").trim().length < minimumLength) {
    errors.push(`${key} must be at least ${minimumLength} characters.`)
  }
}

try {
  const { resolvePublicSiteUrl } = require(
    path.join(rootDir, "dashboards/shared/server-public-site-url-config.js"),
  )
  resolvePublicSiteUrl(env, { requireInDevelopment: true })
} catch (error) {
  errors.push(error instanceof Error ? error.message : "NEXT_PUBLIC_SITE_URL is invalid.")
}

try {
  const { resolveCoreApiBaseUrl } = require(
    path.join(rootDir, "dashboards/shared/server-core-api-config.js"),
  )
  resolveCoreApiBaseUrl(env)
} catch (error) {
  errors.push(error instanceof Error ? error.message : "CORE_API_URL is invalid.")
}

try {
  const ecosystemPath = path.join(rootDir, "ecosystem.config.js")
  delete require.cache[require.resolve(ecosystemPath)]
  require(ecosystemPath)
} catch (error) {
  errors.push(error instanceof Error ? error.message : "Production ecosystem config is invalid.")
}

if (errors.length > 0) {
  console.error("CI configuration validation failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log("CI configuration validation passed.")
console.log("Loaded CI env keys:")
for (const key of [...requiredPublicKeys, ...requiredBrowserConfigKeys, ...requiredPrivateKeys].sort()) {
  console.log(`- ${key}=${redactEnvValue(key, env[key])}`)
}
