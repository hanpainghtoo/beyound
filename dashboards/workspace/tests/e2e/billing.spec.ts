import { expect, test, type Page } from "@playwright/test"

const SESSION_KEY = "kme-auth-session"

const session = {
  accessToken: "billing-v2-test",
  refreshToken: "billing-v2-test-refresh",
  user: {
    id: "billing-v2-user",
    email: "billing-v2@example.com",
    fullName: "Billing V2 Owner",
    role: "owner",
    type: "tenant_user",
    tenantId: "billing-v2-tenant",
  },
}

const plan = {
  id: "business-launch",
  name: "Business Launch",
  description: "A focused plan for growing commerce teams.",
  monthlyPrice: 500000,
  durationDays: 30,
  messageQuotaMode: "directional",
  maxCsrs: 5,
  maxChannels: 2,
  messageLimit: 20000,
  inboundMessageLimit: 16000,
  outboundMessageLimit: 4000,
  allowedProviders: ["messenger", "telegram"],
  apiLimit: 50000,
  storageLimitGb: 10,
  status: "active",
  public: {
    displayOrder: 1,
    eyebrow: "For growing teams",
    summary: "A simple workflow from chat to delivery.",
    currencyCode: "MMK",
    billingInterval: "monthly",
    monthlyPriceLabel: "MMK 500,000 / month",
    availability: "enabled",
    selfServe: true,
  },
}

const displayPlan = {
  ...plan,
  code: "business-launch",
  displayOrder: 1,
  eyebrow: "For growing teams",
  summary: "A simple workflow from chat to delivery.",
  targetCustomer: "Growing commerce teams",
  ctaLabel: "Start workspace",
  ctaHref: "/start?planId=business-launch",
  recommended: false,
  recommendationLabel: "Recommended plan",
  selfServe: true,
  monthlyPriceDisplay: "MMK 500,000 / month",
  periodDurationLabel: "Monthly subscription",
  setupFeeTitle: "Setup and onboarding",
  setupFeeDisplay: "Pricing unavailable",
  includedUsersLabel: "5 users",
  includedChannelsLabel: "2 channels",
  supportedProvidersLabel: "Messenger, Telegram",
  featureList: [],
  availability: "enabled",
}

const billing = {
  tenant: { companyName: "Billing V2 Workspace", status: "active" },
  plan: {
    id: plan.id,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    currency: "MMK",
    maxCsrs: plan.maxCsrs,
    maxChannels: plan.maxChannels,
    messageLimit: plan.messageLimit,
    apiLimit: plan.apiLimit,
    storageLimitGb: plan.storageLimitGb,
  },
  currentPeriod: {
    id: "period-current",
    planId: plan.id,
    periodStatus: "active",
    paymentStatus: "paid",
    adminActivationStatus: "approved",
    monthStartAt: "2026-08-01T00:00:00.000Z",
    monthEndAt: "2026-09-01T00:00:00.000Z",
  },
  trial: null,
  upgrade: null,
  upgradeHistory: [],
  entitlement: null,
  usage: {
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    refreshedAt: "2026-08-10T00:00:00.000Z",
    latestUsageEventAt: null,
    source: "tenant_usage_events",
    monthlyMessages: 7000,
    teamMembers: 3,
    connectedChannels: 2,
    metrics: {},
  },
  records: [],
}

