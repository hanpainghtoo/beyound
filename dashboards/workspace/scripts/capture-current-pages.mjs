/* global fetch, process, console, URL, window, document */
import { chromium } from "@playwright/test"
import { mkdir, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const baseURL = process.env.CSR_DASHBOARD_URL || "http://localhost:6100"
const apiBaseURL = process.env.CORE_API_URL || "http://localhost:3001/api/v1"
const browserExecutablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROME_BIN
const outputDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/v2/brand/page_images/current_pages",
)

const marketingRoutes = [
  ["landing-home", "/"],
  ["landing-product", "/product"],
  ["landing-use-cases", "/use-cases"],
  ["landing-pricing", "/pricing"],
  ["landing-resources", "/resources"],
  ["landing-contact", "/contact"],
]

const workspaceRoutes = [
  ["workspace-home", "/workspace", "supervisor"],
  ["workspace-inbox", "/workspace/inbox", "supervisor"],
  ["workspace-orders", "/workspace/orders", "supervisor"],
  ["workspace-deliveries", "/workspace/deliveries", "supervisor"],
  ["workspace-products", "/workspace/products", "supervisor"],
  ["workspace-customers", "/workspace/customers", "supervisor"],
  ["workspace-saved-replies", "/workspace/saved-replies", "supervisor"],
  ["workspace-media", "/workspace/media", "supervisor"],
  ["workspace-search", "/workspace/search", "supervisor"],
  ["workspace-report-conversations", "/workspace/reports/conversations", "supervisor"],
  ["workspace-report-sales-orders", "/workspace/reports/sales-orders", "supervisor"],
  ["workspace-report-deliveries", "/workspace/reports/deliveries", "supervisor"],
  ["workspace-report-customers", "/workspace/reports/customers", "supervisor"],
  ["workspace-report-products", "/workspace/reports/products", "supervisor"],
  ["workspace-report-payments", "/workspace/reports/payments", "supervisor"],
  ["workspace-notifications", "/workspace/notifications", "supervisor"],
  ["workspace-team", "/workspace/team", "admin"],
  ["workspace-channels", "/workspace/channels", "admin"],
  ["workspace-roles", "/workspace/roles", "admin"],
  ["workspace-audit", "/workspace/audit", "admin"],
  ["workspace-settings", "/workspace/settings", "admin"],
  ["workspace-billing", "/workspace/billing", "admin"],
]

async function loginSession(usernameOrEmail) {
  const response = await fetch(`${apiBaseURL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernameOrEmail, password: "Password123!" }),
  })

  if (!response.ok) {
    throw new Error(`Unable to log in as ${usernameOrEmail}: ${response.status}`)
  }

  return response.json()
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded")
  await page.waitForTimeout(1_200)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.race([
      Promise.all(
        [...document.images]
          .filter((image) => !image.complete)
          .map(
            (image) =>
              new Promise((resolve) => {
                image.addEventListener("load", resolve, { once: true })
                image.addEventListener("error", resolve, { once: true })
              }),
          ),
      ),
      new Promise((resolve) => window.setTimeout(resolve, 2_500)),
    ])
  })
}

async function capture(page, name) {
  const outputPath = path.join(outputDirectory, `${name}.png`)
  await rm(outputPath, { force: true })
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: outputPath,
  })
  console.log(`${name}.png`)
}

function launchBrowser() {
  return browserExecutablePath
    ? chromium.launch({ executablePath: browserExecutablePath })
    : chromium.launch()
}

async function captureMarketingSet(contextName, viewport) {
  const browser = await launchBrowser()
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: 1,
    viewport,
  })
  const page = await context.newPage()

  try {
    for (const [name, route] of marketingRoutes) {
      await page.goto(new URL(route, baseURL).toString(), { waitUntil: "domcontentloaded" })
      await settle(page)
      await capture(page, `${name}-${contextName}`)
    }
  } finally {
    await browser.close()
  }
}

async function captureWorkspaceSet(contextName, viewport, routes, session, role) {
  const browser = await launchBrowser()
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: 1,
    viewport,
  })
  await context.addInitScript((storedSession) => {
    window.localStorage.setItem("kme-auth-session", JSON.stringify(storedSession))
  }, session)

  const page = await context.newPage()

  try {
    for (const [name, route] of routes.filter((entry) => entry[2] === role)) {
      await page.goto(new URL(route, baseURL).toString(), { waitUntil: "domcontentloaded" })
      await settle(page)
      await capture(page, `${name}-${contextName}`)
    }
  } finally {
    await browser.close()
  }
}

const [supervisorSession, adminSession] = await Promise.all([
  loginSession("supervisor@demo.local"),
  loginSession("admin@demo.local"),
])

await mkdir(outputDirectory, { recursive: true })

await captureMarketingSet("desktop", { width: 1440, height: 900 })
await captureWorkspaceSet("desktop", { width: 1440, height: 900 }, workspaceRoutes, supervisorSession, "supervisor")
await captureWorkspaceSet("desktop", { width: 1440, height: 900 }, workspaceRoutes, adminSession, "admin")

await captureMarketingSet("mobile", { width: 390, height: 844 })
await captureWorkspaceSet("mobile", { width: 390, height: 844 }, workspaceRoutes, supervisorSession, "supervisor")
await captureWorkspaceSet("mobile", { width: 390, height: 844 }, workspaceRoutes, adminSession, "admin")
