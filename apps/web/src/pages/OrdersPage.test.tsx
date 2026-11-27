import { formatRubles, kopecks, type OrderSummary } from "@localhand/shared";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  items: [
    {
      productId: 1,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      quantity: 1,
    },
  ],
};

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
    });

    renderApp(["/orders"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Мои заказы" }),
    ).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 2, name: "Заказ №42" })).toBeInTheDocument();
    expect(screen.getByText("Новый")).toBeInTheDocument();
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

  it("shows an empty state with a catalog link", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/mine": { body: { orders: [] } },
    });

    renderApp(["/orders"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказов пока нет" }),
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
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("redirects to login when the orders request returns 401", async () => {
    let meCalls = 0;
    installFetchMock({
      "GET /auth/me": () => {
        meCalls += 1;
        return meCalls === 1
          ? { body: { user: demoUser } }
          : { status: 401, body: { error: "unauthorized" } };
      },
      "GET /orders/mine": { status: 401, body: { error: "unauthorized" } },
    });

    const browser = userEvent.setup();
    renderApp(["/orders"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Сессия истекла" }),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Вход" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Forders");
  });
});
