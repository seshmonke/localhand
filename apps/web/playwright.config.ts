import { defineConfig, devices } from "@playwright/test";

/**
 * Browser e2e for the buyer core.
 *
 * The stack is not started automatically: run `pnpm dev` first (web :5173, API
 * :3000 with the dev OTP provider) and, optionally, seed the database. The
 * tests create their own seller, shop, products and orders through the public
 * API using fake phones.
 *
 * For production-like numbers (LCP, bundle) build the web app and run
 * `pnpm preview`, then set PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
// Escape hatch for machines where Playwright browsers are not installable:
// point at a local Chromium/Chrome binary without hardcoding a path in the repo.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "ru-RU",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
});
