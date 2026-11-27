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
const LAB_LCP_BUDGET_MS = 2_500;

type LabLcpResult = {
  url: string;
  runs: number[];
  labP75: number;
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

async function measureLcp(page: Page, url: string): Promise<LabLcpResult> {
  const runs: number[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    await page.goto(url, { waitUntil: "load" });
    const startTime = await readLcp(page);
    expect(startTime, `LCP entry on ${url} run ${run + 1}`).toBeGreaterThan(0);
    runs.push(startTime);
  }

  const sorted = [...runs].sort((left, right) => left - right);
  const labP75 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1)] ?? 0;
  return { url, runs, labP75 };
}

/**
 * Lab smoke only, not a field Core Web Vitals measurement:
 * - loopback dev/preview stack, headless Chromium;
 * - no CPU or network throttling;
 * - no real product images, only placeholder blocks;
 * - one machine and five navigations.
 *
 * These numbers catch bundle/render regressions. They are not field p75 and
 * do not prove the DoD "average mobile" budget; field p75 needs RUM or
 * Lighthouse with CPU/network throttling on a real stand (backlog P3).
 */
test("lab LCP smoke stays under 2.5s on catalog and checkout", async ({
  browser,
  request,
}, testInfo) => {
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
      kind: "lab",
      field_p75: false,
      generated_at: new Date().toISOString(),
      base: BASE_URL,
      budget_ms: LAB_LCP_BUDGET_MS,
      runs: RUNS,
      viewport: "390x844 @2x mobile",
      conditions: {
        network: "loopback (localhost / 127.0.0.1)",
        cpu_throttling: "none",
        network_throttling: "none",
        images: "placeholder blocks; no real product images",
        browser: "headless Chromium",
      },
      note: "Lab smoke only. Not field p75 and not the DoD average-mobile metric; field p75 requires RUM or Lighthouse throttling on a real stand (backlog P3).",
      metrics: { catalog: catalogLcp, checkout: checkoutLcp },
    };
    const body = JSON.stringify(evidence, null, 2);
    await writeFile(testInfo.outputPath("lcp-results.json"), body);
    await testInfo.attach("lcp-results.json", { body, contentType: "application/json" });

    expect(catalogLcp.labP75, "catalog lab LCP p75").toBeLessThan(LAB_LCP_BUDGET_MS);
    expect(checkoutLcp.labP75, "checkout lab LCP p75").toBeLessThan(LAB_LCP_BUDGET_MS);
  } finally {
    await context.close();
  }
});
