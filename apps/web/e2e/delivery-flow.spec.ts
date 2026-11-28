import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
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
  waitForStablePage,
  type DeliveryPointChoice,
} from "./helpers.js";
import { connectPaymentsViaApi, createPaidDeliveryOrder } from "./payments-helpers.js";

/**
 * Delivery UI against the fake provider (dev stack only): PVZ checkout, fake
 * payment, seller tariffs/create, webhook replay, manual fallback. The fake
 * provider keeps shipment state inside the API process, so an over-HTTP
 * delivered transition is impossible here. The delivered block below is
 * UI-only (a response stub proves the card renders for both roles); the
 * backend created→delivered transition is covered by the API e2e
 * `apps/api/src/delivery/delivery.e2e.db.test.ts`.
 */
async function screenshot(page: Page, name: string): Promise<void> {
  await waitForStablePage(page);
  await page.screenshot({ path: test.info().outputPath(name), animations: "disabled" });
}

async function deliveryCatalog(
  request: APIRequestContext,
  name: string,
  origin: DeliveryPointChoice,
) {
  return createPublishedCatalog(request, [name], {
    dimensions: DEFAULT_DIMENSIONS,
    deliveryOrigin: {
      cdekCityCode: origin.cityCode,
      cdekCityName: origin.cityName,
      cdekShipmentPoint: origin.pointCode,
    },
  });
}

