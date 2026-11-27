import type { OrderStatus, PaymentStatus } from "@localhand/shared";
import { and, eq, inArray } from "drizzle-orm";
import { orders, payments } from "../db/schema.js";
import type { ProviderPayment } from "./provider.js";
import type { PaymentRow, PaymentsLogger, Transaction } from "./payments.shared.js";

type OrderRow = typeof orders.$inferSelect;

export type TransitionOutcome = {
  status: PaymentStatus;
  orderStatus: OrderStatus;
  code?: "payment_amount_mismatch" | "payment_unknown_status";
};

export type PaymentMatchSubject = Pick<
  PaymentRow,
  "providerPaymentId" | "amountKopecks" | "currency" | "orderId"
>;

/**
 * The provider response is the only trusted source for a webhook. All four
 * fields must agree: a mismatch quarantines the payment instead of moving the
 * order or reopening a terminal attempt.
 */
export function providerPaymentMatches(
  payment: PaymentMatchSubject,
  providerPayment: ProviderPayment,
): boolean {
  return (
    providerPayment.providerPaymentId === payment.providerPaymentId &&
    providerPayment.amountKopecks === payment.amountKopecks &&
    providerPayment.currency === payment.currency &&
    providerPayment.orderId === payment.orderId
  );
}

/**
 * `pending` is the only status that may be advanced by a provider event.
 * Everything else is terminal for the webhook/reconcile flow: a repeated event
 * is an idempotent no-op, never a reopen.
 */
export function isPaymentStatusTerminal(status: PaymentStatus): boolean {
  return status !== "pending";
}

/**
 * Applies a provider payment status inside the order lock. The provider
 * response is authoritative; the webhook body is never trusted. Any
 * amount/currency/order mismatch is quarantined as `manual_review` without
 * moving the order, so a new payment cannot be created behind the operator's
 * back.
 */
export async function applyProviderPayment(
  tx: Transaction,
  payment: PaymentRow,
  order: OrderRow,
  providerPayment: ProviderPayment,
  now: Date,
  log: PaymentsLogger,
): Promise<TransitionOutcome> {
  if (!providerPaymentMatches(payment, providerPayment)) {
    await tx
      .update(payments)
      .set({ status: "manual_review", updatedAt: now })
      .where(eq(payments.id, payment.id));
    log.warn(
      { code: "payment_amount_mismatch", payment_id: payment.id, order_id: payment.orderId },
      "payment provider data does not match the stored payment",
    );
    return { status: "manual_review", orderStatus: order.status, code: "payment_amount_mismatch" };
  }

  if (providerPayment.status === "pending") {
    return { status: "pending", orderStatus: order.status };
  }

  if (providerPayment.status === "succeeded") {
    const paidAt = providerPayment.paidAt ?? now;
    await tx
      .update(payments)
      .set({ status: "succeeded", paidAt, updatedAt: now })
      .where(eq(payments.id, payment.id));

    await tx
      .update(orders)
      .set({ status: "paid", updatedAt: now })
      .where(and(eq(orders.id, order.id), eq(orders.status, "payment_pending")));

    return {
      status: "succeeded",
      orderStatus: order.status === "payment_pending" ? "paid" : order.status,
    };
  }

  if (providerPayment.status === "canceled") {
    await tx
      .update(payments)
      .set({ status: "canceled", updatedAt: now })
      .where(eq(payments.id, payment.id));

    const [other] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.orderId, payment.orderId),
          inArray(payments.status, ["pending", "manual_review"]),
        ),
      )
      .limit(1);

    let orderStatus = order.status;
    if (!other && order.status === "payment_pending") {
      await tx
        .update(orders)
        .set({ status: "new", updatedAt: now })
        .where(and(eq(orders.id, order.id), eq(orders.status, "payment_pending")));
      orderStatus = "new";
    }

    return { status: "canceled", orderStatus };
  }

  // The provider contract has three statuses; anything else is quarantined
  // rather than guessed.
  await tx
    .update(payments)
    .set({ status: "manual_review", updatedAt: now })
    .where(eq(payments.id, payment.id));
  log.warn(
    { code: "payment_unknown_status", payment_id: payment.id, status: providerPayment.status },
    "payment provider returned an unknown status",
  );
  return { status: "manual_review", orderStatus: order.status, code: "payment_unknown_status" };
}
