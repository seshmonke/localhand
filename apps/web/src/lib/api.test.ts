import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createSellerShipment,
  fetchSellerDelivery,
  fetchSellerDeliveryTariffs,
  saveSellerManualTrack,
} from "./api.js";
import { sellerKeys } from "./queries.js";

const snapshot = {
  provider: "cdek",
  status: "in_transit",
  cityCode: 137,
  cityName: "Санкт-Петербург",
  pointCode: "SPB001",
  pointAddress: "Санкт-Петербург, Невский 1",
  recipientName: "Иван Тестов",
  tariffCode: "136",
  tariffName: "Посылка склад-ПВЗ",
  priceKopecks: 38_000,
  periodMin: 2,
  periodMax: 4,
  providerOrderId: "uuid-1",
  providerNumber: "order-7",
  carrier: null,
  trackNumber: null,
  lastStatusCode: "DELIVERED",
  lastStatusAt: "2026-11-28T10:00:00.000Z",
};

function jsonResponse(payload: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload,
  } as unknown as Response;
}

function mockFetch(payload: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seller delivery API client", () => {
  it("fetches the seller delivery with its events", async () => {
    const body = {
      delivery: snapshot,
      events: [
        { statusCode: "DELIVERED", statusName: "Вручён", occurredAt: "2026-11-28T10:00:00.000Z" },
      ],
    };
    const fetchMock = mockFetch(body);

    await expect(fetchSellerDelivery(7)).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seller/orders/7/delivery",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("fetches seller tariffs for the order", async () => {
    const body = {
      paid: { tariffCode: "136", priceKopecks: 38_000 },
      tariffs: [
        {
          shopId: 3,
          tariffCode: "136",
          tariffName: "Посылка склад-ПВЗ",
          priceKopecks: 38_000,
          periodMin: 2,
          periodMax: 4,
        },
      ],
    };
    const fetchMock = mockFetch(body);

    await expect(fetchSellerDeliveryTariffs(7)).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seller/orders/7/delivery/tariffs",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a shipment with the paid tariff code", async () => {
    const fetchMock = mockFetch({ delivery: { ...snapshot, status: "created" } });

    const result = await createSellerShipment(7, "136");
    expect(result.delivery.status).toBe("created");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/seller/orders/7/delivery");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ tariffCode: "136" });
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("saves a manual carrier and track", async () => {
    const fetchMock = mockFetch({
      delivery: {
        ...snapshot,
        provider: "manual",
        status: "manual",
        carrier: "Почта России",
        trackNumber: "RA123456789RU",
      },
    });

    const result = await saveSellerManualTrack(7, {
      carrier: "Почта России",
      trackNumber: "RA123456789RU",
    });
    expect(result.delivery).toMatchObject({ status: "manual", trackNumber: "RA123456789RU" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/seller/orders/7/delivery");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      carrier: "Почта России",
      trackNumber: "RA123456789RU",
    });
  });

  it("propagates API errors with status and code", async () => {
    mockFetch({ error: "delivery_tariff_mismatch" }, 409);

    const failure = createSellerShipment(7, "999");
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 409, code: "delivery_tariff_mismatch" });
  });

  it("keeps seller delivery query keys stable", () => {
    expect(sellerKeys.delivery(7)).toEqual(["seller", "orders", 7, "delivery"]);
    expect(sellerKeys.deliveryTariffs(7)).toEqual(["seller", "orders", 7, "delivery", "tariffs"]);
  });
});
