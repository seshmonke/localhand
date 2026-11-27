import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ORDER_TOTAL_MAX_KOPECKS } from "./order.js";
import { OrderPaymentSchema, PaymentAmountSchema, PaymentCurrencySchema } from "./payments.js";

const TERMINAL_STATUSES = ["succeeded", "canceled", "failed", "manual_review"] as const;

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    status: "pending",
    amountKopecks: 100_000,
    currency: "RUB",
    confirmationUrl: "https://example.com/pay",
    createdAt: "2026-11-27T10:00:00.000Z",
    paidAt: null,
    ...overrides,
  };
}

describe("payment contract (property-based)", () => {
  it("accepts every integer amount from 0 to the order maximum", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: ORDER_TOTAL_MAX_KOPECKS }), (amount) => {
        expect(PaymentAmountSchema.safeParse(amount).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects negative and non-integer amounts", () => {
    fc.assert(
      fc.property(fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }), (amount) => {
        expect(PaymentAmountSchema.safeParse(amount).success).toBe(false);
      }),
      { numRuns: 100 },
    );

    expect(PaymentAmountSchema.safeParse(0.5).success).toBe(false);
    expect(PaymentAmountSchema.safeParse("100").success).toBe(false);
    expect(PaymentAmountSchema.safeParse(null).success).toBe(false);
  });

  it("accepts only RUB as the currency", () => {
    expect(PaymentCurrencySchema.safeParse("RUB").success).toBe(true);
    fc.assert(
      fc.property(
        fc.string().filter((value) => value !== "RUB"),
        (currency) => {
          expect(PaymentCurrencySchema.safeParse(currency).success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("accepts http(s) confirmation URLs on a pending payment", () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(OrderPaymentSchema.safeParse(payment({ confirmationUrl: url })).success).toBe(true);
      }),
      { numRuns: 75 },
    );
  });

  it("rejects non-http(s) confirmation URLs", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "javascript:alert(1)",
          "data:text/html,<script>alert(1)</script>",
          "ftp://example.com/pay",
          "//example.com/pay",
          "not a url",
        ),
        (url) => {
          expect(OrderPaymentSchema.safeParse(payment({ confirmationUrl: url })).success).toBe(
            false,
          );
        },
      ),
      { numRuns: 25 },
    );
  });

  it("never exposes a confirmation URL on a terminal payment", () => {
    fc.assert(
      fc.property(fc.constantFrom(...TERMINAL_STATUSES), fc.webUrl(), (status, url) => {
        expect(
          OrderPaymentSchema.safeParse(
            payment({
              status,
              confirmationUrl: url,
              paidAt: status === "succeeded" ? "2026-11-27T12:00:00.000Z" : null,
            }),
          ).success,
        ).toBe(false);
        expect(
          OrderPaymentSchema.safeParse(
            payment({
              status,
              confirmationUrl: null,
              paidAt: status === "succeeded" ? "2026-11-27T12:00:00.000Z" : null,
            }),
          ).success,
        ).toBe(true);
      }),
      { numRuns: 75 },
    );
  });
});
