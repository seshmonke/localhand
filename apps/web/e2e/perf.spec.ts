import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  BASE_URL,
  cartStateFor,
  createPublishedCatalog,
  loginViaApi,
  seedBrowserSession,
  uniquePhone,
} from "./helpers.js";

const RUNS = 5;
const LCP_BUDGET_MS = 2_500;

type LcpResult = {
  url: string;
  runs: number[];
  p75: number;
};

/**
 * Reads the final largest-contentful-paint entry of the current document via
 * PerformanceObserver. Entries are buffered, so the observer sees paints that
 * happened before it was registered.
 */
async function readLcp(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let largest = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            largest = entry.startTime;
          }
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });
        window.setTimeout(() => {
          observer.disconnect();
          resolve(Math.round(largest));
        }, 300);
      }),
  );
}

async function measureLcp(page: Page, url: string): Promise<LcpResult> {
  const runs: number[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    await page.goto(url, { waitUntil: "load" });
    const startTime = await readLcp(page);
    expect(startTime, `LCP entry on ${url} run ${run + 1}`).toBeGreaterThan(0);
    runs.push(startTime);
  }

  const sorted = [...runs].sort((left, right) => left - right);
  const p75 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1)] ?? 0;
  return { url, runs, p75 };
}

/**
 * Core Web Vitals evidence: LCP p75 over five navigations on the catalog and
 * the checkout, measured in Chromium with PerformanceObserver. The stack is the
 * one from `pnpm dev` (or a production preview via PLAYWRIGHT_BASE_URL).
 */
test("LCP p75 stays under 2.5s on catalog and checkout", async ({ browser, request }, testInfo) => {
  test.slow();

  const catalog = await createPublishedCatalog(request);
  const buyer = await loginViaApi(request, uniquePhone());

  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
  });

  try {
    await seedBrowserSession(context, buyer, cartStateFor(catalog));
    const page = await context.newPage();

    // Warm up the dev server module graph before measuring, so the first run
    // reflects the page and not a cold transform of every module.
    await page.goto("/", { waitUntil: "load" });

    const catalogLcp = await measureLcp(page, "/");
    const checkoutLcp = await measureLcp(page, "/checkout");

    const evidence = {
      generated_at: new Date().toISOString(),
      base: BASE_URL,
      budget_ms: LCP_BUDGET_MS,
      runs: RUNS,
      viewport: "390x844 @2x mobile",
      metrics: { catalog: catalogLcp, checkout: checkoutLcp },
    };
    const body = JSON.stringify(evidence, null, 2);
    await writeFile(testInfo.outputPath("lcp-results.json"), body);
    await testInfo.attach("lcp-results.json", { body, contentType: "application/json" });

    expect(catalogLcp.p75, "catalog LCP p75").toBeLessThan(LCP_BUDGET_MS);
    expect(checkoutLcp.p75, "checkout LCP p75").toBeLessThan(LCP_BUDGET_MS);
  } finally {
    await context.close();
  }
});
