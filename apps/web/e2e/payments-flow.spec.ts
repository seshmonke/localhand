import { expect, test, type Page } from "@playwright/test";
import {
  BASE_URL,
  createPublishedCatalog,
  loginViaApi,
  seedBrowserSession,
  uniquePhone,
  waitForStablePage,
} from "./helpers.js";
import {
  connectPaymentsViaApi,
  createOrder,
  createPendingPayment,
  manualReviewPaymentBody,
} from "./payments-helpers.js";

/**
 * Payments UI against the fake provider (dev stack only):
 * seller connects through the fake OAuth pages, buyer pays via the fake
 * confirmation page, the real webhook marks the order paid, and the seller
 * sees the payment. `manual_review` is rendered as a payment state through a
 * route stub because the fake provider cannot produce a mismatch on its own.
 */
async function screenshot(page: Page, name: string): Promise<void> {
  await waitForStablePage(page);
  await page.screenshot({ path: test.info().outputPath(name), animations: "disabled" });
}

test("seller connects fake payments, buyer pays, seller sees paid", async ({
  browser,
  request,
}, testInfo) => {
  test.slow();

  const catalog = await createPublishedCatalog(request, ["E2E Оплата"]);
  const buyer = await loginViaApi(request, uniquePhone());
  const orderId = await createOrder(request, catalog, buyer);

  const buyerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });
  const sellerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });

  try {
    await seedBrowserSession(buyerContext, buyer, null);
    await seedBrowserSession(sellerContext, catalog.seller, null);

    // Seller: connect through the fake OAuth consent page in the browser.
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto("/admin/shop");
    const connectCard = sellerPage.getByRole("region", { name: "Приём платежей" });
    await expect(connectCard.getByText("Не подключено")).toBeVisible();
    await connectCard.getByRole("button", { name: "Подключить ЮKassa" }).click();

    await sellerPage.waitForURL(/\/dev\/payments\/connect\?state=/);
    await expect(
      sellerPage.getByRole("heading", { level: 1, name: /Подключение ЮKassa/ }),
    ).toBeVisible();
    await sellerPage.getByRole("button", { name: "Подтвердить подключение" }).click();
    await sellerPage.waitForURL(/\/admin\/shop$/);

    const connectedCard = sellerPage.getByRole("region", { name: "Приём платежей" });
    await expect(connectedCard.getByText("Подключено")).toBeVisible();
    await expect(connectedCard.getByText("Тестовый магазин")).toBeVisible();
    await expect(connectedCard.getByText(/^\*{4}.{4}$/)).toBeVisible();
    await screenshot(sellerPage, "payments-admin-shop-connected-1440.png");

    // Buyer: pay from the order page and finish on the fake provider page.
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto(`/orders/${orderId}`);
    const paySection = buyerPage.getByRole("region", { name: "Оплата" });
    await expect(paySection.getByText("Оплата не подключена")).toBeVisible();
    await paySection.getByRole("button", { name: "Оплатить" }).click();

    await buyerPage.waitForURL(/\/dev\/payments\/\d+\/complete/);
    await expect(
      buyerPage.getByRole("heading", { level: 1, name: "Тестовая оплата" }),
    ).toBeVisible();
    await expect(buyerPage.getByText(/Реальные деньги не списываются/)).toBeVisible();
    await screenshot(buyerPage, "payments-dev-complete-1440.png");

    await buyerPage.getByRole("button", { name: "Оплатить тестовым платежом" }).click();
    await buyerPage.waitForURL(new RegExp(`/orders/${orderId}\\?payment=return`));
    await expect(paySection.getByText("Оплачен").first()).toBeVisible({ timeout: 15_000 });
    await expect(paySection.getByText(/^Оплачен /)).toBeVisible();
    await screenshot(buyerPage, "payments-order-paid-1440.png");

    // Seller: the order and the payment are visible in both list and detail.
    const sellerPageAfter = await sellerContext.newPage();
    await sellerPageAfter.goto("/admin/orders");
    await expect(sellerPageAfter.getByText("Оплачен").first()).toBeVisible({ timeout: 15_000 });
    await screenshot(sellerPageAfter, "payments-admin-orders-paid-1440.png");

    await sellerPageAfter.goto(`/admin/orders/${orderId}`);
    const adminPayment = sellerPageAfter.getByRole("region", { name: "Оплата" });
    await expect(adminPayment.getByText("Оплачен").first()).toBeVisible();
    await expect(adminPayment.getByText("Сумма")).toBeVisible();
    await expect(adminPayment.getByRole("button", { name: /Оплатить/ })).toHaveCount(0);
    await screenshot(sellerPageAfter, "payments-admin-order-paid-1440.png");

    await testInfo.attach("payments-flow.json", {
      contentType: "application/json",
      body: JSON.stringify({ orderId, shop: catalog.shop, payment: "succeeded" }, null, 2),
    });
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});

