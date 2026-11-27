import { CART_STORAGE_KEY, type CartState } from "@localhand/shared";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";

const jacket = {
  id: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  shop: { slug: "vintage-shop", name: "Винтаж на районе" },
};

const vase = {
  id: 2,
  name: "Ваза из стекла",
  priceKopecks: 89_900,
  imageUrl: null,
  shop: { slug: "city-shop", name: "Городской винтаж" },
};

function readStored(): CartState {
  return JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}") as CartState;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("cart flow", () => {
  it("adds from a catalog card, keeps the add idempotent and opens the cart from the header", async () => {
    installFetchMock({
      "GET /catalog/products": {
        body: { products: [jacket, vase], page: 1, pageSize: 12, total: 2, hasMore: false },
      },
    });
    const browser = userEvent.setup();
    const app = renderApp(["/"]);

    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();
    const jacketCard = screen.getByRole("link", { name: /Куртка 90-х/ }).closest("article");
    if (!jacketCard) {
      throw new Error("product card container was not found");
    }

    await browser.click(within(jacketCard).getByRole("button", { name: "В корзину" }));

    expect(screen.getByRole("link", { name: "Корзина, 1 товар" })).toBeInTheDocument();
    expect(screen.getByText(/добавлен в корзину/)).toBeInTheDocument();
    await waitFor(() => expect(readStored().items).toHaveLength(1));

    await browser.click(within(jacketCard).getByRole("button", { name: "В корзине" }));

    expect(screen.getByRole("link", { name: "Корзина, 1 товар" })).toBeInTheDocument();
    expect(screen.getByText(/уже в корзине/)).toBeInTheDocument();
    expect(readStored().items).toHaveLength(1);

    await browser.click(screen.getByRole("link", { name: "Корзина, 1 товар" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/cart");
    expect(await screen.findByRole("region", { name: "Винтаж на районе" })).toBeInTheDocument();
    expect(screen.getByText("Куртка 90-х")).toBeInTheDocument();

    app.unmount();

    renderApp(["/cart"]);

    expect(await screen.findByRole("region", { name: "Винтаж на районе" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Корзина, 1 товар" })).toBeInTheDocument();
  });
});
