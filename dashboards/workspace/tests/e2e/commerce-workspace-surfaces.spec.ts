import { expect, test } from "@playwright/test"

const SESSION_KEY = "kme-auth-session"
const API_BASE_URL = process.env.CORE_API_URL || "http://localhost:6001/api/v1"
const PLATFORM_CONSOLE_URL = process.env.PLATFORM_CONSOLE_URL || "http://localhost:6101"
let workspaceSession: string | null = null

async function openSeededConversation(page: import("@playwright/test").Page) {
  await page.getByRole("button").filter({ hasText: "Ko Zaw Zaw" }).first().click()
}

async function login(page: import("@playwright/test").Page, email: string) {
  if (email === "supervisor@demo.local" && workspaceSession) {
    await page.addInitScript(
      ({ key, session }) => window.localStorage.setItem(key, session),
      { key: SESSION_KEY, session: workspaceSession },
    )
    await page.goto("/workspace")
    await expect(page).toHaveURL(/\/workspace$/)
    return
  }

  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.locator("#password").fill("Password123!")
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST",
    { timeout: 30_000 },
  )
  await page.getByRole("button", { name: "Open Commerce Workspace" }).click()
  expect((await loginResponsePromise).ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 15_000 })

  if (email === "supervisor@demo.local") {
    workspaceSession = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY)
    expect(workspaceSession).toBeTruthy()
  }
}

async function createOrderFromConversation(
  page: import("@playwright/test").Page,
  notes: string,
) {
  await page.goto("/workspace/inbox")
  await openSeededConversation(page)
  await expect(page.getByRole("heading", { name: "Ko Zaw Zaw" })).toBeVisible()
  await page.getByRole("button", { name: "Create order" }).click()

  const dialog = page.getByRole("dialog", { name: "Create order from conversation" })
  await expect(dialog).toBeVisible()
  await dialog.getByText("Select product").click()
  await page.getByRole("option").first().click()
  await dialog.locator('input[type="number"]').nth(0).fill("2")
  await dialog.locator('input[type="number"]').nth(2).fill("2500")
  await dialog.getByLabel("Notes").fill(notes)

  const orderResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/csr/orders") &&
      response.request().method() === "POST",
  )
  await dialog.getByRole("button", { name: "Create order", exact: true }).click()
  const orderResponse = await orderResponsePromise
  expect(orderResponse.ok()).toBeTruthy()
  const order = (await orderResponse.json()) as {
    id: string
    orderNumber: string
  }

  await expect(dialog).not.toBeVisible()
  return order
}

test("Commerce Workspace mock-free surfaces load against the live stack", async ({ page }) => {
  await login(page, "supervisor@demo.local")

  await expect(page.getByRole("heading", { name: /Good morning/i })).toBeVisible()
  await expect(page.getByText("Sarah Johnson")).toHaveCount(0)
  await expect(page.getByText("Maintenance Window")).toHaveCount(0)
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "Switch to light theme" }).click()
  await expect(page.locator("html")).not.toHaveClass(/dark/)

  await page.goto("/workspace/search")
  await expect(page.getByRole("heading", { name: "Conversation Search" })).toBeVisible()
  await expect(page.getByText("Search conversations by customer, phone, order number, or message.")).toBeVisible()
  await expect(page.getByText("Search history is not stored yet.")).toHaveCount(0)

  await page.goto("/workspace/notifications")
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible()
  await expect(page.getByText("Achievement unlocked: Speed Demon")).toHaveCount(0)

  await page.goto("/workspace/settings")
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expect(page.getByText("Company name", { exact: true }).locator("..").locator("input")).toHaveValue(/\S/)

  await page.goto("/workspace/reports")
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Conversation Report" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Payment/COD Report" })).toBeVisible()
  await expect(page.getByText("Speed Demon")).toHaveCount(0)

  await page.goto("/workspace")
  await expect(page).toHaveURL(/\/workspace$/)

})

