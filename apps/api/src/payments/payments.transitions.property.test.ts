import type { PaymentStatus } from "@localhand/shared";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isPaymentStatusTerminal, providerPaymentMatches } from "./payments.transitions.js";
import type { ProviderPayment } from "./provider.js";

type MatchPayment = {
  providerPaymentId: string;
  amountKopecks: number;
  currency: "RUB";
  orderId: number;
};

const paymentArb = fc.record({
  providerPaymentId: fc.uuid(),
  amountKopecks: fc.integer({ min: 0, max: 2_147_483_647 }),
  currency: fc.constant("RUB" as const),
  orderId: fc.integer({ min: 1, max: 2_147_483_647 }),
});

function providerFor(
  payment: MatchPayment,
  status: ProviderPayment["status"] = "succeeded",
): ProviderPayment {
  return { ...payment, status };
}

describe("providerPaymentMatches (property-based)", () => {
  it("matches when id, amount, currency and order all agree", () => {
    fc.assert(
      fc.property(
        paymentArb,
        fc.constantFrom<ProviderPayment["status"]>("pending", "succeeded", "canceled"),
        (payment, status) => {
          expect(providerPaymentMatches(payment, providerFor(payment, status))).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects any single mismatch", () => {
    fc.assert(
      fc.property(
        paymentArb,
        fc.constantFrom("providerPaymentId", "amountKopecks", "currency", "orderId"),
        (payment, field) => {
          const provider = providerFor(payment);
          if (field === "providerPaymentId") {
            provider.providerPaymentId = `${payment.providerPaymentId}-other`;
          } else if (field === "amountKopecks") {
            provider.amountKopecks = payment.amountKopecks + 1;
          } else if (field === "orderId") {
            provider.orderId = payment.orderId + 1;
          } else {
            (provider as { currency: string }).currency = "USD";
          }
          expect(providerPaymentMatches(payment, provider)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("terminal payment idempotence (property-based)", () => {
  it("treats only pending as non-terminal", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PaymentStatus>(
          "pending",
          "succeeded",
          "canceled",
          "failed",
          "manual_review",
        ),
        (status) => {
          expect(isPaymentStatusTerminal(status)).toBe(status !== "pending");
        },
      ),
      { numRuns: 25 },
    );
  });

  it("never reopens succeeded, canceled, failed or manual_review", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PaymentStatus>("succeeded", "canceled", "failed", "manual_review"),
        (status) => {
          expect(isPaymentStatusTerminal(status)).toBe(true);
        },
      ),
      { numRuns: 25 },
    );
  });
});
