const fs = require("node:fs")
const path = require("node:path")

const root = __dirname
const isDev = process.env.ZAYOS_ENV === "dev"
const rootEnvPath = path.join(root, isDev ? ".env.dev" : ".env")

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return

  const parsed = {}
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || !line.includes("=")) continue

    const index = line.indexOf("=")
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "")
    parsed[key] = value
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

try {
  require("dotenv").config({ path: rootEnvPath })
} catch {
  loadEnvFile(rootEnvPath)
}

const common = {
  NODE_ENV: isDev ? "development" : "production",
}

const requiredProductionVariablesByScope = {
  all_processes: [
    "CORE_API_URL",
    "INTERNAL_SERVICE_TOKEN_ISSUER",
    "INTERNAL_SERVICE_TOKEN_SIGNING_KEY",
  ],
  backend_only: [
    "DB_HOST",
    "DB_PORT",
    "DB_USERNAME",
    "DB_PASSWORD",
    "DB_NAME",
    "REDIS_HOST",
    "REDIS_PORT",
    "JWT_SECRET",
    "FRONTEND_URLS",
    "CHAT_INGESTION_URL",
    "WEBHOOK_HANDLER_URL",
    "INTEGRATION_SERVICE_URL",
    "FILE_STORAGE_URL",
    "MEDIA_PROCESSING_URL",
    "WORKSPACE_PUBLIC_APP_URL",
    "PLATFORM_CONSOLE_PUBLIC_APP_URL",
    "WEBHOOK_PUBLIC_BASE_URL",
  ],
  workspace_only: [
    "NEXT_PUBLIC_API_BASE_URL",
    "NEXT_PUBLIC_PLATFORM_CONSOLE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_META_APP_ID",
    "NEXT_PUBLIC_TIKTOK_CLIENT_KEY",
    "PLATFORM_CONSOLE_URL",
    "META_APP_ID",
    "META_APP_SECRET",
    "TIKTOK_CLIENT_KEY",
    "WS_BASE_URL",
  ],
  platform_console_only: ["NEXT_PUBLIC_API_BASE_URL"],
  file_storage_only: ["FILE_STORAGE_PUBLIC_URL", "LOCAL_STORAGE_SIGNING_SECRET"],
}

const requiredProductionVariables = Object.values(
  requiredProductionVariablesByScope,
).flat()

const knownPlaceholderSecrets = new Set([
  "your-secret-key",
  "your-super-secret-jwt-key-here",
  "local-dev-change-me",
  "local-dev-internal-api-key",
  "commerce-os-local-file-storage-secret",
  "changeme",
  "change-me",
  "replace-me",
  "placeholder",
])

function isMissing(value) {
  return typeof value !== "string" || value.trim().length === 0
}

function validateSecret(value, envVarName, minimumLength = 32) {
  if (isMissing(value)) return `${envVarName} is required.`
  const normalized = value.trim()
  if (normalized.length < minimumLength) return `${envVarName} must be at least ${minimumLength} characters.`
  if (knownPlaceholderSecrets.has(normalized.toLowerCase())) {
    return `${envVarName} must not use a known placeholder value.`
  }
  return null
}

function validateProductionEnvironment(env) {
  const errors = []

  for (const envVarName of requiredProductionVariables) {
    if (isMissing(env[envVarName])) {
      errors.push(`${envVarName} is required.`)
    }
  }

  for (const [envVarName, minimumLength] of [
    ["JWT_SECRET", 32],
    ["INTERNAL_SERVICE_TOKEN_SIGNING_KEY", 32],
    ["LOCAL_STORAGE_SIGNING_SECRET", 32],
  ]) {
    const error = validateSecret(env[envVarName], envVarName, minimumLength)
    if (error) errors.push(error)
  }

  return errors
}

function validateDevEnvironment(env) {
  const errors = []
  for (const envVarName of requiredProductionVariables) {
    if (isMissing(env[envVarName])) {
      errors.push(`${envVarName} is required.`)
    }
  }
  return errors
}

const validationErrors = isDev
  ? validateDevEnvironment(process.env)
  : validateProductionEnvironment(process.env)
if (validationErrors.length > 0) {
  throw new Error(
    `Invalid ${isDev ? "development" : "production"} PM2 environment:\n${validationErrors
      .map((error) => `- ${error}`)
      .join("\n")}`,
  )
}

if (isDev) {
  console.log(
    "ZAYOS_ENV=dev detected: running production build artifacts with NODE_ENV=development from .env.dev.",
  )
}

const cleanEnv = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined),
  )

