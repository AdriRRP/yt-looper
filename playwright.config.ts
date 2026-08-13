import { defineConfig, devices } from "@playwright/test";

const fixtureCommand = (browser: "chrome" | "firefox" | "safari", port: number): string =>
  process.env.YT_LOOPER_E2E_PREBUILT
    ? `node scripts/fixture-server.mjs --browser=${browser} ${port}`
    : browser === "firefox"
      ? `npm run fixture -- ${port}`
      : `npm run fixture:${browser} -- ${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: fixtureCommand("chrome", 4173),
      url: "http://127.0.0.1:4173/__fixture-browser",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command: fixtureCommand("firefox", 4174),
      url: "http://127.0.0.1:4174/__fixture-browser",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command: fixtureCommand("safari", 4175),
      url: "http://127.0.0.1:4175/__fixture-browser",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command: "node scripts/fixture-server.mjs --browser=chrome --https 4176",
      url: "https://127.0.0.1:4176/__fixture-browser",
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4173" }
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], baseURL: "http://127.0.0.1:4174" }
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], baseURL: "http://127.0.0.1:4175" }
    }
  ]
});
