import {
  CART_STORAGE_KEY,
  type CartItem,
  type CartState,
  type Checkout,
  type OrderSummary,
} from "@localhand/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { CartProvider, useCart } from "../cart/CartContext.js";
import { authKeys, orderKeys, sellerKeys } from "../lib/queries.js";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";
import { CheckoutPage, COMMENT_HINT } from "./CheckoutPage.js";
import { formatOrderPhone } from "./OrdersPage.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };

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

const createdAt = "2026-11-27T10:00:00.000Z";

function orderFor(item: CartItem, id = 101): OrderSummary {
  return {
    id,
    shop: { slug: item.shopSlug, name: item.shopName },
    status: "new",
    totalKopecks: item.priceKopecks,
    buyerPhone: demoUser.phone,
    comment: null,
    createdAt,
    items: [
      {
        productId: item.productId,
        name: item.name,
        priceKopecks: item.priceKopecks,
        quantity: 1,
      },
    ],
  };
}

function seed(items: CartItem[]) {
  const state: CartState = { version: 1, items };
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
}

function readStored(): CartState {
  return JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}") as CartState;
}

function checkoutCalls(fetchMock: ReturnType<typeof installFetchMock>) {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith("/api/checkout") && init?.method === "POST",
  );
}

function CartCompositionEditor() {
  const { removeItem, isHydrated } = useCart();
  return (
    <button type="button" onClick={() => removeItem(vase.productId)} disabled={!isHydrated}>
      Убрать вазу из корзины (тест)
    </button>
  );
}

