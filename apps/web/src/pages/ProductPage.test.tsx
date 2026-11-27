import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";

const product = {
  id: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  description: "Винтажная джинсовая куртка.",
  shop: { slug: "vintage-shop", name: "Винтаж на районе" },
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProductPage cart", () => {
  it("adds a published product to the cart without leaving the page", async () => {
    installFetchMock({ "GET /products/1": { body: product } });
    const browser = userEvent.setup();

    renderApp(["/products/1"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Куртка 90-х" }),
    ).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "В корзину" }));

    expect(screen.getByRole("button", { name: "В корзине" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Корзина, 1 товар" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/products/1");
    expect(screen.getByRole("status")).toHaveTextContent("добавлен в корзину");
  });
});
