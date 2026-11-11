import { expect, test, type Page } from "@playwright/test"

const SESSION_KEY = "kme-auth-session"

const session = {
  accessToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzOTczMmQ0MS05ZmVlLTRlYzYtYWE0Ni05NTk1MGQwMzI2NDMiLCJlbWFpbCI6Im93bmVyQGRlbW8ubG9jYWwiLCJyb2xlIjoib3duZXIiLCJ0eXBlIjoidGVuYW50X3VzZXIiLCJ0ZW5hbnRJZCI6ImMxYWFkMmUzLTVmMzYtNDVkNy1iMTlkLTEwODA4MDk5Mjk4NiIsImVtYWlsVmVyaWZpZWRBdCI6IjIwMjYtMTUtMDZUMjA6MzI6MjEuMzc2WiIsInRva2VuVXNlIjoiYWNjZXNzIiwiaWF0IjoxNzk0MDAyOTg4LCJleHAiOjE3OTQwODkzODh9.upMWvJYfFiljmob-57Aj1oLm7OlAIW4e7wqt3Z3MO_I",
  refreshToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzOTczMmQ0MS05ZmVlLTRlYzYtYWE0Ni05NTk1MGQwMzI2NDMiLCJlbWFpbCI6Im93bmVyQGRlbW8ubG9jYWwiLCJyb2xlIjoib3duZXIiLCJ0eXBlIjoidGVuYW50X3VzZXIiLCJ0ZW5hbnRJZCI6ImMxYWFkMmUzLTVmMzYtNDVkNy1iMTlkLTEwODA4MDk5Mjk4NiIsImVtYWlsVmVyaWZpZWRBdCI6IjIwMjYtMTUtMDZUMjA6MzI6MjEuMzc2WiIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzk0MDAyOTg4LCJleHAiOjE3OTQ2MDcxOTR9.IbJyxNPPhNQfQphuZvqBe5ozWohEO5Vt1QCZw1JOdJI",
  user: {
    id: "39732d41-9fee-4ec6-aa46-95950d032643",
    email: "owner@demo.local",
    fullName: "Daw Thandar Aye",
    role: "owner",
    type: "tenant_user",
    tenantId: "c1aad2e3-5f36-45d7-b19d-108080992986",
    emailVerifiedAt: "2026-11-06T20:32:21.376Z",
  },
}

// Test order: MM-ORD-1005 (pending, unpaid, total 453000, paid 0)
const TEST_ORDER_ID = "76ebc78e-f28a-434e-9d0d-603953152e73"
const TEST_ORDER_NUMBER = "MM-ORD-1005"

// Test order: MM-ORD-1004 (confirmed, unpaid, total 35000) - for delivery tests
const DELIVERY_ORDER_ID = "5afc9abb-2fdb-4f4e-ac86-1ecf2966ded3"

// File-storage verifies the uploaded bytes against the declared content type,
// so fixtures must start with a real PNG signature instead of arbitrary text.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

async function authenticate(page: Page) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: SESSION_KEY, value: session },
  )
}

async function openOrderDetail(page: Page, orderId: string = TEST_ORDER_ID) {
  await page.goto(`/workspace/orders?order=${orderId}`)
  // Wait for the order detail panel to load
  await expect(page.getByText(TEST_ORDER_NUMBER)).toBeVisible({ timeout: 10000 })
}

test.describe("Order List Redesign - Order Status", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page)
  })

  test("Scenario 1: Order status change requires confirmation modal", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // Click the order status selector
    await page
      .getByRole("combobox", { name: /order status|order/i })
      .first()
      .click()

    // Select a different status
    await page.getByRole("option", { name: /confirmed/i }).click()

    // Confirmation modal should appear
    await expect(
      page.getByRole("dialog", { name: /confirm order status/i }),
    ).toBeVisible()

    // Verify current and proposed statuses are shown
    await expect(page.getByText(/pending/i)).toBeVisible()
    await expect(page.getByText(/confirmed/i)).toBeVisible()

    // Cancel should discard the change
    await page.getByRole("button", { name: /cancel/i }).click()
    await expect(
      page.getByRole("dialog", { name: /confirm order status/i }),
    ).not.toBeVisible()

    // Verify the status selector still shows the original value
    await page.getByRole("combobox", { name: /order status|order/i }).first()
    await expect(page.getByRole("combobox")).toHaveValue("pending")

    // Try again and confirm
    await page.getByRole("combobox", { name: /order status|order/i }).click()
    await page.getByRole("option", { name: /confirmed/i }).click()
    await expect(
      page.getByRole("dialog", { name: /confirm order status/i }),
    ).toBeVisible()
    await page.getByRole("button", { name: /confirm/i }).click()

    // Wait for the update to complete
    await page.waitForTimeout(1000)

    // Verify the updated status appears
    await expect(page.getByText(/confirmed/i, { exact: false })).toBeVisible()
  })
})

