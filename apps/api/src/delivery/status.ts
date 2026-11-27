import type { DeliveryStatus } from "@localhand/shared";

const CANCELED = new Set(["NOT_DELIVERED", "RETURNED", "CANCELED", "CANCELLED"]);
const CREATED = new Set(["CREATED", "ACCEPTED", "WAITING", "RECEIVED_AT_SHIPMENT_WAREHOUSE"]);

export function mapDeliveryStatus(statusCode: string): DeliveryStatus {
  const normalized = statusCode.trim().toUpperCase();
  if (normalized === "DELIVERED") {
    return "delivered";
  }
  if (CANCELED.has(normalized)) {
    return "canceled";
  }
  if (CREATED.has(normalized)) {
    return "created";
  }
  return "in_transit";
}
