import { CART_MAX_ITEMS, CART_STORAGE_KEY, type CartItem, type CartState } from "@localhand/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCart } from "./CartContext.js";

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

function seed(items: CartItem[]) {
  const state: CartState = { version: 1, items };
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
}

function readStored(): CartState {
  return JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}") as CartState;
}

function Probe({ extra }: { extra?: CartItem }) {
  const { count, items, addItem } = useCart();

  return (
    <div>
      <p data-testid="count">{count}</p>
      <ul>
        {items.map((cartItem) => (
          <li key={cartItem.productId}>{cartItem.name}</li>
        ))}
      </ul>
      {extra ? (
        <button type="button" onClick={() => addItem(extra)}>
          add
        </button>
      ) : null}
    </div>
  );
}

function renderProbe(extra?: CartItem) {
  return render(
    <CartProvider>
      <Probe extra={extra} />
    </CartProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CartProvider", () => {
  it("hydrates the cart from localStorage after mount", async () => {
    seed([item()]);
    renderProbe();

    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("persists an added item and announces it", async () => {
    const browser = userEvent.setup();
    renderProbe(item());

    await browser.click(screen.getByRole("button", { name: "add" }));

    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(readStored().items).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("добавлен в корзину");
  });

  it("keeps a repeated add idempotent", async () => {
    const browser = userEvent.setup();
    renderProbe(item());

    await browser.click(screen.getByRole("button", { name: "add" }));
    await browser.click(screen.getByRole("button", { name: "add" }));

    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(readStored().items).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("уже в корзине");
  });

  it("does not add past the cart limit and announces it", async () => {
    seed(
      Array.from({ length: CART_MAX_ITEMS }, (_, index) =>
        item({ productId: index + 1, name: `Товар ${index + 1}` }),
      ),
    );
    const browser = userEvent.setup();
    renderProbe(item({ productId: CART_MAX_ITEMS + 1, name: "Лишний товар" }));

    await screen.findByText("Товар 1");
    await browser.click(screen.getByRole("button", { name: "add" }));

    expect(screen.getByTestId("count")).toHaveTextContent(String(CART_MAX_ITEMS));
    expect(screen.queryByText("Лишний товар")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Корзина заполнена");
    expect(readStored().items).toHaveLength(CART_MAX_ITEMS);
  });

  it("keeps working in memory when writing to localStorage fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const browser = userEvent.setup();
    renderProbe(item());

    await browser.click(screen.getByRole("button", { name: "add" }));

    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByRole("status")).toHaveTextContent("добавлен в корзину");
  });

  it("keeps working in memory when reading from localStorage fails", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const browser = userEvent.setup();
    renderProbe(item());

    expect(screen.getByTestId("count")).toHaveTextContent("0");
    await browser.click(screen.getByRole("button", { name: "add" }));

    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
