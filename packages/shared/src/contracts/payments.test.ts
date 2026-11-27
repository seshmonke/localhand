import { describe, expect, it } from "vitest";
import {
  CreatePaymentResponseSchema,
  IdempotencyKeySchema,
  OrderPaymentSchema,
  PAYMENT_ERROR_CODES,
  PaymentErrorSchema,
  PaymentStatusSchema,
  SELLER_PAYMENT_ACCOUNT_STATUSES,
  SellerPaymentAccountResponseSchema,
  SellerPaymentAccountSchema,
} from "./payments.js";

const paymentId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

const payment = {
  id: 1,
  status: "pending",
  amountKopecks: 420_000,
  currency: "RUB",
  confirmationUrl: "https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc",
  createdAt: "2026-11-27T10:00:00.000Z",
  paidAt: null,
};

const account = {
  id: 1,
  provider: "fake",
  providerAccountId: "fake-account-1",
  isTest: true,
  status: "active",
  expiresAt: null,
  connectedAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
};

describe("PaymentStatusSchema", () => {
  it("accepts every lifecycle status", () => {
    for (const status of PaymentStatusSchema.options) {
      expect(PaymentStatusSchema.parse(status)).toBe(status);
    }
    expect(PaymentStatusSchema.options).toEqual([
      "pending",
      "succeeded",
      "canceled",
      "failed",
      "manual_review",
    ]);
  });

  it("rejects order statuses and unknown values", () => {
    expect(PaymentStatusSchema.safeParse("new").success).toBe(false);
    expect(PaymentStatusSchema.safeParse("paid").success).toBe(false);
    expect(PaymentStatusSchema.safeParse("waiting_for_capture").success).toBe(false);
  });
});

describe("IdempotencyKeySchema", () => {
  it("normalizes a UUID to lowercase", () => {
    expect(IdempotencyKeySchema.parse(paymentId.toUpperCase())).toBe(paymentId);
  });

  it.each(["", "not-a-uuid", "6f9619ff-8b86-4d01-b42d", 42, null])(
    "rejects a non-UUID value %#",
    (value) => {
      expect(IdempotencyKeySchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("OrderPaymentSchema", () => {
  it("parses a pending payment with a confirmation URL", () => {
    expect(OrderPaymentSchema.parse(payment)).toEqual(payment);
  });

  it("parses terminal payments without a URL", () => {
    for (const status of ["succeeded", "canceled", "failed", "manual_review"] as const) {
      expect(OrderPaymentSchema.parse({ ...payment, status, confirmationUrl: null }).status).toBe(
        status,
      );
    }
  });

  it("rejects a terminal payment that still exposes a confirmation URL", () => {
    expect(OrderPaymentSchema.safeParse({ ...payment, status: "succeeded" }).success).toBe(false);
    expect(OrderPaymentSchema.safeParse({ ...payment, status: "manual_review" }).success).toBe(
      false,
    );
  });

  it.each([
    { ...payment, amountKopecks: -1 },
    { ...payment, amountKopecks: 1.5 },
    { ...payment, currency: "USD" },
    { ...payment, confirmationUrl: "not-a-url" },
    { ...payment, confirmationUrl: "javascript:alert(1)" },
    { ...payment, confirmationUrl: "data:text/html,<script>alert(1)</script>" },
    { ...payment, confirmationUrl: "ftp://example.com/payment" },
    { ...payment, createdAt: "2026-11-27" },
    { ...payment, paidAt: "2026-11-27T10:00:00.000Z", status: "failed" },
  ])("rejects invalid payment %#", (input) => {
    expect(OrderPaymentSchema.safeParse(input).success).toBe(false);
  });

  it("accepts http and https confirmation URLs", () => {
    for (const confirmationUrl of [
      "https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc",
      "http://localhost:3000/dev/payments/fake_123/complete",
    ]) {
      expect(OrderPaymentSchema.parse({ ...payment, confirmationUrl }).confirmationUrl).toBe(
        confirmationUrl,
      );
    }
  });

  it("allows paidAt on a succeeded payment", () => {
    const succeeded = {
      ...payment,
      status: "succeeded",
      confirmationUrl: null,
      paidAt: "2026-11-27T10:05:00.000Z",
    };
    expect(OrderPaymentSchema.parse(succeeded).paidAt).toBe(succeeded.paidAt);
  });
});

describe("payment responses", () => {
  it("parses create payment and seller account responses", () => {
    expect(CreatePaymentResponseSchema.parse({ payment })).toEqual({ payment });
    expect(SellerPaymentAccountSchema.parse(account)).toEqual(account);
    expect(SellerPaymentAccountResponseSchema.parse({ account })).toEqual({ account });
    expect(SellerPaymentAccountResponseSchema.parse({ account: null })).toEqual({ account: null });
  });

  it("keeps the internal superseded account status out of the public contract", () => {
    // The DB enum has `superseded` for account history; the seller API exposes
    // only the current version and must not accept the internal value.
    expect(SELLER_PAYMENT_ACCOUNT_STATUSES).not.toContain("superseded");
    expect(SellerPaymentAccountSchema.safeParse({ ...account, status: "superseded" }).success).toBe(
      false,
    );
  });

  it("accepts every payment error code", () => {
    for (const code of PAYMENT_ERROR_CODES) {
      expect(PaymentErrorSchema.parse({ error: code })).toEqual({ error: code });
    }
    expect(PAYMENT_ERROR_CODES).toContain("payment_requires_review");
    expect(PAYMENT_ERROR_CODES).toContain("invalid_order_transition");
  });

  it("rejects a raw string as an error body", () => {
    expect(PaymentErrorSchema.safeParse({ error: "not_a_code" }).success).toBe(false);
  });
});
