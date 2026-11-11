import { expect, test, type Page } from "@playwright/test"

async function authenticate(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Email Address").fill("platform@kme.local")
  await page.locator("#password").fill("Password123!")
  await page.getByRole("button", { name: "Sign In to Platform Console" }).click()
  await expect(page).toHaveURL(/\/platform-console$/, { timeout: 15_000 })
}

test("platform admin can open the business operations navigation", async ({ page }) => {
  test.setTimeout(90_000)
  await authenticate(page)

  const routes = [
    ["/platform-console", "Overview"],
    ["/platform-console/merchants", "Merchants"],
    ["/platform-console/conversations", "Conversations"],
    ["/platform-console/sales-orders", "Sales & Orders"],
    ["/platform-console/deliveries", "Deliveries"],
    ["/platform-console/products", "Products"],
    ["/platform-console/billing", "Billing"],
    ["/platform-console/reports", "Reports"],
    ["/platform-console/settings", "Settings"],
  ] as const

  for (const [route, heading] of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
  }

  await page.goto("/platform-console/merchants", { waitUntil: "domcontentloaded" })
  const merchantLink = page.locator('a[href^="/platform-console/merchants/"]').first()
  const merchantHref = await merchantLink.getAttribute("href")
  expect(merchantHref).toBeTruthy()
  await page.goto(merchantHref!, { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(/\/platform-console\/merchants\/[^/]+$/)
  await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 })
  await expect(page.locator("h1")).not.toHaveText("Merchants")
})
