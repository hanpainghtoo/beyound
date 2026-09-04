import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  normalizeCoreApiBaseUrl,
  resolveCoreApiBaseUrl,
} = require("../dashboards/shared/server-core-api-config.js")
const {
  resolvePublicSiteUrl,
} = require("../dashboards/shared/server-public-site-url-config.js")

const validProductionEnv = {
  DB_HOST: "db.internal",
  DB_PORT: "5432",
  DB_USERNAME: "zayos",
  DB_PASSWORD: "db-password",
  DB_NAME: "zayos",
  REDIS_HOST: "redis.internal",
  REDIS_PORT: "6379",
  JWT_SECRET: "valid-jwt-secret-value-with-32-characters!",
  INTERNAL_SERVICE_TOKEN_ISSUER: "zayos-test-internal-services",
  INTERNAL_SERVICE_TOKEN_SIGNING_KEY: "valid-internal-service-token-signing-key-32-chars",
  FRONTEND_URLS: "https://zayos.com.mm,https://admin.zayos.com.mm",
  CORE_API_URL: "https://api.zayos.com.mm/api/v1",
  CHAT_INGESTION_URL: "https://chat-ingestion.internal",
  WEBHOOK_HANDLER_URL: "https://webhook-handler.internal",
  INTEGRATION_SERVICE_URL: "https://integration.internal",
  FILE_STORAGE_URL: "https://file-storage.internal",
  FILE_STORAGE_PUBLIC_URL: "https://files.zayos.com.mm",
  MEDIA_PROCESSING_URL: "https://media.internal",
  WORKSPACE_PUBLIC_APP_URL: "https://zayos.com.mm",
  PLATFORM_CONSOLE_PUBLIC_APP_URL: "https://admin.zayos.com.mm",
  WEBHOOK_PUBLIC_BASE_URL: "https://api.zayos.com.mm",
  NEXT_PUBLIC_SITE_URL: "https://zayos.com.mm",
  PLATFORM_CONSOLE_URL: "https://admin.zayos.com.mm",
  META_APP_ID: "123456789012345",
  META_APP_SECRET: "valid-meta-app-secret-value-32-chars",
  TIKTOK_CLIENT_KEY: "prod-tiktok-client-key",
  WS_BASE_URL: "https://api.zayos.com.mm",
  LOCAL_STORAGE_SIGNING_SECRET: "local-storage-signing-secret-value-123!",
}

function loadProductionEcosystem(tempEnv) {
  const previousEnv = process.env
  process.env = { ...previousEnv, ...tempEnv }

  try {
    const modulePath = require.resolve("../ecosystem.config.js")
    delete require.cache[modulePath]
    return require(modulePath)
  } finally {
    process.env = previousEnv
  }
}

test("PM2 production configuration rejects missing required variables", () => {
  assert.throws(
    () =>
      loadProductionEcosystem({
        ...validProductionEnv,
        CORE_API_URL: "",
      }),
    /CORE_API_URL is required/,
  )
})

test("runtime proxy configuration does not resolve to localhost when API base is absent", () => {
  assert.throws(
    () => resolveCoreApiBaseUrl({}),
    /Missing required environment variable: CORE_API_URL/,
  )
})

test("shared API resolver rejects malformed URLs", () => {
  assert.throws(
    () => normalizeCoreApiBaseUrl("not-a-url", "CORE_API_URL"),
    /Invalid CORE_API_URL/,
  )
})

test("shared API resolver normalizes a valid API base without localhost fallback", () => {
  assert.equal(
    resolveCoreApiBaseUrl({ CORE_API_URL: "https://api.zayos.com.mm/" }),
    "https://api.zayos.com.mm/api/v1",
  )
})

test("missing NEXT_PUBLIC_SITE_URL fails with a clear error when required", () => {
  assert.throws(
    () => resolvePublicSiteUrl({ NODE_ENV: "production" }),
    /Missing required environment variable: NEXT_PUBLIC_SITE_URL/,
  )
})

test("valid CI NEXT_PUBLIC_SITE_URL passes build-time validation", () => {
  assert.equal(
    resolvePublicSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:6100/" }),
    "http://127.0.0.1:6100",
  )
})

test("short internal service key fails production validation", () => {
  assert.throws(
    () =>
      loadProductionEcosystem({
        ...validProductionEnv,
        INTERNAL_SERVICE_TOKEN_SIGNING_KEY: "short-key",
      }),
    /INTERNAL_SERVICE_TOKEN_SIGNING_KEY must be at least 32 characters/,
  )
})

test("valid production-like PM2 values pass validation", () => {
  const ecosystem = loadProductionEcosystem(validProductionEnv)
  assert.ok(Array.isArray(ecosystem.apps))
  assert.equal(ecosystem.apps.length > 0, true)
})
