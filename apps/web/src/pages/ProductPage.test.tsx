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

describe("ProductPage storefront copy", () => {
  it("renders the invalid-link state with a catalog action", () => {
    installFetchMock({});

    renderApp(["/products/not-a-number"]);

    expect(screen.getByRole("heading", { level: 2, name: "Товар не найден" })).toBeInTheDocument();
    expect(screen.getByText("Ссылка на товар выглядит некорректной.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вернуться в каталог" })).toHaveAttribute("href", "/");
  });

  it("renders the not-found state for an unpublished product", async () => {
    installFetchMock({
      "GET /products/999": { status: 404, body: { error: "not_found" } },
    });

    renderApp(["/products/999"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Товар не найден" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Возможно, товар снят с публикации или ссылка устарела."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вернуться в каталог" })).toHaveAttribute("href", "/");
  });

  it("renders the load error and retries the product request", async () => {
    let failing = true;
    installFetchMock({
      "GET /products/1": () =>
        failing ? { status: 500, body: { error: "internal_error" } } : { body: product },
    });
    const browser = userEvent.setup();

    renderApp(["/products/1"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Товар не загрузился" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Проверьте соединение и попробуйте снова.")).toBeInTheDocument();

    failing = false;
    await browser.click(screen.getByRole("button", { name: "Повторить" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Куртка 90-х" }),
    ).toBeInTheDocument();
  });

  it("renders the product eyebrow, shop link and delivery note", async () => {
    installFetchMock({ "GET /products/1": { body: product } });

    renderApp(["/products/1"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Куртка 90-х" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Товар")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "В магазин" })).toHaveAttribute(
      "href",
      "/shops/vintage-shop",
    );
    expect(screen.getByText("Оплата и доставка появятся в следующем change.")).toBeInTheDocument();
  });
});

describe("ProductPage cart", () => {
  it("adds a published product to the cart without leaving the page", async () => {
    installFetchMock({ "GET /products/1": { body: product } });
    const browser = userEvent.setup();

    renderApp(["/products/1"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Куртка 90-х" }),
    ).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "В корзину: Куртка 90-х" }));

    expect(screen.getByRole("button", { name: "В корзине: Куртка 90-х" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Корзина, 1 товар" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/products/1");
    expect(screen.getByRole("status")).toHaveTextContent("добавлен в корзину");
  });
});
