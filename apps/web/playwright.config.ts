import { defineConfig, devices } from "@playwright/test";

/**
 * Browser e2e for the buyer core. This is a manual local gate, not part of CI:
 * CI runs only API e2e through `pnpm verify`. Run the stack yourself with
 * `pnpm dev` (web :5173, API :3000 with the dev OTP provider) and execute
 * `pnpm test:e2e`; evidence is the run log plus step screenshots, and
 * video/trace/screenshots are retained on failure.
 *
 * For a lab smoke on the built bundle, run `pnpm preview` and set
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173. On preview the 2.5 s LCP lab
 * budget is enforced; on the unbundled dev server it is informational (or set
 * PERF_ENFORCE=1 to enforce it there too). LCP numbers are lab-only: loopback,
 * CDP Slow 4G + 4x CPU, no real images. They are not field p75 and do not
 * replace the DoD average-mobile measurement.
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
    video: "retain-on-failure",
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
