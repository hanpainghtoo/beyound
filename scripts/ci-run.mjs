import { spawnSync } from "node:child_process"
import path from "node:path"

import { loadCiEnv, rootDir } from "./ci-env.mjs"

const env = loadCiEnv()

const services = [
  "services/chat-ingestion-service",
  "services/webhook-handler-service",
  "services/integration-service",
  "services/file-storage-service",
  "services/media-processing-service",
]

const commands = {
  config: [
    ["Validate CI environment", "node scripts/ci-config-check.mjs"],
    ["Run production runtime config tests", "npm run test:config"],
  ],
  typecheck: [
    ["Backend TypeScript", "npm run build", "backend-core-service"],
    ["Workspace TypeScript", "npx tsc --noEmit", "dashboards/workspace"],
    ["Platform Console TypeScript", "npx tsc --noEmit", "dashboards/platform-console"],
    ...services.map((service) => [`${service} TypeScript`, "npx tsc --noEmit", service]),
  ],
  lint: [
    ["Workspace ESLint", "npm run lint -- --max-warnings=0", "dashboards/workspace"],
    ["Platform Console ESLint", "npm run lint -- --max-warnings=0", "dashboards/platform-console"],
    ["Changed backend ESLint", "node scripts/backend-eslint-changed.mjs"],
  ],
  test: [
    ["Config tests", "npm run test:config"],
    ["Backend Jest", "npm test -- --runInBand", "backend-core-service"],
    ...services.map((service) => [`${service} Jest`, "npm test -- --runInBand", service]),
  ],
  build: [
    ["Backend production build", "npm run build", "backend-core-service"],
    ["Workspace production build", "npm run build", "dashboards/workspace"],
    ["Platform Console production build", "npm run build", "dashboards/platform-console"],
    ...services.map((service) => [`${service} production build`, "npm run build", service]),
  ],
  browser: [["Browser acceptance stack", "bash scripts/ci-browser.sh"]],
  audit: [["Production dependency audit", "node scripts/ci-audit.mjs"]],
}

commands.phase1 = [
  ...commands.config,
  ...commands.typecheck,
  ...commands.lint,
  ...commands.test,
  ...commands.build,
]
commands.full = [...commands.phase1, ...commands.browser, ...commands.audit]

const gate = process.argv[2]
if (!gate || !commands[gate]) {
  console.error(`Usage: node scripts/ci-run.mjs <${Object.keys(commands).join("|")}>`)
  process.exit(2)
}

for (const [label, command, cwd = "."] of commands[gate]) {
  console.log(`\n==> ${label}`)
  const commandEnv = {
    ...env,
    PATH: process.env.PATH,
    CI_GATE: gate,
  }

  if (label.endsWith("Jest")) {
    commandEnv.NODE_ENV = "test"
    delete commandEnv.CORE_API_URL
    delete commandEnv.CHAT_INGESTION_URL
    delete commandEnv.WEBHOOK_HANDLER_URL
    delete commandEnv.INTEGRATION_SERVICE_URL
    delete commandEnv.FILE_STORAGE_URL
    delete commandEnv.MEDIA_PROCESSING_URL
    delete commandEnv.REDIS_HOST
    delete commandEnv.REDIS_PORT
    delete commandEnv.REDIS_URL
    delete commandEnv.WEBHOOK_QUEUE_BACKEND
    delete commandEnv.MESSENGER_APP_SECRET
    delete commandEnv.MESSENGER_VERIFY_TOKEN
    delete commandEnv.MESSENGER_GRAPH_API_BASE_URL
    delete commandEnv.MESSENGER_GRAPH_API_VERSION
    delete commandEnv.VIBER_AUTH_TOKEN
    delete commandEnv.VIBER_API_BASE_URL
    delete commandEnv.FILE_SCANNING_API_KEY
    delete commandEnv.TRANSCRIPTION_API_KEY
  }

  const result = spawnSync(command, {
    cwd: path.join(rootDir, cwd),
    env: commandEnv,
    shell: true,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    console.error(`\nCI gate failed: ${label}`)
    process.exit(result.status ?? 1)
  }
}

console.log(`\nCI gate passed: ${gate}`)
