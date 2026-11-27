import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { orders, payments, sellerPaymentAccounts } from "../db/schema.js";
import type { PaymentsRuntime } from "./context.js";
import { PaymentProviderError } from "./provider.js";
import {
  decryptAccountToken,
  loadProviderAccount,
  markAccountError,
  PAYMENT_PROVIDER_TIMEOUT_MS,
  withProviderTimeout,
  type PaymentRow,
  type PaymentsLogger,
  type SellerAccountRow,
  type Transaction,
} from "./payments.shared.js";
import { applyProviderPayment } from "./payments.transitions.js";

export const PAYMENTS_RECONCILE_INTERVAL_MS = 60_000;
/** A provider id exists but the order is still waiting for a webhook. */
export const PAYMENTS_RECONCILE_PROVIDER_ID_AGE_MS = 2 * 60_000;
/** No provider id: the create call outcome is unknown. */
export const PAYMENTS_RECONCILE_ORPHAN_AGE_MS = 15 * 60_000;
export const PAYMENTS_RECONCILE_MAX_ATTEMPTS = 3;
const RECONCILE_BATCH_SIZE = 50;

/**
 * One reconcile pass. It is deliberately idempotent and safe to run by hand:
 * both branches take the same `order:{id}` advisory lock as create and the
 * webhook, so a late webhook can never race the state transition.
 */
export async function runPaymentReconcile(
  runtime: PaymentsRuntime,
  log: PaymentsLogger,
  now = new Date(),
): Promise<void> {
  const db = requireDb();

  const orphanCutoff = new Date(now.getTime() - PAYMENTS_RECONCILE_ORPHAN_AGE_MS);
  const providerCutoff = new Date(now.getTime() - PAYMENTS_RECONCILE_PROVIDER_ID_AGE_MS);

  const [orphans, providerBacked] = await Promise.all([
    db
      .select({ id: payments.id, orderId: payments.orderId })
      .from(payments)
      .where(
        and(
          eq(payments.status, "pending"),
          isNull(payments.providerPaymentId),
          lt(payments.createdAt, orphanCutoff),
        ),
      )
      .limit(RECONCILE_BATCH_SIZE),
    db
      .select({ id: payments.id, orderId: payments.orderId })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          eq(payments.status, "pending"),
          isNotNull(payments.providerPaymentId),
          lt(payments.createdAt, providerCutoff),
          eq(orders.status, "payment_pending"),
        ),
      )
      .limit(RECONCILE_BATCH_SIZE),
  ]);

  for (const orphan of orphans) {
    await reconcileOrphan(orphan.id, orphan.orderId, now, log);
  }
  for (const candidate of providerBacked) {
    await reconcileWithProvider(runtime, candidate.id, candidate.orderId, now, log);
  }
}