const nodeService = (name, directory, port, env = {}) => ({
  name,
  cwd: path.join(root, directory),
  script: "dist/main.js",
  exec_mode: "fork",
  instances: 1,
  autorestart: true,
  max_memory_restart: "512M",
  time: true,
  env: cleanEnv({
    ...common,
    PORT: port,
    HOST: process.env.HOST || "127.0.0.1",
    INTERNAL_SERVICE_TOKEN_ISSUER: process.env.INTERNAL_SERVICE_TOKEN_ISSUER,
    INTERNAL_SERVICE_TOKEN_SIGNING_KEY: process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY,
    INTERNAL_SERVICE_TOKEN_TTL_SECONDS: process.env.INTERNAL_SERVICE_TOKEN_TTL_SECONDS,
    INTERNAL_SERVICE_ALLOWED_CLOCK_SKEW_SECONDS: process.env.INTERNAL_SERVICE_ALLOWED_CLOCK_SKEW_SECONDS,
    ...env,
  }),
})

const dashboard = (name, directory, port, env = {}) => ({
  name,
  cwd: path.join(root, directory),
  script: "node_modules/next/dist/bin/next",
  args: ["start", "-p", String(port)],
  exec_mode: "fork",
  instances: 1,
  autorestart: true,
  max_memory_restart: "512M",
  time: true,
  env: cleanEnv({
    ...common,
    PORT: port,
    CORE_API_URL: process.env.CORE_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_META_APP_ID: process.env.NEXT_PUBLIC_META_APP_ID,
    NEXT_PUBLIC_TIKTOK_CLIENT_KEY: process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY,
    GA_ID: process.env.GA_ID,
    GTM_ID: process.env.GTM_ID,
    ...env,
  }),
})

