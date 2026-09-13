import { defineConfig, devices } from "@playwright/test"

const externalDashboardUrl = process.env.CSR_DASHBOARD_URL

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: externalDashboardUrl || "http://127.0.0.1:6110",
    trace: "retain-on-failure",
  },
  ...(externalDashboardUrl
    ? {}
    : {
        webServer: {
          command: "npm run build && npm run start -- --port 6110",
          url: "http://127.0.0.1:6110",
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