async function reconcileOrphan(
  paymentId: number,
  orderId: number,
  now: Date,
  log: PaymentsLogger,
): Promise<void> {
  await requireDb().transaction(async (tx) => {
    await lockOrder(tx, orderId);

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for("update");
    if (
      !payment ||
      payment.status !== "pending" ||
      payment.providerPaymentId !== null ||
      payment.createdAt.getTime() > now.getTime() - PAYMENTS_RECONCILE_ORPHAN_AGE_MS
    ) {
      return;
    }

    await tx
      .update(payments)
      .set({
        status: "manual_review",
        reconcileAttempts: payment.reconcileAttempts,
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(eq(payments.id, paymentId));

    log.warn(
      {
        code: "payment_orphan_manual_review",
        payment_id: paymentId,
        order_id: orderId,
      },
      "pending payment without a provider id moved to manual review",
    );
  });
}

async function reconcileWithProvider(
  runtime: PaymentsRuntime,
  paymentId: number,
  orderId: number,
  now: Date,
  log: PaymentsLogger,
): Promise<void> {
  await requireDb().transaction(async (tx) => {
    await lockOrder(tx, orderId);

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for("update");
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (
      !payment ||
      !order ||
      payment.status !== "pending" ||
      !payment.providerPaymentId ||
      order.status !== "payment_pending"
    ) {
      return;
    }

    const account = await loadProviderAccount(tx, payment.sellerAccountId);
    if (!account) {
      await failAttempt(tx, payment, "payment_account_missing", now, log);
      return;
    }

    const result = await fetchProviderPayment(runtime, payment, account, log);
    if (result.ok) {
      const outcome = await applyProviderPayment(tx, payment, order, result.value, now, log);
      await tx
        .update(payments)
        .set({ reconcileAttempts: 0, lastCheckedAt: now, updatedAt: now })
        .where(eq(payments.id, payment.id));
      log.info(
        {
          payment_id: payment.id,
          order_id: payment.orderId,
          status: outcome.status,
          code: outcome.code ?? "payment_reconcile_checked",
        },
        "payment reconcile applied the provider status",
      );
      return;
    }

    // 401: the token used for this payment is dead. Try the newer active
    // version of the same provider account before counting a failure.
    if (result.code === "unauthorized") {
      await markAccountError(tx, account.id, now);
      const newer = await findNewerActiveAccount(tx, account);
      if (newer) {
        const retry = await fetchProviderPayment(runtime, payment, newer, log);
        if (retry.ok) {
          const outcome = await applyProviderPayment(tx, payment, order, retry.value, now, log);
          await tx
            .update(payments)
            .set({ reconcileAttempts: 0, lastCheckedAt: now, updatedAt: now })
            .where(eq(payments.id, payment.id));
          log.info(
            {
              payment_id: payment.id,
              order_id: payment.orderId,
              status: outcome.status,
              code: outcome.code ?? "payment_reconcile_recovered",
            },
            "payment reconcile recovered with a newer active account",
          );
          return;
        }
        if (retry.code === "unauthorized") {
          await markAccountError(tx, newer.id, now);
        }
        await failAttempt(tx, payment, retry.code, now, log);
        return;
      }
    }

    await failAttempt(tx, payment, result.code, now, log);
  });
}

type FetchResult =
  | { ok: true; value: Awaited<ReturnType<PaymentsRuntime["provider"]["getPayment"]>> }
  | { ok: false; code: string };

async function fetchProviderPayment(
  runtime: PaymentsRuntime,
  payment: PaymentRow,
  account: SellerAccountRow,
  log: PaymentsLogger,
): Promise<FetchResult> {
  let token: string;
  try {
    token = decryptAccountToken(runtime, account);
  } catch {
    log.warn(
      { code: "payment_token_unavailable", payment_id: payment.id, order_id: payment.orderId },
      "payment token could not be decrypted during reconcile",
    );
    return { ok: false, code: "unauthorized" };
  }

  if (!payment.providerPaymentId) {
    return { ok: false, code: "not_found" };
  }

  try {
    return {
      ok: true,
      value: await withProviderTimeout(
        runtime.provider.getPayment(token, payment.providerPaymentId),
        PAYMENT_PROVIDER_TIMEOUT_MS,
      ),
    };
  } catch (error) {
    const code = error instanceof PaymentProviderError ? error.code : "provider_error";
    log.warn(
      { code, payment_id: payment.id, order_id: payment.orderId },
      "payment reconcile status lookup failed",
    );
    return { ok: false, code };
  }
}

async function findNewerActiveAccount(
  tx: Transaction,
  account: SellerAccountRow,
): Promise<SellerAccountRow | null> {
  const [newer] = await tx
    .select()
    .from(sellerPaymentAccounts)
    .where(
      and(
        eq(sellerPaymentAccounts.sellerId, account.sellerId),
        eq(sellerPaymentAccounts.provider, account.provider),
        eq(sellerPaymentAccounts.providerAccountId, account.providerAccountId),
        eq(sellerPaymentAccounts.status, "active"),
      ),
    )
    .limit(1);
  return newer && newer.id !== account.id ? newer : null;
}

async function failAttempt(
  tx: Transaction,
  payment: PaymentRow,
  code: string,
  now: Date,
  log: PaymentsLogger,
): Promise<void> {
  const attempts = payment.reconcileAttempts + 1;

  if (attempts >= PAYMENTS_RECONCILE_MAX_ATTEMPTS) {
    await tx
      .update(payments)
      .set({
        status: "manual_review",
        reconcileAttempts: attempts,
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id));
    log.warn(
      {
        code: "payment_reconcile_manual_review",
        payment_id: payment.id,
        order_id: payment.orderId,
        attempts,
      },
      "payment moved to manual review after repeated reconcile failures",
    );
    return;
  }

  await tx
    .update(payments)
    .set({ reconcileAttempts: attempts, lastCheckedAt: now, updatedAt: now })
    .where(eq(payments.id, payment.id));
  log.warn(
    { code, payment_id: payment.id, order_id: payment.orderId, attempts },
    "payment reconcile attempt failed",
  );
}

async function lockOrder(tx: Transaction, orderId: number): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`);
}
