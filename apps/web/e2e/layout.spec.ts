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
  waitForStablePage,
} from "./helpers.js";

const viewports = [
  { key: "320", width: 320, height: 900 },
  { key: "768", width: 768, height: 1024 },
  { key: "1440", width: 1440, height: 900 },
] as const;

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

type Viewport = (typeof viewports)[number];

type LayoutPage = {
  key: string;
  path: string;
  heading: string | RegExp;
  group: "storefront" | "admin";
  ready?: (page: Page, productName: string) => Promise<void>;
};

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const sizes = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(sizes.documentScrollWidth, `${label}: document scrollWidth`).toBeLessThanOrEqual(
    sizes.documentClientWidth,
  );
  expect(sizes.bodyScrollWidth, `${label}: body scrollWidth`).toBeLessThanOrEqual(
    sizes.documentClientWidth,
  );
}

async function firstHeadingLeft(page: Page): Promise<number> {
  const box = await page.locator("main h1").first().boundingBox();
  if (!box) {
    throw new Error("main h1 has no layout box");
  }
  return box.x;
}

async function expectHeaderControls(page: Page, label: string): Promise<void> {
  const controls = await page.locator("header [data-header-control]").evaluateAll((elements) =>
    elements
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        top: rect.top,
        height: rect.height,
        center: rect.top + rect.height / 2,
      })),
  );

  expect(controls.length, `${label}: visible header controls`).toBeGreaterThanOrEqual(2);

  for (const control of controls) {
    expect(control.height, `${label}: header control height`).toBeCloseTo(44, 0);
  }

  const centers = controls.map((control) => control.center);
  expect(Math.max(...centers) - Math.min(...centers), `${label}: center delta`).toBeLessThanOrEqual(
    1,
  );
}

async function expectHeaderNav(page: Page, label: string): Promise<void> {
  const heights = await page.locator("header [data-header-nav] a").evaluateAll((elements) =>
    elements
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => rect.height),
  );

  expect(heights.length, `${label}: visible nav links`).toBeGreaterThanOrEqual(3);

  for (const height of heights) {
    expect(height, `${label}: nav link height`).toBeGreaterThanOrEqual(44);
  }
}

async function expectHeaderCta(page: Page, label: string, visible: boolean): Promise<void> {
  const cta = page.locator("header [data-header-cta]");

  if (!visible) {
    await expect(cta, `${label}: header CTA hidden`).toBeHidden();
    return;
  }

  await expect(cta, `${label}: header CTA visible`).toBeVisible();
  const box = await cta.boundingBox();
  expect(box?.height ?? 0, `${label}: header CTA height`).toBeCloseTo(44, 0);
}

async function expectAddToCartSingleLine(page: Page, label: string): Promise<void> {
  const button = page.getByRole("button", { name: /^В корзину:/ }).first();
  const geometry = await button.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      height: element.getBoundingClientRect().height,
      lines: range.getClientRects().length,
    };
  });

  expect(geometry.height, `${label}: cart button height`).toBeCloseTo(44, 0);
  expect(geometry.lines, `${label}: cart button single line`).toBe(1);
}

async function expectCartBadgeInsideHeader(page: Page): Promise<void> {
  const header = await page.locator("header").first().boundingBox();
  const shell = await page.locator("header [data-page-shell]").first().boundingBox();
  const badge = await page.locator("header [data-cart-badge]").first().boundingBox();

  if (!header || !shell || !badge) {
    throw new Error("cart badge or header has no layout box");
  }

  const headerLeft = header.x;
  const headerRight = header.x + header.width;
  const shellRight = shell.x + shell.width;
  const badgeLeft = badge.x;
  const badgeRight = badge.x + badge.width;
  const badgeTop = badge.y;

  expect(badgeLeft, "cart badge left edge").toBeGreaterThanOrEqual(headerLeft);
  expect(badgeRight, "cart badge right edge").toBeLessThanOrEqual(headerRight);
  expect(badgeRight, "cart badge stays inside the header container").toBeLessThanOrEqual(
    shellRight,
  );
  expect(badgeTop, "cart badge top edge").toBeGreaterThanOrEqual(header.y);
}

async function openAndCheckLayout(
  page: Page,
  target: LayoutPage,
  viewport: Viewport,
  productName: string,
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(target.path);
  await expect(page.getByRole("heading", { level: 1, name: target.heading }).first()).toBeVisible();
  await target.ready?.(page, productName);
  await waitForStablePage(page);
  await expectNoHorizontalOverflow(page, `${target.key} ${viewport.key}`);
}

