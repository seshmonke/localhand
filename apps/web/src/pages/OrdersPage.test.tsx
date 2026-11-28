import {
  formatRubles,
  kopecks,
  type DeliverySnapshot,
  type OrderPayment,
  type OrderSummary,
} from "@localhand/shared";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authKeys, orderKeys, sellerKeys } from "../lib/queries.js";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";
import { formatOrderDate } from "./OrdersPage.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };
const createdAt = "2026-11-27T10:00:00.000Z";

const order: OrderSummary = {
  id: 42,
  shop: { slug: "vintage-shop", name: "Винтаж на районе" },
  status: "new",
  totalKopecks: 420_000,
  buyerPhone: demoUser.phone,
  comment: null,
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

const inTransitDelivery: DeliverySnapshot = {
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
  carrier: "СДЭК",
  trackNumber: "1234567890",
  lastStatusCode: "IN_TRANSIT",
  lastStatusAt: "2026-11-27T12:00:00.000Z",
};

function payment(overrides: Partial<OrderPayment> = {}): OrderPayment {
  return {
    id: 5,
    status: "pending",
    amountKopecks: 420_000,
    currency: "RUB",
    confirmationUrl: "https://yookassa.example/confirm/abc",
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

describe("OrdersPage", () => {
  it("lists buyer orders with status, shop, items, total and a detail link", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": { body: { orders: [order] } },
      "GET /orders/42/payment": { body: { payment: null } },
    });

    renderApp(["/orders"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Мои заказы" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Заказы, оформленные с вашего номера. Продавец свяжется с вами по телефону.",
      ),
    ).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 2, name: "Заказ №42" })).toBeInTheDocument();
    expect(document.querySelector('[aria-label="Статус оплаты"]')).not.toBeNull();
    expect(screen.getByText(/Магазин:/)).toBeInTheDocument();
    expect(screen.getByText("Оплата")).toBeInTheDocument();
    expect(screen.getByText("Новый")).toBeInTheDocument();
    expect(await screen.findByText("Оплата не начата")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Винтаж на районе" })).toHaveAttribute(
      "href",
      "/shops/vintage-shop",
    );
    expect(screen.getByRole("link", { name: "Куртка 90-х" })).toHaveAttribute(
      "href",
      "/products/1",
    );
    expect(screen.getAllByText(price(420_000)).length).toBeGreaterThan(0);
    expect(screen.getByText(formatOrderDate(createdAt))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Подробнее" })).toHaveAttribute("href", "/orders/42");
  });

  it("shows a delivery line only for orders with delivery", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": {
        body: {
          orders: [
            { ...order, totalKopecks: 465_000, delivery: inTransitDelivery },
            { ...order, id: 43, delivery: null },
          ],
        },
      },
      "GET /orders/42/payment": { body: { payment: null } },
      "GET /orders/43/payment": { body: { payment: null } },
    });

    renderApp(["/orders"]);

    const card = await screen.findByRole("article", { name: "Заказ №42" });
    expect(within(card).getByText(/Доставка:/)).toHaveTextContent(
      `Доставка: ${price(45_000)} · В пути`,
    );
    expect(screen.getAllByText(/Доставка:/)).toHaveLength(1);
  });

  it("shows the active payment status on the order card", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": { body: { orders: [order] } },
      "GET /orders/42/payment": { body: { payment: payment() } },
    });

    renderApp(["/orders"]);

    const card = await screen.findByRole("article", { name: "Заказ №42" });
    expect(await within(card).findByText("Ожидает оплаты")).toBeInTheDocument();
    expect(within(card).queryByText("Оплата не начата")).not.toBeInTheDocument();
  });

  it("shows a paid payment status on the order card", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": { body: { orders: [{ ...order, status: "paid" }] } },
      "GET /orders/42/payment": {
        body: {
          payment: payment({
            status: "succeeded",
            confirmationUrl: null,
            paidAt: "2026-11-27T12:00:00.000Z",
          }),
        },
      },
    });

    renderApp(["/orders"]);

    const card = await screen.findByRole("article", { name: "Заказ №42" });
    expect(await within(card).findByText("Оплачен")).toBeInTheDocument();
    expect(within(card).queryByText("Оплата не начата")).not.toBeInTheDocument();
  });

  it("does not turn a payment read error into 'payment not started'", async () => {
    let fail = true;
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": { body: { orders: [order] } },
      "GET /orders/42/payment": () =>
        fail ? { status: 500, body: { error: "internal_error" } } : { body: { payment: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/orders"]);

    const card = await screen.findByRole("article", { name: "Заказ №42" });
    expect(await within(card).findByText("Статус оплаты недоступен")).toBeInTheDocument();
    expect(within(card).queryByText("Оплата не начата")).not.toBeInTheDocument();

    fail = false;
    await browser.click(within(card).getByRole("button", { name: "Повторить" }));

    expect(await within(card).findByText("Оплата не начата")).toBeInTheDocument();
  });

  it("falls back to the paid order status when no payment row exists", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": { body: { orders: [{ ...order, status: "paid" }] } },
      "GET /orders/42/payment": { body: { payment: null } },
    });

    renderApp(["/orders"]);

    const card = await screen.findByRole("article", { name: "Заказ №42" });
    expect((await within(card).findAllByText("Оплачен")).length).toBeGreaterThan(0);
    expect(within(card).queryByText("Оплата не начата")).not.toBeInTheDocument();
  });

  it("shows the loading state while buyer orders are fetched", async () => {
    let resolveOrders!: (value: { body: { orders: OrderSummary[] } }) => void;
    const ordersResponse = new Promise<{ body: { orders: OrderSummary[] } }>((resolve) => {
      resolveOrders = resolve;
    });
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": () => ordersResponse,
    });

    renderApp(["/orders"]);

    expect(await screen.findByText("Загружаем заказы")).toBeInTheDocument();
    expect(screen.getByText("Секунду — собираем ваши заказы.")).toBeInTheDocument();

    resolveOrders({ body: { orders: [] } });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказов пока нет" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state with a catalog link", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": { body: { orders: [] } },
    });

    renderApp(["/orders"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказов пока нет" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Добавьте товары в корзину и оформите первый заказ — он появится здесь."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в каталог" })).toHaveAttribute("href", "/");
  });

  it("shows a retryable error state", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": { status: 500, body: { error: "internal_error" } },
    });

    renderApp(["/orders"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказы не загрузились" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Проверьте соединение и попробуйте снова.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("shows the buyer-neutral session expired state and clears buyer data on a 401", async () => {
    let sessionExpired = false;
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });
    client.setQueryData(authKeys.me, { user: demoUser });
    client.setQueryData(orderKeys.mine, { orders: [order] });
    client.setQueryData(sellerKeys.orders, { orders: [] });

    installFetchMock({
      "GET /auth/me": () =>
        sessionExpired
          ? { status: 401, body: { error: "unauthorized" } }
          : { body: { user: demoUser } },
      "GET /orders/mine": { status: 401, body: { error: "unauthorized" } },
      "GET /orders/42/payment": { body: { payment: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/orders"], client);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Сессия истекла" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Войдите снова, чтобы продолжить.")).toBeInTheDocument();

    sessionExpired = true;
    await browser.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Вход" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Forders");
    expect(client.getQueryData(authKeys.me)).toBeUndefined();
    expect(client.getQueryCache().findAll({ queryKey: orderKeys.all })).toHaveLength(0);
  });
});
