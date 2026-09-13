/* global console, fetch, process, window */
import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const baseURL = process.env.CSR_DASHBOARD_URL || "http://localhost:6100"
const apiBaseURL = process.env.CORE_API_URL || "http://localhost:6001/api/v1"
const outputDir = path.resolve("artifacts/mobile-ux")
await mkdir(outputDir, { recursive: true })

const loginResponse = await fetch(`${apiBaseURL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usernameOrEmail: "supervisor@demo.local", password: "Password123!" }) })
if (!loginResponse.ok) throw new Error(`Workspace login failed: ${loginResponse.status}`)
const session = await loginResponse.json()

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" })
await context.addInitScript((value) => window.localStorage.setItem("kme-auth-session", JSON.stringify(value)), session)
const page = await context.newPage()

async function open(route) {
  await page.goto(`${baseURL}${route}`)
  await page.locator(".workspace-shell").waitFor()
  await page.waitForTimeout(600)
}

async function shot(name, fullPage = false) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage, animations: "disabled" })
  console.log(`${name}.png`)
}

await open("/workspace")
await shot("dashboard-mobile")

await open("/workspace/inbox")
await shot("inbox-queue-mobile")
await page.getByRole("button").filter({ hasText: "Ko Zaw Zaw" }).first().click()
await shot("inbox-conversation-mobile")
await page.getByRole("button", { name: "Customer context" }).click()
await shot("inbox-context-mobile")

for (const [name, route, cardSelector, backName] of [
  ["products", "/workspace/products", '[class~="xl:hidden"] > button', "Products"],
  ["deliveries", "/workspace/deliveries", '[class~="xl:hidden"] > button', "Deliveries"],
  ["orders", "/workspace/orders", '[data-radix-scroll-area-viewport] button', "Orders"],
  ["customers", "/workspace/customers", '[class~="lg:hidden"] > button', "Customers"],
]) {
  await open(route)
  await shot(`${name}-list-mobile`)
  const firstCard = page.locator(cardSelector).first()
  if (await firstCard.count()) {
    await firstCard.click()
    await page.getByRole("button", { name: backName }).waitFor()
  }
  await shot(`${name}-details-mobile`)
}

await open("/workspace/saved-replies")
await shot("saved-replies-list-mobile")
const firstReply = page.locator('[data-radix-scroll-area-viewport] button').first()
if (await firstReply.count()) {
  await firstReply.click()
  await page.getByRole("button", { name: "Saved replies" }).waitFor()
}
await shot("saved-replies-editor-mobile")

await page.setViewportSize({ width: 1440, height: 900 })
for (const [name, route] of [["dashboard", "/workspace"], ["inbox", "/workspace/inbox"], ["products", "/workspace/products"]]) {
  await open(route)
  await shot(`${name}-desktop`)
}

await browser.close()
