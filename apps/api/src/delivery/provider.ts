import type { DeliveryCity, DeliveryPoint } from "@localhand/shared";
import type { DeliveryPackageInput } from "./packaging.js";

export type DeliveryQuoteInput = {
  fromCityCode: number;
  fromPointCode: string;
  toCityCode: number;
  toPointCode: string;
  packages: DeliveryPackageInput;
};

export type DeliveryTariff = {
  tariffCode: string;
  tariffName: string;
  priceKopecks: number;
  periodMin: number;
  periodMax: number;
};

export type CreateShipmentInput = DeliveryQuoteInput & {
  orderId: number;
  tariffCode: string;
  recipientName: string;
  recipientPhone: string;
};

export type CreatedShipment = {
  providerOrderId: string;
  providerNumber: string;
  statusCode: string;
  statusName: string;
  statusDateTime: string | null;
};

export type ShipmentState = {
  providerOrderId: string | null;
  statusCode: string;
  statusName: string;
  trackNumber: string | null;
  statusDateTime: string | null;
};

export interface DeliveryProvider {
  readonly name: "cdek" | "fake";
  listCities(query: string): Promise<DeliveryCity[]>;
  listPoints(cityCode: number): Promise<DeliveryPoint[]>;
  quote(input: DeliveryQuoteInput): Promise<DeliveryTariff>;
  listTariffs(input: DeliveryQuoteInput): Promise<DeliveryTariff[]>;
  createShipment(input: CreateShipmentInput): Promise<CreatedShipment>;
  getShipment(providerOrderId: string): Promise<ShipmentState | null>;
  findShipmentByNumber(number: string): Promise<ShipmentState | null>;
  ensureOrderStatusWebhook(): Promise<void>;
}
