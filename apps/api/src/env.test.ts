import { describe, expect, it } from "vitest";
import { isForbiddenSecret, parseEnv, resolvePaymentsSettings, resolveTrustProxy } from "./env.js";

const RANDOM_SECRET = "q7Zr3mB9xK2pL5wN8cV1tY4hJ6sD0fGz";
const CI_JWT_SECRET = "ci-only-secret-that-is-long-enough-123456";
const CI_OTP_SECRET = "ci-only-otp-secret-that-is-long-enough-123456";

describe("isForbiddenSecret", () => {
  it("rejects known placeholders", () => {
    expect(isForbiddenSecret("change-me-to-a-long-random-string")).toBe(true);
    expect(isForbiddenSecret("dev-only-secret-for-local-use-only")).toBe(true);
    expect(isForbiddenSecret("ci-only-secret-for-tests-only")).toBe(true);
    expect(isForbiddenSecret("localhand-dev-jwt-secret-not-for-production-use")).toBe(true);
    expect(isForbiddenSecret("CHANGE-ME-PLEASE-WITH-RANDOM-VALUE")).toBe(true);
  });

  it("accepts a random-looking secret", () => {
    expect(isForbiddenSecret(RANDOM_SECRET)).toBe(false);
  });
});

describe("parseEnv", () => {
  it("treats empty secrets as undefined in test", () => {
    const parsed = parseEnv({ NODE_ENV: "test", JWT_SECRET: "", OTP_SECRET: "" });

    expect(parsed.JWT_SECRET).toBeUndefined();
    expect(parsed.OTP_SECRET).toBeUndefined();
  });

  it("accepts CI secrets in test", () => {
    const parsed = parseEnv({
      NODE_ENV: "test",
      JWT_SECRET: CI_JWT_SECRET,
      OTP_SECRET: CI_OTP_SECRET,
    });

    expect(parsed.JWT_SECRET).toBe(CI_JWT_SECRET);
    expect(parsed.OTP_SECRET).toBe(CI_OTP_SECRET);
  });

  it("requires secrets outside test", () => {
    expect(() => parseEnv({ NODE_ENV: "development" })).toThrow();
    expect(() => parseEnv({ NODE_ENV: "development", JWT_SECRET: RANDOM_SECRET })).toThrow();
  });

  it("rejects placeholders outside test", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "development",
        JWT_SECRET: "change-me-to-a-long-random-string",
        OTP_SECRET: RANDOM_SECRET,
      }),
    ).toThrow(/placeholder/);
    expect(() =>
      parseEnv({
        NODE_ENV: "development",
        JWT_SECRET: RANDOM_SECRET,
        OTP_SECRET: "ci-only-otp-secret-that-is-long-enough-123456",
      }),
    ).toThrow(/placeholder/);
  });

  it("accepts strong secrets outside test", () => {
    const parsed = parseEnv({
      NODE_ENV: "development",
      JWT_SECRET: RANDOM_SECRET,
      OTP_SECRET: `${RANDOM_SECRET}-2`,
    });

    expect(parsed.JWT_SECRET).toBe(RANDOM_SECRET);
  });
});