test.describe("Order List Redesign - Payment Management", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page)
  })

  test("Scenario A - Unpaid: Submit Payment button visible", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // Unpaid order with outstanding balance should show Submit Payment
    await expect(
      page.getByRole("button", { name: /submit payment/i }),
    ).toBeVisible()

    // Open the payment modal
    await page.getByRole("button", { name: /submit payment/i }).click()
    await expect(
      page.getByRole("dialog", { name: /submit payment/i }),
    ).toBeVisible()

    // Verify amount and proof fields
    await expect(page.getByLabel(/payment amount/i)).toBeVisible()
    await expect(page.getByLabel(/payment proof/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /submit payment/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible()
  })

  test("Scenario B - Partial Payment: create transaction, status becomes Partially Paid", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // Click Submit Payment
    await page.getByRole("button", { name: /submit payment/i }).click()

    // Enter amount less than remaining balance
    const amountInput = page.getByLabel(/payment amount/i)
    await amountInput.fill("30000")

    // Upload a proof file
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: "proof.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    })

    // Submit
    await page.getByRole("button", { name: /submit payment/i }).click()

    // Wait for submission to complete
    await page.waitForTimeout(1500)

    // Verify payment status changed to Partially Paid
    await expect(page.getByText(/partially paid/i)).toBeVisible()

    // Verify remaining balance updated
    await expect(page.getByText(/423000/i)).toBeVisible()

    // Verify Submit Payment still available
    await expect(
      page.getByRole("button", { name: /submit payment/i }),
    ).toBeVisible()

    // Verify transaction appears in history
    await expect(
      page.getByText(/30000/i),
    ).toBeVisible()
  })

  test("Scenario C - Multiple Payments: second transaction created, history preserved", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // First payment
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.getByLabel(/payment amount/i).fill("40000")
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: "proof2.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    })
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.waitForTimeout(1500)

    // Verify Partially Paid
    await expect(page.getByText(/partially paid/i)).toBeVisible()

    // Second payment
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.getByLabel(/payment amount/i).fill("40000")
    const fileInput2 = page.locator('input[type="file"]').first()
    await fileInput2.setInputFiles({
      name: "proof3.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    })
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.waitForTimeout(1500)

    // Verify both transactions exist in history
    await expect(page.getByText(/30000/i)).toBeVisible()
    await expect(page.getByText(/40000/i)).toBeVisible()

    // Verify remaining balance decreased
    await expect(page.getByText(/23000/i)).toBeVisible()
  })

  test("Scenario D - Full Payment: status becomes Paid, Submit Payment disappears", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // Submit the exact remaining balance
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.getByLabel(/payment amount/i).fill("453000")
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: "final-proof.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    })
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.waitForTimeout(1500)

    // Verify status is Paid
    await expect(page.getByText(/paid/i)).toBeVisible()

    // Verify Submit Payment button is hidden
    await expect(
      page.getByRole("button", { name: /submit payment/i }),
    ).not.toBeVisible()

    // Verify all previous transactions remain accessible
    await expect(
      page.getByText(/transaction|payment history/i),
    ).toBeVisible()
  })

  test("Scenario E - Payment Validation: zero/negative and overpayment rejected", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // Try zero amount
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.getByLabel(/payment amount/i).fill("0")
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.waitForTimeout(500)
    // Should show error, modal still open
    await expect(
      page.getByRole("dialog", { name: /submit payment/i }),
    ).toBeVisible()

    // Try amount exceeding balance
    await page.getByLabel(/payment amount/i).fill("999999")
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.waitForTimeout(500)
    await expect(
      page.getByRole("dialog", { name: /submit payment/i }),
    ).toBeVisible()
  })

  test("Scenario F - Payment Proof Persistence: upload, refresh, verify", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // Upload a proof file with payment
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.getByLabel(/payment amount/i).fill("10000")
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: "persist-proof.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    })
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.waitForTimeout(1500)

    // Verify proof appears in history
    await expect(page.getByText(/persist-proof/i)).toBeVisible()

    // Refresh the page
    await page.reload()
    await openOrderDetail(page)

    // Verify payment history still shows the transaction
    await expect(page.getByText(/10000/i)).toBeVisible()
    await expect(page.getByText(/partially paid/i)).toBeVisible()
  })

  test("Scenario G - Mark as Unpaid: reason required, preserves history", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // First make a payment so we have history to preserve
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.getByLabel(/payment amount/i).fill("5000")
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: "before-unpaid.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    })
    await page.getByRole("button", { name: /submit payment/i }).click()
    await page.waitForTimeout(1500)

    // Click Mark as Unpaid
    await page.getByRole("button", { name: /mark unpaid/i }).click()
    await expect(
      page.getByRole("dialog", { name: /mark unpaid/i }),
    ).toBeVisible()

    // Try submitting without reason
    await page.getByRole("button", { name: /mark unpaid/i }).click()
    await page.waitForTimeout(500)
    // Modal should still be open (validation error)
    await expect(
      page.getByRole("dialog", { name: /mark unpaid/i }),
    ).toBeVisible()

    // Enter a reason and confirm
    await page.getByLabel(/reason/i).fill("Customer requested reversal")
    await page.getByRole("button", { name: /mark unpaid/i }).click()
    await page.waitForTimeout(1500)

    // Verify status changed to Unpaid
    await expect(page.getByText(/unpaid/i)).toBeVisible()

    // Verify previous payment history is preserved
    await expect(page.getByText(/5000/i)).toBeVisible()
  })
})

