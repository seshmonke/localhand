import { CART_MAX_ITEMS, CART_STORAGE_KEY, type CartItem } from "@localhand/shared";
import { describe, expect, it } from "vitest";
import { emptyCartState } from "./cart-state.js";
import { parseCartState, readCartState, writeCartState, type CartStorage } from "./cart-storage.js";

const item: CartItem = {
  productId: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  shopSlug: "vintage-shop",
  shopName: "Винтаж на районе",
};

function cartWith(itemCount: number) {
  return {
    version: 1 as const,
    items: Array.from({ length: itemCount }, (_, index) => ({
      ...item,
      productId: index + 1,
    })),
  };
}

class MemoryStorage implements CartStorage {
  readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class BrokenStorage implements CartStorage {
  getItem(): string | null {
    throw new Error("storage is not readable");
  }

  setItem(): void {
    throw new Error("storage is not writable");
  }

  removeItem(): void {
    throw new Error("storage is not writable");
  }
}

describe("parseCartState", () => {
  it("returns an empty cart for missing data", () => {
    expect(parseCartState(null)).toEqual(emptyCartState());
  });

  it("parses a valid versioned cart", () => {
    const state = cartWith(2);
    expect(parseCartState(JSON.stringify(state))).toEqual(state);
  });

  it.each([
    ["corrupted JSON", "{not-json"],
    ["an unknown version", JSON.stringify({ ...cartWith(1), version: 2 })],
    ["items above the limit", JSON.stringify(cartWith(CART_MAX_ITEMS + 1))],
    [
      "an invalid item",
      JSON.stringify({
        version: 1,
        items: [{ ...item, priceKopecks: -100 }],
      }),
    ],
    ["a non-object payload", JSON.stringify("cart")],
  ])("falls back to an empty cart for %s", (_label, raw) => {
    expect(parseCartState(raw)).toEqual(emptyCartState());
  });
});

describe("readCartState", () => {
  it("reads the stored cart from the shared key", () => {
    const storage = new MemoryStorage();
    const state = cartWith(1);
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(state));

    expect(readCartState(storage)).toEqual(state);
  });

  it("works without storage", () => {
    expect(readCartState(null)).toEqual(emptyCartState());
  });

  it("does not throw when reading fails", () => {
    expect(readCartState(new BrokenStorage())).toEqual(emptyCartState());
  });
});

describe("writeCartState", () => {
  it("persists the cart under the shared key", () => {
    const storage = new MemoryStorage();
    const state = cartWith(1);

    writeCartState(state, storage);

    expect(storage.getItem(CART_STORAGE_KEY)).toBe(JSON.stringify(state));
  });

  it("does not throw when storage is missing", () => {
    expect(() => writeCartState(cartWith(1), null)).not.toThrow();
  });

  it("does not throw when writing fails", () => {
    expect(() => writeCartState(cartWith(1), new BrokenStorage())).not.toThrow();
  });
});
