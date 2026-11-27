import { describe, expect, it } from "vitest";
import {
  CreateProductSchema,
  PRODUCT_PRICE_MAX_KOPECKS,
  ProductIdSchema,
  SellerProductListResponseSchema,
  SellerProductSchema,
  UpdateProductSchema,
} from "./product-admin.js";

const validCreate = {
  name: "Куртка 90-х",
  priceKopecks: 420_000,
};

describe("create product contract", () => {
  it("accepts name, price and optional description/image URL", () => {
    expect(CreateProductSchema.parse(validCreate)).toEqual(validCreate);
    expect(
      CreateProductSchema.parse({
        ...validCreate,
        description: "Винтажная джинсовая куртка",
        imageUrl: "https://example.com/jacket.jpg",
      }),
    ).toEqual({
      ...validCreate,
      description: "Винтажная джинсовая куртка",
      imageUrl: "https://example.com/jacket.jpg",
    });
  });

  it("trims the name", () => {
    expect(CreateProductSchema.parse({ ...validCreate, name: "  Куртка  " }).name).toBe("Куртка");
  });

  it("accepts null image URL and both price boundaries", () => {
    expect(CreateProductSchema.safeParse({ ...validCreate, imageUrl: null }).success).toBe(true);
    expect(CreateProductSchema.safeParse({ ...validCreate, priceKopecks: 0 }).success).toBe(true);
    expect(
      CreateProductSchema.safeParse({ ...validCreate, priceKopecks: PRODUCT_PRICE_MAX_KOPECKS })
        .success,
    ).toBe(true);
  });

  it("rejects names outside 1–120 characters", () => {
    expect(CreateProductSchema.safeParse({ ...validCreate, name: "" }).success).toBe(false);
    expect(CreateProductSchema.safeParse({ ...validCreate, name: "   " }).success).toBe(false);
    expect(CreateProductSchema.safeParse({ ...validCreate, name: "a".repeat(121) }).success).toBe(
      false,
    );
    expect(CreateProductSchema.safeParse({ ...validCreate, name: "a".repeat(120) }).success).toBe(
      true,
    );
    expect(CreateProductSchema.safeParse({ priceKopecks: 100 }).success).toBe(false);
  });

  it("rejects prices that are not non-negative int4 kopecks", () => {
    for (const priceKopecks of [
      -1,
      1.5,
      PRODUCT_PRICE_MAX_KOPECKS + 1,
      Number.MAX_SAFE_INTEGER,
      "100",
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(
        CreateProductSchema.safeParse({ ...validCreate, priceKopecks }).success,
        String(priceKopecks),
      ).toBe(false);
    }
  });

  it("rejects descriptions and image URLs longer than 2000 characters", () => {
    expect(
      CreateProductSchema.safeParse({ ...validCreate, description: "a".repeat(2000) }).success,
    ).toBe(true);
    expect(
      CreateProductSchema.safeParse({ ...validCreate, description: "a".repeat(2001) }).success,
    ).toBe(false);
    expect(
      CreateProductSchema.safeParse({
        ...validCreate,
        imageUrl: `https://example.com/${"a".repeat(2000)}`,
      }).success,
    ).toBe(false);
    expect(
      CreateProductSchema.safeParse({ ...validCreate, imageUrl: "a".repeat(2000) }).success,
    ).toBe(true);
  });

  it("rejects NUL bytes in name, description and image URL", () => {
    expect(CreateProductSchema.safeParse({ ...validCreate, name: "A\u0000B" }).success).toBe(false);
    expect(CreateProductSchema.safeParse({ ...validCreate, description: "X\u0000Y" }).success).toBe(
      false,
    );
    expect(
      CreateProductSchema.safeParse({ ...validCreate, imageUrl: "https://example.com/\u0000.jpg" })
        .success,
    ).toBe(false);
  });
});

describe("product id contract", () => {
  it("coerces a positive int4 id", () => {
    expect(ProductIdSchema.parse("1")).toBe(1);
    expect(ProductIdSchema.parse(2_147_483_647)).toBe(2_147_483_647);
  });

  it("rejects ids outside the PostgreSQL int4 range", () => {
    for (const id of [
      0,
      -1,
      1.5,
      "abc",
      2_147_483_648,
      3_000_000_000,
      "3000000000",
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(ProductIdSchema.safeParse(id).success, String(id)).toBe(false);
    }
  });
});

describe("update product contract", () => {
  it("accepts every mutable field as a partial", () => {
    expect(UpdateProductSchema.safeParse({ name: "Новое имя" }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ description: "Описание" }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ description: null }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ priceKopecks: 0 }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ imageUrl: null }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ status: "published" }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ status: "hidden" }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ status: "draft" }).success).toBe(true);
  });

  it("rejects an empty update and unknown statuses", () => {
    expect(UpdateProductSchema.safeParse({}).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ status: "blocked" }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ name: "" }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ priceKopecks: -1 }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ priceKopecks: 1.5 }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ description: "a".repeat(2001) }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ imageUrl: "a".repeat(2001) }).success).toBe(false);
  });

  it("rejects NUL bytes in updated text fields", () => {
    expect(UpdateProductSchema.safeParse({ name: "A\u0000B" }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ description: "X\u0000Y" }).success).toBe(false);
    expect(
      UpdateProductSchema.safeParse({ imageUrl: "https://example.com/\u0000.jpg" }).success,
    ).toBe(false);
  });
});

describe("seller product response contract", () => {
  const product = {
    id: 1,
    name: "Куртка 90-х",
    description: null,
    priceKopecks: 420_000,
    imageUrl: null,
    status: "draft",
  };

  it("exposes all fields without timestamps", () => {
    expect(SellerProductSchema.parse(product)).toEqual(product);
    expect(SellerProductSchema.parse({ ...product, status: "published" }).status).toBe("published");
    expect(SellerProductSchema.parse({ ...product, status: "hidden" }).status).toBe("hidden");
    expect(SellerProductSchema.parse({ ...product, updatedAt: "2026-01-01" })).toEqual(product);
  });

  it("rejects unknown statuses and non-integer prices", () => {
    expect(SellerProductSchema.safeParse({ ...product, status: "blocked" }).success).toBe(false);
    expect(SellerProductSchema.safeParse({ ...product, priceKopecks: 1.5 }).success).toBe(false);
  });

  it("wraps the list in a products object", () => {
    expect(SellerProductListResponseSchema.parse({ products: [product] })).toEqual({
      products: [product],
    });
    expect(SellerProductListResponseSchema.parse({ products: [] })).toEqual({ products: [] });
  });
});