const buyerPages: LayoutPage[] = [
  {
    key: "catalog",
    path: "/",
    heading: /Секонд-хенд и локальные бренды/,
    group: "storefront",
    ready: async (page, productName) => {
      await expect(page.getByText(productName).first()).toBeVisible();
    },
  },
  {
    key: "cart",
    path: "/cart",
    heading: "Корзина",
    group: "storefront",
    ready: async (page, productName) => {
      await expect(page.getByText(productName).first()).toBeVisible();
    },
  },
  {
    key: "checkout",
    path: "/checkout",
    heading: "Проверьте заказ",
    group: "storefront",
    ready: async (page, productName) => {
      await expect(page.getByText(productName).first()).toBeVisible();
    },
  },
  {
    key: "orders",
    path: "/orders",
    heading: "Мои заказы",
    group: "storefront",
    ready: async (page, productName) => {
      await expect(page.getByText(productName).filter({ visible: true }).first()).toBeVisible();
    },
  },
];

function adminPages(productId: number): LayoutPage[] {
  return [
    {
      key: "admin-shop",
      path: "/admin/shop",
      heading: "Ваш магазин",
      group: "admin",
      ready: async (page) => {
        await expect(
          page.getByRole("heading", { name: "Настройки магазина" }).first(),
        ).toBeVisible();
      },
    },
    {
      key: "admin-product",
      path: `/admin/products/${productId}`,
      heading: "Редактирование товара",
      group: "admin",
      ready: async (page) => {
        await expect(page.locator('form[aria-labelledby="product-form-title"]')).toBeVisible();
      },
    },
    {
      key: "admin-orders",
      path: "/admin/orders",
      heading: "Заказы",
      group: "admin",
      ready: async (page, productName) => {
        await expect(page.getByText(productName).filter({ visible: true }).first()).toBeVisible();
      },
    },
  ];
}

/**
 * Layout smoke for every page in the PBI: screenshots at 320/768/1440,
 * horizontal overflow, 44 px header controls, one container edge, and the
 * admin product form/status alignment. The overlay check is a separate test
 * because it only exists in the dev build.
 */
test("layout holds at 320/768/1440 across storefront and admin", async ({
  browser,
  request,
}, testInfo) => {
  test.slow();

  const catalog = await createPublishedCatalog(request, ["LAYOUT Куртка", "LAYOUT Шарф"]);
  const product = catalog.products[0];
  if (!product) {
    throw new Error("catalog fixture did not create a product");
  }

  const buyer = await loginViaApi(request, uniquePhone());
  const checkoutResponse = await request.post("/api/checkout", {
    headers: { cookie: buyer.cookie },
    data: {
      items: catalog.products.map((item) => ({ productId: item.id })),
      clientCheckoutId: randomUUID(),
    },
  });
  expect(checkoutResponse.status(), await checkoutResponse.text()).toBe(201);

  const screenshots: string[] = [];
  const leftEdges: Record<string, number[]> = {};
  const controlChecks: string[] = [];

  function recordLeftEdge(key: string, value: number): void {
    const values = leftEdges[key];
    if (values) {
      values.push(value);
    } else {
      leftEdges[key] = [value];
    }
  }

  const buyerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });

  try {
    await seedBrowserSession(buyerContext, buyer, cartStateFor(catalog));
    const page = await buyerContext.newPage();

    for (const viewport of viewports) {
      for (const target of buyerPages) {
        await openAndCheckLayout(page, target, viewport, product.name);
        recordLeftEdge(`storefront-${viewport.key}`, await firstHeadingLeft(page));

        if (target.key === "catalog") {
          await expectHeaderControls(page, `catalog ${viewport.key}`);
          await expectCartBadgeInsideHeader(page);
          await expectHeaderCta(page, `catalog ${viewport.key}`, viewport.width >= 1024);

          if (viewport.width >= 768) {
            await expectHeaderNav(page, `catalog ${viewport.key}`);
          }

          if (viewport.width === 320) {
            await expectAddToCartSingleLine(page, `catalog ${viewport.key}`);
          }

          controlChecks.push(`${target.key}-${viewport.key}`);
        }

        const path = testInfo.outputPath(`layout-${target.key}-${viewport.key}.png`);
        await page.screenshot({ path, fullPage: true, animations: "disabled" });
        screenshots.push(path);
      }
    }

    const shopPage: LayoutPage = {
      key: "shop",
      path: `/shops/${catalog.shop.slug}`,
      heading: catalog.shop.name,
      group: "storefront",
      ready: async (page, productName) => {
        await expect(page.getByText(productName).first()).toBeVisible();
      },
    };

    for (const viewport of viewports) {
      await openAndCheckLayout(page, shopPage, viewport, product.name);
      recordLeftEdge(`storefront-${viewport.key}`, await firstHeadingLeft(page));

      const path = testInfo.outputPath(`layout-shop-${viewport.key}.png`);
      await page.screenshot({ path, fullPage: true, animations: "disabled" });
      screenshots.push(path);
    }
  } finally {
    await buyerContext.close();
  }

  const sellerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });

  try {
    await seedBrowserSession(sellerContext, catalog.seller, null);
    const page = await sellerContext.newPage();

    for (const viewport of viewports) {
      for (const target of adminPages(product.id)) {
        await openAndCheckLayout(page, target, viewport, product.name);
        recordLeftEdge(`admin-${viewport.key}`, await firstHeadingLeft(page));

        if (target.key === "admin-product" && viewport.key === "1440") {
          const formTop = await page
            .locator('form[aria-labelledby="product-form-title"]')
            .evaluate((element) => element.getBoundingClientRect().top);
          const statusTop = await page
            .locator('section[aria-labelledby="product-status-title"]')
            .evaluate((element) => element.getBoundingClientRect().top);
          expect(
            Math.abs(formTop - statusTop),
            `admin product form/status top: ${formTop} vs ${statusTop}`,
          ).toBeLessThanOrEqual(1);
        }

        const path = testInfo.outputPath(`layout-${target.key}-${viewport.key}.png`);
        await page.screenshot({ path, fullPage: true, animations: "disabled" });
        screenshots.push(path);
      }
    }
  } finally {
    await sellerContext.close();
  }

  for (const [group, edges] of Object.entries(leftEdges)) {
    const min = Math.min(...edges);
    const max = Math.max(...edges);
    expect(max - min, `${group}: heading left edges ${edges.join(", ")}`).toBeLessThanOrEqual(1);
  }

  const evidence = {
    generated_at: new Date().toISOString(),
    base: BASE_URL,
    viewports: viewports.map((viewport) => `${viewport.width}x${viewport.height}`),
    screenshots,
    headerControlsChecked: controlChecks,
    headingLeftEdges: leftEdges,
    fixture: {
      shopSlug: catalog.shop.slug,
      productId: product.id,
    },
  };
  const body = JSON.stringify(evidence, null, 2);
  await writeFile(testInfo.outputPath("layout-results.json"), body);
  await testInfo.attach("layout-results.json", { body, contentType: "application/json" });
});

