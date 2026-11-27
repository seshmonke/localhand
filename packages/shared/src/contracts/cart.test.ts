import { describe, expect, it } from "vitest";
import { CART_MAX_ITEMS, CartItemSchema, CartStateSchema } from "./cart.js";

const item = {
  productId: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  shopSlug: "vintage-shop",
  shopName: "Винтаж на районе",
};

function cartWith(itemCount: number) {
  return {
    version: 1,
    items: Array.from({ length: itemCount }, (_, index) => ({
      ...item,
      productId: index + 1,
    })),
  };
}

describe("CartItemSchema", () => {
  it("parses a cart snapshot item", () => {
    expect(CartItemSchema.parse(item)).toEqual(item);
  });

  it("accepts a non-null image url", () => {
    expect(
      CartItemSchema.parse({ ...item, imageUrl: "https://cdn.example.com/item.jpg" }).imageUrl,
    ).toBe("https://cdn.example.com/item.jpg");
  });

  it.each([
    { ...item, productId: 0 },
    { ...item, productId: 1.5 },
    { ...item, name: "" },
    { ...item, priceKopecks: -1 },
    { ...item, priceKopecks: 1.5 },
    { ...item, imageUrl: 42 },
    { ...item, shopSlug: "" },
    { ...item, shopName: "" },
    { ...item, productId: undefined },
  ])("rejects invalid item %j", (input) => {
    expect(CartItemSchema.safeParse(input).success).toBe(false);
  });
});

describe("CartStateSchema", () => {
  it("parses the versioned cart with up to the item limit", () => {
    const state = cartWith(CART_MAX_ITEMS);
    expect(CartStateSchema.parse(state)).toEqual(state);
  });

  it("rejects a cart above the item limit", () => {
    expect(CartStateSchema.safeParse(cartWith(CART_MAX_ITEMS + 1)).success).toBe(false);
  });

  it("rejects an unknown storage version", () => {
    expect(CartStateSchema.safeParse({ ...cartWith(1), version: 2 }).success).toBe(false);
  });

  it("rejects a cart without items", () => {
    expect(CartStateSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});
