import {
  formatRubles,
  kopecks,
  type DeliverySnapshot,
  type OrderPayment,
  type OrderSummary,
} from "@localhand/shared";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";
import { formatOrderDate, formatOrderPhone } from "./OrdersPage.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };
const firstBuyerPhone = phone("+7", "999", "111", "22", "33");
const secondBuyerPhone = phone("+7", "999", "444", "55", "66");
const createdAt = "2026-11-27T10:00:00.000Z";

const publishedShop = {
  id: 1,
  slug: "demo-shop",
  name: "Демо-магазин",
  description: null,
  cdekCityCode: null,
  cdekCityName: null,
  cdekShipmentPoint: null,
  status: "published" as const,
};

const firstOrder: OrderSummary = {
  id: 42,
  shop: { slug: "demo-shop", name: "Демо-магазин" },
  status: "new",
  totalKopecks: 420_000,
  buyerPhone: firstBuyerPhone,
  comment: "Позвоните после 18:00",
  createdAt,
  delivery: null,
  items: [
    {
      productId: 1,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      quantity: 1,
    },
  ],
};

const secondOrder: OrderSummary = {
  ...firstOrder,
  id: 43,
  totalKopecks: 89_900,
  buyerPhone: secondBuyerPhone,
  comment: null,
  items: [
    {
      productId: 2,
      name: "Ваза из стекла",
      priceKopecks: 89_900,
      quantity: 1,
    },
  ],
};

function payment(overrides: Partial<OrderPayment> = {}): OrderPayment {
  return {
    id: 5,
    status: "pending",
    amountKopecks: 420_000,
    currency: "RUB",
    confirmationUrl: null,
    createdAt,
    paidAt: null,
    ...overrides,
  };
}

function price(value: number): string {
  return formatRubles(kopecks(value)).replace(/\s+/g, " ");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminOrdersPage", () => {
  it("lists shop orders in a desktop table and mobile cards", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/orders": { body: { orders: [firstOrder, secondOrder] } },
      "GET /seller/orders/42/payment": { body: { payment: payment() } },
      "GET /seller/orders/43/payment": { body: { payment: null } },
    });

    renderApp(["/admin/orders"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Заказы" })).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Заказы покупателей вашего магазина, новые первыми. Статус оплаты показан отдельно от статуса заказа.",
      ),
    ).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Разделы админки" });
    expect(within(nav).getByRole("link", { name: "Заказы" })).toHaveAttribute(
      "href",
      "/admin/orders",
    );

    const table = await screen.findByRole("table", { name: "Заказы вашего магазина" });
    for (const header of [
      "№",
      "Дата",
      "Покупатель",
      "Состав",
      "Сумма",
      "Статус",
      "Оплата",
      "Действия",
    ]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(table).getByRole("rowheader", { name: "42" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "43" })).toBeInTheDocument();
    expect(within(table).getAllByText(formatOrderPhone(firstBuyerPhone)).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(formatOrderPhone(secondBuyerPhone)).length).toBeGreaterThan(
      0,
    );
    expect(within(table).getAllByText(formatOrderDate(createdAt)).length).toBe(2);
    expect(within(table).getByText("Куртка 90-х")).toBeInTheDocument();
    expect(within(table).getByText("Ваза из стекла")).toBeInTheDocument();
    expect(within(table).getByText(`Комментарий: Позвоните после 18:00`)).toBeInTheDocument();
    expect(within(table).getAllByText(price(420_000)).length).toBeGreaterThan(0);

    const desktopLink = within(table).getAllByRole("link", { name: "Открыть" })[0];
    expect(desktopLink).toHaveAttribute("href", "/admin/orders/42");

    expect(screen.getAllByRole("heading", { level: 2, name: "Заказ №42" }).length).toBe(1);
    const mobileLink = screen.getAllByRole("link", { name: "Открыть заказ" })[0];
    expect(mobileLink).toHaveAttribute("href", "/admin/orders/42");
    expect(screen.getAllByText("Новый").length).toBeGreaterThan(0);
  });

  it("shows an unavailable payment status with retry instead of 'no payment'", async () => {
    let fail = true;
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/orders": { body: { orders: [firstOrder] } },
      "GET /seller/orders/42/payment": () =>
        fail ? { status: 500, body: { error: "internal_error" } } : { body: { payment: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/orders"]);

    const table = await screen.findByRole("table", { name: "Заказы вашего магазина" });
    expect(await within(table).findByText("Статус оплаты недоступен")).toBeInTheDocument();
    expect(within(table).queryByText("Нет платежа")).not.toBeInTheDocument();

    fail = false;
    await browser.click(within(table).getByRole("button", { name: "Повторить" }));

    expect(await within(table).findByText("Нет платежа")).toBeInTheDocument();
  });

  it("falls back to the paid order status when no payment row exists", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/orders": { body: { orders: [{ ...firstOrder, status: "paid" }] } },
      "GET /seller/orders/42/payment": { body: { payment: null } },
    });

    renderApp(["/admin/orders"]);

    const table = await screen.findByRole("table", { name: "Заказы вашего магазина" });
    expect((await within(table).findAllByText("Оплачен")).length).toBeGreaterThan(0);
    expect(within(table).queryByText("Нет платежа")).not.toBeInTheDocument();
  });

  it("shows an onboarding state for a seller without a shop and skips the orders request", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: null } },
    });

    renderApp(["/admin/orders"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Сначала создайте магазин" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Заказы приходят в магазин. Настройте магазин, чтобы принимать заказы."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Настроить магазин" })).toHaveAttribute(
      "href",
      "/admin/shop",
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/seller/orders"))).toBe(
      false,
    );
  });

  it("shows an empty state when the shop has no orders", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/orders": { body: { orders: [] } },
    });

    renderApp(["/admin/orders"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказов пока нет" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Когда покупатель оформит заказ, он появится здесь с составом и контактами.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the shop loading state while the seller shop is fetched", async () => {
    let resolveShop!: (value: { body: { shop: typeof publishedShop } }) => void;
    const shopResponse = new Promise<{ body: { shop: typeof publishedShop } }>((resolve) => {
      resolveShop = resolve;
    });
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": () => shopResponse,
      "GET /seller/orders": { body: { orders: [] } },
    });

    renderApp(["/admin/orders"]);

    expect(await screen.findByText("Загружаем магазин")).toBeInTheDocument();
    expect(screen.getByText("Секунду — проверяем кабинет.")).toBeInTheDocument();

    resolveShop({ body: { shop: publishedShop } });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказов пока нет" }),
    ).toBeInTheDocument();
  });

  it("shows the orders loading state after the shop is known", async () => {
    let resolveOrders!: (value: { body: { orders: OrderSummary[] } }) => void;
    const ordersResponse = new Promise<{ body: { orders: OrderSummary[] } }>((resolve) => {
      resolveOrders = resolve;
    });
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/orders": () => ordersResponse,
    });

    renderApp(["/admin/orders"]);

    expect(await screen.findByText("Загружаем заказы")).toBeInTheDocument();
    expect(screen.getByText("Секунду — собираем заказы магазина.")).toBeInTheDocument();

    resolveOrders({ body: { orders: [] } });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказов пока нет" }),
    ).toBeInTheDocument();
  });

  it("shows a retryable error state", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/orders": { status: 500, body: { error: "internal_error" } },
    });

    renderApp(["/admin/orders"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказы не загрузились" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Проверьте соединение и попробуйте снова.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("redirects to login when the seller orders request returns 401", async () => {
    let sessionExpired = false;
    installFetchMock({
      "GET /auth/me": () =>
        sessionExpired
          ? { status: 401, body: { error: "unauthorized" } }
          : { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/orders": { status: 401, body: { error: "unauthorized" } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/orders"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Сессия истекла" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Войдите снова, чтобы продолжить.")).toBeInTheDocument();

    sessionExpired = true;
    await browser.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Вход" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Fadmin%2Forders");
  });
});