describe("resolveTrustProxy", () => {
  it("does not trust proxy headers outside production by default", () => {
    expect(resolveTrustProxy("development", undefined)).toBe(false);
    expect(resolveTrustProxy("test", undefined)).toBe(false);
    expect(resolveTrustProxy("development", "")).toBe(false);
  });

  it("requires an explicit proxy address in production", () => {
    expect(() => resolveTrustProxy("production", undefined)).toThrow(/required in production/);
    expect(() => resolveTrustProxy("production", "")).toThrow(/required in production/);
  });

  it("rejects boolean true", () => {
    expect(() => resolveTrustProxy("production", "true")).toThrow(/not allowed/);
    expect(() => resolveTrustProxy("development", "true")).toThrow(/not allowed/);
    expect(() => resolveTrustProxy("production", "TRUE")).toThrow(/not allowed/);
  });

  it("accepts an explicit IP or CIDR list", () => {
    expect(resolveTrustProxy("production", "172.28.0.2/32")).toBe("172.28.0.2/32");
    expect(resolveTrustProxy("production", "172.28.0.2")).toBe("172.28.0.2");
    expect(resolveTrustProxy("production", "172.28.0.2/32, 10.0.0.0/8")).toBe(
      "172.28.0.2/32,10.0.0.0/8",
    );
    expect(resolveTrustProxy("test", "::1")).toBe("::1");
  });

  it("allows explicit false", () => {
    expect(resolveTrustProxy("production", "false")).toBe(false);
  });

  it("rejects invalid entries", () => {
    expect(() => resolveTrustProxy("production", "not-an-ip")).toThrow();
    expect(() => resolveTrustProxy("production", "172.28.0.2/33")).toThrow();
    expect(() => resolveTrustProxy("production", "172.28.0.2/32,")).toThrow();
  });
});

const PAYMENTS_STATE_SECRET = "q7Zr3mB9xK2pL5wN8cV1tY4hJ6sD0fGz";
const PAYMENT_KEY_ONE = Buffer.alloc(32, 1).toString("base64");
const PAYMENT_KEY_TWO = Buffer.alloc(32, 2).toString("base64");
const PAYMENT_TOKEN_KEYS = JSON.stringify({ 1: PAYMENT_KEY_ONE, 2: PAYMENT_KEY_TWO });

function paymentsEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    PAYMENTS_TOKEN_KEYS: PAYMENT_TOKEN_KEYS,
    PAYMENTS_TOKEN_KEY_VERSION: "1",
    PAYMENTS_STATE_SECRET,
    ...overrides,
  };
}

