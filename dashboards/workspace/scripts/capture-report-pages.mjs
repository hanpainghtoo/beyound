/* global console, process, URL, window */
import { chromium } from "@playwright/test"
import { mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, "..")
const outputDir = path.join(appRoot, "screenshots", "workspace-reports")
const baseUrl = process.env.WORKSPACE_DASHBOARD_URL || "http://localhost:6100"

const session = {
  accessToken: "workspace-report-screenshot-token",
  refreshToken: "workspace-report-screenshot-refresh-token",
  user: {
    id: "workspace-report-user",
    email: "admin@demo.local",
    fullName: "Mingalar Mobile Admin",
    role: "admin",
    type: "tenant_user",
  },
}

const routes = [
  ["conversation-report", "/workspace/reports/conversations"],
  ["sales-orders-report", "/workspace/reports/sales-orders"],
  ["delivery-report", "/workspace/reports/deliveries"],
  ["customer-report", "/workspace/reports/customers"],
  ["product-report", "/workspace/reports/products"],
  ["payment-cod-report", "/workspace/reports/payments"],
]

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  colorScheme: "light",
  deviceScaleFactor: 1,
  viewport: { width: 1440, height: 900 },
})

for (const [name, route] of routes) {
  const page = await context.newPage()
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem(key, value)
    },
    { key: "kme-auth-session", value: JSON.stringify(session) },
  )
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
    animations: "disabled",
    fullPage: true,
    path: path.join(outputDir, `${name}-desktop.png`),
  })
  await page.close()
}

await browser.close()

const files = await readdir(outputDir)
if (files.length !== routes.length) {
  throw new Error(`Expected ${routes.length} workspace report screenshots. Found ${files.length}.`)
}

console.log(`Captured ${files.length} workspace report screenshots in ${path.relative(process.cwd(), outputDir)}`)