test("layout guides overlay renders 12 columns in dev", async ({ page }, testInfo) => {
  test.skip(
    process.env.PLAYWRIGHT_BASE_URL?.includes(":4173") === true,
    "guides overlay is a dev-only tool and does not exist in the production preview bundle",
  );

  const columnsByViewport = [
    { width: 320, height: 900, columns: 4 },
    { width: 768, height: 1024, columns: 8 },
    { width: 1440, height: 900, columns: 12 },
  ] as const;

  for (const viewport of columnsByViewport) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/?guides=1");

    const overlay = page.getByTestId("layout-guides");
    await expect(overlay).toBeVisible();

    const visibleColumns = await overlay.locator("[data-guide-column]").evaluateAll((elements) =>
      elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && style.display !== "none";
      }),
    );
    expect(visibleColumns, `guides ${viewport.width}: visible columns`).toHaveLength(
      viewport.columns,
    );
  }

  await page.screenshot({
    path: testInfo.outputPath("layout-guides-1440.png"),
    fullPage: false,
    animations: "disabled",
  });
});

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-theme", value);
  }, theme);
  await page.waitForTimeout(100);
}

/**
 * Admin pages were not covered by the buyer axe test. Layout changes touch
 * them, so scan both themes at the narrow and wide viewports.
 */
test("axe has no serious or critical findings on admin pages", async ({
  browser,
  request,
}, testInfo) => {
  test.slow();

  const catalog = await createPublishedCatalog(request, ["LAYOUT A11y"]);
  const product = catalog.products[0];
  if (!product) {
    throw new Error("catalog fixture did not create a product");
  }

  const buyer = await loginViaApi(request, uniquePhone());
  const checkoutResponse = await request.post("/api/checkout", {
    headers: { cookie: buyer.cookie },
    data: {
      items: catalog.products.map((item) => ({ productId: item.id })),
      clientCheckoutId: randomUUID(),
    },
  });
  expect(checkoutResponse.status(), await checkoutResponse.text()).toBe(201);

  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });

  const scans: Record<
    string,
    {
      url: string;
      violations: Array<{ id: string; impact: string | null; nodes: number }>;
    }
  > = {};

  try {
    await seedBrowserSession(context, catalog.seller, null);
    const page = await context.newPage();

    for (const viewport of [viewports[0], viewports[2]]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });

        for (const target of adminPages(product.id)) {
          await page.goto(target.path);
          await expect(
            page.getByRole("heading", { level: 1, name: target.heading }).first(),
          ).toBeVisible();
          await target.ready?.(page, product.name);
          await setTheme(page, theme);

          const analysis = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
          const key = `${target.key}-${viewport.key}-${theme}`;
          scans[key] = {
            url: page.url(),
            violations: analysis.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact ?? null,
              nodes: violation.nodes.length,
            })),
          };

          const serious = analysis.violations.filter(
            (violation) => violation.impact === "serious" || violation.impact === "critical",
          );
          expect(
            serious.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              help: violation.help,
            })),
            `${target.key} ${viewport.key} ${theme}`,
          ).toEqual([]);
        }
      }
    }
  } finally {
    await context.close();
  }

  const body = JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      base: BASE_URL,
      tags: AXE_TAGS,
      scans,
    },
    null,
    2,
  );
  await writeFile(testInfo.outputPath("layout-axe-results.json"), body);
  await testInfo.attach("layout-axe-results.json", { body, contentType: "application/json" });
});
