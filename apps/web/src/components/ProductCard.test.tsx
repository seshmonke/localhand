import {
  CART_MAX_ITEMS,
  CART_STORAGE_KEY,
  CartStateSchema,
  formatRubles,
  kopecks,
  type CartState,
  type ProductCard as ProductCardData,
} from "@localhand/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CartProvider } from "../cart/CartContext.js";
import { ProductCard } from "./ProductCard.js";

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

const longName = "Сверхдлинноеназваниевинтажнойкурткииздевяностых";

const product: ProductCardData = {
  id: 12,
  name: longName,
  priceKopecks: 4_299_900,
  imageUrl: null,
  shop: { slug: "smoke-7392012", name: "Винтаж на районе" },
};

function normalizedText(value: string): string {
  return value.replace(/\s/g, "");
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location" hidden>
      {location.pathname}
    </div>
  );
}

function seedFullCart() {
  const state: CartState = {
    version: 1,
    items: Array.from({ length: CART_MAX_ITEMS }, (_, index) => ({
      productId: 100 + index,
      name: `Товар ${index + 1}`,
      priceKopecks: 100_000,
      imageUrl: null,
      shopSlug: "other-shop",
      shopName: "Другой магазин",
    })),
  };
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <CartProvider>
        <ProductCard product={product} />
        <LocationProbe />
      </CartProvider>
    </MemoryRouter>,
  );
}

describe("ProductCard", () => {
  it("keeps a long product name and the price inside the card link", () => {
    renderCard();

    expect(screen.getByRole("heading", { level: 3, name: longName })).toBeInTheDocument();
    const price = normalizedText(formatRubles(kopecks(product.priceKopecks)));
    expect(
      screen.getByText((_, element) => normalizedText(element?.textContent ?? "") === price),
    ).toBeInTheDocument();
    expect(screen.getByText(product.shop.name)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(longName) })).toHaveAttribute(
      "href",
      `/products/${product.id}`,
    );
  });

  it("keeps the add button outside the product link and navigates only through the link", async () => {
    const browser = userEvent.setup();
    renderCard();

    const card = screen.getByRole("article");
    const link = screen.getByRole("link", { name: new RegExp(longName) });
    const button = screen.getByRole("button", { name: `В корзину: ${longName}` });

    expect(link.contains(button)).toBe(false);
    expect(card).toContainElement(link);
    expect(card).toContainElement(button);

    await browser.click(link);

    expect(screen.getByTestId("location")).toHaveTextContent(`/products/${product.id}`);
  });

  it("adds the product to the cart without following the card link", async () => {
    const browser = userEvent.setup();
    renderCard();

    await browser.click(screen.getByRole("button", { name: `В корзину: ${longName}` }));

    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(screen.getByRole("button", { name: `В корзине: ${longName}` })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`Товар «${longName}» добавлен в корзину.`);

    const stored = CartStateSchema.parse(
      JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}"),
    );
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]?.productId).toBe(product.id);
  });

  it("keeps the cart at the limit and shows a visible message", async () => {
    seedFullCart();
    const browser = userEvent.setup();
    renderCard();

    await screen.findByRole("button", { name: `В корзину: ${longName}` });
    await browser.click(screen.getByRole("button", { name: `В корзину: ${longName}` }));

    expect(
      screen.getByText(`В корзине не может быть больше ${CART_MAX_ITEMS} товаров.`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `В корзину: ${longName}` })).toBeInTheDocument();

    const stored = CartStateSchema.parse(
      JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}"),
    );
    expect(stored.items).toHaveLength(CART_MAX_ITEMS);
  });
});
