import type { DeliverySnapshot, DeliveryTariffListResponse } from "@localhand/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock, type MockRoutes } from "../../test/mock-api.js";
import { AdminDeliveryCard } from "./AdminDeliveryCard.js";

const createdAt = "2026-11-27T10:00:00.000Z";
const quoted: DeliverySnapshot = {
  provider: "cdek",
  status: "quoted",
  cityCode: 44,
  cityName: "Москва",
  pointCode: "MSK001",
  pointAddress: "ул. Тестовая, 1, ПВЗ «Тестовый»",
  recipientName: "Иван Тестов",
  tariffCode: "136",
  tariffName: "Посылка склад-ПВЗ",
  priceKopecks: 45_000,
  periodMin: 2,
  periodMax: 5,
  providerOrderId: null,
  providerNumber: null,
  carrier: null,
  trackNumber: null,
  lastStatusCode: null,
  lastStatusAt: null,
};
const created: DeliverySnapshot = {
  ...quoted,
  status: "created",
  providerOrderId: "cdek-order-42",
  providerNumber: "1234567890",
  lastStatusCode: "CREATED",
  lastStatusAt: createdAt,
};
function tariff(code: string, name: string, price: number, min: number, max: number) {
  return {
    shopId: 1,
    tariffCode: code,
    tariffName: name,
    priceKopecks: price,
    periodMin: min,
    periodMax: max,
  };
}
const tariffs: DeliveryTariffListResponse = {
  paid: { tariffCode: "136", priceKopecks: 45_000 },
  tariffs: [
    tariff("136", "Посылка склад-ПВЗ", 45_000, 2, 5),
    tariff("137", "Посылка склад-склад", 41_000, 1, 4),
  ],
};

