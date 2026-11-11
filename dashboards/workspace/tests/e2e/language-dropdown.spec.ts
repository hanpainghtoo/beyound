import { test, expect } from "@playwright/test"

test.describe("language switcher dropdown", () => {
  test("trigger shows flag and name; dropdown lists both languages and switches", async ({ page }) => {
    const session = {
      accessToken: "stub",
      refreshToken: "stub-refresh",
      user: { id: "u", email: "owner@example.com", fullName: "Workspace Owner", role: "owner", type: "tenant_user", tenantId: "stub-tenant" },
    }
    const QUOTA_DIMS = ["inbound_messages", "outbound_messages", "contacts", "orders", "products", "conversations"]
    const metric = { used: 0, limit: 1000, remaining: 1000, limitReached: false }
    const usageSummary = {
      tenantId: "stub-tenant",
      scope: "period_scoped",
      activePeriodId: "p1",
      planId: "pl1",
      periodStart: null,
      periodEnd: null,
      baseLimits: Object.fromEntries(QUOTA_DIMS.map((d) => [d, 1000])),
      activeTopUpComponentTotals: {},
      effectiveLimits: Object.fromEntries(QUOTA_DIMS.map((d) => [d, 1000])),
      inboundMessages: metric,
      outboundMessages: metric,
    }
    await page.addInitScript(
      ({ key, session }) => window.localStorage.setItem(key, JSON.stringify(session)),
      { key: "kme-auth-session", session },
    )
    await page.route("**/api/proxy/**", async (route) => {
      const p = new URL(route.request().url()).pathname.replace("/api/proxy", "")
      let body: unknown = { data: [], total: 0, page: 1, limit: 100 }
      if (/\/usage-summary/.test(p)) body = usageSummary
      else if (/\/tenant\/settings/.test(p)) body = { companyName: "Acme", language: "my", timezone: "Asia/Yangon", businessType: "online-shop" }
      else if (/\/auth\/login/.test(p)) body = session
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    })

    await page.goto("/workspace/team")

    // Trigger: single tab with current locale flag + native name
    const trigger = page.getByRole("button", { name: "ဘာသာစကား ပြောင်းလဲရန်" })
    await expect(trigger).toBeVisible()
    await expect(trigger.locator("img")).toHaveAttribute("src", "/Myanmarflag.png")
    await expect(trigger).toContainText("မြန်မာ")

    // Dropdown opens with both languages
    await trigger.click()
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    const items = menu.getByRole("menuitem")
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText("မြန်မာ")
    await expect(items.nth(1)).toContainText("English")

    // Switching to English updates the trigger label and persists
    await items.nth(1).click()
    const englishTrigger = page.getByRole("button", { name: "Change language" })
    await expect(englishTrigger).toContainText("English")
    await expect(englishTrigger.locator("img")).toHaveAttribute("src", "/Englishflag.png")
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("zayos-language"))).toBe("en")
  })
})
