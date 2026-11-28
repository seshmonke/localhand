import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";

const product = {
  id: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  shop: { slug: "vintage-shop", name: "Винтаж на районе" },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ShopPage storefront copy", () => {
  it("renders the shop header, products and the catalog link", async () => {
    installFetchMock({
      "GET /shops/vintage-shop": {
        body: {
          slug: "vintage-shop",
          name: "Винтаж на районе",
          description: "Отборные вещи.",
          products: [product],
        },
      },
    });

    renderApp(["/shops/vintage-shop"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Винтаж на районе" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Магазин")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Товары магазина" })).toBeInTheDocument();
    expect(screen.getByText("Куртка 90-х")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "В каталог" })).toHaveAttribute("href", "/");
  });

  it("shows the empty shop state with a catalog action", async () => {
    installFetchMock({
      "GET /shops/vintage-shop": {
        body: {
          slug: "vintage-shop",
          name: "Винтаж на районе",
          description: null,
          products: [],
        },
      },
    });

    renderApp(["/shops/vintage-shop"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "В магазине пока нет товаров" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Продавец ещё не опубликовал ни одной вещи.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Смотреть другие магазины" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows the not-found state for an unpublished shop", async () => {
    installFetchMock({
      "GET /shops/missing-shop": { status: 404, body: { error: "not_found" } },
    });

    renderApp(["/shops/missing-shop"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Магазин не найден" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Возможно, магазин ещё не опубликован или ссылка устарела."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вернуться в каталог" })).toHaveAttribute("href", "/");
  });

  it("shows the load error and retries the shop request", async () => {
    let failing = true;
    installFetchMock({
      "GET /shops/vintage-shop": () =>
        failing
          ? { status: 500, body: { error: "internal_error" } }
          : {
              body: {
                slug: "vintage-shop",
                name: "Винтаж на районе",
                description: null,
                products: [product],
              },
            },
    });
    const browser = userEvent.setup();

    renderApp(["/shops/vintage-shop"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Магазин не загрузился" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Проверьте соединение и попробуйте снова.")).toBeInTheDocument();

    failing = false;
    await browser.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();
  });
});
