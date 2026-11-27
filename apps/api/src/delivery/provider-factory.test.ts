import { describe, expect, it } from "vitest";
import { createDeliveryProvider } from "./provider-factory.js";

const base = {
  environment: "test" as const,
  quoteSecret: "x".repeat(32),
  livePii: false,
};

describe("delivery provider factory", () => {
  it("returns fake, CDEK and manual as configured", () => {
    expect(createDeliveryProvider(null)).toBeNull();
    expect(createDeliveryProvider({ ...base, provider: "fake", cdek: null })?.name).toBe("fake");
    expect(
      createDeliveryProvider({
        ...base,
        provider: "cdek",
        cdek: {
          clientId: "id",
          clientSecret: "secret",
          apiUrl: "https://api.edu.cdek.ru",
          webhookUrl: "https://example.com/delivery/cdek/webhook",
        },
      })?.name,
    ).toBe("cdek");
    expect(createDeliveryProvider({ ...base, provider: "manual", cdek: null })).toBeNull();
  });
});
