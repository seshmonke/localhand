import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  BASE_URL,
  cartStateFor,
  createPublishedCatalog,
  loginViaApi,
  seedBrowserSession,
  uniquePhone,
} from "./helpers.js";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

const pages = [
  { key: "catalog", path: "/", heading: /Секонд-хенд и локальные бренды/ },
  { key: "cart", path: "/cart", heading: "Корзина" },
  { key: "checkout", path: "/checkout", heading: "Проверьте заказ" },
  { key: "orders", path: "/orders", heading: "Мои заказы" },
] as const;

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

test("axe has no serious or critical findings on buyer pages in light and dark", async ({
  browser,
  request,
}, testInfo) => {
  test.slow();

  const catalog = await createPublishedCatalog(request);
  const buyer = await loginViaApi(request, uniquePhone());

  const checkoutResponse = await request.post("/api/checkout", {
    headers: { cookie: buyer.cookie },
    data: {
      items: catalog.products.map((product) => ({ productId: product.id })),
      clientCheckoutId: randomUUID(),
    },
  });
  expect(checkoutResponse.status(), await checkoutResponse.text()).toBe(201);
  const orderId = ((await checkoutResponse.json()) as { orders: Array<{ id: number }> }).orders[0]
    ?.id;

  const targets = [
    ...pages,
    { key: "shop", path: `/shops/${catalog.shop.slug}`, heading: catalog.shop.name },
  ];

  const scans: Record<string, ScanResult> = {};

  for (const viewport of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ru-RU",
        colorScheme: theme,
      });
      try {
        await seedBrowserSession(context, buyer, cartStateFor(catalog));
        const page = await context.newPage();

        for (const target of targets) {
          await page.goto(target.path);
          await expect(page.getByRole("heading", { name: target.heading }).first()).toBeVisible();
          await setTheme(page, theme);

          const analysis = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
          const serious = analysis.violations.filter(
            (violation) => violation.impact === "serious" || violation.impact === "critical",
          );

          const key = `${target.key}-${viewport.key}-${theme}`;
          scans[key] = {
            url: page.url(),
            testEngine: {
              name: analysis.testEngine.name,
              version: analysis.testEngine.version,
            },
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
            })),
            `${target.key} ${viewport.key} ${theme}`,
          ).toEqual([]);
        }
      } finally {
        await context.close();
      }
    }
  }

  const evidence = {
    generated_at: new Date().toISOString(),
    base: BASE_URL,
    tags: AXE_TAGS,
    orderId: orderId ?? null,
    scans,
  };
  const body = JSON.stringify(evidence, null, 2);
  await writeFile(testInfo.outputPath("axe-results.json"), body);
  await testInfo.attach("axe-results.json", { body, contentType: "application/json" });
});