test("a 409 payment_in_progress refetches the active payment instead of duplicating it", async ({
  browser,
  request,
}) => {
  const catalog = await createPublishedCatalog(request, ["E2E Оплата 409"]);
  const buyer = await loginViaApi(request, uniquePhone());
  await connectPaymentsViaApi(request, catalog.seller);
  const orderId = await createOrder(request, catalog, buyer);

  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });
  try {
    await seedBrowserSession(context, buyer, null);
    const page = await context.newPage();
    await page.goto(`/orders/${orderId}`);

    const paymentSection = page.getByRole("region", { name: "Оплата" });
    await expect(paymentSection.getByRole("button", { name: "Оплатить" })).toBeVisible();

    // Another tab creates the payment after this page loaded.
    await createPendingPayment(request, buyer, orderId);

    await paymentSection.getByRole("button", { name: "Оплатить" }).click();

    // The 409 is not shown as an error: the UI refetches and shows the active
    // payment, staying on the order page.
    await expect(paymentSection.getByText("Ожидает оплаты").first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(paymentSection.getByRole("button", { name: "Оплатить" })).toHaveCount(0);
    await screenshot(page, "payments-order-409-retry-1440.png");
  } finally {
    await context.close();
  }
});

test("manual_review is a payment state, not an order status, for buyer and seller", async ({
  browser,
  request,
}) => {
  const catalog = await createPublishedCatalog(request, ["E2E Оплата review"]);
  const buyer = await loginViaApi(request, uniquePhone());
  await connectPaymentsViaApi(request, catalog.seller);
  const orderId = await createOrder(request, catalog, buyer);
  await createPendingPayment(request, buyer, orderId);

  const buyerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 320, height: 800 },
    locale: "ru-RU",
  });
  const sellerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 320, height: 800 },
    locale: "ru-RU",
  });
  try {
    await seedBrowserSession(buyerContext, buyer, null);
    await seedBrowserSession(sellerContext, catalog.seller, null);

    const buyerPage = await buyerContext.newPage();
    await buyerPage.route(`**/api/orders/${orderId}/payment`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: manualReviewPaymentBody(),
      }),
    );
    await buyerPage.goto(`/orders/${orderId}`);
    const buyerPayment = buyerPage.getByRole("region", { name: "Оплата" });
    await expect(buyerPayment.getByText("Требует проверки").first()).toBeVisible();
    await expect(buyerPayment.getByText(/Платёж проверяет продавец или поддержка/)).toBeVisible();
    await expect(buyerPayment.getByRole("button", { name: /Оплатить/ })).toHaveCount(0);
    await expect(buyerPayment.getByRole("link", { name: "Продолжить оплату" })).toHaveCount(0);
    await screenshot(buyerPage, "payments-order-manual-review-320.png");

    const sellerPage = await sellerContext.newPage();
    await sellerPage.route(`**/api/seller/orders/${orderId}/payment`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: manualReviewPaymentBody(),
      }),
    );
    await sellerPage.goto(`/admin/orders/${orderId}`);
    // The order keeps its own status; the payment badge is separate.
    await expect(sellerPage.getByText("Ожидает оплаты").first()).toBeVisible();
    const adminPayment = sellerPage.getByRole("region", { name: "Оплата" });
    await expect(adminPayment.getByText("Требует проверки")).toBeVisible();
    await expect(adminPayment.getByText(/ручной проверки/)).toBeVisible();
    await expect(adminPayment.getByRole("button", { name: /Оплатить/ })).toHaveCount(0);
    await screenshot(sellerPage, "payments-admin-order-manual-review-320.png");
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});