test.describe("Order List Redesign - Delivery Management", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page)
  })

  test("Delivery status change requires confirmation modal", async ({
    page,
  }) => {
    await openOrderDetail(page, DELIVERY_ORDER_ID)

    // Click delivery status selector
    await page.getByRole("combobox", { name: /delivery/i }).click()
    await page.getByRole("option", { name: /out for delivery/i }).click()

    // Confirmation modal should appear
    await expect(
      page.getByRole("dialog", { name: /confirm delivery status/i }),
    ).toBeVisible()

    // Cancel should discard
    await page.getByRole("button", { name: /cancel/i }).click()
    await expect(
      page.getByRole("dialog", { name: /confirm delivery status/i }),
    ).not.toBeVisible()

    // Confirm
    await page.getByRole("combobox", { name: /delivery/i }).click()
    await page.getByRole("option", { name: /out for delivery/i }).click()
    await expect(
      page.getByRole("dialog", { name: /confirm delivery status/i }),
    ).toBeVisible()
    await page.getByRole("button", { name: /confirm/i }).click()
    await page.waitForTimeout(1000)

    // Verify updated status
    await expect(page.getByText(/out for delivery/i)).toBeVisible()
  })

  test("Edit Delivery Info opens modal instead of redirecting", async ({
    page,
  }) => {
    await openOrderDetail(page, DELIVERY_ORDER_ID)

    // Click Edit Delivery Info button
    await page.getByRole("button", { name: /edit delivery info/i }).click()

    // Modal should open
    await expect(
      page.getByRole("dialog", { name: /edit delivery info/i }),
    ).toBeVisible()

    // Verify we're still on the orders page (not redirected)
    await expect(page.url()).toContain("/workspace/orders")

    // Edit delivery information
    await page.getByLabel(/delivery person/i).fill("Test Courier")
    await page.getByLabel(/delivery person phone/i).fill("09123456789")

    // Save
    await page.getByRole("button", { name: /save delivery info/i }).click()
    await page.waitForTimeout(1000)

    // Verify toast or success
    await expect(
      page.getByText(/delivery updated/i),
    ).toBeVisible()

    // Refresh and verify persistence
    await page.reload()
    await openOrderDetail(page, DELIVERY_ORDER_ID)

    // Verify delivery info persisted
    await expect(page.getByText(/test courier/i)).toBeVisible()
  })
})

test.describe("Order List Redesign - Delivery Header Icon", () => {
  test("Delivery section header reuses navigation icon", async ({
    page,
  }) => {
    await openOrderDetail(page)

    // Delivery section header should have the truck icon button
    await expect(page.getByTitle("Open delivery")).toBeVisible()

    // Click should navigate to deliveries page
    await page.getByTitle("Open delivery").click()
    await expect(page.url()).toContain("/workspace/deliveries")
  })
})

test.describe("Order List Redesign - Reason/Note Card Layout", () => {
  test("Reason/Note card does not span full width", async ({ page }) => {
    await openOrderDetail(page)

    // Reason/Note card should be a card in the right column
    const reasonCard = page.getByText(/reason or note/i).locator("..")
    await expect(reasonCard).toBeVisible()

    // Card should not be full width (should be in the grid layout)
    await expect(page.locator("grid-cols-2")).toBeVisible()
  })
})

test.describe("Order List Redesign - Responsive", () => {
  test.use({ viewport: { width: 1024, height: 768 } })
  test("Desktop viewport: layout renders correctly", async ({ page }) => {
    await authenticate(page)
    await openOrderDetail(page)
    await expect(page.getByRole("button", { name: /submit payment/i })).toBeVisible()
  })

  test.use({ viewport: { width: 768, height: 1024 } })
  test("Tablet viewport: layout renders correctly", async ({ page }) => {
    await authenticate(page)
    await openOrderDetail(page)
    await expect(page.getByRole("button", { name: /submit payment/i })).toBeVisible()
  })

  test.use({ viewport: { width: 375, height: 667 } })
  test("Mobile viewport: layout renders correctly", async ({ page }) => {
    await authenticate(page)
    await openOrderDetail(page)
    await expect(page.getByRole("button", { name: /submit payment/i })).toBeVisible()
  })
})
