import { expect, test } from "@playwright/test";
import {
  BASE_URL,
  createPublishedCatalog,
  loginViaUi,
  uniquePhone,
  waitForStablePage,
} from "./helpers.js";

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

/**
 * The Sprint 2 buyer core in one browser session:
 * catalog search -> product -> cart -> guest checkout -> phone login -> order
 * -> /orders, then the seller logs in and sees the same order in
 * /admin/orders. Evidence screenshots are attached to the Playwright report.
 */
test("buyer and seller see the same order end-to-end", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const catalog = await createPublishedCatalog(request, ["E2E Куртка"]);
  const product = catalog.products[0];
  if (!product) {
    throw new Error("catalog fixture did not create a product");
  }
  const comment = "Тестовый комментарий e2e";
  const buyerPhone = uniquePhone();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Секонд-хенд и локальные бренды/ })).toBeVisible();

  await page.getByLabel("Поиск по каталогу").fill(product.name);
  await page.getByRole("button", { name: "Найти" }).click();

  const productLink = page.locator(`a[href="/products/${product.id}"]`).first();
  await expect(productLink).toBeVisible();
  await productLink.click();

  await expect(page.getByRole("heading", { name: product.name, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: `В корзину: ${product.name}` }).click();
  await expect(page.getByRole("button", { name: `В корзине: ${product.name}` })).toBeVisible();

  await page
    .getByRole("link", { name: /Корзина/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Корзина", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: product.name }).first()).toBeVisible();
  await waitForStablePage(page);
  await page.screenshot({
    path: testInfo.outputPath("buyer-cart-1440.png"),
    animations: "disabled",
  });

  // A guest who opens checkout is sent to login with `next=/checkout`.
  await page.getByRole("link", { name: "Оформить" }).click();
  await page.waitForURL(/\/login\?(.*)next=/);
  await loginViaUi(page, buyerPhone);

  await page.waitForURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Проверьте заказ" })).toBeVisible();
  await expect(page.getByText(catalog.shop.name).first()).toBeVisible();
  await page.getByLabel("Комментарий продавцу").fill(comment);
  await waitForStablePage(page);
  await page.screenshot({
    path: testInfo.outputPath("buyer-checkout-1440.png"),
    animations: "disabled",
  });

  await page.getByRole("button", { name: "Оформить заказ" }).click();
  // A single order opens straight on the order screen so the buyer can pay.
  await page.waitForURL(/\/orders\/\d+$/);
  await expect(page.getByRole("heading", { name: /Заказ №\d+/, level: 1 })).toBeVisible();
  await expect(page.getByText(product.name).first()).toBeVisible();
  await expect(page.getByText(catalog.shop.name).first()).toBeVisible();
  await expect(page.getByText("Новый").first()).toBeVisible();
  await waitForStablePage(page);
  await page.screenshot({
    path: testInfo.outputPath("buyer-order-1440.png"),
    animations: "disabled",
  });

  // The orders list keeps the honest "payment not connected" state when the
  // seller has no payment account.
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Мои заказы", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Заказ №\d+/ })).toBeVisible();
  await expect(page.getByText("Оплата не подключена")).toBeVisible();
  await waitForStablePage(page);
  await page.screenshot({
    path: testInfo.outputPath("buyer-orders-1440.png"),
    animations: "disabled",
  });

  // The seller logs in in a separate context and sees the buyer's order.
  const sellerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });
  try {
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto("/login");
    await loginViaUi(sellerPage, catalog.seller.phone);
    await sellerPage.waitForURL(/\/admin(\/shop)?$/);

    await sellerPage.goto("/admin/orders");
    await expect(sellerPage.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();
    await expect(sellerPage.getByText(product.name).first()).toBeVisible();
    await expect(sellerPage.getByText(formatPhone(buyerPhone)).first()).toBeVisible();
    await expect(sellerPage.getByText(comment).first()).toBeVisible();
    await waitForStablePage(sellerPage);
    await sellerPage.screenshot({
      path: testInfo.outputPath("seller-orders-1440.png"),
      animations: "disabled",
    });
  } finally {
    await sellerContext.close();
  }

  await testInfo.attach("buyer-flow.json", {
    contentType: "application/json",
    body: JSON.stringify(
      {
        sellerPhone: catalog.seller.phone,
        buyerPhone,
        shop: catalog.shop,
        product,
        comment,
        buyerOrdersUrl: `${BASE_URL}/orders`,
        sellerOrdersUrl: `${BASE_URL}/admin/orders`,
      },
      null,
      2,
    ),
  });
});
