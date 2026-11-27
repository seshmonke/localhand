import { CART_MAX_ITEMS, type CartItem } from "@localhand/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  addCartItem,
  cartCount,
  cartTotalKopecks,
  clearCartState,
  emptyCartState,
  groupCartItems,
  removeCartItem,
  type AddCartItemStatus,
  type CartGroup,
} from "./cart-state.js";
import { readCartState, writeCartState } from "./cart-storage.js";

export type CartContextValue = {
  items: CartItem[];
  count: number;
  groups: CartGroup[];
  totalKopecks: number;
  isHydrated: boolean;
  announcement: string;
  addItem: (item: CartItem) => AddCartItemStatus;
  removeItem: (productId: number) => void;
  clear: () => void;
  hasItem: (productId: number) => boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState(emptyCartState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // localStorage is only safe to read after mount; the initial render stays empty.
    // oxlint-disable-next-line react/set-state-in-effect
    setCart(readCartState());
    // oxlint-disable-next-line react/set-state-in-effect
    setIsHydrated(true);
  }, []);

  const addItem = useCallback(
    (item: CartItem): AddCartItemStatus => {
      const result = addCartItem(cart, item);
      if (result.status === "added") {
        setCart(result.state);
        writeCartState(result.state);
        setAnnouncement(`Товар «${item.name}» добавлен в корзину.`);
      } else if (result.status === "duplicate") {
        setAnnouncement(`Товар «${item.name}» уже в корзине.`);
      } else {
        setAnnouncement(`Корзина заполнена: не больше ${CART_MAX_ITEMS} товаров.`);
      }
      return result.status;
    },
    [cart],
  );

  const removeItem = useCallback(
    (productId: number) => {
      const target = cart.items.find((item) => item.productId === productId);
      if (!target) {
        return;
      }
      const next = removeCartItem(cart, productId);
      setCart(next);
      writeCartState(next);
      setAnnouncement(`Товар «${target.name}» удалён из корзины.`);
    },
    [cart],
  );

  const clear = useCallback(() => {
    if (cart.items.length === 0) {
      return;
    }
    const next = clearCartState();
    setCart(next);
    writeCartState(next);
    setAnnouncement("Корзина очищена.");
  }, [cart]);

  const hasItem = useCallback(
    (productId: number) => cart.items.some((item) => item.productId === productId),
    [cart],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items: cart.items,
      count: cartCount(cart.items),
      groups: groupCartItems(cart.items),
      totalKopecks: cartTotalKopecks(cart.items),
      isHydrated,
      announcement,
      addItem,
      removeItem,
      clear,
      hasItem,
    }),
    [cart, isHydrated, announcement, addItem, removeItem, clear, hasItem],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <output aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </output>
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) {
    throw new Error("useCart must be used within CartProvider");
  }
  return value;
}
