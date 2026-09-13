import { chromium } from "playwright"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputDir = path.join(appRoot, "screenshots", "merchant-management")
const consoleUrl = process.env.PLATFORM_DASHBOARD_URL || "http://localhost:6101"
const apiUrl = process.env.CORE_API_URL || "http://localhost:3001/api/v1"

const loginResponse = await fetch(`${apiUrl}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ usernameOrEmail: "platform@kme.local", password: "Password123!" }),
})
if (!loginResponse.ok) throw new Error(`Platform login failed with ${loginResponse.status}`)
const session = await loginResponse.json()

const tenantsResponse = await fetch(`${apiUrl}/platform-admin/tenants?page=1&limit=1`, {
  headers: { Authorization: `Bearer ${session.accessToken}` },
})
if (!tenantsResponse.ok) throw new Error(`Tenant lookup failed with ${tenantsResponse.status}`)
const tenants = await tenantsResponse.json()
const tenantId = tenants.data?.[0]?.id
if (!tenantId) throw new Error("A real tenant is required for merchant detail screenshots")

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch()
for (const [viewportName, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport })
  await context.addInitScript(({ value }) => window.localStorage.setItem("kme-auth-session", value), {
    value: JSON.stringify(session),
  })
  for (const [name, route] of [["merchant-list", "/platform-console/merchants"], ["merchant-detail", `/platform-console/merchants/${tenantId}`]]) {
    const page = await context.newPage()
    await page.goto(`${consoleUrl}${route}`, { waitUntil: "networkidle" })
    await page.locator("nextjs-portal").evaluateAll((nodes) => nodes.forEach((node) => node.remove()))
    await page.screenshot({ path: path.join(outputDir, `${name}-${viewportName}.png`), fullPage: true })
    await page.close()
  }
  await context.close()
}
await browser.close()

console.log(`Captured merchant management screenshots in ${path.relative(process.cwd(), outputDir)}`)
