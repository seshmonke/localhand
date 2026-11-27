import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { orders, payments, sellerPaymentAccounts } from "../db/schema.js";
import type { PaymentsRuntime } from "./context.js";
import { PaymentProviderError } from "./provider.js";
import {
  decryptAccountToken,
  loadProviderAccount,
  markAccountError,
  withProviderTimeout,
  type PaymentRow,
  type PaymentsLogger,
  type QueryExecutor,
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
 * One reconcile pass. The provider HTTP call happens before the order lock:
 * a slow provider must not block create, webhook or another reconcile pass.
 * The status is applied in a short transaction that re-reads the payment and
 * order under `order:{id}` and verifies that neither the provider payment id
 * nor the provider account changed while the call was in flight.
 */
export async function runPaymentReconcile(
  runtime: PaymentsRuntime,
  log: PaymentsLogger,
  now = new Date(),
  signal?: AbortSignal,
): Promise<void> {
  const db = requireDb();

  const orphanCutoff = new Date(now.getTime() - PAYMENTS_RECONCILE_ORPHAN_AGE_MS);
  const providerCutoff = new Date(now.getTime() - PAYMENTS_RECONCILE_PROVIDER_ID_AGE_MS);

  if (signal?.aborted) {
    return;
  }

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
    if (signal?.aborted) {
      return;
    }
    await reconcileOrphan(orphan.id, orphan.orderId, now, log);
  }
  for (const candidate of providerBacked) {
    if (signal?.aborted) {
      return;
    }
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
  const db = requireDb();

  const [snapshot] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!snapshot || snapshot.status !== "pending" || !snapshot.providerPaymentId) {
    return;
  }
  const providerPaymentId = snapshot.providerPaymentId;

  const account = await loadProviderAccount(db, snapshot.sellerAccountId);
  if (!account) {
    await recordFailedAttempt(
      orderId,
      paymentId,
      providerPaymentId,
      null,
      "payment_account_missing",
      now,
      log,
    );
    return;
  }

  let accountUsed = account;
  let result = await fetchProviderPayment(runtime, snapshot, account, log);

  // 401: mark the token version as error and retry with the newer active
  // version of the same provider account before counting a failure.
  if (!result.ok && result.code === "unauthorized") {
    await markAccountError(db, account.id, now);
    const newer = await findNewerActiveAccount(db, account);
    if (newer) {
      accountUsed = newer;
      result = await fetchProviderPayment(runtime, snapshot, newer, log);
      if (!result.ok && result.code === "unauthorized") {
        await markAccountError(db, newer.id, now);
      }
    }
  }

  if (!result.ok) {
    await recordFailedAttempt(
      orderId,
      paymentId,
      providerPaymentId,
      accountUsed.providerAccountId,
      result.code,
      now,
      log,
    );
    return;
  }

  await applyFetchedStatus(
    orderId,
    paymentId,
    providerPaymentId,
    accountUsed.providerAccountId,
    result.value,
    now,
    log,
  );
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
        runtime.providerTimeoutMs,
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

async function applyFetchedStatus(
  orderId: number,
  paymentId: number,
  providerPaymentId: string,
  providerAccountId: string | null,
  providerPayment: Awaited<ReturnType<PaymentsRuntime["provider"]["getPayment"]>>,
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
      payment.providerPaymentId !== providerPaymentId ||
      order.status !== "payment_pending"
    ) {
      return;
    }

    if (!(await accountStillMatches(tx, payment, providerAccountId))) {
      return;
    }

    const outcome = await applyProviderPayment(tx, payment, order, providerPayment, now, log);
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
  });
}

async function recordFailedAttempt(
  orderId: number,
  paymentId: number,
  providerPaymentId: string,
  providerAccountId: string | null,
  code: string,
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
      payment.providerPaymentId !== providerPaymentId
    ) {
      return;
    }
    if (!(await accountStillMatches(tx, payment, providerAccountId))) {
      return;
    }

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
  });
}

/**
 * The fetched provider status is only applied if the payment still resolves
 * to the same provider account. A reconnect to a different provider account
 * must be picked up by the next pass instead of applying a foreign status.
 */
async function accountStillMatches(
  tx: Transaction,
  payment: PaymentRow,
  providerAccountId: string | null,
): Promise<boolean> {
  if (providerAccountId === null) {
    return true;
  }
  const current = await loadProviderAccount(tx, payment.sellerAccountId);
  return current !== null && current.providerAccountId === providerAccountId;
}

async function findNewerActiveAccount(
  executor: QueryExecutor,
  account: SellerAccountRow,
): Promise<SellerAccountRow | null> {
  const [newer] = await executor
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

async function lockOrder(tx: Transaction, orderId: number): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`);
}
