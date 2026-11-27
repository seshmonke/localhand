import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function currentUrl(): string {
  return screen.getByTestId("location").textContent ?? "";
}

function currentParams(): URLSearchParams {
  return new URL(currentUrl(), "http://localhost").searchParams;
}

function lastCatalogRequest(fetchMock: ReturnType<typeof installFetchMock>) {
  const catalogCalls = fetchMock.mock.calls.filter(([input]) =>
    String(input).startsWith("/api/catalog/products"),
  );
  const last = catalogCalls.at(-1);
  if (!last) {
    throw new Error("catalog request was not made");
  }
  return new URL(String(last[0]), "http://localhost");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketplacePage catalog discovery", () => {
  it("restores search, sort and page from a shareable URL", async () => {
    const fetchMock = installFetchMock({
      "GET /catalog/products": ({ query }) => ({
        body: {
          products: [vase],
          page: Number(query.page),
          pageSize: Number(query.pageSize),
          total: 30,
          hasMore: true,
        },
      }),
    });

    renderApp(["/?q=%D0%B2%D0%B0%D0%B7%D0%B0&sort=price_desc&page=2"]);

    expect(await screen.findByText("Ваза из стекла")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Поиск по каталогу" })).toHaveValue("ваза");
    expect(screen.getByRole("combobox", { name: "Сортировка" })).toHaveValue("price_desc");
    expect(await screen.findByText("Страница 2 из 3")).toBeInTheDocument();
    expect(screen.getByText("Найдено товаров: 30")).toBeInTheDocument();

    const request = lastCatalogRequest(fetchMock);
    expect(Object.fromEntries(request.searchParams)).toEqual({
      sort: "price_desc",
      page: "2",
      pageSize: "12",
      q: "ваза",
    });
  });

  it("submits a trimmed search query and resets the page to the first one", async () => {
    const fetchMock = installFetchMock({
      "GET /catalog/products": ({ query }) => ({
        body: {
          products: query.q ? [jacket] : [jacket, vase],
          page: Number(query.page),
          pageSize: Number(query.pageSize),
          total: query.q ? 1 : 2,
          hasMore: false,
        },
      }),
    });
    const browser = userEvent.setup();

    renderApp(["/?page=3"]);

    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();

    await browser.type(
      screen.getByRole("searchbox", { name: "Поиск по каталогу" }),
      "  куртка  {Enter}",
    );

    await waitFor(() => expect(currentParams().get("q")).toBe("куртка"));
    expect(currentParams().get("page")).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Поиск по каталогу" })).toHaveValue("куртка");

    const request = lastCatalogRequest(fetchMock);
    expect(request.searchParams.get("q")).toBe("куртка");
    expect(request.searchParams.get("sort")).toBe("newest");
    expect(request.searchParams.get("page")).toBe("1");
    expect(request.searchParams.get("pageSize")).toBe("12");
  });

  it("changes the sort order and resets the page", async () => {
    const fetchMock = installFetchMock({
      "GET /catalog/products": ({ query }) => ({
        body: {
          products: [vase],
          page: Number(query.page),
          pageSize: Number(query.pageSize),
          total: 30,
          hasMore: true,
        },
      }),
    });
    const browser = userEvent.setup();

    renderApp(["/?sort=newest&page=2"]);

    expect(await screen.findByText("Страница 2 из 3")).toBeInTheDocument();

    await browser.selectOptions(screen.getByRole("combobox", { name: "Сортировка" }), "price_asc");

    await waitFor(() => expect(currentParams().get("sort")).toBe("price_asc"));
    expect(currentParams().get("page")).toBeNull();
    expect(await screen.findByText("Страница 1 из 3")).toBeInTheDocument();
    expect(lastCatalogRequest(fetchMock).searchParams.get("page")).toBe("1");
    expect(lastCatalogRequest(fetchMock).searchParams.get("sort")).toBe("price_asc");
  });

  it("moves between pages through the URL and shows page state", async () => {
    const fetchMock = installFetchMock({
      "GET /catalog/products": ({ query }) => {
        const page = Number(query.page);
        return {
          body: {
            products: page === 1 ? [jacket] : [vase],
            page,
            pageSize: Number(query.pageSize),
            total: 30,
            hasMore: page < 3,
          },
        };
      },
    });
    const browser = userEvent.setup();

    renderApp(["/"]);

    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();
    expect(screen.getByText("Страница 1 из 3")).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Дальше" }));

    await waitFor(() => expect(currentParams().get("page")).toBe("2"));
    expect(await screen.findByText("Ваза из стекла")).toBeInTheDocument();
    expect(screen.queryByText("Куртка 90-х")).not.toBeInTheDocument();
    expect(screen.getByText("Страница 2 из 3")).toBeInTheDocument();
    expect(lastCatalogRequest(fetchMock).searchParams.get("page")).toBe("2");

    await browser.click(screen.getByRole("button", { name: "Назад" }));

    await waitFor(() => expect(currentParams().get("page")).toBeNull());
    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();
    expect(screen.getByText("Страница 1 из 3")).toBeInTheDocument();
  });

  it("shows a search empty state and lets the buyer reset the query", async () => {
    installFetchMock({
      "GET /catalog/products": ({ query }) => ({
        body: {
          products: query.q ? [] : [jacket],
          page: 1,
          pageSize: 12,
          total: query.q ? 0 : 1,
          hasMore: false,
        },
      }),
    });
    const browser = userEvent.setup();

    renderApp(["/?q=%D0%BA%D1%83%D1%80%D1%82%D0%BA%D0%B0"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Ничего не найдено" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/По запросу «куртка»/)).toBeInTheDocument();
    expect(screen.getByText("Найдено товаров: 0")).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Сбросить поиск" }));

    await waitFor(() => expect(currentParams().get("q")).toBeNull());
    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();
  });

  it("shows an empty catalog state without a search query", async () => {
    installFetchMock({
      "GET /catalog/products": {
        body: { products: [], page: 1, pageSize: 12, total: 0, hasMore: false },
      },
    });

    renderApp(["/"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Пока пусто" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Найдено товаров: 0")).toBeInTheDocument();
  });

  it("retries the catalog request after an error", async () => {
    let failing = true;
    installFetchMock({
      "GET /catalog/products": () =>
        failing
          ? { status: 500, body: { error: "internal_error" } }
          : {
              body: { products: [jacket], page: 1, pageSize: 12, total: 1, hasMore: false },
            },
    });
    const browser = userEvent.setup();

    renderApp(["/"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Каталог не загрузился" }),
    ).toBeInTheDocument();

    failing = false;
    await browser.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();
  });
});
