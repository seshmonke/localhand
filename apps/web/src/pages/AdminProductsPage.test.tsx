import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };

const publishedShop = {
  id: 1,
  slug: "demo-shop",
  name: "Демо-магазин",
  description: null,
  status: "published" as const,
};

const draftProduct = {
  id: 11,
  name: "Куртка 90-х",
  description: "Тёплая куртка из девяностых.",
  priceKopecks: 420_000,
  imageUrl: null,
  status: "draft" as const,
};

const publishedProduct = {
  id: 12,
  name: "Ваза из стекла",
  description: null,
  priceKopecks: 89_900,
  imageUrl: "https://example.com/vase.jpg",
  status: "published" as const,
};

const hiddenProduct = {
  id: 13,
  name: "Плёночный фотоаппарат",
  description: null,
  priceKopecks: 350_000,
  imageUrl: null,
  status: "hidden" as const,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminProductsPage", () => {
  it("lists own products with every status in a captioned table", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": {
        body: { products: [draftProduct, publishedProduct, hiddenProduct] },
      },
    });

    renderApp(["/admin/products"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Товары" })).toBeInTheDocument();

    const table = await screen.findByRole("table", { name: "Товары вашего магазина" });
    expect(table).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Название",
      "Цена",
      "Статус",
      "Действия",
    ]);

    expect(screen.getAllByText("Куртка 90-х").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ваза из стекла").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Плёночный фотоаппарат").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Черновик").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Опубликован").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Скрыт").length).toBeGreaterThan(0);

    const editLinks = [
      ...screen.getAllByRole("link", { name: "Изменить" }),
      ...screen.getAllByRole("link", { name: "Редактировать" }),
    ];
    expect(editLinks.some((link) => link.getAttribute("href") === "/admin/products/11")).toBe(true);
    expect(screen.getByRole("link", { name: "Новый товар" })).toHaveAttribute(
      "href",
      "/admin/products/new",
    );
  });

  it("shows an empty state that links to the creation form", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": { body: { products: [] } },
    });

    renderApp(["/admin/products"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Товаров пока нет" }),
    ).toBeInTheDocument();

    const createLinks = screen.getAllByRole("link", { name: "Новый товар" });
    expect(createLinks.length).toBeGreaterThan(0);
    expect(createLinks.every((link) => link.getAttribute("href") === "/admin/products/new")).toBe(
      true,
    );
  });

  it("shows a retryable error state when the product list fails", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": { status: 500, body: { error: "internal_error" } },
    });

    renderApp(["/admin/products"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Товары не загрузились" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("points a seller without a shop to the shop settings and skips the product request", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: null } },
    });

    renderApp(["/admin/products"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Сначала создайте магазин" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Настроить магазин" })).toHaveAttribute(
      "href",
      "/admin/shop",
    );

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/seller/products"))).toBe(
      false,
    );
  });

  it("shows a not-found state for a product outside the seller's list", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": { body: { products: [draftProduct] } },
    });

    renderApp(["/admin/products/999"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Редактирование товара" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Товар не найден" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К списку товаров" })).toHaveAttribute(
      "href",
      "/admin/products",
    );
  });
});
