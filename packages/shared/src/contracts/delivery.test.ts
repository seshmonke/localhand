import { describe, expect, it } from "vitest";
import {
  DeliveryCheckoutSchema,
  DeliveryCitySchema,
  DeliveryEventSchema,
  DeliveryManualTrackSchema,
  DeliveryPointSchema,
  DeliveryQuoteRequestSchema,
  DeliveryQuoteResponseSchema,
  DeliveryQuoteTokenPayloadSchema,
  DeliveryShipmentCreateSchema,
  DeliverySnapshotSchema,
  DeliveryStatusSchema,
  DeliveryTariffListResponseSchema,
  SellerDeliveryResponseSchema,
} from "./delivery.js";

const city = { code: 44, name: "Москва" };
const point = {
  code: "MSK123",
  name: "ПВЗ на Тверской",
  address: "Москва, Тверская 1",
  cityCode: 44,
  cityName: "Москва",
};

const quoteShop = {
  shopId: 7,
  tariffCode: "136",
  tariffName: "Посылка склад-ПВЗ",
  priceKopecks: 35_000,
  periodMin: 2,
  periodMax: 4,
};

describe("DeliveryCitySchema", () => {
  it("accepts a city and rejects a non-positive code", () => {
    expect(DeliveryCitySchema.parse(city)).toEqual(city);
    expect(DeliveryCitySchema.safeParse({ ...city, code: 0 }).success).toBe(false);
    expect(DeliveryCitySchema.safeParse({ code: 44, name: "" }).success).toBe(false);
  });
});

describe("DeliveryPointSchema", () => {
  it("accepts a PVZ and requires the city link", () => {
    expect(DeliveryPointSchema.parse(point)).toEqual(point);
    expect(DeliveryPointSchema.safeParse({ ...point, cityCode: 0 }).success).toBe(false);
    expect(DeliveryPointSchema.safeParse({ ...point, address: "" }).success).toBe(false);
  });
});

describe("DeliveryQuoteRequestSchema", () => {
  it("accepts unique products and a point", () => {
    expect(
      DeliveryQuoteRequestSchema.parse({
        items: [{ productId: 1 }, { productId: 2 }],
        cityCode: 44,
        pointCode: "MSK123",
      }),
    ).toEqual({
      items: [{ productId: 1 }, { productId: 2 }],
      cityCode: 44,
      pointCode: "MSK123",
    });
  });

  it("rejects duplicates, empty carts and a blank point", () => {
    expect(
      DeliveryQuoteRequestSchema.safeParse({
        items: [{ productId: 1 }, { productId: 1 }],
        cityCode: 44,
        pointCode: "MSK123",
      }).success,
    ).toBe(false);
    expect(
      DeliveryQuoteRequestSchema.safeParse({ items: [], cityCode: 44, pointCode: "MSK123" })
        .success,
    ).toBe(false);
    expect(
      DeliveryQuoteRequestSchema.safeParse({
        items: [{ productId: 1 }],
        cityCode: 44,
        pointCode: "  ",
      }).success,
    ).toBe(false);
  });
});

describe("DeliveryQuoteResponseSchema", () => {
  it("carries a token, expiry and per-shop quotes", () => {
    const response = {
      quoteToken: "signed.token",
      expiresAt: "2026-11-27T16:30:00.000Z",
      shops: [quoteShop, { ...quoteShop, shopId: 8, priceKopecks: 41_000 }],
    };
    expect(DeliveryQuoteResponseSchema.parse(response)).toEqual(response);
    expect(DeliveryQuoteResponseSchema.safeParse({ ...response, shops: [] }).success).toBe(false);
    expect(DeliveryQuoteResponseSchema.safeParse({ ...response, quoteToken: "" }).success).toBe(
      false,
    );
    expect(
      DeliveryQuoteResponseSchema.safeParse({ ...response, quoteToken: "a".repeat(32_769) })
        .success,
    ).toBe(false);
  });
});

