import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { PaymentProvider } from "./provider.js";

/**
 * The fake completion route is a test hook, not part of the product. It must be
 * absent unless the app runs the fake provider with the fake explicitly enabled
 * outside live.
 */

const nonFakeProvider: PaymentProvider = {
  name: "yookassa",
  async createConnection() {
    return { consentUrl: "https://example.com/consent" };
  },
  async exchangeCode() {
    return { accessToken: "stub-token" };
  },
  async getAccountInfo() {
    return { accountId: "stub-account", isTest: false };
  },
  async subscribeWebhooks() {},
  async unsubscribeWebhooks() {},
  async createPayment() {
    throw new Error("stub provider must not create payments");
  },
  async getPayment() {
    throw new Error("stub provider must not read payments");
  },
  async cancelPayment() {},
  async revoke() {},
};

describe("dev payment routes", () => {
  it("registers the fake completion route for fake + enabled + non-live", async () => {
    const app = buildApp({ reconcile: false });
    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/dev/payments/1/complete",
      });
      // The route exists; the session guard rejects an anonymous request.
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("does not register the route for a non-fake provider", async () => {
    const app = buildApp({ paymentProvider: nonFakeProvider, reconcile: false });
    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/dev/payments/1/complete",
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("does not register the route in PAYMENTS_ENV=live", async () => {
    const app = buildApp({ reconcile: false });
    try {
      if (app.payments) {
        app.payments.settings = { ...app.payments.settings, environment: "live" };
      }
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/dev/payments/1/complete",
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("does not register the route when the fake provider is disabled", async () => {
    const app = buildApp({ reconcile: false });
    try {
      if (app.payments) {
        app.payments.settings = { ...app.payments.settings, fakeEnabled: false };
      }
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/dev/payments/1/complete",
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
