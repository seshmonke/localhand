import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orderKeys } from "../lib/queries.js";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };
const draftShop = {
  id: 1,
  slug: "demo-shop",
  name: "Демо-магазин",
  description: null,
  status: "draft" as const,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin guard", () => {
  it("redirects an unauthenticated visitor from /admin/shop to /login", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { status: 401, body: { error: "unauthorized" } },
    });

    renderApp(["/admin/shop"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Вход" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

describe("AdminShopPage", () => {
  it("maps a duplicate slug conflict to a field message", async () => {
    let createBody: unknown;
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: null } },
      "POST /seller/shop": ({ body }) => {
        createBody = body;
        return { status: 409, body: { error: "slug_taken" } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 2, name: "Создать магазин" });
    await browser.type(screen.getByLabelText("Название"), "Тестовый магазин");
    await browser.type(screen.getByLabelText("Slug"), "taken-shop");
    await browser.click(screen.getByRole("button", { name: "Создать магазин" }));

    expect(await screen.findByText("Этот slug уже занят. Выберите другой.")).toBeInTheDocument();
    expect(createBody).toEqual({ name: "Тестовый магазин", slug: "taken-shop" });
  });

  it("publishes a draft shop and shows the new status", async () => {
    let patchBody: unknown;
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "GET /seller/payments/account": { body: { account: null } },
      "PATCH /seller/shop": ({ body }) => {
        patchBody = body;
        return { body: { shop: { ...draftShop, status: "published" } } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 1, name: "Ваш магазин" });
    expect((await screen.findAllByText("Черновик")).length).toBeGreaterThan(0);

    await browser.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(await screen.findByText("Магазин опубликован.")).toBeInTheDocument();
    expect(screen.getAllByText("Опубликован").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Открыть витрину/ })).toBeInTheDocument();
    expect(patchBody).toEqual({ status: "published" });
  });

  it("locks publish until unsaved changes are saved", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "GET /seller/payments/account": { body: { account: null } },
      "PATCH /seller/shop": ({ body }) => {
        const patch = body as Partial<typeof draftShop>;
        return { body: { shop: { ...draftShop, ...patch } } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 2, name: "Настройки магазина" });

    const nameInput = screen.getByLabelText("Название");
    await browser.clear(nameInput);
    await browser.type(nameInput, "Новое имя");

    expect(screen.getByText("Сначала сохраните изменения.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();

    await browser.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled());
    expect(screen.queryByText("Сначала сохраните изменения.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Название")).toHaveValue("Новое имя");
  });

  it("disables the settings form for a blocked shop", async () => {
    const blockedShop = { ...draftShop, status: "blocked" as const };
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: blockedShop } },
      "GET /seller/payments/account": { body: { account: null } },
    });

    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 2, name: "Настройки магазина" });

    expect(
      screen.getByText("Платформа заблокировала магазин: изменения недоступны."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Название")).toBeDisabled();
    expect(screen.getByLabelText("Slug")).toBeDisabled();
    expect(screen.getByLabelText("Описание")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить изменения" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Опубликовать" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Снять с публикации" })).not.toBeInTheDocument();
  });

  it("logs out through the API and returns to /login", async () => {
    let loggedIn = true;
    installFetchMock({
      "GET /auth/me": () =>
        loggedIn ? { body: { user: demoUser } } : { status: 401, body: { error: "unauthorized" } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "GET /seller/payments/account": { body: { account: null } },
      "POST /auth/logout": () => {
        loggedIn = false;
        return { status: 204 };
      },
    });

    const browser = userEvent.setup();
    const { client } = renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 1, name: "Ваш магазин" });
    client.setQueryData(orderKeys.mine, { orders: [{ id: 42 }] });
    client.setQueryData(orderKeys.detail(42), { order: { id: 42 } });

    await browser.click(screen.getByRole("button", { name: "Выйти" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Вход" })).toBeInTheDocument();
    expect(loggedIn).toBe(false);
    expect(client.getQueryCache().findAll({ queryKey: orderKeys.all })).toHaveLength(0);
  });
});