module.exports = {
  apps: [
    nodeService("zayos-core-api", "backend-core-service", 6001, {
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      DB_USERNAME: process.env.DB_USERNAME,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_NAME: process.env.DB_NAME,
      DB_SYNCHRONIZE: process.env.DB_SYNCHRONIZE || "false",
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",
      JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
      FRONTEND_URLS: process.env.FRONTEND_URLS,
      CHAT_INGESTION_URL: process.env.CHAT_INGESTION_URL,
      WEBHOOK_HANDLER_URL: process.env.WEBHOOK_HANDLER_URL,
      INTEGRATION_SERVICE_URL: process.env.INTEGRATION_SERVICE_URL,
      FILE_STORAGE_URL: process.env.FILE_STORAGE_URL,
      MEDIA_PROCESSING_URL: process.env.MEDIA_PROCESSING_URL,
      WORKSPACE_PUBLIC_APP_URL: process.env.WORKSPACE_PUBLIC_APP_URL,
      PLATFORM_CONSOLE_PUBLIC_APP_URL: process.env.PLATFORM_CONSOLE_PUBLIC_APP_URL,
      WEBHOOK_PUBLIC_BASE_URL: process.env.WEBHOOK_PUBLIC_BASE_URL,
      PROVIDER_CREDENTIAL_ENCRYPTION_KEY: process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY,
      TELEGRAM_MANAGER_BOT_TOKEN: process.env.TELEGRAM_MANAGER_BOT_TOKEN,
      TELEGRAM_MANAGER_BOT_USERNAME: process.env.TELEGRAM_MANAGER_BOT_USERNAME,
      TELEGRAM_MANAGER_WEBHOOK_SECRET: process.env.TELEGRAM_MANAGER_WEBHOOK_SECRET,
      TELEGRAM_MANAGER_WEBHOOK_URL: process.env.TELEGRAM_MANAGER_WEBHOOK_URL,
      TELEGRAM_MERCHANT_WEBHOOK_BASE_URL: process.env.TELEGRAM_MERCHANT_WEBHOOK_BASE_URL,
      TELEGRAM_TOKEN_ENCRYPTION_KEY: process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY,
      TELEGRAM_API_BASE_URL: process.env.TELEGRAM_API_BASE_URL,
      TELEGRAM_WEBHOOK_MAX_CONNECTIONS: process.env.TELEGRAM_WEBHOOK_MAX_CONNECTIONS,
      META_PROVIDER_APP_ROUTING_ID: process.env.META_PROVIDER_APP_ROUTING_ID,
      MESSENGER_PROVIDER_APP_ROUTING_ID: process.env.MESSENGER_PROVIDER_APP_ROUTING_ID,
      META_APP_SECRET: process.env.META_APP_SECRET,
      META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
      META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
      META_APP_STATUS: process.env.META_APP_STATUS,
      MESSENGER_APP_SECRET: process.env.MESSENGER_APP_SECRET,
      MESSENGER_VERIFY_TOKEN: process.env.MESSENGER_VERIFY_TOKEN,
      MESSENGER_GRAPH_API_VERSION: process.env.MESSENGER_GRAPH_API_VERSION,
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      SMTP_FROM: process.env.SMTP_FROM,
      SUBSCRIPTION_PERIOD_SCHEDULER_ENABLED: process.env.SUBSCRIPTION_PERIOD_SCHEDULER_ENABLED || 'true',
    }),
    nodeService("zayos-chat-ingestion", "services/chat-ingestion-service", 6002, {
      CORE_API_URL: process.env.CORE_API_URL,
      MESSENGER_GRAPH_API_BASE_URL: process.env.MESSENGER_GRAPH_API_BASE_URL,
      MESSENGER_GRAPH_API_VERSION: process.env.MESSENGER_GRAPH_API_VERSION,
    }),
    nodeService("zayos-webhook-handler", "services/webhook-handler-service", 6003, {
      CORE_API_URL: process.env.CORE_API_URL,
      CHAT_INGESTION_URL: process.env.CHAT_INGESTION_URL,
      MESSENGER_VERIFY_TOKEN: process.env.MESSENGER_VERIFY_TOKEN,
      MESSENGER_APP_SECRET: process.env.MESSENGER_APP_SECRET,
      TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
      VIBER_AUTH_TOKEN: process.env.VIBER_AUTH_TOKEN,
      VIBER_API_BASE_URL: process.env.VIBER_API_BASE_URL,
      TELEGRAM_MANAGER_BOT_TOKEN: process.env.TELEGRAM_MANAGER_BOT_TOKEN,
      TELEGRAM_MANAGER_BOT_USERNAME: process.env.TELEGRAM_MANAGER_BOT_USERNAME,
      TELEGRAM_MANAGER_WEBHOOK_SECRET: process.env.TELEGRAM_MANAGER_WEBHOOK_SECRET,
      TELEGRAM_MANAGER_WEBHOOK_URL: process.env.TELEGRAM_MANAGER_WEBHOOK_URL,
      TELEGRAM_MERCHANT_WEBHOOK_BASE_URL: process.env.TELEGRAM_MERCHANT_WEBHOOK_BASE_URL,
      TELEGRAM_API_BASE_URL: process.env.TELEGRAM_API_BASE_URL,
    }),
    nodeService("zayos-integration", "services/integration-service", 6004, {
      CORE_API_URL: process.env.CORE_API_URL,
      VIBER_API_BASE_URL: process.env.VIBER_API_BASE_URL,
    }),
    nodeService("zayos-file-storage", "services/file-storage-service", 6005, {
      CORE_API_URL: process.env.CORE_API_URL,
      STORAGE_DRIVER: process.env.STORAGE_DRIVER || "local-contract",
      FILE_STORAGE_PUBLIC_URL: process.env.FILE_STORAGE_PUBLIC_URL,
      LOCAL_STORAGE_SIGNING_SECRET: process.env.LOCAL_STORAGE_SIGNING_SECRET,
    }),
    nodeService("zayos-media-processing", "services/media-processing-service", 6006, {
      CORE_API_URL: process.env.CORE_API_URL,
      FILE_STORAGE_URL: process.env.FILE_STORAGE_URL,
      FILE_SCANNING_PROVIDER: process.env.FILE_SCANNING_PROVIDER,
      FILE_SCANNING_ENDPOINT: process.env.FILE_SCANNING_ENDPOINT,
      FILE_SCANNING_API_KEY: process.env.FILE_SCANNING_API_KEY,
      TRANSCRIPTION_PROVIDER: process.env.TRANSCRIPTION_PROVIDER,
      TRANSCRIPTION_ENDPOINT: process.env.TRANSCRIPTION_ENDPOINT,
      TRANSCRIPTION_API_KEY: process.env.TRANSCRIPTION_API_KEY,
      TRANSCRIPTION_MODEL: process.env.TRANSCRIPTION_MODEL,
    }),
    dashboard("zayos-workspace", "dashboards/workspace", 6100, {
      BILLING_BANK_ACCOUNT: process.env.BILLING_BANK_ACCOUNT,
      BILLING_KBZPAY_NUMBER: process.env.BILLING_KBZPAY_NUMBER,
      BILLING_WAVEPAY_NUMBER: process.env.BILLING_WAVEPAY_NUMBER,
      CONTACT_EMAIL: process.env.CONTACT_EMAIL,
      META_APP_ID: process.env.META_APP_ID,
      META_APP_SECRET: process.env.META_APP_SECRET,
      META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
      META_PROVIDER_APP_ROUTING_ID: process.env.META_PROVIDER_APP_ROUTING_ID,
      META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
      MESSENGER_APP_SECRET: process.env.MESSENGER_APP_SECRET,
      MESSENGER_GRAPH_API_VERSION: process.env.MESSENGER_GRAPH_API_VERSION,
      MESSENGER_PROVIDER_APP_ROUTING_ID: process.env.MESSENGER_PROVIDER_APP_ROUTING_ID,
      MESSENGER_VERIFY_TOKEN: process.env.MESSENGER_VERIFY_TOKEN,
      PLATFORM_CONSOLE_URL: process.env.PLATFORM_CONSOLE_URL,
      TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
      WS_BASE_URL: process.env.WS_BASE_URL,
    }),
    dashboard("zayos-platform-console", "dashboards/platform-console", 6101),
  ],
  validateProductionEnvironment,
  requiredProductionVariables,
  requiredProductionVariablesByScope,
}
