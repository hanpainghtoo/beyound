import { expect, test, type Page } from "@playwright/test"

const SESSION_KEY = "kme-auth-session"

const tenantSession = {
  accessToken: "workspace-boundary-token",
  refreshToken: "workspace-boundary-refresh",
  user: {
    id: "workspace-boundary-user",
    email: "owner@example.com",
    fullName: "Workspace Owner",
    role: "owner",
    type: "tenant_user",
    tenantId: "workspace-boundary-tenant",
  },
}

async function mockWorkspaceApi(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let body: unknown = []

    if (pathname.endsWith("/auth/login")) body = tenantSession
    else if (
      pathname.endsWith("/csr/conversations") ||
      pathname.endsWith("/csr/orders") ||
      pathname.endsWith("/tenant/products") ||
      pathname.endsWith("/tenant/csrs")
    ) body = { data: [], total: 0, page: 1, limit: 100 }
    else if (pathname.endsWith("/csr/dashboard/stats")) {
      body = {
        assignedConversations: 0,
        unreadConversations: 0,
        todayChatsHandled: 0,
        avgResponseTime: 0,
        resolutionRate: 0,
        customerSatisfactionAvg: 0,
        onlineTime: 0,
        activeCampaigns: 0,
      }
    } else if (pathname.endsWith("/tenant/settings") || pathname.endsWith("/tenant/billing")) body = {}

    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
  })
}

async function expectLoadedBrandMark(page: Page) {
  const mark = page.locator('img[src="/zayos-mark-light.png"]').first()
  await expect(mark).toBeVisible()
  await expect.poll(() => mark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
}

test("workspace login lands tenant users on the workspace", async ({ page }) => {
  await mockWorkspaceApi(page)
  await page.goto("/login")
  await expectLoadedBrandMark(page)
  await page.getByLabel("Email").fill("owner@example.com")
  await page.getByLabel("Password").fill("Password123!")
  await page.getByRole("button", { name: "Open Commerce Workspace" }).click()

  await expect(page).toHaveURL(/\/workspace$/)
  await expect(page.getByRole("heading", { name: /Good morning/i })).toBeVisible()
  await expectLoadedBrandMark(page)
})

test("workspace session expiry returns to the workspace login", async ({ page }) => {
  await mockWorkspaceApi(page)
  await page.addInitScript(({ key, session }) => window.localStorage.setItem(key, JSON.stringify(session)), {
    key: SESSION_KEY,
    session: tenantSession,
  })
  await page.goto("/workspace")
  await expect(page.getByRole("heading", { name: /Good morning/i })).toBeVisible()

  await page.evaluate((key) => {
    window.localStorage.removeItem(key)
    window.dispatchEvent(new Event("zayos:session-expired"))
  }, SESSION_KEY)

  await expect(page).toHaveURL(/\/login\?next=%2Fworkspace&reason=session-expired$/)
  await expect(page.getByText("Your session has expired. Please sign in again.")).toBeVisible()
})

test("workspace login keeps credential entry visible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/login")

  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByRole("button", { name: "Open Commerce Workspace" })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test("public ZayOS surface loads the approved brand mark", async ({ page }) => {
  await page.goto("/")
  await expectLoadedBrandMark(page)
})

test("public legal pages are available without a policy API dependency", async ({ page }) => {
  for (const [path, heading] of [
    ["/privacy-policy", "Privacy Policy"],
    ["/terms-of-service", "Terms of Service"],
    ["/data-deletion", "Data Deletion"],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole("heading", { name: heading })).toBeVisible()
    await expect(page.getByText("support@kme.com.mm").first()).toBeVisible()
  }
})
