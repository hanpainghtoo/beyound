import { expect, test, type Page } from "@playwright/test"

/**
 * Myanmar layout guard.
 *
 * Burmese is written without spaces between words and every string runs far
 * wider than the English it replaced. A grid item's automatic minimum size is
 * its min-content width, so a bare `fr` track cannot shrink below it: the
 * column pushes wider than its parent and an ancestor's `overflow-hidden`
 * silently clips the text. That is exactly what happened to the sign-in card
 * (tracks were 349px + 375px inside a 566px card), which cut the form off.
 *
 * These specs fail if that ever comes back on a public marketing page. They are
 * deliberately locale-scoped: the same layout overflowing on `en` is a
 * different bug with a different cause.
 */

const LOCALE_KEY = "zayos-language"

const ROUTES = ["/", "/login", "/pricing", "/product", "/trial", "/forgot-password"]

/**
 * Elements whose overflow is deliberate and not text-related: decorative
 * absolutely-positioned blobs, gradient washes and the phone mockup frames,
 * all of which overflow on English too.
 */
const DECORATIVE = ["min-h-screen", "relative mx-auto", "group relative", "animate-marquee"]

async function useMyanmar(page: Page) {
  const baseURL = process.env.CSR_DASHBOARD_URL || "http://127.0.0.1:6110"
  await page.context().addCookies([{ name: LOCALE_KEY, value: "my", url: baseURL }])
}

type ClippedText = { tag: string; className: string; clientWidth: number; scrollWidth: number; text: string }

/**
 * Finds elements that clip *text*: a rendered text node whose box is narrower
 * than the text needs, i.e. the reader is missing characters.
 */
async function clippedBurmese(page: Page): Promise<ClippedText[]> {
  // `decorativeTokens` is passed in rather than closed over: page.evaluate runs
  // in the browser, where module-scope constants do not exist.
  return page.evaluate((decorativeTokens) => {
    const hasBurmese = (value: string) => /[\u1000-\u109f]/.test(value)
    const decorative = (className: string) => decorativeTokens.some((token) => className.includes(token))

    const clipped: ClippedText[] = []
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const className = element.className?.toString() ?? ""
      if (decorative(className)) continue

      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
      if (!hasBurmese(ownText)) continue

      const overflows = element.scrollWidth - element.clientWidth > 2
      const textIsCut = element.scrollWidth > element.clientWidth
      // `overflow: visible` means the text is painted outside the box rather than
      // lost, so it reads as broken layout but not as missing glyphs.
      const hidden = getComputedStyle(element).overflowX !== "visible"

      if ((overflows && hidden) || textIsCut) {
        clipped.push({
          tag: element.tagName,
          className: className.slice(0, 80),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: ownText.trim().slice(0, 40),
        })
      }
    }
    return clipped
  }, DECORATIVE)
}

for (const route of ROUTES) {
  test(`Myanmar text is not clipped on ${route}`, async ({ page }) => {
    await useMyanmar(page)
    await page.goto(route, { waitUntil: "networkidle" })
    await page.evaluate(() => document.fonts.ready)

    await expect(page.locator("html")).toHaveAttribute("data-locale", "my")
    expect(await clippedBurmese(page)).toEqual([])
  })
}

// ── Authenticated workspace routes ────────────────────────────────────────
//
// The workspace app gates rendering behind a client-side session and hydrates
// its shell from three endpoints that live behind the app's own /api/proxy, so
// a clipped-Burmese check needs the same seed trio the dev harness documents
// (see docs/localization-configuration.md § Tests).
const WORKSPACE_ROUTES = ["/workspace/team", "/workspace/settings", "/workspace/payment-settings"]

const QUOTA_DIMS = ["inbound_messages", "outbound_messages", "channel_slots", "storage_gb", "team_members"] as const