describe("payments env", () => {
  it("defaults to live with payments disabled when nothing is configured", () => {
    const parsed = parseEnv({ NODE_ENV: "test" });

    expect(parsed.PAYMENTS_ENV).toBe("live");
    expect(parsed.PAYMENTS_PROVIDER).toBeUndefined();
    expect(parsed.PAYMENTS_FAKE_ENABLED).toBe(false);
    expect(resolvePaymentsSettings(parsed)).toBeNull();
  });

  it("rejects PAYMENTS_FAKE_ENABLED in live even without a provider", () => {
    expect(() => parseEnv({ NODE_ENV: "test", PAYMENTS_FAKE_ENABLED: "true" })).toThrow(
      /PAYMENTS_FAKE_ENABLED/,
    );
  });

  it("rejects the fake provider in live", () => {
    expect(() =>
      parseEnv(
        paymentsEnv({
          PAYMENTS_PROVIDER: "fake",
          PAYMENTS_FAKE_ENABLED: "true",
          PAYMENTS_ENV: "live",
        }),
      ),
    ).toThrow(/PAYMENTS_PROVIDER|PAYMENTS_FAKE_ENABLED/);
  });

  it("requires an explicit fake opt-in outside live", () => {
    expect(() =>
      parseEnv(paymentsEnv({ PAYMENTS_PROVIDER: "fake", PAYMENTS_ENV: "sandbox" })),
    ).toThrow(/PAYMENTS_FAKE_ENABLED/);
  });

  it("accepts the fully configured fake provider in sandbox and test", () => {
    for (const environment of ["sandbox", "test"]) {
      const parsed = parseEnv(
        paymentsEnv({
          PAYMENTS_PROVIDER: "fake",
          PAYMENTS_FAKE_ENABLED: "true",
          PAYMENTS_ENV: environment,
        }),
      );
      const settings = resolvePaymentsSettings(parsed);

      expect(settings?.provider).toBe("fake");
      expect(settings?.environment).toBe(environment);
      expect(settings?.fakeEnabled).toBe(true);
      expect(settings?.tokenKeyVersion).toBe(1);
      expect(settings?.tokenKeyring.get(1)?.toString("base64")).toBe(PAYMENT_KEY_ONE);
      expect(settings?.yookassaRedirectUri).toBeNull();
    }
  });

  it("fails startup on an incomplete yookassa config", () => {
    expect(() =>
      parseEnv(paymentsEnv({ PAYMENTS_PROVIDER: "yookassa", PAYMENTS_ENV: "sandbox" })),
    ).toThrow(/YOOKASSA_REDIRECT_URI/);
    expect(() =>
      parseEnv({
        NODE_ENV: "test",
        PAYMENTS_PROVIDER: "yookassa",
        PAYMENTS_ENV: "sandbox",
        YOOKASSA_REDIRECT_URI: "https://example.com/seller/payments/callback",
      }),
    ).toThrow(/PAYMENTS_TOKEN_KEYS|PAYMENTS_TOKEN_KEY_VERSION|PAYMENTS_STATE_SECRET/);
  });

  it("accepts a complete yookassa config", () => {
    const parsed = parseEnv(
      paymentsEnv({
        PAYMENTS_PROVIDER: "yookassa",
        PAYMENTS_ENV: "sandbox",
        YOOKASSA_REDIRECT_URI: "https://example.com/seller/payments/callback",
      }),
    );

    expect(resolvePaymentsSettings(parsed)?.yookassaRedirectUri).toBe(
      "https://example.com/seller/payments/callback",
    );
  });

  it("rejects a non-http redirect URI", () => {
    expect(() =>
      parseEnv(
        paymentsEnv({
          PAYMENTS_PROVIDER: "yookassa",
          PAYMENTS_ENV: "sandbox",
          YOOKASSA_REDIRECT_URI: "ftp://example.com/callback",
        }),
      ),
    ).toThrow(/YOOKASSA_REDIRECT_URI/);
  });

  it("rejects an invalid token keyring", () => {
    expect(() => parseEnv(paymentsEnv({ PAYMENTS_TOKEN_KEYS: "not-json" }))).toThrow(
      /PAYMENTS_TOKEN_KEYS/,
    );
    expect(() =>
      parseEnv(paymentsEnv({ PAYMENTS_TOKEN_KEYS: JSON.stringify({ 1: "short" }) })),
    ).toThrow(/PAYMENTS_TOKEN_KEYS/);
  });

  it("requires a key version and that it exists in the keyring", () => {
    expect(() => parseEnv(paymentsEnv({ PAYMENTS_TOKEN_KEY_VERSION: undefined }))).toThrow(
      /PAYMENTS_TOKEN_KEY_VERSION/,
    );
    expect(() => parseEnv(paymentsEnv({ PAYMENTS_TOKEN_KEY_VERSION: "9" }))).toThrow(
      /PAYMENTS_TOKEN_KEY_VERSION/,
    );
    expect(() => parseEnv({ NODE_ENV: "test", PAYMENTS_TOKEN_KEY_VERSION: "1" })).toThrow(
      /PAYMENTS_TOKEN_KEYS/,
    );
  });

  it("rejects a placeholder PAYMENTS_STATE_SECRET", () => {
    expect(() =>
      parseEnv(
        paymentsEnv({
          PAYMENTS_PROVIDER: "fake",
          PAYMENTS_FAKE_ENABLED: "true",
          PAYMENTS_ENV: "test",
          PAYMENTS_STATE_SECRET: "change-me-to-a-long-random-string",
        }),
      ),
    ).toThrow(/placeholder/);
  });

  it("treats empty payment values as undefined", () => {
    const parsed = parseEnv({
      NODE_ENV: "test",
      PAYMENTS_PROVIDER: "",
      PAYMENTS_TOKEN_KEYS: "",
      PAYMENTS_TOKEN_KEY_VERSION: "",
      PAYMENTS_STATE_SECRET: "",
      YOOKASSA_REDIRECT_URI: "",
    });

    expect(parsed.PAYMENTS_PROVIDER).toBeUndefined();
    expect(parsed.PAYMENTS_TOKEN_KEYS).toBeUndefined();
    expect(parsed.PAYMENTS_TOKEN_KEY_VERSION).toBeUndefined();
    expect(resolvePaymentsSettings(parsed)).toBeNull();
  });
});
