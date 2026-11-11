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
  maxAgents: 5,
  maxChannels: 2,
  messageLimit: 20000,
  inboundMessageLimit: 16000,
  outboundMessageLimit: 4000,
  allowedProviders: ["messenger", "telegram"],
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
    maxAgents: plan.maxAgents,
    maxChannels: plan.maxChannels,
    messageLimit: plan.messageLimit,
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

// E2E mock gap fix (2026-09-09): usage-summary was unmocked, so the mock
// returned {} and buildQuotaView crashed reading effectiveLimits (every
// billing test failed with a client-side exception). Low, warning-free
// usage keeps banner assertions deterministic.
// Live billing-accounts module shape (Plan 31): grouped bank/wallet items
// with real ids, numbers, and QR. Unmatched by default — tests opt in;
// without it the UI falls back to hardcoded constants.
const liveBillingAccounts = [
  {
    type: "bank_account",
    name: "Bank Account",
    items: [
      {
        id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        icon: "https://files.test/icon-kbzbank.png",
        account_name: "ZayOS KBZ Bank",
        account_no: "123-456-789",
      },
    ],
  },
  {
    type: "digital_wallet",
    name: "Digital Wallet",
    items: [
      {
        id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        icon: "https://files.test/icon-kbzpay.png",
        account_name: "ZayOS KBZPay",
        ph_no: "09123456789",
        qr: "https://files.test/qr-kbzpay.png",
      },
    ],
  },
]

