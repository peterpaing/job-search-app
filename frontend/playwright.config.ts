import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,

  expect: {
    timeout: 15_000,
  },

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          width: 1440,
          height: 1000,
        },
      },
    },
  ],

  webServer: [
    {
      command: "node e2e/mock-jobs-api.mjs",
      url: "http://localhost:5010/api/jobs",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        JOBS_API_URL: "http://localhost:5010/api/jobs",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
