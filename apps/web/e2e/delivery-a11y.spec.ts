import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  BASE_URL,
  cartStateFor,
  createPublishedCatalog,
  DEFAULT_DIMENSIONS,
  DEFAULT_RECIPIENT_NAME,
  findDeliveryOrigin,
  findDeliveryPoint,
  loginViaApi,
  seedBrowserSession,
  uniquePhone,
} from "./helpers.js";
import { createPaidDeliveryOrder } from "./payments-helpers.js";

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
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, theme);
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
 * axe on the delivery surfaces: checkout with a PVZ/quote, buyer order with a
 * delivery card, seller order in quoted and created states, shop origin and
 * the product dimensions fieldset. 320/1440, light/dark, 0 serious/critical.
 */
test("axe has no serious or critical findings on delivery pages", async ({
  browser,
  request,
}, testInfo) => {
  test.slow();

  const destination = await findDeliveryPoint(request);
  const origin = await findDeliveryOrigin(request);
  expect(origin.cityCode).not.toBe(destination.cityCode);
  const catalog = await createPublishedCatalog(request, ["E2E axe Доставка"], {
    dimensions: DEFAULT_DIMENSIONS,
    deliveryOrigin: {
      cdekCityCode: origin.cityCode,
      cdekCityName: origin.cityName,
      cdekShipmentPoint: origin.pointCode,
    },
  });
  const quotedBuyer = await loginViaApi(request, uniquePhone());
  const quotedOrderId = await createPaidDeliveryOrder(request, catalog, quotedBuyer);
  const createdBuyer = await loginViaApi(request, uniquePhone());
  const createdOrderId = await createPaidDeliveryOrder(request, catalog, createdBuyer);

  const createShipment = await request.post(`/api/seller/orders/${createdOrderId}/delivery`, {
    headers: { cookie: catalog.seller.cookie },
    data: { tariffCode: "136" },
  });
  expect(createShipment.status(), await createShipment.text()).toBe(201);

  const scans: Record<string, ScanResult> = {};

  for (const viewport of viewports) {
    for (const theme of themes) {
      const buyerContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ru-RU",
        colorScheme: theme,
      });
      const sellerContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ru-RU",
        colorScheme: theme,
      });
      try {
        await seedBrowserSession(buyerContext, createdBuyer, cartStateFor(catalog));
        await seedBrowserSession(sellerContext, catalog.seller, null);

        const buyerPage = await buyerContext.newPage();
        await buyerPage.goto("/checkout");
        await expect(buyerPage.getByRole("heading", { name: "Проверьте заказ" })).toBeVisible();
        const citySelect = buyerPage.getByLabel("Город доставки");
        await expect(citySelect.locator(`option[value="${destination.cityCode}"]`)).toHaveCount(1);
        await citySelect.selectOption(String(destination.cityCode));
        const pointSelect = buyerPage.getByLabel("Пункт выдачи");
        await expect(pointSelect.locator(`option[value="${destination.pointCode}"]`)).toHaveCount(
          1,
        );
        await expect(pointSelect).toBeEnabled();
        await pointSelect.selectOption(destination.pointCode);
        await buyerPage.getByLabel("Имя получателя").fill(DEFAULT_RECIPIENT_NAME);
        await expect(buyerPage.getByText("Срок", { exact: true })).toBeVisible();
        await setTheme(buyerPage, theme);
        await scan(buyerPage, `checkout-${viewport.key}-${theme}`, scans);

        await buyerPage.goto(`/orders/${createdOrderId}`);
        const buyerDelivery = buyerPage.getByRole("region", { name: "Доставка" });
        await expect(buyerDelivery.getByText("Отправление создано")).toBeVisible();
        await setTheme(buyerPage, theme);
        await scan(buyerPage, `order-${viewport.key}-${theme}`, scans);

        const sellerPage = await sellerContext.newPage();
        await sellerPage.goto("/admin/shop");
        await expect(sellerPage.getByRole("heading", { name: "Ваш магазин" })).toBeVisible();
        await expect(sellerPage.getByText(`Город сдачи: ${origin.cityName}`)).toBeVisible();
        await setTheme(sellerPage, theme);
        await scan(sellerPage, `admin-shop-${viewport.key}-${theme}`, scans);

        await sellerPage.goto(`/admin/orders/${quotedOrderId}`);
        const quotedDelivery = sellerPage.getByRole("region", { name: "Доставка" });
        await expect(quotedDelivery.getByText("Ожидает отправки")).toBeVisible();
        await setTheme(sellerPage, theme);
        await scan(sellerPage, `admin-order-quoted-${viewport.key}-${theme}`, scans);

        await sellerPage.goto(`/admin/orders/${createdOrderId}`);
        const createdDelivery = sellerPage.getByRole("region", { name: "Доставка" });
        await expect(createdDelivery.getByText("Отправление создано")).toBeVisible();
        await setTheme(sellerPage, theme);
        await scan(sellerPage, `admin-order-created-${viewport.key}-${theme}`, scans);

        await sellerPage.goto("/admin/products/new");
        await expect(sellerPage.getByRole("heading", { name: "Новый товар" })).toBeVisible();
        await expect(sellerPage.getByText("Габариты для доставки")).toBeVisible();
        await setTheme(sellerPage, theme);
        await scan(sellerPage, `admin-product-new-${viewport.key}-${theme}`, scans);
      } finally {
        await buyerContext.close();
        await sellerContext.close();
      }
    }
  }

  const evidence = {
    generated_at: new Date().toISOString(),
    base: BASE_URL,
    tags: AXE_TAGS,
    orderIds: { quoted: quotedOrderId, created: createdOrderId },
    scans,
  };
  const body = JSON.stringify(evidence, null, 2);
  await writeFile(testInfo.outputPath("axe-results.json"), body);
  await testInfo.attach("axe-results.json", { body, contentType: "application/json" });
});
