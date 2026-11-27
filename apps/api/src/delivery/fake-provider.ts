import type { DeliveryCity, DeliveryPoint } from "@localhand/shared";
import type {
  CreateShipmentInput,
  CreatedShipment,
  DeliveryProvider,
  DeliveryQuoteInput,
  DeliveryTariff,
  ShipmentState,
} from "./provider.js";

const CITIES: DeliveryCity[] = [
  { code: 44, name: "Москва" },
  { code: 137, name: "Санкт-Петербург" },
  { code: 447, name: "Казань" },
];

const POINTS: DeliveryPoint[] = [
  {
    code: "MSK001",
    name: "ПВЗ Тверская",
    address: "Москва, Тверская 1",
    cityCode: 44,
    cityName: "Москва",
  },
  {
    code: "MSK002",
    name: "ПВЗ Арбат",
    address: "Москва, Арбат 2",
    cityCode: 44,
    cityName: "Москва",
  },
  {
    code: "SPB001",
    name: "ПВЗ Невский",
    address: "Санкт-Петербург, Невский 1",
    cityCode: 137,
    cityName: "Санкт-Петербург",
  },
  {
    code: "SPB002",
    name: "ПВЗ Садовая",
    address: "Санкт-Петербург, Садовая 2",
    cityCode: 137,
    cityName: "Санкт-Петербург",
  },
  {
    code: "KZN001",
    name: "ПВЗ Баумана",
    address: "Казань, Баумана 1",
    cityCode: 447,
    cityName: "Казань",
  },
];

function fakeTariff(input: DeliveryQuoteInput): DeliveryTariff {
  // Deterministic and monotonic in weight: tests can assert that a heavier
  // parcel is never cheaper without depending on a real CDEK price.
  const priceKopecks = 30_000 + input.packages.weightG * 10;
  return {
    tariffCode: "136",
    tariffName: "Посылка склад-ПВЗ",
    priceKopecks,
    periodMin: input.fromCityCode === input.toCityCode ? 1 : 2,
    periodMax: input.fromCityCode === input.toCityCode ? 2 : 4,
  };
}

/**
 * Network-free provider for API tests, local dev and preview. It never sends
 * recipient data anywhere; the in-memory shipment map is process-local.
 */
export function createFakeDeliveryProvider(): DeliveryProvider {
  const shipments = new Map<string, { input: CreateShipmentInput; created: CreatedShipment }>();

  return {
    name: "fake",

    async listCities(query: string): Promise<DeliveryCity[]> {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        return CITIES;
      }
      return CITIES.filter((city) => city.name.toLowerCase().includes(normalized));
    },

    async listPoints(cityCode: number): Promise<DeliveryPoint[]> {
      return POINTS.filter((point) => point.cityCode === cityCode);
    },

    async quote(input: DeliveryQuoteInput): Promise<DeliveryTariff> {
      return fakeTariff(input);
    },

    async listTariffs(input: DeliveryQuoteInput): Promise<DeliveryTariff[]> {
      return [fakeTariff(input)];
    },

    async createShipment(input: CreateShipmentInput): Promise<CreatedShipment> {
      const id = `fake-${input.orderId}`;
      const existing = shipments.get(id);
      if (existing) {
        return existing.created;
      }

      const created: CreatedShipment = {
        providerOrderId: id,
        providerNumber: `order-${input.orderId}`,
        statusCode: "CREATED",
        statusName: "Создан",
      };
      shipments.set(id, { input, created });
      return created;
    },

    async getShipment(providerOrderId: string): Promise<ShipmentState | null> {
      const shipment = shipments.get(providerOrderId);
      if (!shipment) {
        return null;
      }
      return {
        statusCode: shipment.created.statusCode,
        statusName: shipment.created.statusName,
        trackNumber: null,
      };
    },

    async ensureOrderStatusWebhook(): Promise<void> {
      // The fake provider has no external subscriptions.
    },
  };
}
