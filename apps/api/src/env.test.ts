import { describe, expect, it } from "vitest";
import { isForbiddenSecret, resolveTrustProxy } from "./env.js";

describe("isForbiddenSecret", () => {
  it("rejects known placeholders", () => {
    expect(isForbiddenSecret("change-me-to-a-long-random-string")).toBe(true);
    expect(isForbiddenSecret("dev-only-secret-for-local-use-only")).toBe(true);
    expect(isForbiddenSecret("localhand-dev-jwt-secret-not-for-production-use")).toBe(true);
    expect(isForbiddenSecret("CHANGE-ME-PLEASE-WITH-RANDOM-VALUE")).toBe(true);
  });

  it("accepts a random-looking secret", () => {
    expect(isForbiddenSecret("q7Zr3mB9xK2pL5wN8cV1tY4hJ6sD0fG")).toBe(false);
  });
});

describe("resolveTrustProxy", () => {
  it("trusts proxy headers in production by default", () => {
    expect(resolveTrustProxy("production", undefined)).toBe(true);
  });

  it("does not trust proxy headers outside production by default", () => {
    expect(resolveTrustProxy("development", undefined)).toBe(false);
    expect(resolveTrustProxy("test", undefined)).toBe(false);
  });

  it("honours the explicit TRUST_PROXY value", () => {
    expect(resolveTrustProxy("production", "false")).toBe(false);
    expect(resolveTrustProxy("development", "true")).toBe(true);
    expect(resolveTrustProxy("test", "true")).toBe(true);
  });
});
