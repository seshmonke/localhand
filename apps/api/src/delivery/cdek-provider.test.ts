import { describe, expect, it, vi } from "vitest";
import { createCdekDeliveryProvider, DeliveryWebhookConflictError } from "./cdek-provider.js";
import { calculatePackaging } from "./packaging.js";

const CONFIG = {
  clientId: "test-client",
  clientSecret: "test-secret",
  apiUrl: "https://api.edu.cdek.ru",
  webhookUrl: "https://example.com/delivery/cdek/webhook",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const packages = calculatePackaging([{ weightG: 1000, lengthCm: 20, widthCm: 15, heightCm: 10 }]);

describe("CDEK delivery provider", () => {
  it("authenticates once, caches the token and maps cities", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(json([{ code: 44, city: "Москва" }]))
      .mockResolvedValueOnce(json([{ code: 44, city: "Москва" }]));

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    const cities = await provider.listCities("Москва");
    expect(cities).toEqual([{ code: 44, name: "Москва" }]);

    await provider.listCities("Москва");
    const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/v2/oauth/token"),
    );
    expect(tokenCalls).toHaveLength(1);

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(String(url)).toContain("/v2/location/cities");
    expect(String(url)).toContain("city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer token-1" });
  });

  it("maps PVZ points and keeps the city name", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(
        json([
          {
            code: "MSK001",
            name: "ПВЗ Тверская",
            address: "Москва, Тверская 1",
            city_code: 44,
            city: "Москва",
          },
        ]),
      );

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    expect(await provider.listPoints(44)).toEqual([
      {
        code: "MSK001",
        name: "ПВЗ Тверская",
        address: "Москва, Тверская 1",
        cityCode: 44,
        cityName: "Москва",
      },
    ]);
  });

  it("quotes the cheapest PVZ tariff in kopecks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(
        json({
          tariff_codes: [
            {
              tariff_code: 137,
              tariff_name: "Дверной дешёвый",
              delivery_sum: 100,
              period_min: 1,
              period_max: 2,
              tariff_mode: 1,
            },
            {
              tariff_code: 138,
              tariff_name: "Дверной дорогой",
              delivery_sum: 500,
              period_min: 1,
              period_max: 2,
              tariff_mode: 1,
            },
            {
              tariff_code: 136,
              tariff_name: "Посылка склад-ПВЗ",
              delivery_sum: 350.5,
              period_min: 2,
              period_max: 4,
              tariff_mode: 2,
            },
          ],
        }),
      );

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    const quote = await provider.quote({
      fromCityCode: 44,
      fromPointCode: "MSK001",
      toCityCode: 137,
      toPointCode: "SPB001",
      packages,
    });

    expect(quote).toEqual({
      tariffCode: "136",
      tariffName: "Посылка склад-ПВЗ",
      priceKopecks: 35_050,
      periodMin: 2,
      periodMax: 4,
    });

    const [, init] = fetchMock.mock.calls[1] ?? [];
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: 1,
      from_location: { code: 44 },
      to_location: { code: 137 },
      packages: [{ weight: 1000, length: 20, width: 15, height: 10 }],
    });
  });

  it("returns no tariffs when modes exist but there is no PVZ tariff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(
        json({
          tariff_codes: [
            {
              tariff_code: 137,
              tariff_name: "Дверной",
              delivery_sum: 100,
              period_min: 1,
              period_max: 2,
              tariff_mode: 1,
            },
          ],
        }),
      );

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    expect(
      await provider.listTariffs({
        fromCityCode: 44,
        fromPointCode: "MSK001",
        toCityCode: 137,
        toPointCode: "SPB001",
        packages,
      }),
    ).toEqual([]);
  });

  it("creates an async order, polls until the entity appears and maps the status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(
        json({ requests: [{ request_uuid: "uuid-1", state: "ACCEPTED" }] }, 202),
      )
      .mockResolvedValueOnce(
        json({
          entity: {
            uuid: "uuid-1",
            cdek_number: "1234567890",
            number: "order-42",
            statuses: [{ code: "CREATED", name: "Создан", date_time: "2026-11-27T16:00:00+0000" }],
          },
        }),
      );

    const provider = createCdekDeliveryProvider(CONFIG, {
      fetch: fetchMock,
      pollIntervalMs: 0,
      pollTimeoutMs: 1_000,
    });
    const created = await provider.createShipment({
      orderId: 42,
      tariffCode: "136",
      fromCityCode: 44,
      fromPointCode: "MSK001",
      toCityCode: 137,
      toPointCode: "SPB001",
      recipientName: "Иван Тестов",
      recipientPhone: "0000000000",
      packages,
    });

    expect(created).toEqual({
      providerOrderId: "uuid-1",
      providerNumber: "1234567890",
      statusCode: "CREATED",
      statusName: "Создан",
      statusDateTime: "2026-11-27T16:00:00+0000",
    });

    const [, postInit] = fetchMock.mock.calls[1] ?? [];
    const body = JSON.parse(String((postInit as RequestInit).body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      number: "order-42",
      tariff_code: 136,
      shipment_point: "MSK001",
      delivery_point: "SPB001",
      recipient: { name: "Иван Тестов", phones: [{ number: "0000000000" }] },
    });
  });

  it("returns the latest shipment status and track", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(
        json({
          entity: {
            uuid: "uuid-1",
            cdek_number: "1234567890",
            statuses: [
              { code: "CREATED", name: "Создан", date_time: "2026-11-27T16:00:00+0000" },
              {
                code: "DELIVERED",
                name: "Вручён",
                date_time: "2026-11-28T16:00:00+0000",
              },
            ],
          },
        }),
      );

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    expect(await provider.getShipment("uuid-1")).toEqual({
      providerOrderId: "uuid-1",
      statusCode: "DELIVERED",
      statusName: "Вручён",
      trackNumber: "1234567890",
      statusDateTime: "2026-11-28T16:00:00+0000",
    });
  });

  it("finds a shipment by im_number and returns null on not found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(
        json([
          {
            uuid: "uuid-1",
            cdek_number: "1234567890",
            number: "order-42",
            statuses: [{ code: "CREATED", name: "Создан", date_time: "2026-11-27T16:00:00+0000" }],
          },
        ]),
      )
      .mockResolvedValueOnce(json({ errors: [{ code: "v2_entity_not_found_im_number" }] }, 400));

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    expect(await provider.findShipmentByNumber("order-42")).toMatchObject({
      providerOrderId: "uuid-1",
      statusCode: "CREATED",
      trackNumber: "1234567890",
    });
    expect(await provider.findShipmentByNumber("missing")).toBeNull();

    const entityFetch = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(
        json({
          entity: {
            uuid: "uuid-2",
            cdek_number: "222",
            number: "order-43",
            statuses: [{ code: "CREATED", name: "Создан", date_time: "2026-11-27T16:00:00+0000" }],
          },
        }),
      );
    const entityProvider = createCdekDeliveryProvider(CONFIG, { fetch: entityFetch });
    expect(await entityProvider.findShipmentByNumber("order-43")).toMatchObject({
      providerOrderId: "uuid-2",
      statusCode: "CREATED",
    });
  });

  it("throws a conflict and does not create a third webhook when two foreign subscriptions exist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(
        json([
          { uuid: "1", type: "ORDER_STATUS", url: "https://other/1" },
          { uuid: "2", type: "ORDER_STATUS", url: "https://other/2" },
        ]),
      );

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    await expect(provider.ensureOrderStatusWebhook()).rejects.toBeInstanceOf(
      DeliveryWebhookConflictError,
    );

    const webhookCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/v2/webhooks"),
    );
    expect(webhookCalls).toHaveLength(1);
    expect((webhookCalls[0]?.[1] as RequestInit | undefined)?.method).toBeUndefined();
  });

  it("does not create a webhook when a matching ORDER_STATUS subscription exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(json([{ uuid: "1", type: "ORDER_STATUS", url: CONFIG.webhookUrl }]));

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    await provider.ensureOrderStatusWebhook();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates one ORDER_STATUS webhook when one foreign subscription exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(json([{ uuid: "1", type: "ORDER_STATUS", url: "https://other/1" }]))
      .mockResolvedValueOnce(json({ uuid: "hook-2" }, 201));

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    await provider.ensureOrderStatusWebhook();

    const [, init] = fetchMock.mock.calls[2] ?? [];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      type: "ORDER_STATUS",
      url: CONFIG.webhookUrl,
    });
  });

  it("creates one ORDER_STATUS webhook when none matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token-1", expires_in: 3599 }))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ uuid: "hook-1" }, 201));

    const provider = createCdekDeliveryProvider(CONFIG, { fetch: fetchMock });
    await provider.ensureOrderStatusWebhook();

    const [, init] = fetchMock.mock.calls[2] ?? [];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      type: "ORDER_STATUS",
      url: CONFIG.webhookUrl,
    });
  });
});