const usageSummary = {
  tenantId: "billing-v2-tenant",
  scope: "period_scoped",
  activePeriodId: "period-current",
  planId: plan.id,
  periodStart: "2026-08-01T00:00:00.000Z",
  periodEnd: "2026-09-01T00:00:00.000Z",
  baseLimits: {
    inbound_messages: 12000,
    outbound_messages: 3000,
    channel_slots: 2,
    storage_gb: 10,
    team_members: 5,
  },
  activeTopUpComponentTotals: { inbound_messages: 3000, outbound_messages: 500 },
  effectiveLimits: {
    inbound_messages: 16000,
    outbound_messages: 4000,
    channel_slots: 2,
    storage_gb: 10,
    team_members: 5,
  },
  inboundMessages: { used: 3000, limit: 16000, remaining: 13000, limitReached: false },
  outboundMessages: { used: 1000, limit: 4000, remaining: 3000, limitReached: false },
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
      channel_slots: 2,
      storage_gb: 10,
      team_members: 5,
    },
    carryover: {
      inboundMessages: 1000,
      outboundMessages: 500,
    },
    activeTopUpComponentTotals: {
      inbound_messages: 3000,
      outbound_messages: 500,
    },
    // E2E fixture fix (2026-09-09): the real API always returns quotaState
    // (built for every dimension); omitting it crashed buildQuotaView on
    // `entitlement?.quotaState[dim]` and blanked the whole suite.
    quotaState: {
      inbound_messages: { blocked: false },
      outbound_messages: { blocked: false },
      channel_slots: { blocked: false },
      storage_gb: { blocked: false },
      team_members: { blocked: false },
    },
    effectiveLimits: {
      inbound_messages: 16000,
      outbound_messages: 4000,
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
    usageSummary?: unknown
    billingAccounts?: unknown
  } = {},
) {
  // Created records live in this mock's closure so the invoice page resolves
  // post-redirect (mirrors the app's invalidate + refetch before navigation).
  const createdInvoices: Record<string, unknown>[] = []
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const pathname = url.pathname
    const method = route.request().method()
    let body: unknown = {}

    if (pathname.endsWith("/tenant/billing")) {
      const base = (overrides.billing ?? billing) as Record<string, unknown>
      body = { ...base, records: [...((base.records as unknown[]) || []), ...createdInvoices] }
    }
    else if (pathname.endsWith("/tenant/subscription/periods")) body = overrides.periods ?? periods
    else if (pathname.endsWith("/tenant/usage-summary")) body = overrides.usageSummary ?? usageSummary
    else if (pathname.endsWith("/tenant/add-on-products")) body = overrides.addOnProducts ?? []
    else if (pathname.endsWith("/tenant/add-on-purchases")) {
      if (method === "POST") {
        let payload: Record<string, unknown> = {}
        try {
          payload = (route.request().postDataJSON() || {}) as Record<string, unknown>
        } catch {
          payload = {}
        }
        const addonRecord = {
          ...invoiceRecord,
          id: "invoice-addon-request",
          invoiceNo: "INV-00032",
          subscriptionPlanId: null,
          metadata: {
            purchaseRequestType: "top_up",
            productId: payload.productId || "addon-1",
            productName: "Message Boost",
          },
        }
        createdInvoices.push(addonRecord)
        body = {
          id: "purchase-addon-1",
          tenantId: "billing-v2-tenant",
          subscriptionPeriodId: "period-current",
          productId: payload.productId || "addon-1",
          billingRecordId: "invoice-addon-request",
          productName: "Message Boost",
          purchasePrice: 50000,
          currency: "MMK",
          paymentStatus: "pending",
          purchaseStatus: "pending",
          createdAt: "2026-09-10T00:00:00.000Z",
          updatedAt: "2026-09-10T00:00:00.000Z",
        }
      } else {
        body = overrides.addOnPurchases ?? []
      }
    }
    else if (pathname.endsWith("/tenant/billing/plan-change-requests")) body = []
    else if (pathname.endsWith("/public-subscription-plans")) body = overrides.plans ?? [displayPlan]
    else if (/\/public\/subscription-plans\/[^/]+$/.test(pathname)) {
      const id = pathname.split("/").pop()
      const found = (overrides.plans ?? [displayPlan]).find(
        (item: unknown) =>
          typeof item === "object" && item !== null && (item as { id?: unknown }).id === id,
      )
      if (!found) {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
        return
      }
      body = found
    }
    else if (pathname.endsWith("/public/billing-accounts")) body = overrides.billingAccounts ?? liveBillingAccounts
    else if (pathname.endsWith("/tenant/billing/purchase-requests") && method === "POST") {
      let payload: Record<string, unknown> = {}
      try {
        payload = (route.request().postDataJSON() || {}) as Record<string, unknown>
      } catch {
        payload = {}
      }
      const createdRecord = {
        ...invoiceRecord,
        id: "invoice-request-payment",
        invoiceNo: "INV-00030",
        subscriptionPlanId: payload.subscriptionPlanId || plan.id,
        metadata: {
          selectedPlanId: payload.subscriptionPlanId || plan.id,
          selectedPlanName: plan.name,
          ...(typeof payload.paymentMethod === "string" ? { selectedPaymentMethod: payload.paymentMethod } : {}),
          ...(typeof payload.paymentAccount === "string" ? { selectedPaymentAccount: payload.paymentAccount } : {}),
          ...(typeof payload.note === "string" ? { requestNote: payload.note } : {}),
        },
      }
      createdInvoices.push(createdRecord)
      body = {
        billingRecord: createdRecord,
        purchase: {
          startOption: payload.startOption || "current_month",
          monthStartAt: "2026-09-01T00:00:00.000Z",
          monthEndAt: "2026-10-01T00:00:00.000Z",
          amountDue: 500000,
          currency: "MMK",
          reviewStatus: "in_review",
          periodStatus: "pending_activation",
        },
      }
    } else if (/\/tenant\/billing\/[^/]+\/payment-proof$/.test(pathname) && method === "POST") {
      body = {
        message: "Payment proof submitted for review",
        billingRecordId: "invoice-request-payment",
        paymentStatus: "proof_submitted",
        proof: { id: "proof-1", status: "pending_review" },
      }
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    })
  })
  // Mocked scenarios assume a signed-in workspace (the billing pages render
  // the marketing landing without a session). Tests without mocks target a
  // live seeded stack instead.
  await authenticate(page)
}

