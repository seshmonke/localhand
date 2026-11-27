import { describe, expect, it } from "vitest";
import { createFakeDeliveryProvider } from "./fake-provider.js";
import { calculatePackaging } from "./packaging.js";

const packages = calculatePackaging([{ weightG: 800, lengthCm: 20, widthCm: 15, heightCm: 10 }]);

describe("fake delivery provider", () => {
  it("filters cities case-insensitively and lists points per city", async () => {
    const provider = createFakeDeliveryProvider();

    expect((await provider.listCities("моск")).map((city) => city.code)).toEqual([44]);
    expect(await provider.listCities("")).toHaveLength(3);

    const points = await provider.listPoints(44);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => point.cityCode === 44)).toBe(true);
    expect(await provider.listPoints(999)).toEqual([]);
  });

  it("returns a deterministic quote that grows with weight", async () => {
    const provider = createFakeDeliveryProvider();
    const input = {
      fromCityCode: 44,
      fromPointCode: "MSK001",
      toCityCode: 137,
      toPointCode: "SPB001",
      packages,
    };

    const first = await provider.quote(input);
    const second = await provider.quote(input);
    expect(first).toEqual(second);
    expect(first.tariffCode).toBeTruthy();
    expect(first.priceKopecks).toBeGreaterThan(0);

    const heavier = await provider.quote({
      ...input,
      packages: { ...packages, weightG: packages.weightG + 1000 },
    });
    expect(heavier.priceKopecks).toBeGreaterThan(first.priceKopecks);
  });

  it("creates an idempotent fake shipment and exposes its status", async () => {
    const provider = createFakeDeliveryProvider();
    const input = {
      orderId: 42,
      tariffCode: "136",
      fromCityCode: 44,
      fromPointCode: "MSK001",
      toCityCode: 137,
      toPointCode: "SPB001",
      recipientName: "Иван Тестов",
      recipientPhone: "0000000000",
      packages,
    };

    const created = await provider.createShipment(input);
    expect(created).toEqual({
      providerOrderId: "fake-42",
      providerNumber: "order-42",
      statusCode: "CREATED",
      statusName: "Создан",
      statusDateTime: expect.any(String),
    });
    expect(await provider.createShipment(input)).toEqual(created);

    expect(await provider.getShipment("fake-42")).toEqual({
      providerOrderId: "fake-42",
      statusCode: "CREATED",
      statusName: "Создан",
      trackNumber: null,
      statusDateTime: expect.any(String),
    });
    expect(await provider.getShipment("missing")).toBeNull();
  });
});
