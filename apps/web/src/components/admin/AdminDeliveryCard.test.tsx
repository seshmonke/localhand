import type { DeliverySnapshot, DeliveryTariffListResponse } from "@localhand/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  tariffCode: "137",
  tariffName: "Посылка склад-склад",
  priceKopecks: 41_000,
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
  providerNumber: "CDEK-00042",
  trackNumber: "1234567890",
  lastStatusCode: "CREATED",
  lastStatusAt: createdAt,
};
const manual: DeliverySnapshot = {
  ...quoted,
  provider: "manual",
  status: "manual",
  cityCode: 0,
  cityName: "Не указан",
  pointCode: "manual",
  pointAddress: "Не указан",
  recipientName: "Не указан",
  tariffCode: null,
  tariffName: null,
  priceKopecks: 0,
  periodMin: null,
  periodMax: null,
  providerOrderId: null,
  providerNumber: null,
  carrier: "Почта России",
  trackNumber: "RA123456789RU",
  lastStatusCode: "MANUAL",
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
  paid: { tariffCode: "137", priceKopecks: 45_000 },
  tariffs: [
    tariff("136", "Посылка склад-ПВЗ", 45_000, 2, 5),
    tariff("137", "Посылка склад-склад", 45_000, 1, 4),
  ],
};

function setupCard(
  routes: MockRoutes,
  props: Partial<Parameters<typeof AdminDeliveryCard>[0]> = {},
) {
  const fetchMock = installFetchMock(routes);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminDeliveryCard orderId={42} orderStatus="paid" delivery={quoted} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock, client, unmount: view.unmount };
}

