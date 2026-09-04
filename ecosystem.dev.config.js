const path = require("node:path");
const fs = require("node:fs");

const root = __dirname;
const rootEnvPath = path.join(root, ".env");
const backendEnvPath = path.join(root, "backend-core-service", ".env");
const serviceUrl = (port) => `http://127.0.0.1:${port}`;
const cleanEnv = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined),
  );
const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line
          .slice(index + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        return [key, value];
      }),
  );
};

const rootEnv = readEnvFile(rootEnvPath);
const backendEnv = readEnvFile(backendEnvPath);
const envValue = (key, fallback) =>
  process.env[key] || rootEnv[key] || backendEnv[key] || fallback;

const common = {
  NODE_ENV: "development",
};

const npmService = (
  name,
  directory,
  port,
  scriptName,
  env = {},
  options = {},
) => ({
  name,
  cwd: path.join(root, directory),
  script: "npm",
  args: `run ${scriptName}`,
  exec_mode: "fork",
  instances: 1,
  autorestart: true,
  max_memory_restart: "512M",
  time: true,
  ...options,
  env: cleanEnv({
    ...common,
    PORT: port,
    HOST: process.env.HOST || "127.0.0.1",
    INTERNAL_SERVICE_TOKEN_ISSUER:
      process.env.INTERNAL_SERVICE_TOKEN_ISSUER ||
      "zayos-local-internal-services",
    INTERNAL_SERVICE_TOKEN_SIGNING_KEY:
      process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY ||
      "local-dev-internal-service-token-signing-key-32-chars",
    ...env,
  }),
});

const dashboard = (name, directory, port) => ({
  name,
  cwd: path.join(root, directory),
  script: "npm",
  args: `run dev -- -p ${port}`,
  exec_mode: "fork",
  instances: 1,
  autorestart: true,
  max_memory_restart: "512M",
  time: true,
  env: {
    ...common,
    PORT: port,
    WATCHPACK_POLLING: "true",
    CHOKIDAR_USEPOLLING: "1",
    CORE_API_URL: process.env.DEV_CORE_API_URL || `${serviceUrl(6001)}/api/v1`,
    NEXT_PUBLIC_META_APP_ID: envValue("NEXT_PUBLIC_META_APP_ID"),
    NEXT_PUBLIC_TIKTOK_CLIENT_KEY: envValue("NEXT_PUBLIC_TIKTOK_CLIENT_KEY"),
    META_APP_ID: envValue("META_APP_ID"),
    META_APP_SECRET: envValue("META_APP_SECRET"),
    META_GRAPH_API_VERSION: envValue("META_GRAPH_API_VERSION"),
    META_PROVIDER_APP_ROUTING_ID: envValue("META_PROVIDER_APP_ROUTING_ID"),
    META_WEBHOOK_VERIFY_TOKEN: envValue("META_WEBHOOK_VERIFY_TOKEN"),
    MESSENGER_APP_SECRET: envValue("MESSENGER_APP_SECRET"),
    MESSENGER_GRAPH_API_VERSION: envValue("MESSENGER_GRAPH_API_VERSION"),
    MESSENGER_PROVIDER_APP_ROUTING_ID: envValue(
      "MESSENGER_PROVIDER_APP_ROUTING_ID",
    ),
    MESSENGER_VERIFY_TOKEN: envValue("MESSENGER_VERIFY_TOKEN"),
    PLATFORM_CONSOLE_URL: envValue("PLATFORM_CONSOLE_URL", serviceUrl(6101)),
    TIKTOK_CLIENT_KEY: envValue("TIKTOK_CLIENT_KEY"),
    WS_BASE_URL: envValue("WS_BASE_URL", serviceUrl(6001)),
  },
});