/** Renders CheckoutPage with a button that mutates the real cart composition. */
function renderCheckoutWithCart(items: CartItem[]) {
  seed(items);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={client}>
      <CartProvider>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
          </Routes>
        </MemoryRouter>
        <CartCompositionEditor />
      </CartProvider>
    </QueryClientProvider>,
  );

  return client;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CheckoutPage", () => {
  it("sends an unauthenticated buyer to login with next=/checkout", async () => {
    installFetchMock({
      "GET /auth/me": { status: 401, body: { error: "unauthorized" } },
    });

    renderApp(["/checkout"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Вход" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Fcheckout"),
    );
  });

  it("shows an empty state when the cart has no items", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
    });

    renderApp(["/checkout"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Корзина пуста" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в каталог" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Оформить заказ" })).not.toBeInTheDocument();
  });

  it("shows shop groups, submits items with a stable id and clears the ordered cart", async () => {
    seed([jacket, vase]);
    const submittedBodies: Checkout[] = [];

    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "POST /checkout": ({ body }) => {
        submittedBodies.push(body as Checkout);
        return { status: 201, body: { orders: [orderFor(jacket), orderFor(vase, 102)] } };
      },
      "GET /orders/mine": { body: { orders: [orderFor(jacket), orderFor(vase, 102)] } },
      "GET /orders/101/payment": { body: { payment: null } },
      "GET /orders/102/payment": { body: { payment: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/checkout"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Проверьте заказ" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Если продавец не подключил приём платежей/)).toBeInTheDocument();
    expect(screen.getByText(/оплата проходит на странице ЮKassa/)).toBeInTheDocument();

    const vintage = screen.getByRole("region", { name: "Винтаж на районе" });
    const city = screen.getByRole("region", { name: "Городской винтаж" });
    expect(within(vintage).getByText("Куртка 90-х")).toBeInTheDocument();
    expect(within(city).getByText("Ваза из стекла")).toBeInTheDocument();
    expect(screen.getByText(formatOrderPhone(demoUser.phone))).toBeInTheDocument();

    const commentField = screen.getByLabelText("Комментарий продавцу");
    expect(commentField).toHaveAttribute("aria-describedby", "checkout-comment-hint");
    expect(document.getElementById("checkout-comment-hint")).toHaveTextContent(COMMENT_HINT);

    await browser.type(commentField, "Позвоните после 18:00");
    await browser.click(screen.getByRole("button", { name: "Оформить заказ" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Мои заказы" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Заказ оформлен и передан продавцу.")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/orders");
    await waitFor(() => expect(readStored().items).toEqual([]));

    expect(submittedBodies[0]).toMatchObject({
      items: [{ productId: 1 }, { productId: 2 }],
      comment: "Позвоните после 18:00",
    });
    expect(submittedBodies[0]?.clientCheckoutId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(checkoutCalls(fetchMock)).toHaveLength(1);
  });

  it("clears only the products returned by the checkout replay", async () => {
    seed([jacket, vase]);

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "POST /checkout": { status: 201, body: { orders: [orderFor(jacket)] } },
      "GET /orders/mine": { body: { orders: [orderFor(jacket)] } },
      "GET /orders/101": { body: { order: orderFor(jacket) } },
      "GET /orders/101/payment": { body: { payment: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/checkout"]);

    await screen.findByRole("heading", { level: 1, name: "Проверьте заказ" });
    await browser.click(screen.getByRole("button", { name: "Оформить заказ" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Заказ №101" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/orders/101");
    expect(readStored().items.map((item) => item.productId)).toEqual([2]);
  });

  it("keeps the cart and the idempotency key when a product is unavailable", async () => {
    seed([jacket]);
    const checkoutIds: string[] = [];
    let attempts = 0;

    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "POST /checkout": ({ body }) => {
        checkoutIds.push((body as { clientCheckoutId: string }).clientCheckoutId);
        attempts += 1;
        return attempts === 1
          ? { status: 409, body: { error: "product_unavailable" } }
          : { status: 201, body: { orders: [orderFor(jacket)] } };
      },
      "GET /orders/mine": { body: { orders: [orderFor(jacket)] } },
      "GET /orders/101": { body: { order: orderFor(jacket) } },
      "GET /orders/101/payment": { body: { payment: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/checkout"]);

    await screen.findByRole("heading", { level: 1, name: "Проверьте заказ" });
    await browser.click(screen.getByRole("button", { name: "Оформить заказ" }));

    expect(await screen.findByText(/Часть товаров стала недоступна/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Проверить корзину" })).toHaveAttribute(
      "href",
      "/cart",
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/checkout");
    expect(readStored().items.map((item) => item.productId)).toEqual([1]);

    await browser.click(screen.getByRole("button", { name: "Оформить заказ" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Заказ №101" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/orders/101");
    await waitFor(() => expect(readStored().items).toEqual([]));
    expect(checkoutIds).toHaveLength(2);
    expect(checkoutIds[0]).toBe(checkoutIds[1]);
    expect(checkoutCalls(fetchMock)).toHaveLength(2);
  });

  it("rotates the clientCheckoutId when the cart composition changes and keeps it for retries", async () => {
    const submitted: Checkout[] = [];

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "POST /checkout": ({ body }) => {
        submitted.push(body as Checkout);
        return { status: 500, body: { error: "internal_error" } };
      },
    });

    const browser = userEvent.setup();
    renderCheckoutWithCart([jacket, vase]);

    await screen.findByRole("heading", { level: 1, name: "Проверьте заказ" });

    const submit = () => browser.click(screen.getByRole("button", { name: "Оформить заказ" }));

    await submit();
    await screen.findByText(/Не удалось оформить заказ/);
    await submit();
    await waitFor(() => expect(submitted).toHaveLength(2));

    // A retry with the same composition must reuse the idempotency key.
    expect(submitted[1]?.clientCheckoutId).toBe(submitted[0]?.clientCheckoutId);

    await browser.click(screen.getByRole("button", { name: "Убрать вазу из корзины (тест)" }));
    expect(screen.queryByText("Ваза из стекла")).not.toBeInTheDocument();

    await submit();
    await waitFor(() => expect(submitted).toHaveLength(3));

    // A different composition must get a fresh key and a reduced item list.
    expect(submitted[2]?.clientCheckoutId).not.toBe(submitted[0]?.clientCheckoutId);
    expect(submitted[2]?.items).toEqual([{ productId: jacket.productId }]);
  });

  it("disables the submit button while checkout is pending", async () => {
    seed([jacket]);
    let finishCheckout: (value: { status: number; body: unknown }) => void = () => {};

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "POST /checkout": () =>
        new Promise((resolve) => {
          finishCheckout = resolve;
        }),
      "GET /orders/mine": { body: { orders: [orderFor(jacket)] } },
      "GET /orders/101": { body: { order: orderFor(jacket) } },
      "GET /orders/101/payment": { body: { payment: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/checkout"]);

    await screen.findByRole("heading", { level: 1, name: "Проверьте заказ" });
    await browser.click(screen.getByRole("button", { name: "Оформить заказ" }));

    const pendingButton = await screen.findByRole("button", { name: "Оформляем…" });
    expect(pendingButton).toBeDisabled();

    finishCheckout({ status: 201, body: { orders: [orderFor(jacket)] } });

    await screen.findByRole("heading", { level: 1, name: "Заказ №101" });
  });

  it("shows the session expired state on a 401 checkout and clears caches before login", async () => {
    seed([jacket]);
    let sessionExpired = false;
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });
    client.setQueryData(authKeys.me, { user: demoUser });
    client.setQueryData(sellerKeys.shop, { shop: null });
    client.setQueryData(orderKeys.mine, { orders: [] });

    installFetchMock({
      "GET /auth/me": () =>
        sessionExpired
          ? { status: 401, body: { error: "unauthorized" } }
          : { body: { user: demoUser } },
      "POST /checkout": { status: 401, body: { error: "unauthorized" } },
    });

    const browser = userEvent.setup();
    renderApp(["/checkout"], client);

    await screen.findByRole("heading", { level: 1, name: "Проверьте заказ" });
    await browser.click(screen.getByRole("button", { name: "Оформить заказ" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Сессия истекла" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Войдите снова, чтобы продолжить.")).toBeInTheDocument();

    sessionExpired = true;
    await browser.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Вход" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Fcheckout"),
    );
    expect(client.getQueryData(authKeys.me)).toBeUndefined();
    expect(client.getQueryCache().findAll({ queryKey: sellerKeys.all })).toHaveLength(0);
    expect(client.getQueryCache().findAll({ queryKey: orderKeys.all })).toHaveLength(0);
  });
});