describe("DeliveryQuoteTokenPayloadSchema", () => {
  it("holds per-shop tariff and price", () => {
    const payload = {
      v: 1,
      productHash: "abc123",
      cityCode: 44,
      cityName: "Москва",
      pointCode: "MSK123",
      pointAddress: "Москва, Тверская 1",
      exp: 1_800_000_000,
      shops: [quoteShop],
    };
    expect(DeliveryQuoteTokenPayloadSchema.parse(payload)).toEqual(payload);
    expect(
      DeliveryQuoteTokenPayloadSchema.safeParse({
        ...payload,
        shops: [{ ...quoteShop, shopId: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("DeliveryCheckoutSchema", () => {
  it("accepts recipient name and token", () => {
    const delivery = {
      cityCode: 44,
      pointCode: "MSK123",
      recipientName: "Иван Тестов",
      quoteToken: "signed.token",
    };
    expect(DeliveryCheckoutSchema.parse(delivery)).toEqual(delivery);
  });

  it("rejects blank names, NUL bytes and missing tokens", () => {
    const base = {
      cityCode: 44,
      pointCode: "MSK123",
      recipientName: "Иван Тестов",
      quoteToken: "signed.token",
    };
    expect(DeliveryCheckoutSchema.safeParse({ ...base, recipientName: " " }).success).toBe(false);
    expect(DeliveryCheckoutSchema.safeParse({ ...base, recipientName: "Ив\u0000ан" }).success).toBe(
      false,
    );
    expect(DeliveryCheckoutSchema.safeParse({ ...base, quoteToken: "" }).success).toBe(false);
  });
});

describe("DeliveryShipmentCreateSchema", () => {
  it("requires only the paid tariff code", () => {
    expect(DeliveryShipmentCreateSchema.parse({ tariffCode: "136" })).toEqual({
      tariffCode: "136",
    });
    expect(DeliveryShipmentCreateSchema.safeParse({ tariffCode: "" }).success).toBe(false);
  });
});

describe("DeliveryManualTrackSchema", () => {
  it("bounds carrier and track length and format", () => {
    expect(DeliveryManualTrackSchema.parse({ carrier: "СДЭК", trackNumber: "1234567890" })).toEqual(
      { carrier: "СДЭК", trackNumber: "1234567890" },
    );
    expect(DeliveryManualTrackSchema.safeParse({ carrier: "", trackNumber: "1" }).success).toBe(
      false,
    );
    expect(
      DeliveryManualTrackSchema.safeParse({
        carrier: "СДЭК",
        trackNumber: "1".repeat(65),
      }).success,
    ).toBe(false);
    expect(
      DeliveryManualTrackSchema.safeParse({ carrier: "СДЭК", trackNumber: "AB C" }).success,
    ).toBe(false);
  });
});

describe("DeliveryStatusSchema", () => {
  it("covers the delivery lifecycle but not order statuses", () => {
    expect(DeliveryStatusSchema.options).toEqual([
      "quoted",
      "created",
      "in_transit",
      "delivered",
      "canceled",
      "manual",
      "failed",
    ]);
    expect(DeliveryStatusSchema.safeParse("paid").success).toBe(false);
  });
});

describe("DeliverySnapshotSchema", () => {
  it("is provider-neutral with nullable provider fields", () => {
    const snapshot = {
      provider: "cdek",
      status: "created",
      cityCode: 44,
      cityName: "Москва",
      pointCode: "MSK123",
      pointAddress: "Москва, Тверская 1",
      recipientName: "Иван Тестов",
      tariffCode: "136",
      tariffName: "Посылка склад-ПВЗ",
      priceKopecks: 35_000,
      periodMin: 2,
      periodMax: 4,
      providerOrderId: "uuid-1",
      providerNumber: "order-7",
      carrier: null,
      trackNumber: null,
      lastStatusCode: "CREATED",
      lastStatusAt: "2026-11-27T16:00:00.000Z",
    };
    expect(DeliverySnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(
      DeliverySnapshotSchema.parse({
        ...snapshot,
        provider: "manual",
        status: "manual",
        providerOrderId: null,
        providerNumber: null,
        carrier: "СДЭК",
        trackNumber: "1234567890",
      }),
    ).toMatchObject({ provider: "manual", status: "manual" });
    expect(DeliverySnapshotSchema.safeParse({ ...snapshot, provider: "ozon" }).success).toBe(false);
  });
});

describe("DeliveryTariffListResponseSchema", () => {
  it("returns the paid tariff marker", () => {
    const response = {
      paid: { tariffCode: "136", priceKopecks: 35_000 },
      tariffs: [quoteShop],
    };
    expect(DeliveryTariffListResponseSchema.parse(response)).toEqual(response);
  });
});

const deliveryEvent = {
  statusCode: "DELIVERED",
  statusName: "Вручён",
  occurredAt: "2026-11-28T10:00:00.000Z",
};

const sellerSnapshot = {
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

describe("DeliveryEventSchema", () => {
  it("accepts a status event and strips the internal payload hash", () => {
    expect(DeliveryEventSchema.parse(deliveryEvent)).toEqual(deliveryEvent);
    const parsed = DeliveryEventSchema.parse({
      ...deliveryEvent,
      payloadHash: "sha256-internal",
    });
    expect(parsed).toEqual(deliveryEvent);
    expect(Object.keys(parsed)).toEqual(["statusCode", "statusName", "occurredAt"]);
  });

  it("bounds status fields and requires an ISO datetime", () => {
    expect(DeliveryEventSchema.safeParse({ ...deliveryEvent, statusCode: "" }).success).toBe(false);
    expect(
      DeliveryEventSchema.safeParse({ ...deliveryEvent, statusCode: "C".repeat(65) }).success,
    ).toBe(false);
    expect(
      DeliveryEventSchema.safeParse({ ...deliveryEvent, statusName: "С".repeat(161) }).success,
    ).toBe(false);
    expect(
      DeliveryEventSchema.safeParse({ ...deliveryEvent, occurredAt: "2026-11-28" }).success,
    ).toBe(false);
  });
});

describe("SellerDeliveryResponseSchema", () => {
  it("combines the snapshot with the event timeline", () => {
    const response = { delivery: sellerSnapshot, events: [deliveryEvent] };
    expect(SellerDeliveryResponseSchema.parse(response)).toEqual(response);
  });

  it("requires events and rejects malformed events", () => {
    expect(SellerDeliveryResponseSchema.safeParse({ delivery: sellerSnapshot }).success).toBe(
      false,
    );
    expect(
      SellerDeliveryResponseSchema.safeParse({
        delivery: sellerSnapshot,
        events: [{ statusCode: "CREATED" }],
      }).success,
    ).toBe(false);
  });
});
