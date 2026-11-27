import { describe, expect, it } from "vitest";
import { CatalogQuerySchema, CatalogResponseSchema, CatalogSortSchema } from "./catalog.js";

const card = {
  id: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  shop: { slug: "local-hand-demo", name: "Винтаж на районе" },
};

describe("CatalogQuerySchema", () => {
  it("applies defaults that keep the previous catalog output", () => {
    expect(CatalogQuerySchema.parse({})).toEqual({
      q: undefined,
      sort: "newest",
      page: 1,
      pageSize: 100,
    });
  });

  it("coerces page and pageSize from query strings", () => {
    expect(CatalogQuerySchema.parse({ page: "2", pageSize: "12" })).toEqual({
      q: undefined,
      sort: "newest",
      page: 2,
      pageSize: 12,
    });
  });

  it("trims the search query", () => {
    expect(CatalogQuerySchema.parse({ q: "  куртка  " }).q).toBe("куртка");
  });

  it("treats an empty or whitespace-only query as no search", () => {
    expect(CatalogQuerySchema.parse({ q: "" }).q).toBeUndefined();
    expect(CatalogQuerySchema.parse({ q: "   " }).q).toBeUndefined();
  });

  it("accepts search boundaries", () => {
    expect(CatalogQuerySchema.parse({ q: "a".repeat(100) }).q).toHaveLength(100);
    expect(CatalogQuerySchema.parse({ q: "a" }).q).toBe("a");
  });

  it.each([
    { q: "a".repeat(101) },
    { q: 42 },
    { q: "a\u0000b" },
    { q: "\u0000" },
    { sort: "oldest" },
    { page: "0" },
    { page: "-1" },
    { page: "1.5" },
    { page: "abc" },
    { pageSize: "0" },
    { pageSize: "101" },
    { pageSize: "1.5" },
    { pageSize: "abc" },
  ])("rejects invalid input %j", (input) => {
    expect(CatalogQuerySchema.safeParse(input).success).toBe(false);
  });

  it("keeps the sort enum exhaustive", () => {
    expect(CatalogSortSchema.options).toEqual(["newest", "price_asc", "price_desc"]);
    expect(CatalogQuerySchema.parse({ sort: "price_asc" }).sort).toBe("price_asc");
    expect(CatalogQuerySchema.parse({ sort: "price_desc" }).sort).toBe("price_desc");
  });
});

describe("CatalogResponseSchema", () => {
  it("accepts a paginated response with metadata", () => {
    expect(
      CatalogResponseSchema.parse({
        products: [card],
        page: 1,
        pageSize: 12,
        total: 1,
        hasMore: false,
      }),
    ).toEqual({
      products: [card],
      page: 1,
      pageSize: 12,
      total: 1,
      hasMore: false,
    });
  });

  it("rejects a response without pagination metadata", () => {
    expect(CatalogResponseSchema.safeParse({ products: [card] }).success).toBe(false);
  });

  it("rejects inconsistent metadata types", () => {
    expect(
      CatalogResponseSchema.safeParse({
        products: [],
        page: 0,
        pageSize: 12,
        total: -1,
        hasMore: "no",
      }).success,
    ).toBe(false);
  });
});
