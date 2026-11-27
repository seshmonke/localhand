import { describe, expect, it } from "vitest";
import {
  CreateShopSchema,
  isValidShopSlug,
  isReservedShopSlug,
  reservedShopSlugs,
  SellerShopResponseSchema,
  SellerShopSchema,
  UpdateShopSchema,
} from "./seller.js";

describe("shop slug validation", () => {
  it("accepts lowercase latin slugs with digits and inner hyphens", () => {
    expect(isValidShopSlug("vintage-shop")).toBe(true);
    expect(isValidShopSlug("shop-2")).toBe(true);
    expect(isValidShopSlug("abc")).toBe(true);
    expect(isValidShopSlug("a".repeat(40))).toBe(true);
  });

  it("rejects wrong length, characters, edge hyphens and uppercase", () => {
    expect(isValidShopSlug("ab")).toBe(false);
    expect(isValidShopSlug("a".repeat(41))).toBe(false);
    expect(isValidShopSlug("-shop")).toBe(false);
    expect(isValidShopSlug("shop-")).toBe(false);
    expect(isValidShopSlug("Shop")).toBe(false);
    expect(isValidShopSlug("shop_name")).toBe(false);
    expect(isValidShopSlug("shop name")).toBe(false);
    expect(isValidShopSlug("магазин")).toBe(false);
    expect(isValidShopSlug("shop--name")).toBe(true);
  });

  it("rejects every reserved slug", () => {
    for (const slug of reservedShopSlugs) {
      expect(isReservedShopSlug(slug)).toBe(true);
      expect(isValidShopSlug(slug)).toBe(false);
    }
  });

  it("rejects reserved and invalid slugs through the contract", () => {
    const base = { name: "Винтаж на районе" };

    expect(CreateShopSchema.safeParse({ ...base, slug: "admin" }).success).toBe(false);
    expect(CreateShopSchema.safeParse({ ...base, slug: "Bad_Slug" }).success).toBe(false);
    expect(CreateShopSchema.safeParse({ ...base, slug: "ok-slug" }).success).toBe(true);
  });
});

describe("create shop contract", () => {
  it("trims the name and keeps the optional description", () => {
    const parsed = CreateShopSchema.parse({
      name: "  Винтаж на районе  ",
      slug: "vintage-shop",
      description: "Секонд-хенд",
    });

    expect(parsed).toEqual({
      name: "Винтаж на районе",
      slug: "vintage-shop",
      description: "Секонд-хенд",
    });
  });

  it("requires a name of 1–80 characters and a description up to 2000", () => {
    const valid = { name: "Магазин", slug: "shop-1" };

    expect(CreateShopSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(CreateShopSchema.safeParse({ ...valid, name: "a".repeat(81) }).success).toBe(false);
    expect(CreateShopSchema.safeParse({ ...valid, description: "a".repeat(2001) }).success).toBe(
      false,
    );
    expect(CreateShopSchema.safeParse({ ...valid, slug: "ab" }).success).toBe(false);
    expect(CreateShopSchema.safeParse({ slug: "shop-1" }).success).toBe(false);
  });
});

describe("update shop contract", () => {
  it("accepts partial fields and a null description", () => {
    expect(UpdateShopSchema.safeParse({ name: "Новое имя" }).success).toBe(true);
    expect(UpdateShopSchema.safeParse({ description: null }).success).toBe(true);
    expect(UpdateShopSchema.safeParse({ status: "published" }).success).toBe(true);
    expect(UpdateShopSchema.safeParse({ status: "draft" }).success).toBe(true);
    expect(
      UpdateShopSchema.safeParse({
        cdekCityCode: 44,
        cdekCityName: "Москва",
        cdekShipmentPoint: "MSK123",
      }).success,
    ).toBe(true);
    expect(UpdateShopSchema.safeParse({ cdekCityCode: null }).success).toBe(true);
  });

  it("rejects an empty update and the platform-only blocked status", () => {
    expect(UpdateShopSchema.safeParse({}).success).toBe(false);
    expect(UpdateShopSchema.safeParse({ status: "blocked" }).success).toBe(false);
    expect(UpdateShopSchema.safeParse({ name: "" }).success).toBe(false);
    expect(UpdateShopSchema.safeParse({ slug: "admin" }).success).toBe(false);
    expect(UpdateShopSchema.safeParse({ description: "a".repeat(2001) }).success).toBe(false);
    expect(UpdateShopSchema.safeParse({ cdekCityCode: 0 }).success).toBe(false);
    expect(UpdateShopSchema.safeParse({ cdekShipmentPoint: "  " }).success).toBe(false);
  });
});

describe("seller shop response contract", () => {
  it("allows a null shop for a seller without one", () => {
    expect(SellerShopResponseSchema.safeParse({ shop: null }).success).toBe(true);
  });

  it("exposes the shop statuses without timestamps", () => {
    const shop = {
      id: 1,
      slug: "vintage-shop",
      name: "Винтаж на районе",
      description: null,
      cdekCityCode: null,
      cdekCityName: null,
      cdekShipmentPoint: null,
      status: "draft",
    };

    expect(SellerShopSchema.safeParse(shop).success).toBe(true);
    expect(SellerShopSchema.safeParse({ ...shop, status: "published" }).success).toBe(true);
    expect(SellerShopSchema.safeParse({ ...shop, status: "blocked" }).success).toBe(true);
    expect(SellerShopSchema.safeParse({ ...shop, status: "hidden" }).success).toBe(false);
    expect(SellerShopResponseSchema.parse({ shop })).toEqual({ shop });
  });
});
