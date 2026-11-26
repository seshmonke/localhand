import { describe, expect, it } from "vitest";
import { isForbiddenSecret, parseEnv, resolveTrustProxy } from "./env.js";

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
