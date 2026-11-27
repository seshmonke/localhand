import type {
  CatalogQuery,
  CatalogResponse,
  ProductCard,
  ProductDetail,
  ShopPage,
} from "@localhand/shared";
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

const catalogResponse: CatalogResponse = {
  products: [card],
  page: 1,
  pageSize: 100,
  total: 1,
  hasMore: false,
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
  it("returns the published catalog with default pagination", async () => {
    vi.mocked(storefrontService.listPublishedProducts).mockResolvedValue(catalogResponse);

    const response = await app.inject({ method: "GET", url: "/catalog/products" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(catalogResponse);
    expect(vi.mocked(storefrontService.listPublishedProducts)).toHaveBeenCalledWith({
      q: undefined,
      sort: "newest",
      page: 1,
      pageSize: 100,
    } satisfies CatalogQuery);
  });

  it("passes trimmed search, sort and pagination to the service", async () => {
    vi.mocked(storefrontService.listPublishedProducts).mockResolvedValue({
      ...catalogResponse,
      page: 2,
      pageSize: 12,
      hasMore: true,
    });

    const response = await app.inject({
      method: "GET",
      url: "/catalog/products?q=%20куртка%20&sort=price_asc&page=2&pageSize=12",
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(storefrontService.listPublishedProducts)).toHaveBeenCalledWith({
      q: "куртка",
      sort: "price_asc",
      page: 2,
      pageSize: 12,
    } satisfies CatalogQuery);
  });

  it.each([
    "/catalog/products?q=" + "a".repeat(101),
    "/catalog/products?q=%00",
    "/catalog/products?sort=oldest",
    "/catalog/products?page=0",
    "/catalog/products?page=1.5",
    "/catalog/products?pageSize=0",
    "/catalog/products?pageSize=101",
  ])("rejects invalid catalog query %s with 400", async (url) => {
    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
    expect(storefrontService.listPublishedProducts).not.toHaveBeenCalled();
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

  it("rejects product ids outside the int4 range with 400 and accepts the int4 max", async () => {
    const outOfRange = await app.inject({ method: "GET", url: "/products/2147483648" });

    expect(outOfRange.statusCode).toBe(400);
    expect(outOfRange.json()).toEqual({ error: "invalid_request" });
    expect(storefrontService.getPublishedProduct).not.toHaveBeenCalled();

    vi.mocked(storefrontService.getPublishedProduct).mockResolvedValue(null);

    const maxId = await app.inject({ method: "GET", url: "/products/2147483647" });

    expect(maxId.statusCode).toBe(404);
    expect(maxId.json()).toEqual({ error: "not_found" });
    expect(storefrontService.getPublishedProduct).toHaveBeenCalledWith(2_147_483_647);
  });
});