const pendingInvoice = {
  id: "invoice-pending-enterprise",
  invoiceNo: "INV-00021",
  billingPeriodStart: "2026-09-01T00:00:00.000Z",
  billingPeriodEnd: "2026-10-01T00:00:00.000Z",
  reviewStatus: "in_review",
  amountDue: 750000,
  amountPaid: 0,
  currency: "MMK",
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
  invoiceNo: "INV-00020",
  billingPeriodStart: "2026-08-01T00:00:00.000Z",
  billingPeriodEnd: "2026-09-01T00:00:00.000Z",
  reviewStatus: "in_review",
  amountDue: 500000,
  amountPaid: 0,
  currency: "MMK",
  paidAt: null,
  subscriptionPlan: { id: plan.id, name: plan.name },
  metadata: { selectedPlanName: plan.name },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

const rejectedProofInvoice = {
  ...invoiceRecord,
  id: "invoice-proof-rejected",
  invoiceNo: "INV-00022",
  reviewStatus: "reject",
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
  invoiceNo: "INV-00023",
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
            reviewStatus: "in_review",
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
            invoiceNo: "INV-00024",
            billingPeriodStart: "2026-08-31T00:00:00.000Z",
            billingPeriodEnd: "2026-09-01T00:00:00.000Z",
            reviewStatus: "confirm",
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
            invoiceNo: "INV-00025",
            billingPeriodStart: "2026-09-01T00:00:00.000Z",
            billingPeriodEnd: "2026-10-01T00:00:00.000Z",
            reviewStatus: "in_review",
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

  test("trial awaiting banner hides once the after-trial period is admin-approved", async ({ page }) => {
    const afterTrialInvoice = {
      ...invoiceRecord,
      id: "invoice-after-trial-banner",
      invoiceNo: "INV-00026",
      billingPeriodStart: "2026-09-01T00:00:00.000Z",
      billingPeriodEnd: "2026-10-01T00:00:00.000Z",
      reviewStatus: "confirm",
      metadata: {
        purchaseMode: "after_trial",
        purchaseRequestType: "subscription_period",
        selectedPlanId: plan.id,
        selectedPlanName: plan.name,
        scheduledStartAt: "2026-09-15T00:00:00.000Z",
      },
    }
    const trialEntitlementPeriods = (activation: "pending" | "approved") => ({
      ...periods,
      activePeriodId: null,
      entitlement: {
        tenantId: "billing-v2-tenant",
        activePeriodId: "period-trial",
        planId: null,
        periodType: "trial",
        periodStatus: "active",
        quotaState: {
          inbound_messages: { blocked: false },
          outbound_messages: { blocked: false },
          channel_slots: { blocked: false },
          storage_gb: { blocked: false },
          team_members: { blocked: false },
        },
      },
      periods: [
        {
          id: "period-trial",
          planId: "trial-plan",
          periodType: "trial",
          periodStatus: "active",
          paymentStatus: "pending",
          adminActivationStatus: "approved",
          monthStartAt: null,
          monthEndAt: null,
          periodStartAt: "2026-09-08T00:00:00.000Z",
          periodEndAt: "2026-09-15T00:00:00.000Z",
          sequenceNumber: 1,
        },
        {
          id: "period-after-trial",
          planId: plan.id,
          billingRecordId: "invoice-after-trial-banner",
          periodType: "paid",
          periodStatus: "upcoming",
          paymentStatus: "paid",
          adminActivationStatus: activation,
          monthStartAt: "2026-09-01T00:00:00.000Z",
          monthEndAt: "2026-10-01T00:00:00.000Z",
          periodStartAt: "2026-09-15T00:00:00.000Z",
          periodEndAt: "2026-10-01T00:00:00.000Z",
          sequenceNumber: 2,
        },
      ],
    })
    const trialBilling = {
      ...billing,
      currentPeriod: null,
      trial: { periodStatus: "active", periodEndAt: "2026-09-15T00:00:00.000Z" },
      records: [afterTrialInvoice],
    }
    await mockBillingV2Api(page, {
      billing: trialBilling,
      periods: trialEntitlementPeriods("pending"),
    })
    await page.goto("/workspace/billing?tab=packages")

    await expect(page.getByText("Your Trial Plan remains active", { exact: false })).toHaveCount(1)

    await mockBillingV2Api(page, {
      billing: trialBilling,
      periods: trialEntitlementPeriods("approved"),
    })
    await page.reload()
    await expect(page.getByText("Your Trial Plan remains active", { exact: false })).toHaveCount(0)
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
    await expect(page.getByText("No active plan yet", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Browse packages", exact: true }).click()
    await expect(page).toHaveURL(/tab=packages/)
    await expect(page.getByTestId("billing-v2-main-plan-section")).toHaveCount(0)
    await expect(page.getByTestId("billing-v2-addon-packages")).toHaveCount(0)
    await expect(page.getByTestId("billing-v2-upcoming-plans")).toHaveCount(0)

    const trialBilling = {
      ...noPlanBilling,
      trial: { periodStatus: "active", periodEndAt: "2026-08-31T00:00:00.000Z" },
    }
    // Trial usage renders inside the usage section, which requires an
    // entitlement — mirror the trial-authoritative shape used below.
    const trialPeriods = {
      ...noPlanPeriods,
      entitlement: {
        tenantId: "billing-v2-tenant",
        activePeriodId: null,
        planId: null,
        periodType: "trial",
        periodStatus: "active",
        quotaState: {
          inbound_messages: { blocked: false },
          outbound_messages: { blocked: false },
          channel_slots: { blocked: false },
          storage_gb: { blocked: false },
          team_members: { blocked: false },
        },
      },
    }
    await mockBillingV2Api(page, { billing: trialBilling, periods: trialPeriods })
    await page.goto("/workspace/billing?tab=my-plan")
    // Client-side navigation keeps React Query cache: reload so the new mocks apply.
    await page.reload()
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
    await page.reload()
    await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible()
    await expect(page.getByTestId("billing-v2-main-plan-section")).toHaveCount(0)
    await expect(page.getByTestId("billing-v2-addon-packages")).toHaveCount(0)

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
    await page.reload()
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

  test("Billing History exposes one status-driven modal with proof submission", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [invoiceRecord] }, periods: { ...periods, entitlement: null } })
    await page.goto("/workspace/billing?tab=billing-history")

    await expect(page.getByText(/INV-00020/).first()).toBeVisible()

    await expect(page.getByRole("columnheader", { name: "Confirmed" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Plan Change Requests" })).toHaveCount(0)
    await page.getByRole("button", { name: "Submit proof", exact: true }).click()
    await expect(page.getByRole("dialog")).toContainText("Invoice: In review")
    await expect(page.getByRole("dialog")).toContainText("Payment: Unpaid")
    await expect(page.locator('input[type="file"]')).toBeVisible()
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled()
  })

  test("Billing History shows a dead-invoice notice for invoice-rejected records", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [rejectedProofInvoice] } })
    await page.goto("/workspace/billing?tab=billing-history")

    await page.getByRole("button", { name: "View status", exact: true }).click()
    await expect(page.getByRole("dialog")).toContainText("Invoice: Rejected")
    await expect(page.getByRole("dialog")).toContainText("This invoice was rejected by the billing team")
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
  })

  test("Billing History prevents duplicate submission while proof is under review", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [pendingProofInvoice] } })
    await page.goto("/workspace/billing?tab=billing-history")

    await expect(page.getByRole("table").getByText("In review", { exact: true }).first()).toBeVisible()
    await page.getByRole("button", { name: "View status" }).click()
    await expect(page.getByRole("dialog")).toContainText("Payment proof is pending operator review")
    await expect(page.getByRole("dialog")).not.toContainText("Submit for review")
  })

  test("Invoice page renders the printable document with totals and entry button", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [invoiceRecord] } })
    await page.goto("/workspace/billing?tab=billing-history")

    await page.getByRole("link", { name: "Invoice", exact: true }).click()
    await expect(page).toHaveURL(/workspace\/billing\/invoice\/invoice-history-001/)
    await expect(page.getByText(/INV-00020/).first()).toBeVisible()
    await expect(page.getByText("Balance due", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Print invoice", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Back to history", exact: true })).toBeVisible()
    // Unpaid record: no Paid row, no reference row (missing fields hide).
    await expect(page.getByText("Reference:", { exact: true })).toHaveCount(0)
  })

  test("Invoice page shows not-found for unknown ids", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [invoiceRecord] } })
    await page.goto("/workspace/billing/invoice/does-not-exist")

    await expect(page.getByText("Invoice not found.", { exact: true })).toBeVisible()
  })

  test("Contact-only plans show talk-to-sales instead of the payment form", async ({ page }) => {
    const contactPlan = {
      ...displayPlan,
      id: "contact-plan-1",
      name: "Enterprise Custom",
      availability: "contact-only",
      ctaLabel: "Talk to sales",
      ctaHref: "/contact?planId=contact-plan-1",
    }
    await mockBillingV2Api(page, { plans: [contactPlan] })
    await page.goto("/workspace/billing/request-payment?planId=contact-plan-1&startOption=current_month")

    await expect(page.getByText("Talk to sales", { exact: true }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Submit Request", exact: true })).toHaveCount(0)
    await expect(page.getByText("Enterprise Custom", { exact: true }).first()).toBeVisible()
  })

  test("Request payment routes from Packages and shows the one-shot banner", async ({ page }) => {
    await mockBillingV2Api(page, {
      billing: { ...billing, plan: null, currentPeriod: null, trial: null },
      periods: { ...periods, activePeriodId: null, entitlement: null, periodUsage: null, periods: [] },
    })
    await page.goto("/workspace/billing?tab=packages")

    await page.getByRole("button", { name: /Request this month/ }).first().click()
    await expect(page).toHaveURL(/workspace\/billing\/request-payment\?planId=.*&startOption=current_month/)
    await expect(page.getByRole("heading", { name: "Payment & Receipt" })).toBeVisible()
    await expect(page.getByText("Business Launch", { exact: true }).first()).toBeVisible()
    // Amount is static full plan price (F1): no editable numeric input.
    await expect(page.getByText("Amount to pay", { exact: true })).toBeVisible()
    await expect(page.locator('input[inputmode="numeric"]')).toHaveCount(0)

    await page.getByRole("button", { name: /Digital Wallet/ }).click()
    await page.getByRole("button", { name: /KBZPay/ }).first().click()
    await page.getByRole("button", { name: "Submit Request", exact: true }).click()

    await expect(page).toHaveURL(/workspace\/billing\/invoice\/invoice-request-payment/)
    await expect(page.getByText("Invoice sent", { exact: true })).toBeVisible()
    await expect(page.getByText(/emailed to/, { exact: false })).toBeVisible()
    // F2: the document itself must resolve post-redirect, not just the banner.
    await expect(page.getByText(/INV-00030/).first()).toBeVisible()
    await expect(page.getByText("Balance due", { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByText("Invoice sent", { exact: true })).toHaveCount(0)
  })

  test("Request payment lists live billing accounts with real ids", async ({ page }) => {
    await mockBillingV2Api(page, {
      billing: { ...billing, plan: null, currentPeriod: null, trial: null },
      periods: { ...periods, activePeriodId: null, entitlement: null, periodUsage: null, periods: [] },
      billingAccounts: liveBillingAccounts,
    })
    await page.goto("/workspace/billing?tab=packages")
    await page.getByRole("button", { name: /Request this month/ }).first().click()
    await expect(page).toHaveURL(/workspace\/billing\/request-payment/)

    await page.getByRole("button", { name: /Bank Account/ }).click()
    await expect(page.getByText("ZayOS KBZ Bank", { exact: true })).toBeVisible()
    await expect(page.locator('img[src="https://files.test/icon-kbzbank.png"]').first()).toBeVisible()
    await page.getByRole("button", { name: /Digital Wallet/ }).click()
    await expect(page.getByText("ZayOS KBZPay", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: /ZayOS KBZPay/ }).first().click()
    await expect(page.getByAltText("ZayOS KBZPay payment QR").first()).toBeVisible()
    await expect(page.getByRole("radio", { name: "ZayOS KBZPay selected" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Copy ZayOS KBZPay number", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Download QR", exact: true })).toBeVisible()
  })

  test("Request payment shows unavailable state instead of stale accounts", async ({ page }) => {
    await mockBillingV2Api(page, {
      billing: { ...billing, plan: null, currentPeriod: null, trial: null },
      periods: { ...periods, activePeriodId: null, entitlement: null, periodUsage: null, periods: [] },
      billingAccounts: { unexpected: "shape" },
    })
    await page.goto("/workspace/billing?tab=packages")
    await page.getByRole("button", { name: /Request this month/ }).first().click()
    await expect(page).toHaveURL(/workspace\/billing\/request-payment/)

    // No stale hardcoded names (e.g. WavePay) may appear.
    await expect(page.getByText("Payment accounts are currently unavailable.", { exact: true })).toBeVisible()
    await expect(page.getByText("WavePay", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Submit Request", exact: true })).toBeDisabled()
  })

  test("Pay-to box highlights the selected live account with QR", async ({ page }) => {
    // Unpaid + no proof → form branch renders the Pay-to box (pending proofs
    // show the read-only view instead, which carries no Pay-to).
    const unpaidLiveAccountInvoice = {
      ...invoiceRecord,
      id: "invoice-live-account",
      invoiceNo: "INV-00031",
      metadata: {
        selectedPlanId: plan.id,
        selectedPlanName: plan.name,
        selectedPaymentAccountId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      },
    }
    await mockBillingV2Api(page, {
      billing: { ...billing, records: [unpaidLiveAccountInvoice] },
      billingAccounts: liveBillingAccounts,
    })
    await page.goto("/workspace/billing?tab=billing-history")

    await page.getByRole("button", { name: "Submit proof", exact: true }).click()
    await expect(page.getByRole("dialog")).toContainText("ZayOS KBZPay · selected")
    await expect(page.getByAltText("ZayOS KBZPay payment QR")).toBeVisible()
  })

  test("History modal is file-only with frozen payment info", async ({ page }) => {
    await mockBillingV2Api(page, { billing: { ...billing, records: [invoiceRecord] } })
    await page.goto("/workspace/billing?tab=billing-history")

    await page.getByRole("button", { name: "Submit proof", exact: true }).click()
    // Frozen info renders as text; no editable method/date/amount inputs.
    await expect(page.getByRole("dialog")).toContainText("Amount to pay")
    await expect(page.locator('input[type="date"]')).toHaveCount(0)
    await expect(page.locator('input[inputmode="numeric"]')).toHaveCount(0)
  })

  test("Add-on request routes through the payment page to its invoice", async ({ page }) => {
    const addonProduct = {
      id: "addon-1",
      name: "Message Boost",
      description: "Extra message capacity.",
      price: 50000,
      currency: "MMK",
      components: [
        { id: "component-1", componentType: "inbound_messages", quantity: 1000, unit: "messages" },
      ],
    }
    await mockBillingV2Api(page, { addOnProducts: [addonProduct] })
    await page.goto("/workspace/billing?tab=packages")

    await page.getByRole("button", { name: "Add to Plan", exact: true }).click()
    await expect(page).toHaveURL(/workspace\/billing\/request-payment\?productId=addon-1/)
    await expect(page.getByText("Selected Add-On", { exact: true })).toBeVisible()
    await expect(page.getByText("Message Boost", { exact: true }).first()).toBeVisible()

    await page.getByRole("button", { name: /Bank Account/ }).click()
    await page.getByRole("button", { name: /ZayOS KBZ Bank/ }).first().click()
    await page.getByRole("button", { name: "Submit Request", exact: true }).click()

    await expect(page).toHaveURL(/workspace\/billing\/invoice\/invoice-addon-request/)
    await expect(page.getByText(/INV-00032/).first()).toBeVisible()
    await expect(page.getByText("Balance due", { exact: true })).toBeVisible()
  })
})
