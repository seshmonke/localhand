import { deliverySettings } from "../env.js";
import { createFakeDeliveryProvider } from "./fake-provider.js";
import type { DeliveryProvider } from "./provider.js";

let provider: DeliveryProvider | null | undefined;

/**
 * One delivery provider per process. The real CDEK adapter is added in the
 * shipment PR; until then a `cdek` config is treated as unavailable instead of
 * silently falling back to fake prices.
 */
export function getDeliveryProvider(): DeliveryProvider | null {
  if (provider !== undefined) {
    return provider;
  }

  if (!deliverySettings) {
    provider = null;
    return provider;
  }

  provider = deliverySettings.provider === "fake" ? createFakeDeliveryProvider() : null;
  return provider;
}
