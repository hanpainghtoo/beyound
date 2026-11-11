import { expect, test } from "@playwright/test"

const baseURL = process.env.AGENT_DASHBOARD_URL || "http://127.0.0.1:6100"

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${baseURL}/login`)
  await page.locator("#email").fill("supervisor@demo.local")
  await page.locator("#password").fill("Password123!")
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 15_000 })
}

test("capture inbox command center with pane toggles", async ({ page }) => {
  await login(page)

  // Default landing: queue open, context hidden.
  await page.goto(`${baseURL}/workspace/inbox`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1800)
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible()
  await page.screenshot({
    path: "artifacts/inbox-command-center-desktop.png",
    fullPage: true,
    animations: "disabled",
  })

  // Context toggled on: both side panes visible.
  await page.getByRole("button", { name: "Show customer context" }).click()
  await page.waitForTimeout(800)
  await expect(page.getByText("Commerce Timeline")).toBeVisible()
  await page.screenshot({
    path: "artifacts/inbox-command-center-context.png",
    fullPage: true,
    animations: "disabled",
  })
})
