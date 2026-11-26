import type { ProductCard, ProductDetail, ShopPage } from "@localhand/shared";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./storefront.service.js", () => ({
  listPublishedProducts: vi.fn(),
  getPublishedShop: vi.fn(),
  getPublishedProduct: vi.fn(),
}));

import { buildApp } from "../app.js";
import * as storefrontService from "./storefront.service.js";

const card: ProductCard = {
  id: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  shop: { slug: "local-hand-demo", name: "Винтаж на районе" },
};

const shopPage: ShopPage = {
  slug: "local-hand-demo",
  name: "Винтаж на районе",
  description: "Тестовый магазин",
  products: [card],
};

const productDetail: ProductDetail = {
  ...card,
  description: "Винтажная куртка",
};

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.mocked(storefrontService.listPublishedProducts).mockReset();
  vi.mocked(storefrontService.getPublishedShop).mockReset();
  vi.mocked(storefrontService.getPublishedProduct).mockReset();
});

describe("storefront routes", () => {
  it("returns the published catalog", async () => {
    vi.mocked(storefrontService.listPublishedProducts).mockResolvedValue([card]);

    const response = await app.inject({ method: "GET", url: "/catalog/products" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ products: [card] });
  });

  it("returns a shop with its products", async () => {
    vi.mocked(storefrontService.getPublishedShop).mockResolvedValue(shopPage);

    const response = await app.inject({ method: "GET", url: "/shops/local-hand-demo" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(shopPage);
  });

  it("returns 404 for an unknown shop", async () => {
    vi.mocked(storefrontService.getPublishedShop).mockResolvedValue(null);

    const response = await app.inject({ method: "GET", url: "/shops/missing" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found" });
  });

  it("returns a product detail", async () => {
    vi.mocked(storefrontService.getPublishedProduct).mockResolvedValue(productDetail);

    const response = await app.inject({ method: "GET", url: "/products/1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(productDetail);
  });

  it("returns 404 for an unknown product", async () => {
    vi.mocked(storefrontService.getPublishedProduct).mockResolvedValue(null);

    const response = await app.inject({ method: "GET", url: "/products/999" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found" });
  });
});