const periods = {
  tenantId: "billing-v2-tenant",
  activePeriodId: "period-current",
  entitlement: {
    tenantId: "billing-v2-tenant",
    activePeriodId: "period-current",
    planId: plan.id,
    periodType: "paid",
    periodStartAt: "2026-08-01T00:00:00.000Z",
    periodEndAt: "2026-09-01T00:00:00.000Z",
    activatedAt: "2026-08-02T00:00:00.000Z",
    periodStatus: "active",
    paymentStatus: "paid",
    baseLimits: {
      inbound_messages: 12000,
      outbound_messages: 3000,
      api_requests: 40000,
      channel_slots: 2,
      storage_gb: 10,
      team_members: 5,
    },
    carryover: {
      inboundMessages: 1000,
      outboundMessages: 500,
      apiRequests: 5000,
    },
    activeTopUpComponentTotals: {
      inbound_messages: 3000,
      outbound_messages: 500,
    },
    effectiveLimits: {
      inbound_messages: 16000,
      outbound_messages: 4000,
      api_requests: 50000,
      channel_slots: 2,
      storage_gb: 10,
      team_members: 5,
    },
  },
  entitlementError: null,
  periodUsage: {
    usageSource: "period_scoped",
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    inboundMessages: 3000,
    outboundMessages: 1000,
    apiRequests: 5000,
    activeChannels: 2,
    activeTeamMembers: 3,
    storage: {
      usedBytes: 2 * 1024 ** 3,
      effectiveCapacityGb: 10,
      overStorageLimit: false,
    },
  },
  periods: [
    {
      id: "period-current",
      planId: plan.id,
      periodType: "paid",
      periodStatus: "active",
      paymentStatus: "paid",
      adminActivationStatus: "approved",
      monthStartAt: "2026-08-01T00:00:00.000Z",
      monthEndAt: "2026-09-01T00:00:00.000Z",
      periodStartAt: "2026-08-01T00:00:00.000Z",
      periodEndAt: "2026-09-01T00:00:00.000Z",
      sequenceNumber: 1,
    },
    {
      id: "period-upcoming",
      planId: plan.id,
      periodType: "paid",
      periodStatus: "upcoming",
      paymentStatus: "paid",
      adminActivationStatus: "pending",
      monthStartAt: "2026-09-01T00:00:00.000Z",
      monthEndAt: "2026-10-01T00:00:00.000Z",
      periodStartAt: "2026-09-01T00:00:00.000Z",
      periodEndAt: "2026-10-01T00:00:00.000Z",
      sequenceNumber: 2,
    },
  ],
}

async function authenticate(page: Page) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: SESSION_KEY, value: session },
  )
}

async function mockBillingV2Api(
  page: Page,
  overrides: {
    billing?: unknown
    periods?: unknown
    plans?: unknown[]
    addOnProducts?: unknown[]
    addOnPurchases?: unknown[]
  } = {},
) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let body: unknown = {}

    if (pathname.endsWith("/tenant/billing")) body = overrides.billing ?? billing
    else if (pathname.endsWith("/tenant/subscription/periods")) body = overrides.periods ?? periods
    else if (pathname.endsWith("/tenant/add-on-products")) body = overrides.addOnProducts ?? []
    else if (pathname.endsWith("/tenant/add-on-purchases")) body = overrides.addOnPurchases ?? []
    else if (pathname.endsWith("/tenant/billing/plan-change-requests")) body = []
    else if (pathname.endsWith("/public-subscription-plans")) body = overrides.plans ?? [displayPlan]

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    })
  })
}

const pendingInvoice = {
  id: "invoice-pending-enterprise",
  invoiceNumber: "ZAY-PENDING-001",
  billingPeriodStart: "2026-09-01T00:00:00.000Z",
  billingPeriodEnd: "2026-10-01T00:00:00.000Z",
  invoiceStatus: "issued",
  paymentStatus: "unpaid",
  amountDue: 750000,
  amountPaid: 0,
  currency: "MMK",
  dueDate: "2026-09-08T00:00:00.000Z",
  paidAt: null,
  subscriptionPlan: { id: "enterprise-growth", name: "Enterprise Growth" },
  metadata: {
    purchaseRequestType: "subscription_period",
    selectedPlanId: "enterprise-growth",
    selectedPlanName: "Enterprise Growth",
  },
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
}

const enterprisePlan = {
  ...displayPlan,
  id: "enterprise-growth",
  code: "enterprise-growth",
  name: "Enterprise Growth",
  monthlyPrice: 750000,
  monthlyPriceDisplay: "MMK 750,000 / month",
  displayOrder: 2,
  public: {
    ...displayPlan.public,
    displayOrder: 2,
    monthlyPriceLabel: "MMK 750,000 / month",
  },
}

