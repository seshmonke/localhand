import { CART_STORAGE_KEY, CartStateSchema, type CartState } from "@localhand/shared";
import { emptyCartState } from "./cart-state.js";

export type CartStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getCartStorage(): CartStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseCartState(raw: string | null): CartState {
  if (raw === null) {
    return emptyCartState();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return emptyCartState();
  }

  const parsed = CartStateSchema.safeParse(payload);
  return parsed.success ? parsed.data : emptyCartState();
}

export function readCartState(storage: CartStorage | null = getCartStorage()): CartState {
  if (!storage) {
    return emptyCartState();
  }

  try {
    return parseCartState(storage.getItem(CART_STORAGE_KEY));
  } catch {
    return emptyCartState();
  }
}

export function writeCartState(
  state: CartState,
  storage: CartStorage | null = getCartStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (quota, privacy mode); the in-memory cart keeps working.
  }
}
