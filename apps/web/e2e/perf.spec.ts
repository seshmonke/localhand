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

/**
 * The budget is a gate only for the built preview bundle (port 4173) or when
 * PERF_ENFORCE=1 is set explicitly. The unbundled dev server is informational:
 * it is slower by nature and must not hide a preview regression.
 */
function isPreviewOrForced(): boolean {
  if (process.env.PERF_ENFORCE === "1") {
    return true;
  }

  try {
    return new URL(BASE_URL).port === "4173";
  } catch {
    return false;
  }
}

// Lighthouse "mobileSlow4G" preset: 150 ms RTT, 1.6 Mbps down, 750 kbps up,
// 4x CPU slowdown. Applied through Chrome DevTools Protocol for this lab smoke.
// https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md
const SLOW_4G = {
  latency: 150,
  downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.round((750 * 1024) / 8),
};
const CPU_THROTTLE_RATE = 4;

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
        }, 500);
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

async function enableLabThrottling(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: SLOW_4G.latency,
    downloadThroughput: SLOW_4G.downloadThroughput,
    uploadThroughput: SLOW_4G.uploadThroughput,
    connectionType: "cellular4g",
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
}

/**
 * Lab smoke only, not a field Core Web Vitals measurement:
 * - loopback dev/preview stack, headless Chromium;
 * - CDP Slow 4G (150 ms RTT, 1.6 Mbps down / 750 kbps up) and 4x CPU;
 * - no real product images, only placeholder blocks;
 * - one machine and five navigations.
 *
 * The 2.5 s budget is enforced on preview (port 4173) or with PERF_ENFORCE=1;
 * the unbundled dev server is informational. These numbers are not field p75
 * and do not prove the DoD "average mobile" budget; field p75 needs RUM or
 * real-device/Lighthouse field data (backlog P3, owner exception required to
 * close without it).
 */
test("lab LCP smoke on catalog and checkout", async ({ browser, request }, testInfo) => {
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

    // CDP Slow 4G + 4x CPU: still a lab measurement, not field p75.
    await enableLabThrottling(page);

    const catalogLcp = await measureLcp(page, "/");
    const checkoutLcp = await measureLcp(page, "/checkout");

    const enforceBudget = isPreviewOrForced();

    const budget = {
      limit_ms: LAB_LCP_BUDGET_MS,
      enforced: enforceBudget,
      target: enforceBudget ? "preview-or-forced" : "dev-info",
      catalog_met: catalogLcp.labP75 < LAB_LCP_BUDGET_MS,
      checkout_met: checkoutLcp.labP75 < LAB_LCP_BUDGET_MS,
      note: enforceBudget
        ? "Enforced on the built preview bundle (or PERF_ENFORCE=1): both pages must stay under the lab budget; a regression fails the run."
        : "Information only on the unbundled dev server: exceedance is recorded as an annotation and JSON fact, not a failure. The preview gate is the reference.",
    };

    for (const result of [catalogLcp, checkoutLcp]) {
      if (result.labP75 >= LAB_LCP_BUDGET_MS) {
        const description = `${result.url}: lab p75 ${result.labP75} ms >= ${LAB_LCP_BUDGET_MS} ms`;
        testInfo.annotations.push({ type: "lab-lcp-over-budget", description });
        console.warn(`[lab-lcp-over-budget] ${description}`);
      }
    }

    const evidence = {
      kind: "lab",
      field_p75: false,
      generated_at: new Date().toISOString(),
      base: BASE_URL,
      budget,
      runs: RUNS,
      viewport: "390x844 @2x mobile",
      conditions: {
        network: "CDP Slow 4G: 150 ms RTT, 1.6 Mbps down, 750 kbps up",
        cpu_throttling: "4x (CDP Emulation.setCPUThrottlingRate)",
        network_throttling: "CDP Network.emulateNetworkConditions (Lighthouse mobileSlow4G preset)",
        images: "placeholder blocks; no real product images",
        browser: "headless Chromium",
      },
      note: "Lab smoke only. Not field p75 and not the DoD average-mobile metric; field p75 requires RUM or real-device/Lighthouse field data (backlog P3).",
      metrics: { catalog: catalogLcp, checkout: checkoutLcp },
    };
    const body = JSON.stringify(evidence, null, 2);
    await writeFile(testInfo.outputPath("lcp-results.json"), body);
    await testInfo.attach("lcp-results.json", { body, contentType: "application/json" });

    if (enforceBudget) {
      expect(catalogLcp.labP75, "catalog lab LCP p75 (preview gate)").toBeLessThan(
        LAB_LCP_BUDGET_MS,
      );
      expect(checkoutLcp.labP75, "checkout lab LCP p75 (preview gate)").toBeLessThan(
        LAB_LCP_BUDGET_MS,
      );
    }
  } finally {
    await context.close();
  }
});
