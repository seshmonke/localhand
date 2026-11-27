import type { OrderPayment, PaymentStatus } from "@localhand/shared";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { ATTEMPT_KEY_PREFIX, attemptKeyFor } from "./OrderPage.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const orderIdArb = fc.integer({ min: 1, max: 2_147_483_647 });
const preservedStatusArb = fc.constantFrom<PaymentStatus>("pending", "manual_review");
const terminalStatusArb = fc.constantFrom<PaymentStatus>("succeeded", "canceled", "failed");

function paymentWithStatus(status: PaymentStatus): OrderPayment {
  return {
    id: 1,
    status,
    amountKopecks: 100_000,
    currency: "RUB",
    confirmationUrl: status === "pending" ? "https://example.com/pay" : null,
    createdAt: "2026-11-27T10:00:00.000Z",
    paidAt: status === "succeeded" ? "2026-11-27T12:00:00.000Z" : null,
  };
}

function storageKey(orderId: number): string {
  return `${ATTEMPT_KEY_PREFIX}${orderId}`;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("attemptKeyFor (property-based)", () => {
  it("always stores and returns the same UUID for one order while no payment exists", () => {
    fc.assert(
      fc.property(orderIdArb, (orderId) => {
        window.sessionStorage.clear();
        const first = attemptKeyFor(orderId, null, null);
        expect(first).toMatch(UUID_V4);
        const second = attemptKeyFor(orderId, null, null);
        expect(second).toBe(first);
        expect(window.sessionStorage.getItem(storageKey(orderId))).toBe(first);
      }),
      { numRuns: 75 },
    );
  });

  it("keeps the stored key while the payment is pending or manual_review", () => {
    fc.assert(
      fc.property(orderIdArb, fc.uuid(), preservedStatusArb, (orderId, key, status) => {
        window.sessionStorage.clear();
        window.sessionStorage.setItem(storageKey(orderId), key);
        expect(attemptKeyFor(orderId, paymentWithStatus(status), null)).toBe(key);
        expect(window.sessionStorage.getItem(storageKey(orderId))).toBe(key);
      }),
      { numRuns: 75 },
    );
  });

  it("clears a terminal attempt and creates a fresh key", () => {
    fc.assert(
      fc.property(orderIdArb, fc.uuid(), terminalStatusArb, (orderId, oldKey, status) => {
        window.sessionStorage.clear();
        window.sessionStorage.setItem(storageKey(orderId), oldKey);
        const key = attemptKeyFor(orderId, paymentWithStatus(status), {
          orderId,
          key: oldKey,
        });
        expect(key).not.toBe(oldKey);
        expect(key).toMatch(UUID_V4);
        expect(window.sessionStorage.getItem(storageKey(orderId))).toBe(key);
      }),
      { numRuns: 75 },
    );
  });

  it("never mixes attempt keys between different orders", () => {
    fc.assert(
      fc.property(orderIdArb, orderIdArb, (left, right) => {
        fc.pre(left !== right);
        window.sessionStorage.clear();
        const leftKey = attemptKeyFor(left, null, null);
        const rightKey = attemptKeyFor(right, null, null);
        expect(rightKey).not.toBe(leftKey);
        expect(window.sessionStorage.getItem(storageKey(left))).toBe(leftKey);
        expect(window.sessionStorage.getItem(storageKey(right))).toBe(rightKey);
      }),
      { numRuns: 75 },
    );
  });
});
