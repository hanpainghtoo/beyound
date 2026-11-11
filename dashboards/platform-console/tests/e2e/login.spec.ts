import { expect, test } from "@playwright/test"

test("platform admin can sign in to the live dashboard", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Email Address").fill("platform@kme.local")
  await page.locator("#password").fill("Password123!")
  await page.getByRole("button", { name: "Sign In to Platform Console" }).click()

  await expect(page).toHaveURL(/\/platform-console$/, { timeout: 15_000 })
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
})

test("tenant users cannot sign in to the Platform Console", async ({ page }) => {
  await page.route("**/api/proxy/auth/login", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "tenant-boundary-token",
        refreshToken: "tenant-boundary-refresh",
        user: {
          id: "tenant-boundary-user",
          email: "supervisor@demo.local",
          fullName: "Demo Supervisor",
          role: "supervisor",
          type: "tenant_user",
          tenantId: "tenant-boundary",
        },
      }),
    })
  })

  await page.goto("/login")
  await page.getByLabel("Email Address").fill("supervisor@demo.local")
  await page.locator("#password").fill("Password123!")
  await page.getByRole("button", { name: "Sign In to Platform Console" }).click()

  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 })
  await expect(page.getByText("Please sign in with a platform admin account.")).toBeVisible()
})
