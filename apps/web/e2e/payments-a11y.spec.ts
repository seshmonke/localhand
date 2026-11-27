import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, seedBrowserSession } from "./helpers.js";
import { createPaymentsFixture } from "./payments-helpers.js";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

const viewports = [
  { key: "320", width: 320, height: 800 },
  { key: "1440", width: 1440, height: 900 },
] as const;

const themes = ["light", "dark"] as const;

type ScanResult = {
  url: string;
  testEngine: { name: string; version: string };
  violations: Array<{ id: string; impact: string | null; help: string; nodes: number }>;
};

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-theme", value);
  }, theme);
  await page.waitForTimeout(100);
}

async function scan(page: Page, key: string, scans: Record<string, ScanResult>): Promise<void> {
  const analysis = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
  const serious = analysis.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  scans[key] = {
    url: page.url(),
    testEngine: { name: analysis.testEngine.name, version: analysis.testEngine.version },
    violations: analysis.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      nodes: violation.nodes.length,
    })),
  };

  expect(
    serious.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    })),
    key,
  ).toEqual([]);
}

/**
 * axe on the payment surfaces changed by S3-1b2: seller payment card, seller
 * order list/detail with a payment badge, and the buyer order with a pending
 * payment. Light/dark at 320 and 1440. The fake pages are dev-only and covered
 * by the payments browser flow; they render no real provider content.
 */
test("axe has no serious or critical findings on payment pages", async ({
  browser,
  request,
}, testInfo) => {
  test.slow();

  const fixture = await createPaymentsFixture(request, "E2E axe Оплата");

  const scans: Record<string, ScanResult> = {};

  for (const viewport of viewports) {
    for (const theme of themes) {
      const sellerContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ru-RU",
        colorScheme: theme,
      });
      const buyerContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ru-RU",
        colorScheme: theme,
      });
      try {
        await seedBrowserSession(sellerContext, fixture.catalog.seller, null);
        await seedBrowserSession(buyerContext, fixture.buyer, null);

        const sellerPage = await sellerContext.newPage();
        await sellerPage.goto("/admin/shop");
        await expect(
          sellerPage.getByRole("heading", { level: 1, name: "Ваш магазин" }),
        ).toBeVisible();
        await expect(sellerPage.getByRole("region", { name: "Приём платежей" })).toBeVisible();
        await setTheme(sellerPage, theme);
        await scan(sellerPage, `admin-shop-${viewport.key}-${theme}`, scans);

        await sellerPage.goto("/admin/orders");
        await expect(sellerPage.getByRole("heading", { level: 1, name: "Заказы" })).toBeVisible();
        await expect(
          sellerPage.getByText("Ожидает оплаты").filter({ visible: true }).first(),
        ).toBeVisible();
        await setTheme(sellerPage, theme);
        await scan(sellerPage, `admin-orders-${viewport.key}-${theme}`, scans);

        await sellerPage.goto(`/admin/orders/${fixture.orderId}`);
        await expect(
          sellerPage.getByRole("heading", { level: 1, name: `Заказ №${fixture.orderId}` }),
        ).toBeVisible();
        await expect(sellerPage.getByRole("region", { name: "Оплата" })).toBeVisible();
        await setTheme(sellerPage, theme);
        await scan(sellerPage, `admin-order-${viewport.key}-${theme}`, scans);

        const buyerPage = await buyerContext.newPage();
        await buyerPage.goto(`/orders/${fixture.orderId}`);
        await expect(
          buyerPage.getByRole("heading", { level: 1, name: `Заказ №${fixture.orderId}` }),
        ).toBeVisible();
        await expect(buyerPage.getByRole("region", { name: "Оплата" })).toBeVisible();
        await setTheme(buyerPage, theme);
        await scan(buyerPage, `order-${viewport.key}-${theme}`, scans);
      } finally {
        await sellerContext.close();
        await buyerContext.close();
      }
    }
  }

  const evidence = {
    generated_at: new Date().toISOString(),
    base: BASE_URL,
    tags: AXE_TAGS,
    orderId: fixture.orderId,
    scans,
  };
  const body = JSON.stringify(evidence, null, 2);
  await writeFile(testInfo.outputPath("axe-payments-results.json"), body);
  await testInfo.attach("axe-payments-results.json", { body, contentType: "application/json" });
});