test("Commerce Workspace hands platform sessions to the Platform Console", async ({ page }) => {
  await page.route(`${PLATFORM_CONSOLE_URL}/login`, async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<main><h1>Platform Console Login</h1></main>",
    })
  })

  await page.addInitScript(
    ({ key }) => window.localStorage.setItem(key, JSON.stringify({
      accessToken: "platform-workspace-boundary-token",
      refreshToken: "platform-workspace-boundary-refresh",
      user: {
        id: "platform-boundary-user",
        email: "platform@kme.local",
        fullName: "Platform Operator",
        role: "super_admin",
        type: "platform_admin",
      },
    })),
    { key: SESSION_KEY },
  )

  await page.goto("/login")
  await expect(page).toHaveURL(`${PLATFORM_CONSOLE_URL}/login`, { timeout: 15_000 })
  await expect(page.getByRole("heading", { name: "Platform Console Login" })).toBeVisible()
})

test("legacy workspace dashboard routes hand off to canonical Platform Console routes", async ({ page }) => {
  const cases = [
    ["/dashboard", "/platform-console", "Platform Overview"],
    ["/dashboard/feature-flags", "/platform-console/feature-toggles", "Feature Toggles"],
    ["/dashboard/plans-entitlements", "/platform-console/subscription-plans", "Plans"],
    ["/dashboard/platform-users", "/platform-console/users", "Internal Operators"],
    ["/dashboard/system-health", "/platform-console/operations", "Platform Incidents"],
    ["/dashboard/tenants/apex-trading", "/platform-console/merchants/apex-trading", "Tenant Detail"],
  ] as const

  for (const [, target, heading] of cases) {
    await page.route(`${PLATFORM_CONSOLE_URL}${target}`, async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<main><h1>${heading}</h1></main>`,
      })
    })
  }

  for (const [legacy, target, heading] of cases) {
    await page.goto(legacy)
    await expect(page).toHaveURL(`${PLATFORM_CONSOLE_URL}${target}`, { timeout: 15_000 })
    await expect(page.getByRole("heading", { name: heading })).toBeVisible()
  }
})

test("Commerce Workspace v2 product and delivery routes use live application boundaries", async ({ page }) => {
  await login(page, "supervisor@demo.local")

  await page.goto("/workspace/products")
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible()
  await expect(page.getByText("Catalog editing enabled")).toBeVisible()

  await page.goto("/workspace/deliveries")
  await expect(page.getByRole("heading", { name: "Deliveries" })).toBeVisible()
  await expect(page.getByText("Order-derived delivery record")).toBeVisible()
})

test("Commerce Workspace v2 inbox keeps conversation navigation usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, "supervisor@demo.local")
  await page.goto("/workspace/inbox")

  await expect(page.getByPlaceholder("Search customer, message, tag, or channel")).toBeVisible()
  await openSeededConversation(page)
  await expect(page.getByRole("heading", { name: "Ko Zaw Zaw" })).toBeVisible()
  await expect(page.getByPlaceholder("Search customer, message, tag, or channel")).toBeHidden()
  await page.getByRole("button", { name: "Conversations" }).click()
  await expect(page.getByPlaceholder("Search customer, message, tag, or channel")).toBeVisible()
})

test("Commerce Workspace mobile list and detail views replace each other", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, "supervisor@demo.local")

  await page.goto("/workspace/products")
  const productCard = page.locator('[class~="xl:hidden"] > button').first()
  if (await productCard.count()) {
    await productCard.click()
    await expect(page.getByRole("button", { name: "Products" })).toBeVisible()
    await page.getByRole("button", { name: "Products" }).click()
  }
  await expect(page.getByLabel("Search products")).toBeVisible()

  await page.goto("/workspace/deliveries")
  const deliveryCard = page.locator('[class~="xl:hidden"] > button').first()
  if (await deliveryCard.count()) {
    await deliveryCard.click()
    await expect(page.getByRole("button", { name: "Deliveries" })).toBeVisible()
    await page.getByRole("button", { name: "Deliveries" }).click()
  }
  await expect(page.getByLabel("Search deliveries")).toBeVisible()

  await page.goto("/workspace/orders")
  await page.locator('[data-radix-scroll-area-viewport] button').first().click()
  await expect(page.getByRole("button", { name: "Orders" })).toBeVisible()
  await page.getByRole("button", { name: "Orders" }).click()
  await expect(page.getByPlaceholder("Search orders...")).toBeVisible()

  await page.goto("/workspace/customers")
  await page.locator('[class~="lg:hidden"] > button').first().click()
  await expect(page.getByRole("button", { name: "Customers" })).toBeVisible()
  await page.getByRole("button", { name: "Customers" }).click()
  await expect(page.getByPlaceholder("Search customers...")).toBeVisible()

  await page.goto("/workspace/saved-replies")
  const replyCard = page.locator('[data-radix-scroll-area-viewport] button').first()
  if (await replyCard.count()) {
    await replyCard.click()
    await expect(page.getByRole("button", { name: "Saved replies" })).toBeVisible()
  }
})

test("primary workspace surfaces do not overflow supported viewport widths", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, "supervisor@demo.local")
  const routes = ["/workspace", "/workspace/inbox", "/workspace/products", "/workspace/deliveries", "/workspace/orders", "/workspace/customers", "/workspace/saved-replies"]

  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 })
    for (const route of routes) {
      await page.goto(route)
      await expect(page.locator(".workspace-shell")).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  }
})

test("Commerce Workspace live inbox updates the open conversation without refresh and ignores duplicate events", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  await page.addInitScript(() => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>()
    const addListener = (event: string, callback: (payload: unknown) => void) => {
      const current = listeners.get(event) || new Set()
      current.add(callback)
      listeners.set(event, current)
    }
    const removeListener = (event: string, callback: (payload: unknown) => void) => {
      listeners.get(event)?.delete(callback)
    }

    ;(window as typeof window & {
      __ZAYOS_SOCKET_IO_FACTORY__?: (url: string, options: unknown) => {
        disconnect: () => void
        on: (event: string, callback: (payload: unknown) => void) => void
        off: (event: string, callback: (payload: unknown) => void) => void
      }
      __ZAYOS_TEST_EMIT_SOCKET_EVENT__?: (event: string, payload: unknown) => void
    }).__ZAYOS_SOCKET_IO_FACTORY__ = () => {
      window.setTimeout(() => {
        listeners.get("connect")?.forEach((callback) => callback(undefined))
      }, 0)

      return {
        disconnect: () => {
          listeners.clear()
        },
        on: (event: string, callback: (payload: unknown) => void) => {
          addListener(event, callback)
        },
        off: (event: string, callback: (payload: unknown) => void) => {
          removeListener(event, callback)
        },
      }
    }

    ;(window as typeof window & {
      __ZAYOS_TEST_EMIT_SOCKET_EVENT__?: (event: string, payload: unknown) => void
    }).__ZAYOS_TEST_EMIT_SOCKET_EVENT__ = (event: string, payload: unknown) => {
      listeners.get(event)?.forEach((callback) => callback(payload))
    }
  })

  const session = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}"), SESSION_KEY) as { accessToken: string }
  const conversationsResponse = await page.request.get(`${API_BASE_URL}/csr/conversations`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  expect(conversationsResponse.ok()).toBeTruthy()
  const conversationsPayload = (await conversationsResponse.json()) as {
    data?: Array<{ id: string; customer?: { fullName?: string | null } | null; subject?: string | null }>
  }
  const conversations = conversationsPayload.data || []
  const targetConversation = conversations.find((conversation) => (conversation.customer?.fullName || conversation.subject || "").includes("Ko Zaw Zaw"))
  expect(targetConversation).toBeTruthy()

  await page.goto(`/workspace/inbox?conversation=${targetConversation!.id}`)
  await expect(page.getByRole("heading", { name: "Ko Zaw Zaw" })).toBeVisible()
  await expect(page.getByText("Live", { exact: true })).toBeVisible()

  const liveMessage = `Socket live message ${Date.now()}`
  const createdAt = new Date().toISOString()
  const payload = {
    conversationId: targetConversation!.id,
    message: {
      id: `playwright-live-${Date.now()}`,
      conversationId: targetConversation!.id,
      senderType: "customer",
      senderId: "playwright-customer",
      messageType: "text",
      content: liveMessage,
      attachments: [],
      metadata: {},
      status: "delivered",
      createdAt,
      updatedAt: createdAt,
    },
  }

  await page.evaluate((eventPayload) => {
    ;(window as typeof window & {
      __ZAYOS_TEST_EMIT_SOCKET_EVENT__?: (event: string, payload: unknown) => void
    }).__ZAYOS_TEST_EMIT_SOCKET_EVENT__?.("message.created", eventPayload)
  }, payload)

  await expect(page.getByText(liveMessage, { exact: true })).toHaveCount(1)

  await page.evaluate((eventPayload) => {
    ;(window as typeof window & {
      __ZAYOS_TEST_EMIT_SOCKET_EVENT__?: (event: string, payload: unknown) => void
    }).__ZAYOS_TEST_EMIT_SOCKET_EVENT__?.("message.created", eventPayload)
  }, payload)

  await expect(page.getByText(liveMessage, { exact: true })).toHaveCount(1)
})

test("Commerce Workspace can upload media and send it in a conversation reply", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  const fileName = `commerce-media-${Date.now()}.png`

  await page.goto("/workspace/media")
  const createUploadPromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/media/uploads") && response.request().method() === "POST",
  )
  await page.locator('input[type="file"]').first().setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  })
  const uploadResponse = await createUploadPromise
  expect(uploadResponse.ok()).toBeTruthy()
  const upload = (await uploadResponse.json()) as { file: { id: string } }
  await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible()

  await page.goto("/workspace/inbox")
  await openSeededConversation(page)
  await expect(page.getByRole("heading", { name: "Ko Zaw Zaw" })).toBeVisible()
  await page.getByRole("button", { name: "Attach media" }).click()
  const picker = page.getByRole("dialog", { name: "Choose media" })
  await expect(picker.getByText(fileName, { exact: true })).toBeVisible()
  await picker.getByText(fileName, { exact: true }).click()
  const caption = `Media reply ${Date.now()}`
  await page.getByPlaceholder("Reply with order, payment, or delivery guidance…").fill(caption)
  const sendPromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/csr/conversations/messages") && response.request().method() === "POST",
    { timeout: 30_000 },
  )
  await page.getByRole("button", { name: "Send", exact: true }).click()
  expect((await sendPromise).ok()).toBeTruthy()
  await expect(page.getByText(caption, { exact: true }).last()).toBeVisible()

  const session = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}"), SESSION_KEY) as { accessToken: string }
  const archiveResponse = await page.request.delete(`${API_BASE_URL}/media/${upload.file.id}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  expect(archiveResponse.ok()).toBeTruthy()
})

test("supervisor can sign in to the Commerce Workspace", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  await expect(page.getByRole("heading", { name: /Good morning/i })).toBeVisible()
  await page.goto("/workspace/reports")
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Sales & Orders Report" })).toBeVisible()
})

test("Commerce Workspace inbox loads seeded conversations", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  await page.goto("/workspace/inbox")

  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Unread", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Follow Up", exact: true })).toBeVisible()
  await expect(page.getByText("Ko Zaw Zaw").first()).toBeVisible()
  await expect(page.getByText("Ma Hnin Ei").first()).toBeVisible()
})

