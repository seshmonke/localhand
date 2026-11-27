import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    expect(
      await screen.findByRole("heading", { level: 1, name: "Вход в кабинет" }),
    ).toBeInTheDocument();
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

  it("logs out through the API and returns to /login", async () => {
    let loggedIn = true;
    installFetchMock({
      "GET /auth/me": () =>
        loggedIn ? { body: { user: demoUser } } : { status: 401, body: { error: "unauthorized" } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "POST /auth/logout": () => {
        loggedIn = false;
        return { status: 204 };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 1, name: "Ваш магазин" });
    await browser.click(screen.getByRole("button", { name: "Выйти" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Вход в кабинет" }),
    ).toBeInTheDocument();
    expect(loggedIn).toBe(false);
  });
});
