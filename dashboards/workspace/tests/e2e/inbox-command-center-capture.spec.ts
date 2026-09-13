import { expect, test } from "@playwright/test"

const baseURL = process.env.CSR_DASHBOARD_URL || "http://127.0.0.1:6100"

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${baseURL}/login`)
  await page.getByLabel("Email").fill("supervisor@demo.local")
  await page.locator("#password").fill("Password123!")
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST",
    { timeout: 30_000 },
  )
  await page.getByRole("button", { name: "Open Commerce Workspace" }).click()
  expect((await loginResponsePromise).ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 15_000 })
}

test("capture inbox command center in standard and rush mode", async ({ page }) => {
  await login(page)

  await page.goto(`${baseURL}/workspace/inbox`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1800)
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible()
  await page.screenshot({
    path: "artifacts/inbox-command-center-desktop.png",
    fullPage: true,
    animations: "disabled",
  })

  await page.goto(`${baseURL}/workspace/inbox?rush=1`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1800)
  await expect(page.getByRole("heading", { name: "Rush Mode Command Center" })).toBeVisible()
  await page.screenshot({
    path: "artifacts/inbox-command-center-rush.png",
    fullPage: true,
    animations: "disabled",
  })
})
