import type { DeliverySettings } from "../env.js";
import { deliverySettings } from "../env.js";
import { createCdekDeliveryProvider } from "./cdek-provider.js";
import { createFakeDeliveryProvider } from "./fake-provider.js";
import type { DeliveryProvider } from "./provider.js";

export function createDeliveryProvider(settings: DeliverySettings | null): DeliveryProvider | null {
  if (!settings) {
    return null;
  }
  if (settings.provider === "fake") {
    return createFakeDeliveryProvider();
  }
  if (settings.provider === "cdek" && settings.cdek) {
    return createCdekDeliveryProvider(settings.cdek);
  }
  return null;
}

let provider: DeliveryProvider | null | undefined;

export function getDeliveryProvider(): DeliveryProvider | null {
  if (provider !== undefined) {
    return provider;
  }
  provider = createDeliveryProvider(deliverySettings);
  return provider;
}