test("Commerce Workspace user can send a message from the inbox", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  await page.goto("/workspace/inbox")
  await openSeededConversation(page)
  await expect(page.getByRole("heading", { name: "Ko Zaw Zaw" })).toBeVisible()

  const message = `Playwright message ${Date.now()}`
  await page.getByPlaceholder("Reply with order, payment, or delivery guidance…").fill(message)
  const messageResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/csr/conversations/messages") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  )
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const messageResponse = await messageResponsePromise
  expect(messageResponse.ok()).toBeTruthy()

  await expect(page.getByText(message, { exact: true }).last()).toBeVisible()
})

test("Commerce Workspace canned response picker loads backend responses", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  await page.goto("/workspace/inbox")
  await openSeededConversation(page)
  await expect(page.getByRole("heading", { name: "Ko Zaw Zaw" })).toBeVisible()
  await page.getByText("Saved replies", { exact: true }).click()

  await expect(page.getByText("Welcome", { exact: true })).toBeVisible()
})

test("Commerce Workspace user can create, edit, and delete a canned response", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  await page.goto("/workspace/saved-replies")

  const title = `Browser CRUD ${Date.now()}`
  const updatedTitle = `${title} Updated`

  await page.getByRole("button", { name: "New Saved Reply" }).click()
  await page.getByLabel("Response Title").fill(title)
  await page.getByLabel("Response Content").fill("Created by the live Playwright CRUD test.")
  await page.getByLabel("Tags").fill("playwright, acceptance")
  await page.getByRole("button", { name: "Create Response" }).click()

  await expect(page.locator("h2", { hasText: title })).toBeVisible()
  await page.getByRole("tab", { name: "Edit" }).click()
  await page.getByLabel("Response Title").fill(updatedTitle)
  await page.getByRole("button", { name: "Save Changes" }).click()

  await expect(page.locator("h2", { hasText: updatedTitle })).toBeVisible()
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Delete response" }).click()

  await expect(page.getByText(updatedTitle, { exact: true })).toHaveCount(0)
})

