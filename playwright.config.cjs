// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./ci/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:8765",
    trace: "on-first-retry",
  },
  webServer: {
    command: "python3 -m http.server 8765",
    url: "http://127.0.0.1:8765/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
