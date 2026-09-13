import { chromium } from "playwright"
import { mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, "..")
const outputDir = path.join(appRoot, "screenshots", "platform-console-production")
const baseUrl = process.env.PLATFORM_DASHBOARD_URL || "http://localhost:6101"

const session = {
  accessToken: "platform-console-screenshot-token",
  refreshToken: "platform-console-screenshot-refresh-token",
  user: {
    id: "platform-screenshot-operator",
    email: "platform@zayos.com.mm",
    fullName: "ZayOS Operator",
    role: "super_admin",
    type: "platform_admin",
  },
}

const routes = [
  ["overview", "/platform-console", true],
  ["merchants", "/platform-console/merchants", true],
  ["merchant-detail", "/platform-console/merchants/mingalar-mobile", true],
  ["conversations", "/platform-console/conversations", true],
  ["sales-orders", "/platform-console/sales-orders", true],
  ["deliveries", "/platform-console/deliveries", true],
  ["products", "/platform-console/products", true],
  ["billing", "/platform-console/billing", true],
  ["reports", "/platform-console/reports", true],
  ["settings", "/platform-console/settings", true],
]

const viewports = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch()

for (const [viewportName, viewport] of viewports) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  })

  for (const [name, route, authenticated] of routes) {
    const page = await context.newPage()
    if (authenticated) {
      await page.addInitScript(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: "kme-auth-session", value: JSON.stringify(session) },
      )
    } else {
      await page.addInitScript((key) => window.localStorage.removeItem(key), "kme-auth-session")
    }

    await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "networkidle" })
    await page.addStyleTag({
      content: `
        nextjs-portal,
        [data-nextjs-dialog-overlay],
        [data-nextjs-toast],
        [data-nextjs-dev-tools],
        [aria-label="Next.js issue indicator"],
        [aria-label="Next.js dev tools"] {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
      `,
    })
    await page.screenshot({
      path: path.join(outputDir, `${name}-${viewportName}.png`),
      fullPage: true,
    })
    await page.close()
  }

  await context.close()
}

await browser.close()

const files = await readdir(outputDir)
const invalidFiles = files.filter((file) => /workspace|commerce|incident|audit|operator|support-access|channel-operations/i.test(file))
const expectedCount = routes.length * viewports.length
if (files.length !== expectedCount || invalidFiles.length > 0) {
  throw new Error(
    `Expected ${expectedCount} business platform-console screenshots and no technical console files. Found ${files.length}; invalid: ${invalidFiles.join(", ") || "none"}`,
  )
}

console.log(`Captured ${files.length} platform-console screenshots in ${path.relative(process.cwd(), outputDir)}`)