test("buyer checks out to a PVZ, seller creates a shipment, webhook replay is idempotent", async ({
  browser,
  request,
}, testInfo) => {
  test.skip(
    process.env.PLAYWRIGHT_BASE_URL?.includes(":4173") === true,
    "the fake payment page is dev-only; preview covers delivery UI via API-seeded states",
  );
  test.slow();

  const destination = await findDeliveryPoint(request);
  const origin = await findDeliveryOrigin(request);
  expect(origin.cityCode).not.toBe(destination.cityCode);
  const catalog = await deliveryCatalog(request, "E2E Доставка", origin);
  const buyer = await loginViaApi(request, uniquePhone());
  await connectPaymentsViaApi(request, catalog.seller);
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
    await seedBrowserSession(buyerContext, buyer, cartStateFor(catalog));
    await seedBrowserSession(sellerContext, catalog.seller, null);

    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto("/checkout");
    await expect(buyerPage.getByRole("heading", { name: "Проверьте заказ" })).toBeVisible();
    const citySelect = buyerPage.getByLabel("Город доставки");
    await expect(citySelect.locator(`option[value="${destination.cityCode}"]`)).toHaveCount(1);
    await citySelect.selectOption(String(destination.cityCode));
    const pointSelect = buyerPage.getByLabel("Пункт выдачи");
    await expect(pointSelect.locator(`option[value="${destination.pointCode}"]`)).toHaveCount(1);
    await expect(pointSelect).toBeEnabled();
    const quoteResponse = buyerPage.waitForResponse(
      (response) =>
        response.url().includes("/api/delivery/quote") && response.request().method() === "POST",
    );
    await pointSelect.selectOption(destination.pointCode);
    expect((await quoteResponse).status()).toBe(200);
    await buyerPage.getByLabel("Имя получателя").fill(DEFAULT_RECIPIENT_NAME);
    await expect(buyerPage.getByText("Срок", { exact: true })).toBeVisible();
    await screenshot(buyerPage, "delivery-checkout-1440.png");

    await buyerPage.getByRole("button", { name: "Оформить заказ" }).click();
    await buyerPage.waitForURL(/\/orders\/\d+$/);
    const orderId = Number(new URL(buyerPage.url()).pathname.split("/").pop());
    expect(Number.isInteger(orderId)).toBe(true);

    const paySection = buyerPage.getByRole("region", { name: "Оплата" });
    await paySection.getByRole("button", { name: "Оплатить" }).click();
    await buyerPage.waitForURL(/\/dev\/payments\/\d+\/complete/);
    await buyerPage.getByRole("button", { name: "Оплатить тестовым платежом" }).click();
    await buyerPage.waitForURL(new RegExp(`/orders/${orderId}\\?payment=return`));
    await expect(paySection.getByText("Оплачен").first()).toBeVisible({ timeout: 15_000 });
    await screenshot(buyerPage, "delivery-order-paid-1440.png");

    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto(`/admin/orders/${orderId}`);
    const deliveryCard = sellerPage.getByRole("region", { name: "Доставка" });
    await expect(deliveryCard.getByText("Ожидает отправки")).toBeVisible();
    await deliveryCard.getByRole("button", { name: "Рассчитать тарифы" }).click();
    await expect(deliveryCard.getByRole("list", { name: "Доступные тарифы" })).toBeVisible();
    await deliveryCard.getByRole("button", { name: "Создать отправление" }).click();
    await expect(deliveryCard.getByText(/Отправление создано/).first()).toBeVisible({
      timeout: 15_000,
    });
    await screenshot(sellerPage, "delivery-admin-order-created-1440.png");

    const deliveryResponse = await request.get(`/api/seller/orders/${orderId}/delivery`, {
      headers: { cookie: catalog.seller.cookie },
    });
    expect(deliveryResponse.status(), await deliveryResponse.text()).toBe(200);
    const deliveryBody = (await deliveryResponse.json()) as {
      delivery: Record<string, unknown> & {
        providerOrderId: string;
        providerNumber: string | null;
        status: string;
      };
      events: Array<{ statusCode: string }>;
    };
    expect(deliveryBody.delivery.status).toBe("created");
    const rawProviderIds = [
      deliveryBody.delivery.providerOrderId,
      deliveryBody.delivery.providerNumber,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    const webhook = {
      type: "ORDER_STATUS",
      uuid: deliveryBody.delivery.providerOrderId,
      attributes: { number: `order-${orderId}` },
    };
    expect((await request.post("/api/delivery/cdek/webhook", { data: webhook })).status()).toBe(
      200,
    );
    expect((await request.post("/api/delivery/cdek/webhook", { data: webhook })).status()).toBe(
      200,
    );
    const replay = await request.get(`/api/seller/orders/${orderId}/delivery`, {
      headers: { cookie: catalog.seller.cookie },
    });
    const replayBody = (await replay.json()) as { events: Array<{ statusCode: string }> };
    expect(replayBody.events.filter((event) => event.statusCode === "CREATED")).toHaveLength(1);

    await buyerPage.goto(`/orders/${orderId}`);
    await expect(
      buyerPage.getByRole("region", { name: "Доставка" }).getByText("Отправление создано"),
    ).toBeVisible();
    await sellerPage.reload();
    await expect(deliveryCard.getByText("Создан", { exact: true })).toBeVisible();
    expect(rawProviderIds.length).toBeGreaterThan(0);
    for (const text of [
      await buyerPage.locator("body").innerText(),
      await sellerPage.locator("body").innerText(),
    ]) {
      for (const rawId of rawProviderIds) {
        expect(text).not.toContain(rawId);
      }
      expect(text).not.toMatch(/[0-9a-f]{64}/);
    }

    // UI-only: the fake provider cannot be advanced to delivered over HTTP.
    // This stub proves the card/track render for both roles; the real
    // created→delivered transition is the API e2e (delivery.e2e.db.test.ts).
    const delivered = {
      ...deliveryBody.delivery,
      status: "delivered",
      carrier: "СДЭК",
      trackNumber: "TEST-DELIVERED-1",
      lastStatusAt: new Date().toISOString(),
    };
    await buyerPage.route(new RegExp(`/api/orders/${orderId}$`), async (route) => {
      const response = await route.fetch();
      const payload = (await response.json()) as { order: { delivery: object | null } };
      payload.order.delivery = delivered;
      await route.fulfill({ response, json: payload });
    });
    await buyerPage.reload();
    await expect(
      buyerPage.getByRole("region", { name: "Доставка" }).getByText("Доставлено"),
    ).toBeVisible();
    await expect(buyerPage.getByText("СДЭК · TEST-DELIVERED-1")).toBeVisible();
    await screenshot(buyerPage, "delivery-order-delivered-1440.png");

    await sellerPage.route(new RegExp(`/api/seller/orders/${orderId}$`), async (route) => {
      const response = await route.fetch();
      const payload = (await response.json()) as { order: { delivery: object | null } };
      payload.order.delivery = delivered;
      await route.fulfill({ response, json: payload });
    });
    await sellerPage.route(new RegExp(`/api/seller/orders/${orderId}/delivery$`), (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          delivery: delivered,
          events: [
            {
              statusCode: "DELIVERED",
              statusName: "Вручён",
              occurredAt: delivered.lastStatusAt,
            },
          ],
        }),
      }),
    );
    await sellerPage.reload();
    await expect(deliveryCard.getByText("Доставлено")).toBeVisible();
    await expect(deliveryCard.getByText("СДЭК · TEST-DELIVERED-1")).toBeVisible();
    await screenshot(sellerPage, "delivery-admin-order-delivered-1440.png");

    await testInfo.attach("delivery-flow.json", {
      contentType: "application/json",
      body: JSON.stringify(
        { orderId, shop: catalog.shop, providerOrderId: deliveryBody.delivery.providerOrderId },
        null,
        2,
      ),
    });
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});

