import {
  CART_STORAGE_KEY,
  formatRubles,
  kopecks,
  type CartItem,
  type CartState,
} from "@localhand/shared";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/render-app.js";

const jacket: CartItem = {
  productId: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  shopSlug: "vintage-shop",
  shopName: "Винтаж на районе",
};

const vase: CartItem = {
  productId: 2,
  name: "Ваза из стекла",
  priceKopecks: 89_900,
  imageUrl: null,
  shopSlug: "city-shop",
  shopName: "Городской винтаж",
};

const cup: CartItem = {
  productId: 3,
  name: "Керамическая кружка",
  priceKopecks: 100_000,
  imageUrl: null,
  shopSlug: "vintage-shop",
  shopName: "Винтаж на районе",
};

function seed(items: CartItem[]) {
  const state: CartState = { version: 1, items };
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
}

function readStored(): CartState {
  return JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}") as CartState;
}

function price(value: number): string {
  // Testing Library normalizes the rendered text but not the matcher, so use plain spaces.
  return formatRubles(kopecks(value)).replace(/\s+/g, " ");
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CartPage", () => {
  it("shows an empty state with a way back to the catalog", async () => {
    renderApp(["/cart"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Корзина пуста" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в каталог" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Корзина" })).toHaveAttribute("href", "/cart");
    expect(screen.queryByRole("button", { name: "Оформить" })).not.toBeInTheDocument();
  });

  it("groups items by shop, shows group and total sums, and keeps first-added order", async () => {
    seed([jacket, vase, cup]);
    renderApp(["/cart"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Корзина" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Корзина, 3 товара" })).toBeInTheDocument();

    const vintage = screen.getByRole("region", { name: "Винтаж на районе" });
    const city = screen.getByRole("region", { name: "Городской винтаж" });

    expect(within(vintage).getByText("Куртка 90-х")).toBeInTheDocument();
    expect(within(vintage).getByText("Керамическая кружка")).toBeInTheDocument();
    expect(within(vintage).queryByText("Ваза из стекла")).not.toBeInTheDocument();
    expect(within(city).getByText("Ваза из стекла")).toBeInTheDocument();

    expect(within(vintage).getByText(`Итого: ${price(520_000)}`)).toBeInTheDocument();
    expect(within(city).getByText(`Итого: ${price(89_900)}`)).toBeInTheDocument();

    const total = screen.getByRole("complementary", { name: "Итог" });
    expect(within(total).getByText("3 товара")).toBeInTheDocument();
    expect(within(total).getByText(price(609_900))).toBeInTheDocument();

    const shopHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(shopHeadings).toEqual(["Винтаж на районе", "Городской винтаж", "Итог"]);
  });

  it("removes one item, recalculates the totals and persists the change", async () => {
    seed([jacket, vase]);
    const browser = userEvent.setup();
    renderApp(["/cart"]);

    await screen.findByRole("heading", { name: "Винтаж на районе" });
    await browser.click(screen.getByRole("button", { name: "Удалить «Куртка 90-х» из корзины" }));

    expect(screen.queryByText("Куртка 90-х")).not.toBeInTheDocument();
    expect(screen.getByText("Ваза из стекла")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Винтаж на районе" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Корзина, 1 товар" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("удалён из корзины");
    await waitFor(() => expect(readStored().items.map((item) => item.productId)).toEqual([2]));
  });

  it("clears the whole cart", async () => {
    seed([jacket, vase]);
    const browser = userEvent.setup();
    renderApp(["/cart"]);

    await screen.findByRole("heading", { name: "Винтаж на районе" });
    await browser.click(screen.getByRole("button", { name: "Очистить корзину" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Корзина пуста" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Корзина" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Корзина очищена.");
    await waitFor(() => expect(readStored().items).toEqual([]));
  });

  it("renders long unbroken product and shop names with the remove control", async () => {
    const longProduct: CartItem = {
      ...jacket,
      name: "Сверхдлинноеназваниевинтажнойкурткииздевяностых",
      shopName: "МагазинСОченьДлиннымНазваниемБезПробелов",
    };
    seed([longProduct]);
    renderApp(["/cart"]);

    const shopLink = await screen.findByRole("link", { name: longProduct.shopName });
    const productLink = screen.getByRole("link", { name: longProduct.name });

    expect(shopLink).toHaveClass("break-words");
    expect(shopLink).not.toHaveClass("[overflow-wrap:anywhere]");
    expect(productLink).toHaveClass("break-words");
    expect(productLink).not.toHaveClass("[overflow-wrap:anywhere]");

    const remove = screen.getByRole("button", {
      name: `Удалить «${longProduct.name}» из корзины`,
    });
    expect(remove).toHaveClass("h-11", "w-11", "px-0", "sm:h-12", "sm:w-auto", "sm:px-5");
  });

  it("keeps checkout disabled with a visible hint until S2-3 ships it", async () => {
    seed([jacket]);
    renderApp(["/cart"]);

    await screen.findByRole("heading", { name: "Винтаж на районе" });
    const checkout = screen.getByRole("button", { name: "Оформить" });

    expect(checkout).toBeDisabled();
    expect(checkout).toHaveAttribute("aria-describedby", "checkout-hint");
    expect(screen.getByText(/Оформление заказа станет доступно/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Оформить" })).not.toBeInTheDocument();
  });
});
