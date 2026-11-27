import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };

const publishedShop = {
  id: 1,
  slug: "demo-shop",
  name: "Демо-магазин",
  description: null,
  status: "published" as const,
};

const draftShop = { ...publishedShop, status: "draft" as const };

const draftProduct = {
  id: 11,
  name: "Куртка 90-х",
  description: null,
  priceKopecks: 420_000,
  imageUrl: null,
  status: "draft" as const,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminProductNewPage", () => {
  it("creates a draft, converts rubles with a comma to kopecks and omits empty description", async () => {
    const createdProduct = {
      ...draftProduct,
      id: 99,
      name: "Винтажная куртка",
      priceKopecks: 123_450,
    };
    let postBody: unknown;
    let created = false;

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "POST /seller/products": ({ body }) => {
        postBody = body;
        created = true;
        return { status: 201, body: { product: createdProduct } };
      },
      "GET /seller/products": () => ({ body: { products: created ? [createdProduct] : [] } }),
    });

    const browser = userEvent.setup();
    renderApp(["/admin/products/new"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Новый товар" }),
    ).toBeInTheDocument();

    await browser.type(await screen.findByLabelText("Название"), "Винтажная куртка");
    await browser.type(screen.getByLabelText("Цена, ₽"), "1234,50");
    await browser.click(screen.getByRole("button", { name: "Создать товар" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Товары" })).toBeInTheDocument();

    expect(postBody).toEqual({
      name: "Винтажная куртка",
      priceKopecks: 123_450,
      imageUrl: null,
    });
    expect(postBody).not.toHaveProperty("description");
    expect(postBody).not.toHaveProperty("status");

    expect((await screen.findAllByText("Винтажная куртка")).length).toBeGreaterThan(0);
  });

  it("accepts a dot price and trims a non-empty description", async () => {
    let postBody: unknown;

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "POST /seller/products": ({ body }) => {
        postBody = body;
        return {
          status: 201,
          body: { product: { ...draftProduct, id: 100, name: "Ваза", priceKopecks: 9_999 } },
        };
      },
      "GET /seller/products": { body: { products: [] } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/products/new"]);

    await screen.findByRole("heading", { level: 1, name: "Новый товар" });
    await browser.type(await screen.findByLabelText("Название"), "Ваза");
    await browser.type(screen.getByLabelText("Описание"), "  Стекло  ");
    await browser.type(screen.getByLabelText("Цена, ₽"), "99.99");
    await browser.click(screen.getByRole("button", { name: "Создать товар" }));

    await waitFor(() =>
      expect(postBody).toEqual({
        name: "Ваза",
        description: "Стекло",
        priceKopecks: 9_999,
        imageUrl: null,
      }),
    );
  });

  it("focuses the first invalid field and maps a 400 response to a message", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "POST /seller/products": { status: 400, body: { error: "invalid_request" } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/products/new"]);

    await screen.findByRole("heading", { level: 1, name: "Новый товар" });
    await browser.click(await screen.findByRole("button", { name: "Создать товар" }));

    const nameInput = screen.getByLabelText("Название");
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Цена, ₽")).toHaveAttribute("aria-invalid", "true");

    await browser.type(nameInput, "Куртка");
    await browser.type(screen.getByLabelText("Цена, ₽"), "100");
    await browser.click(screen.getByRole("button", { name: "Создать товар" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Проверьте поля");
    expect(screen.getByRole("alert").parentElement).toHaveFocus();
  });

  it("maps a 409 shop_required response from create to a message", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "POST /seller/products": { status: 409, body: { error: "shop_required" } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/products/new"]);

    await browser.type(await screen.findByLabelText("Название"), "Куртка");
    await browser.type(screen.getByLabelText("Цена, ₽"), "100");
    await browser.click(screen.getByRole("button", { name: "Создать товар" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Сначала создайте магазин: товары хранятся внутри магазина.",
    );
  });

  it("shows the shop CTA when the seller has no shop", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: null } },
    });

    renderApp(["/admin/products/new"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Сначала создайте магазин" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Настроить магазин" })).toHaveAttribute(
      "href",
      "/admin/shop",
    );
  });
});

describe("AdminProductEditPage", () => {
  it("PATCHes only changed fields and updates the cached list", async () => {
    let current = { ...draftProduct };
    let patchBody: unknown;

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": () => ({ body: { products: [current] } }),
      "PATCH /seller/products/11": ({ body }) => {
        patchBody = body;
        current = { ...current, ...(body as Partial<typeof current>) };
        return { body: { product: current } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/products/11"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Редактирование товара" }),
    ).toBeInTheDocument();

    const nameInput = await screen.findByLabelText("Название");
    await browser.clear(nameInput);
    await browser.type(nameInput, "Куртка 90-х, винтаж");

    const priceInput = screen.getByLabelText("Цена, ₽");
    await browser.clear(priceInput);
    await browser.type(priceInput, "4300");

    await browser.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() =>
      expect(patchBody).toEqual({
        name: "Куртка 90-х, винтаж",
        priceKopecks: 430_000,
      }),
    );
    expect(await screen.findByText("Изменения сохранены.")).toBeInTheDocument();
    expect(screen.getByText("Изменений нет")).toBeInTheDocument();
  });

  it("keeps the product id in the login return path after a 401", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": { status: 401, body: { error: "unauthorized" } },
    });

    renderApp(["/admin/products/11"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Сессия истекла" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute(
      "href",
      "/login?next=%2Fadmin%2Fproducts%2F11",
    );
  });

  it("locks status actions until unsaved edits are saved", async () => {
    let current = { ...draftProduct };
    let patchBody: unknown;

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": () => ({ body: { products: [current] } }),
      "PATCH /seller/products/11": ({ body }) => {
        patchBody = body;
        current = { ...current, ...(body as Partial<typeof current>) };
        return { body: { product: current } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/products/11"]);

    const nameInput = await screen.findByLabelText("Название");
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Скрыть" })).toBeEnabled();

    await browser.clear(nameInput);
    await browser.type(nameInput, "Куртка с правками");

    const dirtyHint = screen.getByText("Сначала сохраните изменения.");
    expect(screen.getAllByRole("status")).toContain(dirtyHint);
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Скрыть" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Вернуть в черновик" })).toBeDisabled();

    await browser.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => expect(patchBody).toEqual({ name: "Куртка с правками" }));
    expect(await screen.findByText("Изменения сохранены.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Сначала сохраните изменения.")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Скрыть" })).toBeEnabled();
  });

  it("publishes and hides a product through separate PATCH status actions", async () => {
    let current = { ...draftProduct };
    const statusBodies: unknown[] = [];

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": () => ({ body: { products: [current] } }),
      "PATCH /seller/products/11": ({ body }) => {
        statusBodies.push(body);
        current = { ...current, ...(body as Partial<typeof current>) };
        return { body: { product: current } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/products/11"]);

    const publishButton = await screen.findByRole("button", { name: "Опубликовать" });
    expect(publishButton).toBeEnabled();
    await browser.click(publishButton);

    await waitFor(() => expect(statusBodies.at(-1)).toEqual({ status: "published" }));
    expect(await screen.findByText("Товар опубликован.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled(),
    );
    expect(screen.getAllByText("Опубликован").length).toBeGreaterThan(0);

    await browser.click(screen.getByRole("button", { name: "Скрыть" }));
    await waitFor(() => expect(statusBodies.at(-1)).toEqual({ status: "hidden" }));
    expect(await screen.findByText("Товар скрыт.")).toBeInTheDocument();
    expect(screen.getAllByText("Скрыт").length).toBeGreaterThan(0);
  });

  it("explains a shop_not_published conflict and links to shop settings", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: publishedShop } },
      "GET /seller/products": { body: { products: [draftProduct] } },
      "PATCH /seller/products/11": {
        status: 409,
        body: { error: "shop_not_published" },
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/products/11"]);

    const publishButton = await screen.findByRole("button", { name: "Опубликовать" });
    await browser.click(publishButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Магазин не опубликован. Опубликуйте магазин, чтобы публиковать товары.",
    );
    expect(screen.getByRole("link", { name: "Открыть настройки магазина" })).toHaveAttribute(
      "href",
      "/admin/shop",
    );
  });

  it("disables publish for a draft product while the shop is a draft", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "GET /seller/products": { body: { products: [draftProduct] } },
    });

    renderApp(["/admin/products/11"]);

    expect(await screen.findByLabelText("Название")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Скрыть" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Вернуть в черновик" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Настроить магазин" })).toHaveAttribute(
      "href",
      "/admin/shop",
    );
  });

  it("keeps a published product editable when the shop is a draft and disables publish", async () => {
    const publishedProduct = { ...draftProduct, status: "published" as const };

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "GET /seller/products": { body: { products: [publishedProduct] } },
    });

    renderApp(["/admin/products/11"]);

    const nameInput = await screen.findByLabelText("Название");
    expect(nameInput).toBeEnabled();
    expect(screen.getByLabelText("Цена, ₽")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Скрыть" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Вернуть в черновик" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Настроить магазин" })).toHaveAttribute(
      "href",
      "/admin/shop",
    );
  });
});
