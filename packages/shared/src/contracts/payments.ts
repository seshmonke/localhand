import { z } from "zod";
import { ORDER_ID_MAX, ORDER_TOTAL_MAX_KOPECKS } from "./order.js";

/**
 * Payment lifecycle. `manual_review` is terminal until an operator resolves it
 * (runbook `payments-manual-review.md`); it is a payment status, never an order
 * status.
 */
export const PAYMENT_STATUSES = [
  "pending",
  "succeeded",
  "canceled",
  "failed",
  "manual_review",
] as const;

export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const PAYMENT_PROVIDERS = ["fake", "yookassa"] as const;
export const PaymentProviderSchema = z.enum(PAYMENT_PROVIDERS);

export const PAYMENT_CURRENCY = "RUB";
export const PaymentCurrencySchema = z.literal(PAYMENT_CURRENCY);

/**
 * Seller-facing account states. `superseded` is internal history and must not
 * be returned by the API: the seller sees only the current version.
 */
export const SELLER_PAYMENT_ACCOUNT_STATUSES = ["active", "error", "disabled"] as const;
export const SellerPaymentAccountStatusSchema = z.enum(SELLER_PAYMENT_ACCOUNT_STATUSES);

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/**
 * UUIDs are case-insensitive by spec, but lookups, the unique key and advisory
 * locks compare strings byte-wise. Canonical lowercase makes the same header
 * value hit the same payment row in every case.
 */
export const IdempotencyKeySchema = z.uuid().transform((value) => value.toLowerCase());

export const PaymentIdSchema = z.number().int().positive().max(ORDER_ID_MAX);

export const PaymentAmountSchema = z.number().int().min(0).max(ORDER_TOTAL_MAX_KOPECKS);

/**
 * `confirmationUrl` is present only while the payment is `pending`; the schema
 * rejects a terminal payment that still exposes a provider URL.
 */
export const OrderPaymentSchema = z
  .object({
    id: PaymentIdSchema,
    status: PaymentStatusSchema,
    amountKopecks: PaymentAmountSchema,
    currency: PaymentCurrencySchema,
    confirmationUrl: z.url().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    paidAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .superRefine((payment, ctx) => {
    if (payment.status !== "pending" && payment.confirmationUrl !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmationUrl"],
        message: "confirmation_url_only_pending",
      });
    }
  });

export const CreatePaymentResponseSchema = z.object({
  payment: OrderPaymentSchema,
});

export const SellerPaymentAccountSchema = z.object({
  id: PaymentIdSchema,
  provider: PaymentProviderSchema,
  providerAccountId: z.string().min(1),
  isTest: z.boolean(),
  status: SellerPaymentAccountStatusSchema,
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  connectedAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const SellerPaymentAccountResponseSchema = z.object({
  account: SellerPaymentAccountSchema.nullable(),
});

export const PAYMENT_ERROR_CODES = [
  "invalid_request",
  "unauthorized",
  "not_found",
  "rate_limited",
  "order_already_paid",
  "seller_payment_unavailable",
  "zero_amount",
  "payment_in_progress",
  "payment_requires_review",
  "invalid_order_transition",
  "provider_unavailable",
  "internal_error",
] as const;

export const PaymentErrorCodeSchema = z.enum(PAYMENT_ERROR_CODES);

export const PaymentErrorSchema = z.object({
  error: PaymentErrorCodeSchema,
});

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;
export type SellerPaymentAccountStatus = z.infer<typeof SellerPaymentAccountStatusSchema>;
export type OrderPayment = z.infer<typeof OrderPaymentSchema>;
export type CreatePaymentResponse = z.infer<typeof CreatePaymentResponseSchema>;
export type SellerPaymentAccount = z.infer<typeof SellerPaymentAccountSchema>;
export type SellerPaymentAccountResponse = z.infer<typeof SellerPaymentAccountResponseSchema>;
export type PaymentErrorCode = z.infer<typeof PaymentErrorCodeSchema>;
export type PaymentError = z.infer<typeof PaymentErrorSchema>;