const invoiceRecord = {
  id: "invoice-history-001",
  invoiceNumber: "ZAY-HISTORY-001",
  billingPeriodStart: "2026-08-01T00:00:00.000Z",
  billingPeriodEnd: "2026-09-01T00:00:00.000Z",
  invoiceStatus: "issued",
  paymentStatus: "unpaid",
  amountDue: 500000,
  amountPaid: 0,
  currency: "MMK",
  dueDate: "2026-08-08T00:00:00.000Z",
  paidAt: null,
  subscriptionPlan: { id: plan.id, name: plan.name },
  metadata: { selectedPlanName: plan.name },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

const rejectedProofInvoice = {
  ...invoiceRecord,
  id: "invoice-proof-rejected",
  invoiceNumber: "ZAY-PROOF-REJECTED",
  metadata: {
    ...invoiceRecord.metadata,
    paymentProof: {
      status: "rejected",
      paymentMethod: "bank_transfer",
      paidAmount: 500000,
      paidDate: "2026-08-08T00:00:00.000Z",
      submittedAt: "2026-08-08T04:00:00.000Z",
      fileName: "rejected-receipt.png",
      mediaFileId: "media-rejected-receipt-001",
      rejectionReason: "The amount could not be verified.",
    },
  },
}

const pendingProofInvoice = {
  ...invoiceRecord,
  id: "invoice-proof-pending",
  invoiceNumber: "ZAY-PROOF-001",
  metadata: {
    ...invoiceRecord.metadata,
    paymentProof: {
      status: "pending_review",
      paymentMethod: "bank_transfer",
      paidAmount: 500000,
      paidDate: "2026-08-08T00:00:00.000Z",
      submittedAt: "2026-08-08T04:00:00.000Z",
      fileName: "receipt.png",
      mediaFileId: "media-receipt-001",
    },
  },
}

test.describe("Billing V2", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page)
    await mockBillingV2Api(page)
  })

  test("My Plan is the default first tab", async ({ page }) => {
    await page.goto("/workspace/billing")
    await expect(page.getByRole("heading", { name: "Current Period Usage" })).toBeVisible()
    await expect(page.getByTestId("billing-v2-tab-my-plan")).toHaveAttribute("aria-current", "page")
    await expect(page.locator("[data-testid='billing-v2-tabs'] button")).toHaveText(["My Plan", "Packages", "Billing History"])
  })

  test("no-plan tenants see plan choices and locked top-ups", async ({ page }) => {
    const noPlanBilling = { ...billing, plan: null, currentPeriod: null, trial: null }
    const noPlanPeriods = { ...periods, activePeriodId: null, entitlement: null, periods: [] }
    await mockBillingV2Api(page, {
      billing: noPlanBilling,
      periods: noPlanPeriods,
      addOnProducts: [{
        id: "addon-no-plan",
        name: "Message Boost",
        description: "Extra message capacity.",
        price: 50000,
        currency: "MMK",
        components: [{ id: "component-no-plan", componentType: "inbound_messages", quantity: 1000, unit: "messages" }],
      }],
    })
    await page.goto("/workspace/billing?tab=packages")
    await expect(page.getByRole("heading", { name: "Available Plans" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Request this month/ })).toHaveCount(1)
    await expect(page.getByRole("heading", { name: "Add On Packages" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Requires active paid plan" })).toBeVisible()
  })

  test("direct tab URLs render the selected V2 surface", async ({ page }) => {
    await page.goto("/workspace/billing?tab=packages")
    await expect(page.getByRole("heading", { name: "Available Plans" })).toBeVisible()
    await expect(page.getByTestId("billing-v2-tab-packages")).toHaveAttribute("aria-current", "page")

    await page.goto("/workspace/billing?tab=my-plan")
    await expect(page.getByRole("heading", { name: "Current Period Usage" })).toBeVisible()
    await expect(page.getByTestId("billing-v2-tab-my-plan")).toHaveAttribute("aria-current", "page")

    await page.goto("/workspace/billing?tab=billing-history")
    await expect(page.getByRole("heading", { name: "Billing History" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Upgrade History" })).toHaveCount(0)
    await expect(page.getByTestId("billing-v2-tab-billing-history")).toHaveAttribute("aria-current", "page")
  })

  test("tab navigation updates the URL without leaving Billing V2", async ({ page }) => {
    await page.goto("/workspace/billing?tab=packages")
    await page.getByRole("tab", { name: "Open My Plan" }).click()
    await expect(page).toHaveURL(/\/workspace\/billing\?tab=my-plan$/)
    await expect(page.getByTestId("billing-v2-current-period-usage")).toBeVisible()

    await page.getByRole("tab", { name: "Open Billing History" }).click()
    await expect(page).toHaveURL(/\/workspace\/billing\?tab=billing-history$/)
    await expect(page.getByTestId("billing-v2-history")).toBeVisible()
  })

  test("tab navigation preserves browser history", async ({ page }) => {
    await page.goto("/workspace/billing?tab=packages")
    await page.getByRole("tab", { name: "Open My Plan" }).click()
    await expect(page).toHaveURL(/tab=my-plan$/)
    await page.getByRole("tab", { name: "Open Billing History" }).click()
    await expect(page).toHaveURL(/tab=billing-history$/)

    await page.goBack()
    await expect(page).toHaveURL(/tab=my-plan$/)
    await expect(page.getByRole("heading", { name: "Current Period Usage" })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/tab=packages$/)
    await expect(page.getByRole("heading", { name: "Available Plans" })).toBeVisible()
  })

  test("My Plan keeps usage, main plan, add-ons, and upcoming plans in order", async ({ page }) => {
    await page.goto("/workspace/billing?tab=my-plan")
    const order = await page.locator("[data-testid^='billing-v2-']").evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-testid")),
    )
    expect(order.indexOf("billing-v2-current-period-usage")).toBeLessThan(order.indexOf("billing-v2-main-plan-section"))
    expect(order.indexOf("billing-v2-main-plan-section")).toBeLessThan(order.indexOf("billing-v2-addon-packages"))
    expect(order.indexOf("billing-v2-addon-packages")).toBeLessThan(order.indexOf("billing-v2-upcoming-plans"))
    await expect(page.getByRole("heading", { name: "Upcoming Plans" })).toBeVisible()
    await expect(page.getByTestId("billing-v2-limit-sources")).toContainText("Base Limit")
    await expect(page.getByTestId("billing-v2-limit-sources")).toContainText("Carried Over")
    await expect(page.getByTestId("billing-v2-limit-sources")).toContainText("Add On")
  })

  test("V2 surfaces remain usable on mobile and readable in dark mode", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("zayos-commerce-theme", "dark")
    })

    for (const tab of ["packages", "my-plan", "billing-history"]) {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`/workspace/billing?tab=${tab}`)
      await expect(page.getByRole("main").last()).toBeVisible()

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(hasHorizontalOverflow, `${tab} has page-level horizontal overflow`).toBe(false)
      await page.screenshot({
        path: `/tmp/billing-v2-${tab}-mobile.png`,
        fullPage: true,
        animations: "disabled",
      })
    }

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto("/workspace/billing?tab=my-plan")
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expect(page.getByRole("heading", { name: "Current Period Usage" })).toBeVisible()
    await page.screenshot({
      path: "/tmp/billing-v2-my-plan-dark.png",
      fullPage: true,
      animations: "disabled",
    })
  })

  test("V2 falls back to the pending subscription-period ledger when an invoice is absent", async ({ page }) => {
    const pendingPeriod = {
      ...periods.periods[1],
      paymentStatus: "unpaid",
      adminActivationStatus: "pending",
    }
    await mockBillingV2Api(page, {
      periods: { ...periods, periods: [periods.periods[0], pendingPeriod] },
    })
    await page.goto("/workspace/billing?tab=packages")

    await expect(page.getByRole("button", { name: "Continue payment · September 2026" })).toHaveCount(1)
    await expect(page.getByText("Payment is pending for Business Launch only.", { exact: true })).toBeVisible()
  })

  test("upgrade status remains attached to the matching plan card", async ({ page }) => {
    await mockBillingV2Api(page, {
      billing: { ...billing, upgrade: { targetPlanId: plan.id, upgradeStatus: "requested" } },
    })
    await page.goto("/workspace/billing?tab=packages")

    await expect(page.getByText("Upgrade requested", { exact: true })).toBeVisible()
  })

  test("unpaid scheduled-after-trial records do not appear as paid schedules", async ({ page }) => {
    await mockBillingV2Api(page, {
      billing: {
        ...billing,
        currentPeriod: null,
        trial: { periodStatus: "active", periodEndAt: "2026-08-31T00:00:00.000Z" },
        records: [{
          ...invoiceRecord,
          metadata: {
            purchaseMode: "after_trial",
            selectedPlanId: plan.id,
            selectedPlanName: plan.name,
            scheduledStartAt: "2026-08-31T00:00:00.000Z",
          },
          paymentStatus: "unpaid",
        }],
      },
      periods: { ...periods, activePeriodId: null, entitlement: null, periods: [] },
    })
    await page.goto("/workspace/billing?tab=packages")

    await expect(page.getByRole("button", { name: "Continue payment" })).toHaveCount(1)
    await expect(page.getByText("Paid plan scheduled", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Payment is pending for Business Launch only.", { exact: true })).toBeVisible()
  })

  test("a confirmed fresh-start blocks further requests while its sequential request is unpaid", async ({ page }) => {
    await mockBillingV2Api(page, {
      billing: {
        ...billing,
        currentPeriod: null,
        trial: { periodStatus: "active", periodEndAt: "2026-08-31T00:00:00.000Z" },
        records: [
          {
            ...invoiceRecord,
            id: "invoice-after-trial-paid",
            invoiceNumber: "ZAY-AFTER-TRIAL-001",
            billingPeriodStart: "2026-08-31T00:00:00.000Z",
            billingPeriodEnd: "2026-09-01T00:00:00.000Z",
            paymentStatus: "paid",
            metadata: {
              purchaseMode: "after_trial",
              purchaseRequestType: "subscription_period",
              selectedPlanId: plan.id,
              selectedPlanName: plan.name,
              scheduledStartAt: "2026-08-31T00:00:00.000Z",
            },
          },
          {
            ...invoiceRecord,
            id: "invoice-sequential-unpaid",
            invoiceNumber: "ZAY-SEQUENTIAL-001",
            billingPeriodStart: "2026-09-01T00:00:00.000Z",
            billingPeriodEnd: "2026-10-01T00:00:00.000Z",
            paymentStatus: "unpaid",
            metadata: {
              purchaseRequestType: "subscription_period",
              selectedPlanId: plan.id,
              selectedPlanName: plan.name,
            },
          },
        ],
      },
      periods: { ...periods, activePeriodId: null, entitlement: null, periodUsage: null, periods: [] },
    })
    await page.goto("/workspace/billing?tab=packages")

    await expect(page.getByRole("button", { name: "Continue payment · September 2026" })).toHaveCount(1)
    await expect(page.getByRole("button", { name: /Request next month/ })).toHaveCount(0)
    await expect(page.getByText("Paid plan scheduled", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Payment is pending for Business Launch only.", { exact: true })).toBeVisible()
  })

  test("pending payment actions remain attached to the selected plan", async ({ page }) => {
    const pendingBilling = { ...billing, records: [pendingInvoice] }
    await mockBillingV2Api(page, {
      billing: pendingBilling,
      plans: [displayPlan, enterprisePlan],
    })
    await page.goto("/workspace/billing?tab=packages")

    await expect(page.getByRole("button", { name: "Continue payment · September 2026" })).toHaveCount(1)
    await expect(page.getByText("Payment is pending for Enterprise Growth only.", { exact: true })).toBeVisible()
    await expect(page.getByText(/Payment pending for Enterprise Growth\./)).toHaveCount(1)
  })

  test("My Plan distinguishes no-plan, trial, and awaiting-activation states", async ({ page }) => {
    const noPlanBilling = { ...billing, plan: null, currentPeriod: null }
    const noPlanPeriods = { ...periods, activePeriodId: null, entitlement: null, periodUsage: null, periods: [] }
    await mockBillingV2Api(page, { billing: noPlanBilling, periods: noPlanPeriods })
    await page.goto("/workspace/billing?tab=my-plan")
    await expect(page.getByTestId("billing-v2-current-period-usage")).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "No active plan", exact: true })).toBeVisible()
    await expect(page.getByTestId("billing-v2-limit-sources")).toHaveCount(0)
    await expect(page.getByText("No prepaid future month is currently queued.", { exact: true })).toBeVisible()

    const trialBilling = {
      ...noPlanBilling,
      trial: { periodStatus: "active", periodEndAt: "2026-08-31T00:00:00.000Z" },
    }
    await mockBillingV2Api(page, { billing: trialBilling, periods: noPlanPeriods })
    await page.goto("/workspace/billing?tab=my-plan")
    await expect(page.getByText("Trial usage", { exact: true })).toBeVisible()
    await expect(page.getByText("Trial active", { exact: true })).toBeVisible()

    const awaitingBilling = {
      ...billing,
      currentPeriod: { ...billing.currentPeriod, adminActivationStatus: "pending" },
    }
    const awaitingPeriods = {
      ...periods,
      entitlement: null,
      periods: periods.periods.map((period, index) =>
        index === 0 ? { ...period, adminActivationStatus: "pending" } : period,
      ),
    }
    await mockBillingV2Api(page, { billing: awaitingBilling, periods: awaitingPeriods })
    await page.goto("/workspace/billing?tab=my-plan")
    await expect(page.getByText("Awaiting activation", { exact: true }).first()).toBeVisible()

    const trialAuthoritativePeriods = {
      ...periods,
      entitlement: {
        ...periods.entitlement,
        periodType: "trial",
        periodStatus: "active",
      },
      periods: awaitingPeriods.periods,
    }
    await mockBillingV2Api(page, {
      billing: {
        ...awaitingBilling,
        trial: { periodStatus: "active", periodEndAt: "2026-08-31T00:00:00.000Z" },
      },
      periods: trialAuthoritativePeriods,
    })
    await page.goto("/workspace/billing?tab=my-plan")
    await expect(page.getByText("Trial usage", { exact: true })).toBeVisible()
    await expect(page.getByText("The paid period is awaiting Platform Admin activation.", { exact: false })).toBeVisible()
    await expect(page.getByText("Awaiting activation", { exact: true }).first()).toBeVisible()
  })

  test("My Plan keeps add-on payment and near-expiry status visible", async ({ page }) => {
    const activeAddOn = {
      id: "addon-active-near-expiry",
      productName: "Message Boost",
      productCode: "message_boost",
      purchaseStatus: "active",
      paymentStatus: "paid",
      purchasePrice: 50000,
      currency: "MMK",
      createdAt: "2026-08-08T00:00:00.000Z",
      expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      components: [{ id: "addon-component", componentType: "inbound_messages", quantity: 5000, unit: "messages" }],
    }
    await mockBillingV2Api(page, { addOnPurchases: [activeAddOn] })
    await page.goto("/workspace/billing?tab=my-plan")

    await expect(page.getByText("Message Boost", { exact: true })).toBeVisible()
    await expect(page.getByText("Paid", { exact: true })).toBeVisible()
    await expect(page.getByText(/Expires in \d+ day/)).toBeVisible()
  })

  test("Billing History exposes invoice details and eligible payment-proof submission", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [invoiceRecord] } })
    await page.goto("/workspace/billing?tab=billing-history")

    await expect(page.getByText(/ZAY-HISTORY-001/).first()).toBeVisible()

    await expect(page.getByRole("columnheader", { name: "Due date" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Confirmed" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Plan Change Requests" })).toHaveCount(0)
    await page.getByRole("button", { name: "Proof", exact: true }).click()
    await expect(page.getByRole("dialog")).toContainText("Submit payment proof")
    await expect(page.locator('input[type="file"]')).toBeVisible()
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled()
  })

  test("Billing History keeps rejected receipts viewable for correction", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [rejectedProofInvoice] } })
    await page.goto("/workspace/billing?tab=billing-history")

    await expect(page.getByRole("button", { name: "Receipt", exact: true })).toBeVisible()
  })

  test("Billing History prevents duplicate submission while proof is under review", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [pendingProofInvoice] } })
    await page.goto("/workspace/billing?tab=billing-history")

    await expect(page.getByRole("table").getByText("Proof submitted", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Submitted" }).click()
    await expect(page.getByRole("dialog")).toContainText("Payment proof is pending operator review")
    await expect(page.getByRole("dialog")).not.toContainText("Submit for review")
  })
})
