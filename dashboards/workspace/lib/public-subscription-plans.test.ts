import test from "node:test"
import assert from "node:assert/strict"

import { toDisplayPlan } from "./public-subscription-plans"

test("renders public displayed pricing from API-provided commercial values", () => {
  const displayed = toDisplayPlan({
    id: "plan-growth",
    name: "Growth",
    description: "Scaled plan",
    monthlyPrice: 777000,
    durationDays: 14,
    messageQuotaMode: "combined",
    maxCsrs: 12,
    maxChannels: 3,
    messageLimit: 1000,
    inboundMessageLimit: 800,
    outboundMessageLimit: 200,
    allowedProviders: ["messenger", "telegram"],
    apiLimit: 500,
    storageLimitGb: 10,
    status: "active",
    public: {
      currencyCode: "MMK",
      billingInterval: "monthly",
      setupFeeMmk: 1250000,
      featureList: ["Priority support"],
    },
  })

  assert.equal(displayed.monthlyPriceDisplay, "MMK 777,000 / month")
  assert.equal(displayed.periodDurationLabel, "Monthly subscription")
  assert.equal(displayed.setupFeeDisplay, "MMK 1,250,000")
  assert.deepEqual(displayed.featureList, ["Priority support"])
  assert.equal(displayed.includedUsersLabel, "Up to 12 team members")
  assert.equal(displayed.includedChannelsLabel, "Up to 3 supported channels")
  assert.equal(displayed.supportedProvidersLabel, "MESSENGER · TELEGRAM")
})

test("does not fall back to stale hardcoded commercial pricing when API details are missing", () => {
  const displayed = toDisplayPlan({
    id: "plan-launch",
    name: "Business Launch",
    description: "Primary package",
    monthlyPrice: 500000,
    durationDays: 30,
    messageQuotaMode: "combined",
    maxCsrs: 5,
    maxChannels: 2,
    messageLimit: 20000,
    inboundMessageLimit: 16000,
    outboundMessageLimit: 4000,
    allowedProviders: ["messenger"],
    apiLimit: 50000,
    storageLimitGb: 10,
    status: "active",
    public: {},
  })

  assert.equal(displayed.monthlyPriceDisplay, "Pricing unavailable")
  assert.equal(displayed.periodDurationLabel, "Custom period")
  assert.equal(displayed.setupFeeDisplay, "Pricing unavailable")
  assert.deepEqual(displayed.featureList, [])
  assert.equal(displayed.supportedProvidersLabel, "MESSENGER")
})
