import { describe, expect, it } from "vitest";
import { FakePaymentProvider } from "./fake-provider.js";
import {
  assertPaymentAccountAllowed,
  createPaymentProvider,
  PaymentProviderError,
} from "./provider.js";

const WEB_ORIGIN = "http://localhost:5173";
const PAYMENT_INPUT = {
  amountKopecks: 420_000,
  currency: "RUB" as const,
  orderId: 10,
  paymentId: 20,
  idempotencyKey: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  returnUrl: `${WEB_ORIGIN}/orders/10?payment=return`,
  capture: true as const,
};

function createProvider(): FakePaymentProvider {
  return new FakePaymentProvider({ enabled: true, webOrigin: WEB_ORIGIN });
}

async function connect(provider: FakePaymentProvider, code = "code-1") {
  const { accessToken } = await provider.exchangeCode(code);
  return accessToken;
}

function expectProviderError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentProviderError);
    expect((error as PaymentProviderError).code).toBe(code);
    return;
  }
  throw new Error("expected PaymentProviderError");
}

describe("FakePaymentProvider connection", () => {
  it("builds a fake consent URL from the web origin", async () => {
    const provider = createProvider();
    const result = await provider.createConnection("state-1");

    expect(result.consentUrl).toBe(`${WEB_ORIGIN}/dev/payments/connect?state=state-1`);
  });

  it("exchanges a code once and reports an isTest account", async () => {
    const provider = createProvider();
    const accessToken = await connect(provider);

    expect(accessToken).toBe("fake_access_code-1");
    await expect(provider.getAccountInfo(accessToken)).resolves.toEqual({
      accountId: "fake-account-1",
      isTest: true,
    });
    await expect(provider.exchangeCode("code-1")).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("rejects an unknown token and records webhook subscriptions", async () => {
    const provider = createProvider();
    await expect(provider.getAccountInfo("missing")).rejects.toMatchObject({
      code: "unauthorized",
    });

    const accessToken = await connect(provider);
    await expect(
      provider.subscribeWebhooks(accessToken, "https://example.com/webhook"),
    ).resolves.toBeUndefined();
    await expect(provider.unsubscribeWebhooks(accessToken)).resolves.toBeUndefined();
    await expect(provider.revoke(accessToken)).resolves.toBeUndefined();
  });
});

describe("FakePaymentProvider payments", () => {
  it("creates a pending payment and returns a dev complete URL", async () => {
    const provider = createProvider();
    const accessToken = await connect(provider);
    const created = await provider.createPayment(accessToken, PAYMENT_INPUT);

    expect(created.status).toBe("pending");
    expect(created.providerPaymentId).toMatch(/^fake_/);
    expect(created.confirmationUrl).toBe(
      `${WEB_ORIGIN}/dev/payments/${PAYMENT_INPUT.paymentId}/complete`,
    );
    await expect(
      provider.getPayment(accessToken, created.providerPaymentId),
    ).resolves.toMatchObject({
      status: "pending",
      amountKopecks: 420_000,
      currency: "RUB",
      orderId: 10,
    });
  });

  it("replays the same idempotency key with the same provider payment", async () => {
    const provider = createProvider();
    const accessToken = await connect(provider);
    const first = await provider.createPayment(accessToken, PAYMENT_INPUT);
    const replay = await provider.createPayment(accessToken, PAYMENT_INPUT);

    expect(replay.providerPaymentId).toBe(first.providerPaymentId);
  });

  it("rejects reusing an idempotency key for a different payment", async () => {
    const provider = createProvider();
    const accessToken = await connect(provider);
    await provider.createPayment(accessToken, PAYMENT_INPUT);

    await expect(
      provider.createPayment(accessToken, { ...PAYMENT_INPUT, amountKopecks: 1 }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("completes a payment and is idempotent for terminal states", async () => {
    const provider = createProvider();
    const accessToken = await connect(provider);
    const created = await provider.createPayment(accessToken, PAYMENT_INPUT);

    const succeeded = provider.completePayment(created.providerPaymentId);
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.paidAt).toBeInstanceOf(Date);

    const replay = provider.completePayment(created.providerPaymentId);
    expect(replay.status).toBe("succeeded");
    expect(replay.paidAt).toEqual(succeeded.paidAt);
  });

  it("cancels a pending payment", async () => {
    const provider = createProvider();
    const accessToken = await connect(provider);
    const created = await provider.createPayment(accessToken, PAYMENT_INPUT);

    expect(provider.completePayment(created.providerPaymentId, "canceled").status).toBe("canceled");
  });

  it("best-effort cancels a pending payment and ignores terminal ones", async () => {
    const provider = createProvider();
    const accessToken = await connect(provider);
    const created = await provider.createPayment(accessToken, PAYMENT_INPUT);

    await provider.cancelPayment(accessToken, created.providerPaymentId);
    await expect(
      provider.getPayment(accessToken, created.providerPaymentId),
    ).resolves.toMatchObject({ status: "canceled" });

    // Idempotent for an already-canceled payment and for an unknown id.
    await expect(
      provider.cancelPayment(accessToken, created.providerPaymentId),
    ).resolves.toBeUndefined();
    await expect(provider.cancelPayment(accessToken, "fake_missing")).resolves.toBeUndefined();
  });

  it("returns not_found for an unknown provider payment", async () => {
    const provider = createProvider();
    const accessToken = await connect(provider);

    await expect(provider.getPayment(accessToken, "fake_missing")).rejects.toMatchObject({
      code: "not_found",
    });
    expectProviderError(() => provider.completePayment("fake_missing"), "not_found");
  });

  it("rejects calls when the fake provider is disabled", async () => {
    const provider = new FakePaymentProvider({ enabled: false, webOrigin: WEB_ORIGIN });

    await expect(provider.createConnection("state")).rejects.toMatchObject({ code: "disabled" });
    await expect(provider.exchangeCode("code")).rejects.toMatchObject({ code: "disabled" });
    await expect(provider.getAccountInfo("token")).rejects.toMatchObject({ code: "disabled" });
  });
});

describe("assertPaymentAccountAllowed", () => {
  it("allows the test contour outside live", () => {
    for (const environment of ["sandbox", "test"] as const) {
      expect(() => assertPaymentAccountAllowed(environment, { isTest: true })).not.toThrow();
    }
  });

  it("allows a live account only when the provider says it is not a test", () => {
    expect(() => assertPaymentAccountAllowed("live", { isTest: false })).not.toThrow();
    expectProviderError(
      () => assertPaymentAccountAllowed("live", { isTest: true }),
      "test_account_forbidden",
    );
  });
});

describe("createPaymentProvider", () => {
  it("returns null when payments are not configured", () => {
    expect(
      createPaymentProvider({
        provider: null,
        environment: "live",
        fakeEnabled: false,
        webOrigin: WEB_ORIGIN,
      }),
    ).toBeNull();
  });

  it("rejects the fake provider in live or without explicit opt-in", () => {
    expect(() =>
      createPaymentProvider({
        provider: "fake",
        environment: "live",
        fakeEnabled: true,
        webOrigin: WEB_ORIGIN,
      }),
    ).toThrow(PaymentProviderError);
    expect(() =>
      createPaymentProvider({
        provider: "fake",
        environment: "sandbox",
        fakeEnabled: false,
        webOrigin: WEB_ORIGIN,
      }),
    ).toThrow(PaymentProviderError);
  });

  it("creates the fake provider in sandbox and test", () => {
    for (const environment of ["sandbox", "test"] as const) {
      const provider = createPaymentProvider({
        provider: "fake",
        environment,
        fakeEnabled: true,
        webOrigin: WEB_ORIGIN,
      });
      expect(provider?.name).toBe("fake");
    }
  });

  it("fails explicitly while the yookassa adapter is a PR B deliverable", () => {
    expect(() =>
      createPaymentProvider({
        provider: "yookassa",
        environment: "sandbox",
        fakeEnabled: false,
        webOrigin: WEB_ORIGIN,
      }),
    ).toThrow(PaymentProviderError);
  });
});