test("Commerce Workspace user can create an order from a conversation", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  const notes = `Playwright chat order ${Date.now()}`
  const order = await createOrderFromConversation(page, notes)

  await page.goto("/workspace/orders")
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible()
  await page.getByPlaceholder("Search orders...").fill(order.orderNumber)
  await page.getByText(order.orderNumber, { exact: true }).first().click()

  await expect(page.getByRole("heading", { name: order.orderNumber })).toBeVisible()
  await page.getByRole("tab", { name: "Notes" }).click()
  await expect(page.getByText(notes, { exact: true })).toBeVisible()
})

test("Commerce Workspace user can update order lifecycle, COD, and delivery details", async ({ page }) => {
  await login(page, "supervisor@demo.local")
  const suffix = Date.now()
  const order = await createOrderFromConversation(page, `Lifecycle order ${suffix}`)

  await page.goto("/workspace/orders")
  await page.getByPlaceholder("Search orders...").fill(order.orderNumber)
  await page.getByText(order.orderNumber, { exact: true }).first().click()

  await page.getByLabel("Status", { exact: true }).click()
  await page.getByRole("option", { name: "Out for delivery" }).click()
  await page.getByLabel("Payment Status").click()
  await page.getByRole("option", { name: "COD pending" }).click()
  await page.getByLabel("Paid Amount").fill("1000")
  await page.getByLabel("Delivery Assignee").fill(`Browser Courier ${suffix}`)
  await page.getByLabel("Assignee Phone").fill("+95 9 400 000 999")
  await page.getByLabel("Delivery Zone").fill("Kamayut")
  await page.getByLabel("Tracking").fill(`PW-${suffix}`)
  await page.getByLabel("Transition Note").fill(`Playwright lifecycle ${suffix}`)

  const lifecycleResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/orders/${order.id}/lifecycle`) &&
      response.request().method() === "PUT",
  )
  await page.getByRole("button", { name: "Save Lifecycle" }).click()
  const lifecycleResponse = await lifecycleResponsePromise
  expect(lifecycleResponse.ok()).toBeTruthy()

  await expect(page.getByLabel("Status", { exact: true })).toHaveText("Out for delivery")
  await expect(page.getByLabel("Payment Status")).toHaveText("Partially paid")

  await page.getByRole("tab", { name: "Delivery" }).click()
  await expect(page.getByText(`Browser Courier ${suffix}`, { exact: true })).toBeVisible()
  await expect(page.getByText(`PW-${suffix}`, { exact: true })).toBeVisible()

  await page.getByRole("tab", { name: "History" }).click()
  await expect(page.getByText(`Playwright lifecycle ${suffix}`, { exact: true })).toBeVisible()
})