module.exports = {
  apps: [
    npmService(
      "zayos-core-api",
      "backend-core-service",
      6001,
      "start:dev",
      {
        DB_HOST: envValue("DB_HOST", "127.0.0.1"),
        DB_PORT: envValue("DB_PORT", "5432"),
        DB_USERNAME: envValue("DB_USERNAME", "postgres"),
        DB_PASSWORD: envValue("DB_PASSWORD", "password"),
        DB_NAME: envValue("DB_NAME", "zayos"),
        DB_SYNCHRONIZE: envValue("DB_SYNCHRONIZE", "true"),
        REDIS_HOST: envValue("REDIS_HOST", "127.0.0.1"),
        REDIS_PORT: envValue("REDIS_PORT", "6379"),
        REDIS_PASSWORD: envValue("REDIS_PASSWORD"),
        JWT_SECRET: envValue("JWT_SECRET", "local-dev-change-me"),
        JWT_EXPIRES_IN: envValue("JWT_EXPIRES_IN", "24h"),
        FRONTEND_URLS:
          process.env.DEV_FRONTEND_URLS ||
          "http://localhost:6100,http://localhost:6101,http://localhost:6102",
        CHAT_INGESTION_URL: serviceUrl(6002),
        WEBHOOK_HANDLER_URL: serviceUrl(6003),
        INTEGRATION_SERVICE_URL: serviceUrl(6004),
        FILE_STORAGE_URL: serviceUrl(6005),
        MEDIA_PROCESSING_URL: serviceUrl(6006),
        META_PROVIDER_APP_ROUTING_ID: envValue("META_PROVIDER_APP_ROUTING_ID"),
        MESSENGER_PROVIDER_APP_ROUTING_ID: envValue(
          "MESSENGER_PROVIDER_APP_ROUTING_ID",
        ),
        META_APP_SECRET: envValue("META_APP_SECRET"),
        META_WEBHOOK_VERIFY_TOKEN: envValue("META_WEBHOOK_VERIFY_TOKEN"),
        META_GRAPH_API_VERSION: envValue("META_GRAPH_API_VERSION"),
        META_APP_STATUS: envValue("META_APP_STATUS"),
        MESSENGER_APP_SECRET: envValue("MESSENGER_APP_SECRET"),
        MESSENGER_VERIFY_TOKEN: envValue("MESSENGER_VERIFY_TOKEN"),
        MESSENGER_GRAPH_API_VERSION: envValue("MESSENGER_GRAPH_API_VERSION"),
        TELEGRAM_MANAGER_BOT_TOKEN: envValue("TELEGRAM_MANAGER_BOT_TOKEN"),
        TELEGRAM_MANAGER_BOT_USERNAME: envValue(
          "TELEGRAM_MANAGER_BOT_USERNAME",
        ),
        TELEGRAM_MANAGER_WEBHOOK_SECRET: envValue(
          "TELEGRAM_MANAGER_WEBHOOK_SECRET",
        ),
        TELEGRAM_MANAGER_WEBHOOK_URL: envValue("TELEGRAM_MANAGER_WEBHOOK_URL"),
        TELEGRAM_MERCHANT_WEBHOOK_BASE_URL: envValue(
          "TELEGRAM_MERCHANT_WEBHOOK_BASE_URL",
        ),
        TELEGRAM_TOKEN_ENCRYPTION_KEY: envValue(
          "TELEGRAM_TOKEN_ENCRYPTION_KEY",
        ),
      },
      {
        watch: ["src"],
        ignore_watch: ["node_modules", "dist", "uploads"],
        watch_delay: 500,
      },
    ),
    npmService(
      "zayos-chat-ingestion",
      "services/chat-ingestion-service",
      6002,
      "start:dev",
      {
        CORE_API_URL: `${serviceUrl(6001)}/api/v1`,
        MESSENGER_GRAPH_API_BASE_URL: envValue("MESSENGER_GRAPH_API_BASE_URL"),
        MESSENGER_GRAPH_API_VERSION: envValue("MESSENGER_GRAPH_API_VERSION"),
      },
    ),
    npmService(
      "zayos-webhook-handler",
      "services/webhook-handler-service",
      6003,
      "start:dev",
      {
        CORE_API_URL: `${serviceUrl(6001)}/api/v1`,
        CHAT_INGESTION_URL: serviceUrl(6002),
        MESSENGER_VERIFY_TOKEN: envValue("MESSENGER_VERIFY_TOKEN"),
        MESSENGER_APP_SECRET: envValue("MESSENGER_APP_SECRET"),
        TIKTOK_CLIENT_SECRET: envValue("TIKTOK_CLIENT_SECRET"),
        VIBER_AUTH_TOKEN: envValue("VIBER_AUTH_TOKEN"),
        VIBER_API_BASE_URL: envValue("VIBER_API_BASE_URL"),
        WEBHOOK_QUEUE_BACKEND: envValue("WEBHOOK_QUEUE_BACKEND", "redis"),
        REDIS_HOST: envValue("REDIS_HOST", "127.0.0.1"),
        REDIS_PORT: envValue("REDIS_PORT", "6379"),
        TELEGRAM_MANAGER_BOT_TOKEN: envValue("TELEGRAM_MANAGER_BOT_TOKEN"),
        TELEGRAM_MANAGER_BOT_USERNAME: envValue(
          "TELEGRAM_MANAGER_BOT_USERNAME",
        ),
        TELEGRAM_MANAGER_WEBHOOK_SECRET: envValue(
          "TELEGRAM_MANAGER_WEBHOOK_SECRET",
        ),
        TELEGRAM_MANAGER_WEBHOOK_URL: envValue("TELEGRAM_MANAGER_WEBHOOK_URL"),
        TELEGRAM_MERCHANT_WEBHOOK_BASE_URL: envValue(
          "TELEGRAM_MERCHANT_WEBHOOK_BASE_URL",
        ),
        TELEGRAM_API_BASE_URL: envValue(
          "TELEGRAM_API_BASE_URL",
          "https://api.telegram.org",
        ),
      },
    ),
    npmService(
      "zayos-integration",
      "services/integration-service",
      6004,
      "start:dev",
      {
        CORE_API_URL: `${serviceUrl(6001)}/api/v1`,
        VIBER_API_BASE_URL: envValue("VIBER_API_BASE_URL"),
      },
    ),
    npmService(
      "zayos-file-storage",
      "services/file-storage-service",
      6005,
      "start:dev",
      {
        CORE_API_URL: `${serviceUrl(6001)}/api/v1`,
        STORAGE_DRIVER: process.env.STORAGE_DRIVER || "local-disk",
        LOCAL_STORAGE_SIGNING_SECRET: envValue("LOCAL_STORAGE_SIGNING_SECRET"),
        FILE_OBJECT_STORAGE_PATH: envValue("FILE_OBJECT_STORAGE_PATH"),
        FILE_METADATA_PATH: envValue("FILE_METADATA_PATH"),
        FILE_STORAGE_PUBLIC_URL: envValue(
          "FILE_STORAGE_PUBLIC_URL",
          serviceUrl(6005),
        ),
        MAX_FILE_SIZE: envValue("MAX_FILE_SIZE"),
        ALLOWED_FILE_CONTENT_TYPES: envValue("ALLOWED_FILE_CONTENT_TYPES"),
        SIGNED_URL_TTL_SECONDS: envValue("SIGNED_URL_TTL_SECONDS"),
      },
    ),
    npmService(
      "zayos-media-processing",
      "services/media-processing-service",
      6006,
      "start:dev",
      {
        CORE_API_URL: `${serviceUrl(6001)}/api/v1`,
        FILE_STORAGE_URL: serviceUrl(6005),
        FILE_SCANNING_PROVIDER: process.env.FILE_SCANNING_PROVIDER,
        FILE_SCANNING_ENDPOINT: process.env.FILE_SCANNING_ENDPOINT,
        FILE_SCANNING_API_KEY: process.env.FILE_SCANNING_API_KEY,
        TRANSCRIPTION_PROVIDER: process.env.TRANSCRIPTION_PROVIDER,
        TRANSCRIPTION_ENDPOINT: process.env.TRANSCRIPTION_ENDPOINT,
        TRANSCRIPTION_API_KEY: process.env.TRANSCRIPTION_API_KEY,
        TRANSCRIPTION_MODEL: process.env.TRANSCRIPTION_MODEL,
      },
    ),
    dashboard("zayos-workspace", "dashboards/workspace", 6100),
    dashboard("zayos-platform-console", "dashboards/platform-console", 6101),
  ],
};
