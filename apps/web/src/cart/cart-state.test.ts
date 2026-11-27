import { CART_MAX_ITEMS, type CartItem, type CartState } from "@localhand/shared";
import { describe, expect, it } from "vitest";
import {
  addCartItem,
  cartCount,
  cartTotalKopecks,
  clearCartState,
  emptyCartState,
  groupCartItems,
  removeCartItem,
} from "./cart-state.js";

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 1,
    name: "Куртка 90-х",
    priceKopecks: 420_000,
    imageUrl: null,
    shopSlug: "vintage-shop",
    shopName: "Винтаж на районе",
    ...overrides,
  };
}

function stateWith(items: CartItem[]): CartState {
  return { version: 1, items };
}

function fillToLimit(): CartItem[] {
  return Array.from({ length: CART_MAX_ITEMS }, (_, index) =>
    item({ productId: index + 1, name: `Товар ${index + 1}` }),
  );
}

describe("addCartItem", () => {
  it("adds a new item to the end of the cart", () => {
    const jacket = item();
    const result = addCartItem(emptyCartState(), jacket);

    expect(result.status).toBe("added");
    expect(result.state.items).toEqual([jacket]);
  });

  it("does not create a duplicate for the same product", () => {
    const jacket = item();
    const existing = stateWith([jacket]);
    const result = addCartItem(existing, { ...jacket, priceKopecks: 1 });

    expect(result.status).toBe("duplicate");
    expect(result.state).toBe(existing);
    expect(cartCount(result.state.items)).toBe(1);
    expect(result.state.items[0]?.priceKopecks).toBe(jacket.priceKopecks);
  });

  it("refuses the 51st unique item", () => {
    const existing = stateWith(fillToLimit());
    const result = addCartItem(existing, item({ productId: 100 }));

    expect(result.status).toBe("limit");
    expect(result.state).toBe(existing);
    expect(result.state.items).toHaveLength(CART_MAX_ITEMS);
  });

  it("accepts the item that fills the cart to the limit", () => {
    const existing = stateWith(fillToLimit().slice(0, CART_MAX_ITEMS - 1));
    const result = addCartItem(existing, item({ productId: 100 }));

    expect(result.status).toBe("added");
    expect(result.state.items).toHaveLength(CART_MAX_ITEMS);
  });
});

describe("removeCartItem", () => {
  it("removes only the requested product", () => {
    const jacket = item();
    const vase = item({ productId: 2, name: "Ваза", shopSlug: "city-shop" });
    const result = removeCartItem(stateWith([jacket, vase]), jacket.productId);

    expect(result.items).toEqual([vase]);
  });

  it("keeps the same state when the product is absent", () => {
    const existing = stateWith([item()]);
    expect(removeCartItem(existing, 999)).toBe(existing);
  });
});

describe("clearCartState", () => {
  it("returns an empty versioned cart", () => {
    expect(clearCartState()).toEqual({ version: 1, items: [] });
  });
});

describe("cart selectors", () => {
  it("counts positions and sums prices", () => {
    const items = [item(), item({ productId: 2, priceKopecks: 89_900, shopSlug: "city-shop" })];

    expect(cartCount(items)).toBe(2);
    expect(cartTotalKopecks(items)).toBe(509_900);
  });

  it("groups by shop in first-added order and sums each shop", () => {
    const groups = groupCartItems([
      item({ productId: 1, priceKopecks: 100_000, shopSlug: "vintage-shop" }),
      item({
        productId: 2,
        priceKopecks: 50_000,
        shopSlug: "city-shop",
        shopName: "Городской винтаж",
      }),
      item({ productId: 3, priceKopecks: 25_000, shopSlug: "vintage-shop" }),
    ]);

    expect(groups.map((group) => group.shopSlug)).toEqual(["vintage-shop", "city-shop"]);
    expect(groups[0]?.shopName).toBe("Винтаж на районе");
    expect(groups[0]?.items.map((groupItem) => groupItem.productId)).toEqual([1, 3]);
    expect(groups[0]?.totalKopecks).toBe(125_000);
    expect(groups[1]?.shopName).toBe("Городской винтаж");
    expect(groups[1]?.totalKopecks).toBe(50_000);
  });

  it("returns no groups for an empty cart", () => {
    expect(groupCartItems([])).toEqual([]);
  });
});
