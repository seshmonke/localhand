import { describe, expect, it } from "vitest";
import { PAYMENT_STATE_TTL_MS, signPaymentState, verifyPaymentState } from "./state.js";

const SECRET = "test-state-secret-that-is-long-enough-123456";
const OTHER_SECRET = "another-state-secret-that-is-long-enough-654321";

describe("payment state", () => {
  it("round-trips the seller id inside the TTL", () => {
    const now = Date.parse("2026-11-27T10:00:00.000Z");
    const state = signPaymentState(SECRET, 42, now);

    expect(verifyPaymentState(SECRET, state, now + PAYMENT_STATE_TTL_MS - 1)).toEqual({
      sellerId: 42,
    });
  });

  it("rejects an expired state", () => {
    const now = Date.parse("2026-11-27T10:00:00.000Z");
    const state = signPaymentState(SECRET, 42, now);

    expect(verifyPaymentState(SECRET, state, now + PAYMENT_STATE_TTL_MS + 1)).toBeNull();
  });

  it("rejects a state issued too far in the future", () => {
    const now = Date.parse("2026-11-27T10:00:00.000Z");
    const state = signPaymentState(SECRET, 42, now + 60_000);

    expect(verifyPaymentState(SECRET, state, now)).toBeNull();
  });

  it("rejects a forged signature or payload", () => {
    const now = Date.parse("2026-11-27T10:00:00.000Z");
    const state = signPaymentState(SECRET, 42, now);
    const [payload, signature] = state.split(".");

    expect(verifyPaymentState(OTHER_SECRET, state, now)).toBeNull();
    expect(verifyPaymentState(SECRET, `${payload}.${signature}x`, now)).toBeNull();
    expect(
      verifyPaymentState(
        SECRET,
        `${Buffer.from(JSON.stringify({ v: 1, sellerId: 43, issuedAt: now })).toString("base64url")}.${signature}`,
        now,
      ),
    ).toBeNull();
  });

  it("rejects malformed values", () => {
    const now = Date.now();
    for (const state of ["", "one-part", "a.b.c", "..", "not-base64.not-base64"]) {
      expect(verifyPaymentState(SECRET, state, now)).toBeNull();
    }
  });

  it("requires a positive integer seller id when signing", () => {
    expect(() => signPaymentState(SECRET, 0)).toThrow();
    expect(() => signPaymentState(SECRET, 1.5)).toThrow();
    expect(() => signPaymentState(SECRET, -1)).toThrow();
  });
});