function renderCard(
  routes: MockRoutes,
  props: Partial<Parameters<typeof AdminDeliveryCard>[0]> = {},
) {
  return setupCard(routes, props).fetchMock;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function fillManualTrack(
  section: HTMLElement,
  carrier = "Почта России",
  trackNumber = "RA123456789RU",
) {
  const browser = userEvent.setup();
  await browser.type(within(section).getByLabelText("Перевозчик"), carrier);
  await browser.type(within(section).getByLabelText("Трек"), trackNumber);
  return browser;
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
    const labels = [...section.querySelectorAll("dt")].map((node) => node.textContent);
    expect(labels).toEqual(["Город", "ПВЗ получателя", "Получатель", "Доставка", "Тариф", "Срок"]);

    await browser.click(within(section).getByRole("button", { name: "Рассчитать тарифы" }));
    const paidLabel = await within(section).findByText(/Оплаченный тариф/);
    expect(paidLabel).toHaveTextContent("Посылка склад-склад");
    expect(paidLabel).toHaveTextContent("410");
    const list = within(section).getByRole("list", { name: "Доступные тарифы" });
    expect(within(list).getByText("Посылка склад-склад").closest("li")).toHaveTextContent("450");
    await browser.click(within(section).getByRole("button", { name: "Создать отправление" }));

    expect(
      await within(section).findByText(/Отправление создано\. Трек: 1234567890/),
    ).toBeInTheDocument();
    expect(await within(section).findByText("Создано")).toBeInTheDocument();
    expect(within(section).getByText("Перевозчик · 1234567890")).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Создать отправление" })).toBeNull();

    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/api/seller/orders/42/delivery") && init?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ tariffCode: "137" });
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

  it("reports a network error when creating a shipment", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: quoted, events: [] } },
      "GET /seller/orders/42/delivery/tariffs": { body: tariffs },
      "POST /seller/orders/42/delivery": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await browser.click(await within(section).findByRole("button", { name: "Рассчитать тарифы" }));
    await browser.click(
      await within(section).findByRole("button", { name: "Создать отправление" }),
    );

    expect(
      await within(section).findByText(
        "Не удалось создать отправление. Проверьте соединение и повторите.",
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["delivery_not_paid", "Доставка доступна после оплаты."],
    ["delivery_snapshot_missing", "В заказе нет данных доставки."],
    [
      "delivery_dimensions_missing",
      "У товаров не заполнены вес и габариты. Заполните их в карточке товара.",
    ],
  ])("shows the %s conflict message", async (code, text) => {
    renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: quoted, events: [] } },
      "GET /seller/orders/42/delivery/tariffs": { body: tariffs },
      "POST /seller/orders/42/delivery": { status: 409, body: { error: code } },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await browser.click(await within(section).findByRole("button", { name: "Рассчитать тарифы" }));
    await browser.click(
      await within(section).findByRole("button", { name: "Создать отправление" }),
    );

    expect(await within(section).findByText(text)).toBeInTheDocument();
  });

  it("reports a network error when saving a manual track", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: quoted, events: [] } },
      "PATCH /seller/orders/42/delivery": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const section = screen.getByRole("region", { name: "Доставка" });
    await within(section).findByText("Ожидает отправки");
    const browser = await fillManualTrack(section);
    await browser.click(within(section).getByRole("button", { name: "Сохранить трек" }));

    expect(
      await within(section).findByText(
        "Не удалось сохранить трек. Проверьте соединение и повторите.",
      ),
    ).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Сохранить трек" })).toBeEnabled();
  });

  it("reports a network error when calculating tariffs", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: quoted, events: [] } },
      "GET /seller/orders/42/delivery/tariffs": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await browser.click(await within(section).findByRole("button", { name: "Рассчитать тарифы" }));

    expect(
      await within(section).findByText(
        "Не удалось рассчитать тарифы. Проверьте соединение и повторите.",
      ),
    ).toBeInTheDocument();
  });

  it("refreshes data when create reports delivery_already_exists", async () => {
    let gets = 0;
    renderCard({
      "GET /seller/orders/42/delivery": () => {
        gets += 1;
        return { body: { delivery: quoted, events: [] } };
      },
      "GET /seller/orders/42/delivery/tariffs": { body: tariffs },
      "POST /seller/orders/42/delivery": {
        status: 409,
        body: { error: "delivery_already_exists" },
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await browser.click(await within(section).findByRole("button", { name: "Рассчитать тарифы" }));
    await browser.click(
      await within(section).findByRole("button", { name: "Создать отправление" }),
    );

    expect(
      await within(section).findByText("Отправление уже создано. Обновляем данные."),
    ).toBeInTheDocument();
    expect(within(section).queryByText(/delivery_already_exists|409/)).toBeNull();
    expect(gets).toBe(2);
  });

  it("shows an expired session for a 401 without hiding the snapshot", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": { status: 401, body: { error: "unauthorized" } },
    });
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(
      await within(section).findByRole("heading", { name: "Сессия истекла" }),
    ).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Войти" })).toBeInTheDocument();
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

  it("offers manual entry for a paid order without a delivery snapshot", () => {
    const fetchMock = renderCard({}, { delivery: null });
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(within(section).getByText("Доставка не оформлена")).toBeInTheDocument();
    expect(within(section).getByText(/Трек можно ввести вручную/)).toBeInTheDocument();
    expect(within(section).getByText(/Если отправление СДЭК не создано/)).toBeInTheDocument();
    expect(within(section).getByText("Латинские буквы, цифры и дефис.")).toBeInTheDocument();
    expect(within(section).getByLabelText("Перевозчик")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Сохранить трек" })).toBeInTheDocument();
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
    expect(within(section).getByRole("button", { name: "Обновить" })).toHaveClass("h-11");
    await browser.click(within(section).getByRole("button", { name: "Обновить" }));
    await waitFor(() => expect(gets).toBe(2));
  });

  it("renders a single empty-history line and never exposes raw ids or codes", async () => {
    renderCard({
      "GET /seller/orders/42/delivery": {
        body: { delivery: { ...created, trackNumber: null }, events: [] },
      },
    });
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(await within(section).findByText("Событий пока нет.")).toBeInTheDocument();
    expect(within(section).getByText("Посылка склад-склад")).toBeInTheDocument();
    expect(within(section).queryByText("Трек")).toBeNull();
    for (const raw of ["cdek-order-42", "MSK001", "CREATED", "137", "CDEK-00042"]) {
      expect(within(section).queryByText(new RegExp(raw))).toBeNull();
    }
  });

  const manualEvent = {
    statusCode: "MANUAL",
    statusName: "Почта России",
    occurredAt: createdAt,
  };

  it.each([
    ["a quoted delivery", quoted as DeliverySnapshot | null, false, 2],
    ["a legacy order without a delivery snapshot", null as DeliverySnapshot | null, true, 1],
  ] as Array<[string, DeliverySnapshot | null, boolean, number]>)(
    "saves a manual carrier and track for %s",
    async (_, delivery, note, gets) => {
      let saved = false;
      const fetchMock = renderCard(
        {
          "GET /seller/orders/42/delivery": () => ({
            body: { delivery: saved ? manual : quoted, events: saved ? [manualEvent] : [] },
          }),
          "PATCH /seller/orders/42/delivery": () => {
            saved = true;
            return { body: { delivery: manual } };
          },
        },
        { delivery },
      );
      const browser = userEvent.setup();
      const section = screen.getByRole("region", { name: "Доставка" });
      if (note) {
        expect(within(section).getByText("Доставка не оформлена")).toBeInTheDocument();
        expect(
          within(section).getByText(/Город, ПВЗ и получатель не сохранены в заказе/),
        ).toBeInTheDocument();
      } else {
        await within(section).findByText("Ожидает отправки");
      }

      await browser.type(within(section).getByLabelText("Перевозчик"), "Почта России");
      await browser.type(within(section).getByLabelText("Трек"), "RA123456789RU");
      await browser.click(within(section).getByRole("button", { name: "Сохранить трек" }));

      expect(await within(section).findByText("Ручной трек сохранён.")).toBeInTheDocument();
      expect(within(section).getByText("Ручной трек")).toBeInTheDocument();
      expect(within(section).getByText("Почта России · RA123456789RU")).toBeInTheDocument();
      expect(within(section).queryByRole("button", { name: "Сохранить трек" })).toBeNull();

      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
        carrier: "Почта России",
        trackNumber: "RA123456789RU",
      });
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) =>
            String(url).endsWith("/api/seller/orders/42/delivery") &&
            (init?.method ?? "GET") === "GET",
        ),
      ).toHaveLength(gets);
    },
  );

  it.each([
    ["a CDEK order exists", created, "Отправление создано"],
    [
      "a provider order exists without a track",
      { ...created, trackNumber: null },
      "Отправление создано",
    ],
    ["the delivery is already manual", manual, "Ручной трек"],
    [
      "a track number already exists",
      { ...quoted, carrier: "СДЭК", trackNumber: "1234567890" },
      "Ожидает отправки",
    ],
  ] as Array<[string, DeliverySnapshot, string]>)(
    "does not offer the manual form when %s",
    async (_, snapshot, label) => {
      renderCard(
        { "GET /seller/orders/42/delivery": { body: { delivery: snapshot, events: [] } } },
        { delivery: snapshot },
      );
      const section = screen.getByRole("region", { name: "Доставка" });
      expect(await within(section).findByText(label)).toBeInTheDocument();
      expect(within(section).queryByRole("button", { name: "Сохранить трек" })).toBeNull();
    },
  );

  it.each([
    [401, "unauthorized"],
    [404, "not_found"],
  ])(
    "does not offer the manual form when the delivery request fails with %i",
    async (status, error) => {
      renderCard({ "GET /seller/orders/42/delivery": { status, body: { error } } });
      const section = screen.getByRole("region", { name: "Доставка" });
      if (status === 401) {
        expect(
          await within(section).findByRole("heading", { name: "Сессия истекла" }),
        ).toBeInTheDocument();
      } else {
        expect(await within(section).findByText("Заказ не найден.")).toBeInTheDocument();
      }
      expect(within(section).queryByRole("button", { name: "Сохранить трек" })).toBeNull();
    },
  );

  it("validates carrier and track on the client before sending", async () => {
    const fetchMock = renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: quoted, events: [] } },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await within(section).findByText("Ожидает отправки");

    await browser.click(within(section).getByRole("button", { name: "Сохранить трек" }));
    const carrierInput = within(section).getByLabelText("Перевозчик");
    const trackInput = within(section).getByLabelText("Трек");
    expect(carrierInput).toHaveFocus();
    expect(within(section).getByRole("alert")).toHaveTextContent("Проверьте выделенные поля.");
    expect(within(section).getByText("Укажите перевозчика.")).toBeInTheDocument();
    expect(within(section).getByText("Укажите трек.")).toBeInTheDocument();
    expect(carrierInput).toHaveAttribute("aria-invalid", "true");
    expect(carrierInput.getAttribute("aria-describedby")).toBe(
      within(section).getByText("Укажите перевозчика.").id,
    );
    expect(trackInput).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);

    await browser.type(carrierInput, "СДЭК");
    await browser.tab();
    expect(trackInput).toHaveFocus();
    await browser.type(trackInput, "AB C");
    await browser.click(within(section).getByRole("button", { name: "Сохранить трек" }));
    expect(
      await within(section).findByText("Только латинские буквы, цифры и дефис."),
    ).toBeInTheDocument();
    expect(trackInput).toHaveFocus();
    expect(within(section).getByRole("alert")).toHaveTextContent("Проверьте выделенные поля.");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it.each([
    ["a conflict", 409, "delivery_already_exists", /Отправление уже создано/, false, 2],
    ["a provider error", 502, "delivery_provider_error", /СДЭК временно недоступен/, true, 1],
    ["a missing order", 404, "not_found", "Заказ не найден.", false, 1],
    ["an expired session", 401, "unauthorized", /Сессия истекла/, false, 1],
  ] as Array<[string, number, string, string | RegExp, boolean, number]>)(
    "handles %s when saving the manual track",
    async (_, status, code, text, form, gets) => {
      let attempts = 0;
      let saved = false;
      let getCount = 0;
      renderCard({
        "GET /seller/orders/42/delivery": () => {
          getCount += 1;
          return {
            body: { delivery: saved ? manual : quoted, events: saved ? [manualEvent] : [] },
          };
        },
        "PATCH /seller/orders/42/delivery": () => {
          attempts += 1;
          if (attempts > 1) {
            saved = true;
            return { body: { delivery: manual } };
          }
          return { status, body: { error: code } };
        },
      });
      const section = screen.getByRole("region", { name: "Доставка" });
      await within(section).findByText("Ожидает отправки");
      const browser = await fillManualTrack(section);
      await browser.click(within(section).getByRole("button", { name: "Сохранить трек" }));

      if (status === 401) {
        expect(
          await within(section).findByRole("heading", { name: "Сессия истекла" }),
        ).toBeInTheDocument();
      } else {
        expect(await within(section).findByText(text)).toBeInTheDocument();
      }
      const saveButton = within(section).queryByRole("button", { name: "Сохранить трек" });
      expect(saveButton === null).toBe(!form);
      if (form) {
        expect(saveButton).toBeEnabled();
        await browser.click(saveButton as HTMLElement);
        expect(await within(section).findByText("Ручной трек сохранён.")).toBeInTheDocument();
        expect(attempts).toBe(2);
        expect(getCount).toBe(2);
        return;
      }
      expect(getCount).toBe(gets);
    },
  );

  it("retries a failed delivery request without losing the snapshot", async () => {
    let gets = 0;
    renderCard({
      "GET /seller/orders/42/delivery": () => {
        gets += 1;
        if (gets === 1) {
          return { status: 502, body: { error: "delivery_provider_error" } };
        }
        return { body: { delivery: quoted, events: [] } };
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(
      await within(section).findByText(/СДЭК временно недоступен\. Повторите позже/),
    ).toBeInTheDocument();
    expect(within(section).getByText("Иван Тестов")).toBeInTheDocument();

    await browser.click(within(section).getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(gets).toBe(2));
    await waitFor(() => expect(within(section).queryByText(/СДЭК временно недоступен/)).toBeNull());
  });

  it("retries a delivery request after a network error", async () => {
    let gets = 0;
    renderCard({
      "GET /seller/orders/42/delivery": () => {
        gets += 1;
        if (gets === 1) {
          throw new TypeError("Failed to fetch");
        }
        return { body: { delivery: quoted, events: [] } };
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    expect(await within(section).findByText("Не удалось загрузить доставку.")).toBeInTheDocument();
    expect(within(section).getByText("Иван Тестов")).toBeInTheDocument();

    await browser.click(within(section).getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(gets).toBe(2));
    await waitFor(() =>
      expect(within(section).queryByText("Не удалось загрузить доставку.")).toBeNull(),
    );
  });

  it("retries tariffs after a transient provider error", async () => {
    let attempts = 0;
    renderCard({
      "GET /seller/orders/42/delivery": { body: { delivery: quoted, events: [] } },
      "GET /seller/orders/42/delivery/tariffs": () => {
        attempts += 1;
        if (attempts === 1) {
          return { status: 502, body: { error: "delivery_provider_error" } };
        }
        return { body: tariffs };
      },
    });
    const browser = userEvent.setup();
    const section = screen.getByRole("region", { name: "Доставка" });
    await browser.click(await within(section).findByRole("button", { name: "Рассчитать тарифы" }));
    expect(
      await within(section).findByText(/СДЭК временно недоступен\. Повторите позже/),
    ).toBeInTheDocument();

    await browser.click(within(section).getByRole("button", { name: "Рассчитать тарифы" }));
    expect(await within(section).findByText(/Оплаченный тариф/)).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("does not send a manual track twice while the request is pending", async () => {
    let resolvePatch = () => {};
    let patches = 0;
    let saved = false;
    renderCard({
      "GET /seller/orders/42/delivery": () => ({
        body: { delivery: saved ? manual : quoted, events: saved ? [manualEvent] : [] },
      }),
      "PATCH /seller/orders/42/delivery": () => {
        patches += 1;
        return new Promise((resolve) => {
          resolvePatch = () => {
            saved = true;
            resolve({ body: { delivery: manual } });
          };
        });
      },
    });
    const section = screen.getByRole("region", { name: "Доставка" });
    await within(section).findByText("Ожидает отправки");
    const browser = await fillManualTrack(section);
    await browser.click(within(section).getByRole("button", { name: "Сохранить трек" }));

    const pending = within(section).getByRole("button", { name: "Сохраняем…" });
    expect(pending).toBeDisabled();
    await browser.click(pending);
    expect(patches).toBe(1);

    resolvePatch();
    expect(await within(section).findByText("Ручной трек сохранён.")).toBeInTheDocument();
    expect(patches).toBe(1);
  });

  it("wraps long manual track values and never exposes raw provider data", async () => {
    const longCarrier = "П".repeat(80);
    const longTrack = "A".repeat(64);
    const longManual: DeliverySnapshot = {
      ...manual,
      carrier: longCarrier,
      trackNumber: longTrack,
    };
    renderCard(
      { "GET /seller/orders/42/delivery": { body: { delivery: longManual, events: [] } } },
      { delivery: longManual },
    );
    const section = screen.getByRole("region", { name: "Доставка" });
    const track = await within(section).findByText(`${longCarrier} · ${longTrack}`);
    expect(track.closest("dd")).toHaveClass("break-words");
    for (const raw of ["manual", "MANUAL", "cdek", "payload", "hash"]) {
      expect(within(section).queryByText(new RegExp(raw))).toBeNull();
    }
  });

  it.each(["created", "in_transit"] as const)(
    "polls a %s delivery every 15 seconds, stops when delivered and cleans up",
    async (status) => {
      vi.useFakeTimers();
      try {
        let gets = 0;
        let live = true;
        const { unmount } = setupCard({
          "GET /seller/orders/42/delivery": () => {
            gets += 1;
            return {
              body: { delivery: { ...created, status: live ? status : "delivered" }, events: [] },
            };
          },
        });
        await advance(0);
        expect(gets).toBe(1);
        await advance(14_000);
        expect(gets).toBe(1);
        await advance(1_000);
        expect(gets).toBe(2);

        live = false;
        await advance(15_000);
        expect(gets).toBe(3);
        await advance(30_000);
        expect(gets).toBe(3);

        unmount();
        await advance(30_000);
        expect(gets).toBe(3);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([
    [401, "unauthorized"],
    [404, "not_found"],
  ] as Array<[number, string]>)(
    "stops polling when the delivery request fails with %i",
    async (status, error) => {
      vi.useFakeTimers();
      try {
        let gets = 0;
        setupCard({
          "GET /seller/orders/42/delivery": () => {
            gets += 1;
            if (gets === 1) {
              return { body: { delivery: created, events: [] } };
            }
            return { status, body: { error } };
          },
        });
        await advance(0);
        expect(gets).toBe(1);
        await advance(15_000);
        expect(gets).toBe(2);
        await advance(30_000);
        expect(gets).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each(["quoted", "delivered", "manual", "canceled", "failed"] as const)(
    "does not poll a %s delivery",
    async (status) => {
      vi.useFakeTimers();
      try {
        let gets = 0;
        setupCard({
          "GET /seller/orders/42/delivery": () => {
            gets += 1;
            return { body: { delivery: { ...quoted, status }, events: [] } };
          },
        });
        await advance(0);
        expect(gets).toBe(1);
        await advance(30_000);
        expect(gets).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
