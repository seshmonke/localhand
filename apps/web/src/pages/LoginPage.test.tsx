import { QueryClient } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sellerKeys } from "../lib/queries.js";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";
import { safeNext } from "./LoginPage.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };
const typedPhone = "999 000-00-07";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("safeNext", () => {
  it("keeps only admin destinations and falls back to /admin", () => {
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("/admin/shop")).toBe("/admin/shop");
    expect(safeNext("/admin/products?tab=draft#top")).toBe("/admin/products?tab=draft#top");
    expect(safeNext(null)).toBe("/admin");
    expect(safeNext("/login")).toBe("/admin");
    expect(safeNext("/login?next=/login")).toBe("/admin");
    expect(safeNext("/administrator")).toBe("/admin");
    expect(safeNext("/admin/../login")).toBe("/admin");
    expect(safeNext("//evil.example/admin")).toBe("/admin");
  });
});

describe("LoginPage", () => {
  it("logs in with a phone code from the API and opens the admin", async () => {
    let meCalls = 0;
    const fetchMock = installFetchMock({
      "GET /auth/me": () => {
        meCalls += 1;
        return meCalls === 1
          ? { status: 401, body: { error: "unauthorized" } }
          : { body: { user: demoUser } };
      },
      "POST /auth/request-code": { body: { ok: true, devCode: "123456" } },
      "POST /auth/verify-code": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: null } },
    });

    const browser = userEvent.setup();
    renderApp(["/login"]);

    await browser.type(screen.getByLabelText("Телефон"), typedPhone);
    await browser.click(screen.getByRole("button", { name: "Получить код" }));

    expect(await screen.findByText("123456")).toBeInTheDocument();

    await browser.type(screen.getByLabelText("Код из сообщения"), "123456");
    await browser.click(screen.getByRole("button", { name: "Войти" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ваш магазин" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Вход в кабинет" })).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify-code",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ phone: phone("+7", "999", "000", "00", "07"), code: "123456" }),
      }),
    );
  });

  it("shows a clear message when the code is rejected with 401", async () => {
    installFetchMock({
      "GET /auth/me": { status: 401, body: { error: "unauthorized" } },
      "POST /auth/request-code": { body: { ok: true } },
      "POST /auth/verify-code": { status: 401, body: { error: "unauthorized" } },
    });

    const browser = userEvent.setup();
    renderApp(["/login"]);

    await browser.type(screen.getByLabelText("Телефон"), typedPhone);
    await browser.click(screen.getByRole("button", { name: "Получить код" }));

    await browser.type(await screen.findByLabelText("Код из сообщения"), "000000");
    await browser.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText(/Код неверный или истёк/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Вход в кабинет" })).toBeInTheDocument();
    expect(screen.queryByText("Дев-режим")).not.toBeInTheDocument();
  });

  it("shows a rate-limit message when request-code returns 429", async () => {
    installFetchMock({
      "GET /auth/me": { status: 401, body: { error: "unauthorized" } },
      "POST /auth/request-code": { status: 429, body: { error: "rate_limited" } },
    });

    const browser = userEvent.setup();
    renderApp(["/login"]);

    await browser.type(screen.getByLabelText("Телефон"), typedPhone);
    await browser.click(screen.getByRole("button", { name: "Получить код" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Слишком много запросов");
  });

  it("redirects an authenticated seller from /login to the admin", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: null } },
    });

    renderApp(["/login"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ваш магазин" }),
    ).toBeInTheDocument();
  });

  it("does not loop when next points back to /login", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: null } },
    });

    renderApp(["/login?next=%2Flogin"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ваш магазин" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Вход в кабинет" })).not.toBeInTheDocument();
  });

  it("keeps an admin destination from next after login", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: null } },
    });

    renderApp(["/login?next=%2Fadmin%2Fshop"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ваш магазин" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seller/shop",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("clears the previous seller cache before opening another account", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, retry: false },
        mutations: { retry: false },
      },
    });
    const previousShop = {
      id: 1,
      slug: "previous-shop",
      name: "Магазин A",
      description: null,
      status: "published" as const,
    };
    client.setQueryData(sellerKeys.shop, { shop: previousShop });

    let meCalls = 0;
    installFetchMock({
      "GET /auth/me": () => {
        meCalls += 1;
        return meCalls === 1
          ? { status: 401, body: { error: "unauthorized" } }
          : { body: { user: demoUser } };
      },
      "POST /auth/request-code": { body: { ok: true } },
      "POST /auth/verify-code": { body: { user: demoUser } },
      "GET /seller/shop": () => new Promise<never>(() => {}),
    });

    const browser = userEvent.setup();
    renderApp(["/login"], client);

    await browser.type(screen.getByLabelText("Телефон"), typedPhone);
    await browser.click(screen.getByRole("button", { name: "Получить код" }));
    await browser.type(await screen.findByLabelText("Код из сообщения"), "123456");
    await browser.click(screen.getByRole("button", { name: "Войти" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Загружаем магазин" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Магазин A")).not.toBeInTheDocument();
    expect(client.getQueryData(sellerKeys.shop)).toBeUndefined();
  });
});
