import { CART_MAX_ITEMS, CART_VERSION, type CartItem, type CartState } from "@localhand/shared";

export type CartGroup = {
  shopSlug: string;
  shopName: string;
  items: CartItem[];
  totalKopecks: number;
};

export type AddCartItemStatus = "added" | "duplicate" | "limit";

export type AddCartItemResult = {
  status: AddCartItemStatus;
  state: CartState;
};

export function emptyCartState(): CartState {
  return { version: CART_VERSION, items: [] };
}

export function addCartItem(state: CartState, item: CartItem): AddCartItemResult {
  if (state.items.some((existing) => existing.productId === item.productId)) {
    return { status: "duplicate", state };
  }

  if (state.items.length >= CART_MAX_ITEMS) {
    return { status: "limit", state };
  }

  return {
    status: "added",
    state: { version: CART_VERSION, items: [...state.items, item] },
  };
}

export function removeCartItem(state: CartState, productId: number): CartState {
  const items = state.items.filter((item) => item.productId !== productId);
  if (items.length === state.items.length) {
    return state;
  }

  return { version: CART_VERSION, items };
}

export function clearCartState(): CartState {
  return emptyCartState();
}

export function cartCount(items: CartItem[]): number {
  return items.length;
}

export function cartTotalKopecks(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.priceKopecks, 0);
}

export function groupCartItems(items: CartItem[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();

  for (const item of items) {
    const group = groups.get(item.shopSlug);
    if (group) {
      group.items.push(item);
      group.totalKopecks += item.priceKopecks;
      continue;
    }

    groups.set(item.shopSlug, {
      shopSlug: item.shopSlug,
      shopName: item.shopName,
      items: [item],
      totalKopecks: item.priceKopecks,
    });
  }

  return [...groups.values()];
}