describe("AdminOrderPage", () => {
  it("shows the delivery snapshot to the seller", async () => {
    const delivery: DeliverySnapshot = {
      provider: "cdek",
      status: "in_transit",
      cityCode: 44,
      cityName: "Москва",
      pointCode: "MSK001",
      pointAddress: "ул. Тестовая, 1, ПВЗ «Тестовый»",
      recipientName: "Иван Тестов",
      tariffCode: "136",
      tariffName: "Посылка склад-ПВЗ",
      priceKopecks: 45_000,
      periodMin: 2,
      periodMax: 5,
      providerOrderId: "cdek-order-42",
      providerNumber: "1234567890",
      carrier: null,
      trackNumber: "1234567890",
      lastStatusCode: "IN_TRANSIT",
      lastStatusAt: "2026-11-27T12:00:00.000Z",
    };
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/orders/42": { body: { order: { ...firstOrder, delivery } } },
      "GET /seller/orders/42/payment": { body: { payment: null } },
    });

    renderApp(["/admin/orders/42"]);

    const deliverySection = await screen.findByRole("region", { name: "Доставка" });
    expect(within(deliverySection).getByText("В пути")).toBeInTheDocument();
    expect(within(deliverySection).getByText("ПВЗ получателя")).toBeInTheDocument();
    expect(within(deliverySection).getByText("2–5 дн.")).toBeInTheDocument();
    expect(within(deliverySection).getByText("Перевозчик · 1234567890")).toBeInTheDocument();
  });

  it("shows the seller order details", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/orders/42": { body: { order: firstOrder } },
      "GET /seller/orders/42/payment": { body: { payment: null } },
    });

    renderApp(["/admin/orders/42"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Заказ №42" })).toBeInTheDocument();
    expect(await screen.findByText("Новый")).toBeInTheDocument();
    const pageHeader = screen
      .getByRole("heading", { level: 1, name: "Заказ №42" })
      .closest("header");
    expect(pageHeader).not.toBeNull();
    expect(within(pageHeader as HTMLElement).getByText("Кабинет продавца")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Состав" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Покупатель" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Что дальше" })).toBeInTheDocument();
    expect(screen.getByText("Магазин:")).toBeInTheDocument();
    expect(screen.getByText("Итого")).toBeInTheDocument();
    expect(screen.getByText("Телефон")).toBeInTheDocument();
    expect(screen.getByText("Комментарий")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Состав заказа №42" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Свяжитесь с покупателем по телефону и согласуйте передачу товара. Статус оплаты показан отдельно от статуса заказа.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Все заказы" })).toHaveAttribute(
      "href",
      "/admin/orders",
    );
    expect(screen.getByText(`Создан ${formatOrderDate(createdAt)}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: formatOrderPhone(firstBuyerPhone) })).toHaveAttribute(
      "href",
      `tel:${firstBuyerPhone}`,
    );
    expect(screen.getByText("Позвоните после 18:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Куртка 90-х" })).toHaveAttribute(
      "href",
      "/products/1",
    );
    expect(screen.getAllByText(price(420_000)).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "К заказам" })).toHaveAttribute(
      "href",
      "/admin/orders",
    );
    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(within(paymentSection).getByText(/Платёж не начат/)).toBeInTheDocument();
    expect(
      within(paymentSection).queryByRole("button", { name: /Оплатить/ }),
    ).not.toBeInTheDocument();
  });

  it("shows manual_review as a payment badge separate from the order status", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/orders/42": {
        body: { order: { ...firstOrder, status: "payment_pending" } },
      },
      "GET /seller/orders/42/payment": {
        body: { payment: payment({ status: "manual_review" }) },
      },
    });

    renderApp(["/admin/orders/42"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Заказ №42" })).toBeInTheDocument();
    expect(await screen.findByText("Ожидает оплаты")).toBeInTheDocument();
    const paymentSection = screen.getByRole("region", { name: "Оплата" });
    expect(await within(paymentSection).findByText("Требует проверки")).toBeInTheDocument();
    expect(
      within(paymentSection).getByText(
        "Платёж на ручной проверке. Поддержка разберётся с платежом. Заказ не станет «Оплачен» автоматически.",
      ),
    ).toBeInTheDocument();
    expect(
      within(paymentSection).getByText(/поддержка разберётся|ручной проверке/i),
    ).toBeInTheDocument();
    expect(within(paymentSection).queryByText(/runbook|ops/i)).not.toBeInTheDocument();
    expect(
      within(paymentSection).queryByRole("button", { name: /Оплатить/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a retryable payment read error on the seller order", async () => {
    let fail = true;
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/orders/42": { body: { order: firstOrder } },
      "GET /seller/orders/42/payment": () =>
        fail ? { status: 500, body: { error: "internal_error" } } : { body: { payment: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(
      await within(paymentSection).findByText("Статус оплаты недоступен."),
    ).toBeInTheDocument();

    fail = false;
    await browser.click(within(paymentSection).getByRole("button", { name: "Повторить" }));

    expect(await within(paymentSection).findByText(/Платёж не начат/)).toBeInTheDocument();
  });

  it("shows the paid order status when no payment row exists", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/orders/42": { body: { order: { ...firstOrder, status: "paid" } } },
      "GET /seller/orders/42/payment": { body: { payment: null } },
    });

    renderApp(["/admin/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(await within(paymentSection).findByText("Оплачен")).toBeInTheDocument();
    expect(
      within(paymentSection).getByText("Платёж не найден. Статус взят из заказа."),
    ).toBeInTheDocument();
    expect(within(paymentSection).queryByText(/Платёж не начат/)).not.toBeInTheDocument();
  });

  it("shows the paid payment amount and date on the seller order", async () => {
    const paidAt = "2026-11-27T12:00:00.000Z";
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/orders/42": { body: { order: { ...firstOrder, status: "paid" } } },
      "GET /seller/orders/42/payment": {
        body: { payment: payment({ status: "succeeded", paidAt }) },
      },
    });

    renderApp(["/admin/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect((await within(paymentSection).findAllByText("Оплачен")).length).toBeGreaterThan(0);
    expect(within(paymentSection).getByText(price(420_000))).toBeInTheDocument();
    expect(within(paymentSection).getByText(formatOrderDate(paidAt))).toBeInTheDocument();
  });

  it("shows a not-found state for a foreign order", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/orders/999": { status: 404, body: { error: "not_found" } },
    });

    renderApp(["/admin/orders/999"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказ не найден" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Заказ оформлен в другом магазине или ссылка устарела."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К списку заказов" })).toHaveAttribute(
      "href",
      "/admin/orders",
    );
  });
});
