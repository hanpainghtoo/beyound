import { expect, test, type Page } from "@playwright/test";

const SESSION_KEY = "kme-auth-session";

const product = {
  id: "catalog-product",
  code: "message_api_bundle",
  name: "Message + API Bundle",
  description: "Combined operational capacity.",
  price: 75000,
  currency: "MMK",
  status: "active",
  version: 1,
  metadata: {},
  components: [
    {
      id: "component-inbound",
      componentType: "inbound_messages",
      quantity: 10000,
      unit: "messages",
      displayOrder: 0,
    },
    {
      id: "component-api",
      componentType: "api_requests",
      quantity: 2000,
      unit: "requests",
      displayOrder: 1,
    },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function session(role: string) {
  return {
    accessToken: `phase9-${role}`,
    refreshToken: `phase9-${role}-refresh`,
    user: {
      id: `phase9-${role}-user`,
      email: `${role}@example.com`,
      fullName: role,
      role,
      type: "platform_admin" as const,
    },
  };
}

async function mockCatalog(page: Page, role: string) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: SESSION_KEY, value: session(role) },
  );
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith("/platform-admin/add-on-products")
      ? [product]
      : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test("operations admin can inspect and edit a multi-component top-up product", async ({
  page,
}) => {
  await mockCatalog(page, "ops_admin");
  await page.goto("/platform-console/add-on-products");

  await expect(
    page.getByRole("heading", { name: "Add On Packages", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create product" }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(
    page.getByText("Inbound messages", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("API requests", { exact: true })).toBeVisible();
});

test("finance viewer receives read-only top-up catalog access", async ({
  page,
}) => {
  await mockCatalog(page, "finance_viewer");
  await page.goto("/platform-console/add-on-products");

  await expect(
    page.getByText("Read-only catalog access", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create product" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await expect(
    page.getByText("Message + API Bundle", { exact: true }),
  ).toBeVisible();
});

test("server permission errors remain visible instead of enabling catalog actions", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: SESSION_KEY, value: session("finance_viewer") },
  );
  await page.route(
    "**/api/proxy/platform-admin/add-on-products",
    async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Platform catalog permission required",
        }),
      });
    },
  );
  await page.goto("/platform-console/add-on-products");

  await expect(
    page.getByText("Catalog request failed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Platform catalog permission required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create product" }),
  ).toBeDisabled();
});