test("manual fallback keeps a quoted order and shows the track to buyer and seller", async ({
  browser,
  request,
}) => {
  test.slow();

  const destination = await findDeliveryPoint(request);
  const origin = await findDeliveryOrigin(request);
  expect(origin.cityCode).not.toBe(destination.cityCode);
  const catalog = await deliveryCatalog(request, "E2E Ручной трек", origin);
  const buyer = await loginViaApi(request, uniquePhone());
  const orderId = await createPaidDeliveryOrder(request, catalog, buyer);
  const sellerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });
  const buyerContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });

  try {
    await seedBrowserSession(sellerContext, catalog.seller, null);
    await seedBrowserSession(buyerContext, buyer, null);
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto(`/admin/orders/${orderId}`);
    const deliveryCard = sellerPage.getByRole("region", { name: "Доставка" });
    await expect(deliveryCard.getByText("Ожидает отправки")).toBeVisible();
    await sellerPage.getByLabel("Перевозчик").fill("Почта России");
    await sellerPage.getByLabel("Трек", { exact: true }).fill("TESTTRACK-123");
    await screenshot(sellerPage, "delivery-admin-order-quoted-1440.png");
    await sellerPage.getByRole("button", { name: "Сохранить трек" }).click();
    await expect(deliveryCard.getByText("Ручной трек", { exact: true })).toBeVisible();
    await expect(deliveryCard.getByRole("button", { name: "Создать отправление" })).toHaveCount(0);
    await screenshot(sellerPage, "delivery-admin-order-manual-1440.png");

    const manual = await request.get(`/api/seller/orders/${orderId}/delivery`, {
      headers: { cookie: catalog.seller.cookie },
    });
    expect(manual.status(), await manual.text()).toBe(200);
    const manualBody = (await manual.json()) as {
      delivery: {
        status: string;
        providerOrderId: string | null;
        carrier: string;
        trackNumber: string;
      };
    };
    expect(manualBody.delivery).toMatchObject({
      status: "manual",
      providerOrderId: null,
      carrier: "Почта России",
      trackNumber: "TESTTRACK-123",
    });
    const createAfterManual = await request.post(`/api/seller/orders/${orderId}/delivery`, {
      headers: { cookie: catalog.seller.cookie },
      data: { tariffCode: "136" },
    });
    expect(createAfterManual.status()).toBe(409);
    expect(await createAfterManual.json()).toEqual({ error: "delivery_already_exists" });

    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto(`/orders/${orderId}`);
    const buyerDelivery = buyerPage.getByRole("region", { name: "Доставка" });
    await expect(buyerDelivery.getByText("Ручной трек", { exact: true })).toBeVisible();
    await expect(buyerDelivery.getByText("Почта России · TESTTRACK-123")).toBeVisible();
    await screenshot(buyerPage, "delivery-order-manual-1440.png");
  } finally {
    await sellerContext.close();
    await buyerContext.close();
  }
});
