import { expect, test, type Page } from "@playwright/test"

const SESSION_KEY = "kme-auth-session"

const platformSession = {
  accessToken: "platform-boundary-token",
  refreshToken: "platform-boundary-refresh",
  user: {
    id: "platform-boundary-user",
    email: "platform@example.com",
    fullName: "Platform Operator",
    role: "super_admin",
    type: "platform_admin",
  },
}

async function expectLoadedBrandMark(page: Page) {
  const mark = page.locator('img[src="/zayos-mark-light.png"]').first()
  await expect(mark).toBeVisible()
  await expect.poll(() => mark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
}

async function authenticate(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Email Address").fill("platform@kme.local")
  await page.getByLabel("Password").fill("Password123!")
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/proxy/auth/login") && response.request().method() === "POST",
    { timeout: 30_000 },
  )
  await page.getByRole("button", { name: "Sign In to Platform Console" }).click()
  expect((await loginResponsePromise).ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/platform-console$/, { timeout: 15_000 })
}

test("platform login lands platform operators on the console", async ({ page }) => {
  await page.route("**/api/proxy/auth/login", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(platformSession) })
  })
  await page.goto("/login")
  await expectLoadedBrandMark(page)
  await page.getByLabel("Email Address").fill("platform@example.com")
  await page.getByLabel("Password").fill("Password123!")
  await page.getByRole("button", { name: "Sign In to Platform Console" }).click()

  await expect(page).toHaveURL(/\/platform-console$/)
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await expectLoadedBrandMark(page)
})

test("platform session expiry returns to the platform login", async ({ page }) => {
  await authenticate(page)
  await page.goto("/platform-console")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()

  await page.evaluate((key) => {
    window.localStorage.removeItem(key)
    window.dispatchEvent(new Event("zayos:session-expired"))
  }, SESSION_KEY)

  await expect(page).toHaveURL(/\/login\?next=%2Fplatform-console&reason=session-expired$/)
  await expect(page.getByText("Your session has expired. Please sign in again.")).toBeVisible()
})

test("platform login keeps credential entry visible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/login")

  await expect(page.getByLabel("Email Address")).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign In to Platform Console" })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
