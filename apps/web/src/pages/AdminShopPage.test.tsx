import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orderKeys } from "../lib/queries.js";
import { installFetchMock, type MockResult } from "../test/mock-api.js";
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
  cdekCityCode: null,
  cdekCityName: null,
  cdekShipmentPoint: null,
  status: "draft" as const,
};

const shippingShop = {
  ...draftShop,
  cdekCityCode: 44,
  cdekCityName: "Москва",
  cdekShipmentPoint: "MSK001",
};

const moscowCity = { code: 44, name: "Москва" };
const spbCity = { code: 137, name: "Санкт-Петербург" };
const kazanCity = { code: 447, name: "Казань" };
const moscowPoint = {
  code: "MSK001",
  name: "ПВЗ Тверская",
  address: "ул. Тестовая, 1",
  cityCode: 44,
  cityName: "Москва",
};
const kazanPoint = {
  code: "KZN001",
  name: "ПВЗ Баумана",
  address: "ул. Тестовая, 2",
  cityCode: 447,
  cityName: "Казань",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  it("shows the saved shipping city and PVZ and saves a new origin", async () => {
    let current = { ...shippingShop };
    let patchBody: unknown;

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": () => ({ body: { shop: current } }),
      "GET /seller/payments/account": { body: { account: null } },
      "GET /delivery/cities": ({ query }) => ({
        body: { cities: query.query === "Казань" ? [kazanCity] : [moscowCity] },
      }),
      "GET /delivery/points": ({ query }) => ({
        body: { points: query.cityCode === "447" ? [kazanPoint] : [moscowPoint] },
      }),
      "PATCH /seller/shop": ({ body }) => {
        patchBody = body;
        current = { ...current, ...(body as Partial<typeof current>) };
        return { body: { shop: current } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 2, name: "Настройки магазина" });
    const citySelect = await screen.findByLabelText("Город сдачи");
    expect(citySelect).toHaveValue("44");
    const pointSelect = await screen.findByLabelText("Пункт выдачи");
    await waitFor(() => expect(pointSelect).toHaveValue("MSK001"));

    await browser.type(screen.getByLabelText("Поиск города"), "Казань");
    await waitFor(() => expect(screen.getByRole("option", { name: "Казань" })).toBeInTheDocument());

    await browser.selectOptions(citySelect, "447");
    expect(screen.getByLabelText("Пункт выдачи")).toHaveValue("");

    const kazanPointOption = await screen.findByRole("option", { name: /ПВЗ Баумана/ });
    await browser.selectOptions(screen.getByLabelText("Пункт выдачи"), kazanPointOption);
    await browser.click(screen.getByRole("button", { name: "Сохранить доставку" }));

    await waitFor(() =>
      expect(patchBody).toEqual({
        cdekCityCode: 447,
        cdekCityName: "Казань",
        cdekShipmentPoint: "KZN001",
      }),
    );
    expect(await screen.findByText("Доставка сохранена.")).toBeInTheDocument();
  });

  it("requires a PVZ and reports a save error", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "GET /seller/payments/account": { body: { account: null } },
      "GET /delivery/cities": { body: { cities: [moscowCity] } },
      "GET /delivery/points": { body: { points: [moscowPoint] } },
      "PATCH /seller/shop": { status: 502, body: { error: "delivery_unavailable" } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 2, name: "Настройки магазина" });
    expect(screen.getByText(/Город сдачи не настроен/)).toBeInTheDocument();

    await browser.type(screen.getByLabelText("Поиск города"), "Москва");
    await screen.findByRole("option", { name: "Москва" });
    await browser.selectOptions(screen.getByLabelText("Город сдачи"), "44");
    await browser.click(screen.getByRole("button", { name: "Сохранить доставку" }));

    expect(
      await screen.findByText("Выберите ПВЗ: без него заказы не смогут оформить доставку."),
    ).toBeInTheDocument();

    const pointOption = await screen.findByRole("option", { name: /ПВЗ Тверская/ });
    await browser.selectOptions(screen.getByLabelText("Пункт выдачи"), pointOption);
    await browser.click(screen.getByRole("button", { name: "Сохранить доставку" }));

    expect(
      await screen.findByText("Сервис доставки временно недоступен. Повторите попытку."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Город сдачи")).toHaveValue("44");
    expect(screen.getByLabelText("Пункт выдачи")).toHaveValue("MSK001");
  });

  it("debounces city search and still loads PVZ after a city change", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "GET /seller/payments/account": { body: { account: null } },
      "GET /delivery/cities": { body: { cities: [spbCity] } },
      "GET /delivery/points": { body: { points: [] } },
    });
    const cityCalls = () =>
      fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.includes("/api/delivery/cities"));

    renderApp(["/admin/shop"]);
    await screen.findByRole("heading", { level: 2, name: "Настройки магазина" });

    vi.useFakeTimers();
    const search = screen.getByLabelText<HTMLInputElement>("Поиск города");
    for (const char of "Санкт-Петербург") {
      fireEvent.change(search, { target: { value: search.value + char } });
    }
    expect(cityCalls()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(cityCalls()).toHaveLength(1);
    const [calledUrl] = cityCalls();
    expect(new URL(calledUrl ?? "", "http://localhost").searchParams.get("query")).toBe(
      "Санкт-Петербург",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("option", { name: "Санкт-Петербург" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Город сдачи"), { target: { value: "137" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/api/delivery/points?cityCode=137"),
      ),
    ).toBe(true);
  });

  it("shows an empty city result and a rate-limit error with retry", async () => {
    let rateLimited = true;

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: draftShop } },
      "GET /seller/payments/account": { body: { account: null } },
      "GET /delivery/cities": ({ query }) => {
        if (query.query === "Неттакого") {
          return { body: { cities: [] } };
        }
        if (query.query === "Москва" && rateLimited) {
          rateLimited = false;
          return { status: 429, body: { error: "rate_limited" } };
        }
        return { body: { cities: [moscowCity] } };
      },
      "GET /delivery/points": { body: { points: [moscowPoint] } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 2, name: "Настройки магазина" });
    expect(screen.getByText(/Город сдачи не настроен/)).toBeInTheDocument();

    const search = screen.getByLabelText("Поиск города");
    await browser.type(search, "Неттакого");
    expect(await screen.findByText("Города не найдены. Уточните запрос.")).toBeInTheDocument();

    await browser.clear(search);
    await browser.type(search, "Москва");

    expect(
      await screen.findByText("Слишком много запросов. Подождите минуту и повторите."),
    ).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Повторить поиск городов" }));

    expect(await screen.findByRole("option", { name: "Москва" })).toBeInTheDocument();
  });

  it("shows PVZ loading, maps delivery_unavailable and retries", async () => {
    let pointsAttempt = 0;
    let resolvePoints: ((result: MockResult) => void) | undefined;
    let patchBody: unknown;
    const current = { ...draftShop };

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop: current } },
      "GET /seller/payments/account": { body: { account: null } },
      "GET /delivery/cities": { body: { cities: [moscowCity] } },
      "GET /delivery/points": () => {
        pointsAttempt += 1;
        if (pointsAttempt === 1) {
          return new Promise<MockResult>((resolve) => {
            resolvePoints = resolve;
          });
        }
        return { body: { points: [moscowPoint] } };
      },
      "PATCH /seller/shop": ({ body }) => {
        patchBody = body;
        return { body: { shop: { ...current, ...(body as Partial<typeof current>) } } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 2, name: "Настройки магазина" });
    await browser.type(screen.getByLabelText("Поиск города"), "Москва");
    await screen.findByRole("option", { name: "Москва" });
    await browser.selectOptions(screen.getByLabelText("Город сдачи"), "44");

    expect(await screen.findByText("Загружаем ПВЗ…", { selector: "p" })).toBeInTheDocument();

    await act(async () => {
      resolvePoints?.({ status: 502, body: { error: "delivery_unavailable" } });
    });

    expect(
      await screen.findByText("Сервис доставки временно недоступен. Повторите попытку."),
    ).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Повторить загрузку ПВЗ" }));
    const pointOption = await screen.findByRole("option", { name: /ПВЗ Тверская/ });
    await browser.selectOptions(screen.getByLabelText("Пункт выдачи"), pointOption);
    await browser.click(screen.getByRole("button", { name: "Сохранить доставку" }));

    await waitFor(() =>
      expect(patchBody).toEqual({
        cdekCityCode: 44,
        cdekCityName: "Москва",
        cdekShipmentPoint: "MSK001",
      }),
    );
  });

  it("clears the shipping origin and sends nulls", async () => {
    let current = { ...shippingShop };
    let patchBody: unknown;

    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": () => ({ body: { shop: current } }),
      "GET /seller/payments/account": { body: { account: null } },
      "GET /delivery/points": { body: { points: [moscowPoint] } },
      "PATCH /seller/shop": ({ body }) => {
        patchBody = body;
        current = { ...current, ...(body as Partial<typeof current>) };
        return { body: { shop: current } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    await screen.findByRole("heading", { level: 2, name: "Настройки магазина" });
    await waitFor(() => expect(screen.getByLabelText("Пункт выдачи")).toHaveValue("MSK001"));

    await browser.click(screen.getByRole("button", { name: "Убрать город сдачи" }));
    expect(screen.getByText(/Город сдачи не настроен/)).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Сохранить доставку" }));
    await waitFor(() =>
      expect(patchBody).toEqual({
        cdekCityCode: null,
        cdekCityName: null,
        cdekShipmentPoint: null,
      }),
    );
    expect(await screen.findByText("Доставка сохранена.")).toBeInTheDocument();
  });
});
