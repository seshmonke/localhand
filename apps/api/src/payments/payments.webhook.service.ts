import { eq, sql } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { orders, payments } from "../db/schema.js";
import type { PaymentsRuntime } from "./context.js";
import { PaymentProviderError } from "./provider.js";
import {
  decryptAccountToken,
  loadProviderAccount,
  markAccountError,
  withProviderTimeout,
  type PaymentsLogger,
} from "./payments.shared.js";
import { applyProviderPayment } from "./payments.transitions.js";

export type WebhookResult = { status: 200 | 502 | 503 };

/**
 * Webhook pipeline: trust only the provider's API response, take the same
 * order lock as create, and return 200 only after the transition is committed.
 * A 503 keeps the provider retrying an event whose local payment row is not
 * visible yet (create commits the row before calling the provider).
 */
export async function handlePaymentWebhook(
  runtime: PaymentsRuntime,
  providerPaymentId: string,
  log: PaymentsLogger,
): Promise<WebhookResult> {
  const db = requireDb();

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.providerPaymentId, providerPaymentId))
    .limit(1);

  if (!payment) {
    log.warn({ code: "webhook_unknown_payment" }, "payment webhook references an unknown payment");
    return { status: 503 };
  }

  const account = await loadProviderAccount(db, payment.sellerAccountId);
  if (!account) {
    log.error(
      { code: "payment_account_missing", payment_id: payment.id, order_id: payment.orderId },
      "payment account version is missing",
    );
    return { status: 502 };
  }

  let token: string;
  try {
    token = decryptAccountToken(runtime, account);
  } catch {
    await markAccountError(db, account.id, new Date());
    log.warn(
      { code: "payment_token_unavailable", payment_id: payment.id, order_id: payment.orderId },
      "payment token could not be decrypted",
    );
    return { status: 502 };
  }

  let providerPayment: Awaited<ReturnType<PaymentsRuntime["provider"]["getPayment"]>>;
  try {
    providerPayment = await withProviderTimeout(
      runtime.provider.getPayment(token, providerPaymentId),
      runtime.providerTimeoutMs,
    );
  } catch (error) {
    const code = error instanceof PaymentProviderError ? error.code : "provider_error";
    if (code === "unauthorized") {
      await markAccountError(db, account.id, new Date());
    }
    log.warn(
      { code, payment_id: payment.id, order_id: payment.orderId },
      "payment status lookup failed",
    );
    return { status: code === "not_found" ? 503 : 502 };
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${payment.orderId}`}, 0))`,
    );

    const [currentPayment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, payment.id))
      .for("update");
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, payment.orderId))
      .for("update");

    if (!currentPayment || !order) {
      return { status: 502 };
    }
    if (currentPayment.status !== "pending") {
      // Idempotent replay: a succeeded/canceled/manual row is never reopened.
      return { status: 200 };
    }

    const outcome = await applyProviderPayment(
      tx,
      currentPayment,
      order,
      providerPayment,
      new Date(),
      log,
    );
    log.info(
      {
        payment_id: currentPayment.id,
        order_id: currentPayment.orderId,
        status: outcome.status,
        code: outcome.code ?? "payment_webhook_applied",
      },
      "payment webhook applied",
    );
    return { status: 200 };
  });
}
