import { formatRubles, kopecks, type OrderSummary } from "@localhand/shared";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";
import { formatOrderDate, formatOrderPhone } from "./OrdersPage.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };
const createdAt = "2026-11-27T10:00:00.000Z";

const order: OrderSummary = {
  id: 42,
  shop: { slug: "vintage-shop", name: "Винтаж на районе" },
  status: "new",
  totalKopecks: 509_900,
  buyerPhone: demoUser.phone,
  comment: "Позвоните после 18:00",
  createdAt,
  items: [
    {
      productId: 1,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      quantity: 1,
    },
    {
      productId: 2,
      name: "Ваза из стекла",
      priceKopecks: 89_900,
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

describe("OrderPage", () => {
  it("shows the buyer order with items, total, phone, comment and created date", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
    });

    renderApp(["/orders/42"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Заказ №42" })).toBeInTheDocument();
    expect(await screen.findByText("Новый")).toBeInTheDocument();
    expect(screen.getByText(`Создан ${formatOrderDate(createdAt)}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Винтаж на районе" })).toHaveAttribute(
      "href",
      "/shops/vintage-shop",
    );
    expect(screen.getByRole("link", { name: "Куртка 90-х" })).toHaveAttribute(
      "href",
      "/products/1",
    );
    expect(screen.getByRole("link", { name: "Ваза из стекла" })).toHaveAttribute(
      "href",
      "/products/2",
    );
    expect(screen.getAllByText(price(420_000)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(price(89_900)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(price(509_900)).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: formatOrderPhone(demoUser.phone) })).toHaveAttribute(
      "href",
      `tel:${demoUser.phone}`,
    );
    expect(screen.getByText("Позвоните после 18:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К заказам" })).toHaveAttribute("href", "/orders");
  });

  it("shows a not-found state for a missing or foreign order", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/999": { status: 404, body: { error: "not_found" } },
    });

    renderApp(["/orders/999"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказ не найден" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К списку заказов" })).toHaveAttribute(
      "href",
      "/orders",
    );
  });

  it("does not request an invalid order id", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
    });

    renderApp(["/orders/not-a-number"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказ не найден" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/orders/not-a-number")),
    ).toBe(false);
  });
});