function renderCard(
  routes: MockRoutes,
  props: Partial<Parameters<typeof AdminDeliveryCard>[0]> = {},
) {
  const fetchMock = installFetchMock(routes);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminDeliveryCard orderId={42} orderStatus="paid" delivery={quoted} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminDeliveryCard", () => {
  it("creates a shipment with the paid tariff only and shows track and events", async () => {
    let shipped = false;
    const fetchMock = renderCard({
      "GET /seller/orders/42/delivery": () => ({
        body: shipped
          ? {
              delivery: created,
              events: [{ statusCode: "CREATED", statusName: "Создано", occurredAt: createdAt }],
            }
          : { delivery: quoted, events: [] },
      }),
      "GET /seller/orders/42/delivery/tariffs": { body: tariffs },
      "POST /seller/orders/42/delivery": () => {
        shipped = true;
        return { status: 201, body: { delivery: created } };
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(await within(section).findByText("Ожидает отправки")).toBeInTheDocument();

    await browser.click(within(section).getByRole("button", { name: "Рассчитать тарифы" }));
    expect(await within(section).findByText("Посылка склад-склад")).toBeInTheDocument();
    expect(within(section).getByText(/Оплаченный тариф/)).toBeInTheDocument();
    await browser.click(within(section).getByRole("button", { name: "Создать отправление" }));

    expect(
      await within(section).findByText(/Отправление создано\. Трек: 1234567890/),
    ).toBeInTheDocument();
    expect(await within(section).findByText("Создано")).toBeInTheDocument();
    expect(within(section).getByText("СДЭК · 1234567890")).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Создать отправление" })).toBeNull();

    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/api/seller/orders/42/delivery") && init?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ tariffCode: "136" });
  });

  it("explains a tariff mismatch and keeps the quoted snapshot", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: quoted, events: [] } },
      "GET /seller/orders/42/delivery/tariffs": { body: tariffs },
      "POST /seller/orders/42/delivery": {
        status: 409,
        body: { error: "delivery_tariff_mismatch" },
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await browser.click(await within(section).findByRole("button", { name: "Рассчитать тарифы" }));
    await browser.click(
      await within(section).findByRole("button", { name: "Создать отправление" }),
    );

    expect(
      await within(section).findByText(/Тариф изменился\. Пересчитайте тарифы/),
    ).toBeInTheDocument();
    expect(within(section).getByText("Ожидает отправки")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Создать отправление" })).toBeEnabled();
    expect(within(section).queryByText(/delivery_tariff_mismatch|409/)).toBeNull();
  });

  it("reports a provider outage and allows a retry", async () => {
    let attempts = 0;
    renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: quoted, events: [] } },
      "GET /seller/orders/42/delivery/tariffs": { body: tariffs },
      "POST /seller/orders/42/delivery": () => {
        attempts += 1;
        return { status: 502, body: { error: "delivery_provider_error" } };
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await browser.click(await within(section).findByRole("button", { name: "Рассчитать тарифы" }));
    await browser.click(
      await within(section).findByRole("button", { name: "Создать отправление" }),
    );

    expect(
      await within(section).findByText(/СДЭК временно недоступен\. Повторите позже/),
    ).toBeInTheDocument();
    const retry = within(section).getByRole("button", { name: "Создать отправление" });
    await browser.click(retry);
    await waitFor(() => expect(attempts).toBe(2));
  });

  it("shows an expired session for a 401 without hiding the snapshot", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": { status: 401, body: { error: "unauthorized" } },
    });
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(await within(section).findByText(/Сессия истекла/)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Войдите снова" })).toHaveAttribute(
      "href",
      "/login?next=%2Fadmin%2Forders%2F42",
    );
    expect(within(section).getByText("Иван Тестов")).toBeInTheDocument();
  });

  it("shows a not-found message for a 404 without hiding the snapshot", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": { status: 404, body: { error: "not_found" } },
    });
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(await within(section).findByText("Заказ не найден.")).toBeInTheDocument();
    expect(within(section).getByText("Иван Тестов")).toBeInTheDocument();
  });

  it("shows the empty state and no actions for a paid order without delivery", () => {
    const fetchMock = renderCard({}, { delivery: null });
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(within(section).getByText("Доставка не оформлена")).toBeInTheDocument();
    expect(within(section).getByText(/вручную/)).toBeInTheDocument();
    expect(within(section).queryByRole("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the after-payment state and no actions for an unpaid order", () => {
    const fetchMock = renderCard({}, { orderStatus: "new", delivery: null });
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(within(section).getByText(/Доставка доступна после оплаты/)).toBeInTheDocument();
    expect(within(section).queryByRole("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the newest event first and refreshes the delivery on demand", async () => {
    const newer = "2026-11-28T10:00:00.000Z";
    let gets = 0;
    renderCard({
      "GET /seller/orders/42/delivery": () => {
        gets += 1;
        return {
          body: {
            delivery: {
              ...created,
              status: "in_transit" as const,
              trackNumber: "1234567890",
              lastStatusCode: "IN_TRANSIT",
              lastStatusAt: newer,
            },
            events: [
              { statusCode: "CREATED", statusName: "Создано", occurredAt: createdAt },
              { statusCode: "IN_TRANSIT", statusName: "В пути", occurredAt: newer },
            ],
          },
        };
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await within(section).findByText("Создано");
    expect(
      within(section)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining("В пути"), expect.stringContaining("Создано")]);
    await browser.click(within(section).getByRole("button", { name: "Обновить" }));
    await waitFor(() => expect(gets).toBe(2));
  });

  it("renders a single empty-history line and never exposes raw ids or codes", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: created, events: [] } },
    });
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(await within(section).findByText("Событий пока нет.")).toBeInTheDocument();
    expect(within(section).getByText("Посылка склад-ПВЗ")).toBeInTheDocument();
    for (const raw of ["cdek-order-42", "MSK001", "CREATED", "136"]) {
      expect(within(section).queryByText(raw)).toBeNull();
    }
  });
});
