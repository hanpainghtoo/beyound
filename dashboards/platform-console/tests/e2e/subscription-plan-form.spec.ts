import { expect, test } from "@playwright/test";

const session = {
  accessToken: "phase9-plan-form-test",
  refreshToken: "phase9-plan-form-test-refresh",
  user: {
    id: "phase9-plan-form-admin",
    email: "ops@example.com",
    fullName: "Operations Admin",
    role: "ops_admin",
    type: "platform_admin" as const,
  },
};

const plan = {
  id: "growth",
  name: "Growth",
  description: "Monthly operations plan",
  monthlyPrice: 250000,
  durationDays: 30,
  messageQuotaMode: "combined",
  maxAgents: 10,
  maxChannels: 4,
  messageLimit: 10000,
  inboundMessageLimit: 10000,
  outboundMessageLimit: 5000,
  allowedProviders: ["messenger"],
  storageLimitGb: 10,
  features: {},
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

test("monthly plan form exposes independent limits and unlimited/blocked semantics", async ({
  page,
}) => {
  await page.addInitScript(
    ({ value }) =>
      window.localStorage.setItem("kme-auth-session", JSON.stringify(value)),
    { value: session },
  );
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith("/platform-admin/subscription-plans")
      ? [plan]
      : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/platform-console/subscription-plans");
  await expect(
    page.getByRole("heading", { name: "Plans & Entitlements", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Monthly plan", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Create subscription plan",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Inbound message limit (per month)", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Outbound message limit (per month)", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/unlimited/i).first()).toBeVisible();
  await expect(
    page.getByText("to block that dimension entirely", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/duration/i)).toHaveCount(0);
  await expect(page.getByText(/quota mode/i)).toHaveCount(0);

  // Plan 53: Unlimited toggles, collapsible advanced sections, presets.
  await expect(
    page.getByRole("switch", { name: "Max channels unlimited" }),
  ).toBeVisible();
  await page
    .getByRole("switch", { name: "Max channels unlimited" })
    .click();
  await expect(page.getByText("Unlimited ch", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Landing page wiring/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Landing page wiring/ }).click();
  await expect(
    page.getByText("Visibility & ordering", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /feature flags/i }),
  ).toBeVisible();

  // Validation errors render inline under the field, not as a top banner.
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page.getByText("Plan name is required.", { exact: true })).toBeVisible();
  await expect(page.getByText("Save failed", { exact: false })).toHaveCount(0);
});