async function stubWorkspaceShell(page: Page) {
  const session = {
    accessToken: "stub",
    refreshToken: "stub-refresh",
    user: { id: "u", email: "owner@example.com", fullName: "Workspace Owner", role: "owner", type: "tenant_user", tenantId: "stub-tenant" },
  }
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
  const periods = {
    tenantId: "stub-tenant",
    activePeriodId: "p1",
    entitlement: {
      tenantId: "stub-tenant",
      activePeriodId: "p1",
      planId: "pl1",
      periodStatus: "active",
      paymentStatus: "paid",
      paymentState: "paid" as const,
      periodType: "paid",
      baseLimits: Object.fromEntries(QUOTA_DIMS.map((d) => [d, 1000])),
      activeTopUpComponentTotals: {},
      effectiveLimits: Object.fromEntries(QUOTA_DIMS.map((d) => [d, 1000])),
      quotaState: Object.fromEntries(
        QUOTA_DIMS.map((d) => [d, { base: 1000, topUpTotal: 0, effective: 1000, blocked: false }]),
      ),
      featureState: {},
    },
    entitlementError: null,
    periodUsage: undefined,
    periods: [],
  }
  const features = [
    { key: "orders", displayName: "Orders", description: "Order management", isEnabled: true, isLockable: true, canDisable: true },
  ]

  await page.addInitScript(
    ({ key, session }) => window.localStorage.setItem(key, JSON.stringify(session)),
    { key: "kme-auth-session", session },
  )
  await page.route("**/api/proxy/**", async (route) => {
    const p = new URL(route.request().url()).pathname.replace("/api/proxy", "")
    let body: unknown = { data: [], total: 0, page: 1, limit: 100 }
    if (/\/usage-summary/.test(p)) body = usageSummary
    else if (/\/subscription\/periods/.test(p)) body = periods
    else if (/\/tenant\/features/.test(p)) body = features
    else if (/\/providers\/allowed/.test(p)) body = { hasActivePeriod: true, allowedProviders: ["messenger"] }
    else if (/\/tenant\/agents/.test(p)) body = { data: [], total: 0, page: 1, limit: 100 }
    else if (/\/tenant\/settings/.test(p)) body = { companyName: "Acme", language: "my", timezone: "Asia/Yangon", businessType: "online-shop" }
    else if (/\/auth\/login/.test(p)) body = session
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
  })
}

for (const route of WORKSPACE_ROUTES) {
  test(`Myanmar text is not clipped on ${route}`, async ({ page }) => {
    await useMyanmar(page)
    await stubWorkspaceShell(page)
    await page.goto(route, { waitUntil: "networkidle" })
    await page.evaluate(() => document.fonts.ready)

    await expect(page.locator("html")).toHaveAttribute("data-locale", "my")
    expect(await clippedBurmese(page)).toEqual([])
  })
}

test("the Burmese bold face belongs to the same family as the regular", async ({ page }) => {
  await useMyanmar(page)
  await page.goto("/login", { waitUntil: "networkidle" })

  const faces = await page.evaluate(async () => {
    await document.fonts.ready
    return Array.from(document.fonts)
      .filter((face) => face.family === "Pyidaungsu")
      .map((face) => ({ weight: face.weight, status: face.status }))
  })

  // A mismatched bold (e.g. "Pyidaungsu Book") looks like an entirely different
  // typeface next to the regular, which is the bug this asserts against.
  expect(faces.map((face) => face.weight).sort()).toEqual(["400 600", "700 900"])
  expect(faces.every((face) => face.status === "loaded")).toBe(true)
})

test("no Burmese text resolves to a fallback font", async ({ page }) => {
  await useMyanmar(page)
  await page.goto("/login", { waitUntil: "networkidle" })

  const stacks = await page.evaluate(async () => {
    await document.fonts.ready
    const stacks = new Set<string>()
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
      if (!/[\u1000-\u109f]/.test(ownText)) continue
      stacks.add(getComputedStyle(element).fontFamily)
    }
    return Array.from(stacks)
  })

  expect(stacks.length).toBeGreaterThan(0)
  for (const stack of stacks) {
    // Every Burmese-bearing element must inherit the stack that names Pyidaungsu,
    // otherwise the glyphs fall through to whatever the OS happens to have.
    expect(stack).toContain("Pyidaungsu")
  }
})