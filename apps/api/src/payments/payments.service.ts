import type { OrderPayment, PaymentErrorCode } from "@localhand/shared";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { orders, payments, sellerPaymentAccounts, sellers, shops } from "../db/schema.js";
import type { PaymentsRuntime } from "./context.js";
import { PaymentProviderError, type CreateProviderPaymentResult } from "./provider.js";
import {
  decryptAccountToken,
  isUniqueViolation,
  loadProviderAccount,
  markAccountError,
  toOrderPayment,
  toSellerOrderPayment,
  withProviderTimeout,
  type PaymentRow,
  type PaymentsLogger,
  type SellerAccountRow,
  type Transaction,
} from "./payments.shared.js";

export type PaymentServiceResult<T> =
  { ok: true; value: T } | { ok: false; status: 404 | 409 | 502; error: PaymentErrorCode };

export type CreateOrderPaymentInput = {
  userId: number;
  orderId: number;
  idempotencyKey: string;
  runtime: PaymentsRuntime;
  log: PaymentsLogger;
};

export type CreateOrderPaymentValue = {
  payment: OrderPayment;
  created: boolean;
};

type CreatePlan =
  | { kind: "replay"; row: PaymentRow }
  | { kind: "retry"; row: PaymentRow; account?: SellerAccountRow }
  | { kind: "inserted"; row: PaymentRow; account: SellerAccountRow }
  | { kind: "conflict"; status: 404 | 409 | 502; error: PaymentErrorCode };

function conflict(status: 404 | 409 | 502, error: PaymentErrorCode): CreatePlan {
  return { kind: "conflict", status, error };
}

/**
 * Replay rules are applied before the order-status gate: a repeated
 * Idempotency-Key returns the existing payment even after `paid`, while a new
 * key is gated by order/payment state.
 */
function replayPlan(row: PaymentRow): CreatePlan {
  if (row.status === "manual_review") {
    return conflict(409, "payment_requires_review");
  }
  if (row.status === "pending") {
    if (row.providerPaymentId && row.confirmationUrl) {
      return { kind: "replay", row };
    }
    return { kind: "retry", row };
  }
  if (row.status === "failed" && !row.providerPaymentId) {
    return conflict(409, "payment_in_progress");
  }
  return { kind: "replay", row };
}

/**
 * Re-arms a failed 4xx attempt only after re-checking the order and the
 * active-payment uniqueness under the order lock. The row moves to `pending`
 * in this transaction, so a concurrent new key cannot slip in between the
 * check and the provider call.
 */
async function retryFailedPlan(
  tx: Transaction,
  orderId: number,
  row: PaymentRow,
  providerName: string,
): Promise<CreatePlan> {
  const [lockedOrder] = await tx
    .select({ status: orders.status, shopId: orders.shopId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  if (!lockedOrder) {
    return conflict(404, "not_found");
  }
  if (lockedOrder.status === "paid") {
    return conflict(409, "order_already_paid");
  }

  const [active] = await tx
    .select({ status: payments.status })
    .from(payments)
    .where(
      and(eq(payments.orderId, orderId), inArray(payments.status, ["pending", "manual_review"])),
    )
    .limit(1);
  if (active) {
    return conflict(
      409,
      active.status === "manual_review" ? "payment_requires_review" : "payment_in_progress",
    );
  }

  if (lockedOrder.status !== "new") {
    return conflict(409, "invalid_order_transition");
  }

  const [shop] = await tx
    .select({ sellerId: shops.sellerId })
    .from(shops)
    .where(eq(shops.id, lockedOrder.shopId))
    .limit(1);
  if (!shop) {
    return conflict(404, "not_found");
  }

  // The previous attempt may reference a disabled/superseded account. A retry
  // is a new attempt and must use the seller's current active account, under
  // the same row lock that serializes disconnect.
  const [account] = await tx
    .select()
    .from(sellerPaymentAccounts)
    .where(
      and(
        eq(sellerPaymentAccounts.sellerId, shop.sellerId),
        eq(sellerPaymentAccounts.status, "active"),
        eq(sellerPaymentAccounts.provider, providerName),
      ),
    )
    .for("share")
    .limit(1);
  if (!account) {
    return conflict(409, "seller_payment_unavailable");
  }

  const now = new Date();
  const [updated] = await tx
    .update(payments)
    .set({
      status: "pending",
      sellerAccountId: account.id,
      providerPaymentId: null,
      confirmationUrl: null,
      reconcileAttempts: 0,
      lastCheckedAt: null,
      // Reconcile ages an attempt by createdAt; a retry must get a fresh
      // 15-minute orphan window instead of inheriting the failed row's age.
      createdAt: now,
      updatedAt: now,
    })
    .where(and(eq(payments.id, row.id), eq(payments.status, "failed")))
    .returning();

  return { kind: "retry", row: updated ?? row, account };
}

export async function createOrderPayment(
  input: CreateOrderPaymentInput,
): Promise<PaymentServiceResult<CreateOrderPaymentValue>> {
  const { userId, orderId, idempotencyKey, runtime, log } = input;
  const db = requireDb();

  const [order] = await db
    .select({
      id: orders.id,
      buyerUserId: orders.buyerUserId,
      status: orders.status,
      totalKopecks: orders.totalKopecks,
      sellerId: shops.sellerId,
    })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order || order.buyerUserId !== userId) {
    return { ok: false, status: 404, error: "not_found" };
  }

  let plan: CreatePlan;
  try {
    plan = await db.transaction(async (tx): Promise<CreatePlan> => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`,
      );

      const [existing] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, orderId), eq(payments.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (existing) {
        if (existing.status === "failed" && !existing.providerPaymentId) {
          // A failed 4xx row is not a free pass: re-apply the order/payment
          // gate under the order lock and only then re-arm the attempt.
          return retryFailedPlan(tx, orderId, existing, runtime.provider.name);
        }
        return replayPlan(existing);
      }

      const [lockedOrder] = await tx
        .select({ status: orders.status, totalKopecks: orders.totalKopecks })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");

      if (!lockedOrder) {
        return conflict(404, "not_found");
      }
      if (lockedOrder.status === "paid") {
        return conflict(409, "order_already_paid");
      }

      const [active] = await tx
        .select({ status: payments.status })
        .from(payments)
        .where(
          and(
            eq(payments.orderId, orderId),
            inArray(payments.status, ["pending", "manual_review"]),
          ),
        )
        .limit(1);
      if (active) {
        return conflict(
          409,
          active.status === "manual_review" ? "payment_requires_review" : "payment_in_progress",
        );
      }

      if (lockedOrder.status !== "new") {
        return conflict(409, "invalid_order_transition");
      }

      if (lockedOrder.totalKopecks === 0) {
        return conflict(409, "zero_amount");
      }

      const [account] = await tx
        .select()
        .from(sellerPaymentAccounts)
        .where(
          and(
            eq(sellerPaymentAccounts.sellerId, order.sellerId),
            eq(sellerPaymentAccounts.status, "active"),
            eq(sellerPaymentAccounts.provider, runtime.provider.name),
          ),
        )
        .for("share")
        .limit(1);
      if (!account) {
        return conflict(409, "seller_payment_unavailable");
      }

      const now = new Date();
      const [created] = await tx
        .insert(payments)
        .values({
          orderId,
          sellerAccountId: account.id,
          provider: runtime.provider.name,
          status: "pending",
          amountKopecks: lockedOrder.totalKopecks,
          currency: "RUB",
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!created) {
        throw new Error("payment insert returned no row");
      }

      return { kind: "inserted", row: created, account };
    });
  } catch (error) {
    const raced = await resolveInsertRace(error, orderId, idempotencyKey, runtime.provider.name);
    if (!raced) {
      throw error;
    }
    plan = raced;
  }

  if (plan.kind === "conflict") {
    return { ok: false, status: plan.status, error: plan.error };
  }
  if (plan.kind === "replay") {
    return { ok: true, value: { payment: toOrderPayment(plan.row), created: false } };
  }

  const account =
    plan.kind === "inserted"
      ? plan.account
      : plan.kind === "retry" && plan.account
        ? plan.account
        : await loadProviderAccount(db, plan.row.sellerAccountId);

  if (!account) {
    await markPaymentFailed(plan.row.id);
    return { ok: false, status: 409, error: "seller_payment_unavailable" };
  }

  const providerResult = await callProviderCreate(runtime, plan.row, account, log);
  if (!providerResult.ok) {
    return providerResult;
  }

  if (providerResult.value.status !== "pending") {
    // A create call that already returns a terminal status is not a normal
    // pending checkout; keep the provider id for ops but never expose a URL.
    return quarantineProviderCreateResult(plan.row.id, orderId, providerResult.value, log);
  }

  const saved = await saveProviderResult(
    plan.row.id,
    orderId,
    providerResult.value,
    runtime,
    account,
    log,
  );
  if (!saved.ok) {
    return saved;
  }

  return {
    ok: true,
    value: { payment: toOrderPayment(saved.value), created: plan.kind === "inserted" },
  };
}

async function resolveInsertRace(
  error: unknown,
  orderId: number,
  idempotencyKey: string,
  providerName: string,
): Promise<CreatePlan | null> {
  if (isUniqueViolation(error, "payments_order_id_idempotency_key_unique")) {
    const [row] = await requireDb()
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (!row) {
      return null;
    }
    if (row.status === "failed" && !row.providerPaymentId) {
      return requireDb().transaction((tx) => retryFailedPlan(tx, orderId, row, providerName));
    }
    return replayPlan(row);
  }

  if (isUniqueViolation(error, "payments_order_id_active_unique")) {
    const [active] = await requireDb()
      .select({ status: payments.status })
      .from(payments)
      .where(
        and(eq(payments.orderId, orderId), inArray(payments.status, ["pending", "manual_review"])),
      )
      .limit(1);
    return conflict(
      409,
      active?.status === "manual_review" ? "payment_requires_review" : "payment_in_progress",
    );
  }

  return null;
}

type ProviderCallResult =
  | { ok: true; value: CreateProviderPaymentResult }
  | { ok: false; status: 409 | 502; error: PaymentErrorCode };

async function callProviderCreate(
  runtime: PaymentsRuntime,
  payment: PaymentRow,
  account: SellerAccountRow,
  log: PaymentsLogger,
): Promise<ProviderCallResult> {
  let token: string;
  try {
    token = decryptAccountToken(runtime, account);
  } catch {
    await markAccountError(requireDb(), account.id, new Date());
    await markPaymentFailed(payment.id);
    log.warn(
      { code: "payment_token_unavailable", payment_id: payment.id, order_id: payment.orderId },
      "payment provider token unavailable",
    );
    return { ok: false, status: 409, error: "seller_payment_unavailable" };
  }

  try {
    const result = await withProviderTimeout(
      runtime.provider.createPayment(token, {
        amountKopecks: payment.amountKopecks,
        currency: "RUB",
        orderId: payment.orderId,
        paymentId: payment.id,
        idempotencyKey: payment.idempotencyKey,
        returnUrl: `${runtime.webOrigin}/orders/${payment.orderId}?payment=return`,
        capture: true,
      }),
      runtime.providerTimeoutMs,
    );
    return { ok: true, value: result };
  } catch (error) {
    return handleProviderCreateError(error, payment, account, log);
  }
}

async function handleProviderCreateError(
  error: unknown,
  payment: PaymentRow,
  account: SellerAccountRow,
  log: PaymentsLogger,
): Promise<ProviderCallResult> {
  const db = requireDb();
  const code = error instanceof PaymentProviderError ? error.code : "provider_error";
  const fields = { code, payment_id: payment.id, order_id: payment.orderId };

  if (code === "unauthorized" || code === "test_account_forbidden") {
    await markAccountError(db, account.id, new Date());
    await markPaymentFailed(payment.id);
    log.warn(fields, "payment account rejected by provider");
    return { ok: false, status: 409, error: "seller_payment_unavailable" };
  }

  if (code === "disabled") {
    await markPaymentFailed(payment.id);
    log.warn(fields, "payment provider disabled");
    return { ok: false, status: 409, error: "seller_payment_unavailable" };
  }

  if (code === "invalid_request" || code === "not_found") {
    await markPaymentFailed(payment.id);
    log.warn(fields, "payment provider rejected the payment");
    return { ok: false, status: 502, error: "provider_unavailable" };
  }

  // 5xx/timeout: the outcome is unknown. Keep the row pending so the same
  // key can retry with the same provider idempotency key; a new key gets 409
  // until reconcile turns the orphan into manual_review.
  await markPaymentPending(payment.id);
  log.warn(fields, "payment provider unavailable");
  return { ok: false, status: 502, error: "provider_unavailable" };
}

async function markPaymentFailed(paymentId: number): Promise<void> {
  await requireDb()
    .update(payments)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(payments.id, paymentId), inArray(payments.status, ["pending", "failed"])));
}

async function markPaymentPending(paymentId: number): Promise<void> {
  await requireDb()
    .update(payments)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "failed")));
}

/**
 * Saves the provider id and URL only after re-reading the payment and order
 * under the order lock. A paid order, a foreign status or another active
 * attempt means the URL must not reach the buyer: the attempt is failed and
 * the provider payment is cancelled best effort.
 */
async function saveProviderResult(
  paymentId: number,
  orderId: number,
  result: CreateProviderPaymentResult,
  runtime: PaymentsRuntime,
  account: SellerAccountRow,
  log: PaymentsLogger,
): Promise<PaymentServiceResult<PaymentRow>> {
  type SaveOutcome =
    { kind: "saved"; row: PaymentRow } | { kind: "rejected"; error: PaymentErrorCode };

  let outcome: SaveOutcome;
  try {
    outcome = await requireDb().transaction(async (tx): Promise<SaveOutcome> => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`,
      );

      const [row] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for("update");
      if (!row) {
        throw new Error("payment row disappeared before the provider result was saved");
      }

      const retryingFailed = row.status === "failed" && row.providerPaymentId === null;
      if (row.status !== "pending" && !retryingFailed) {
        log.warn(
          {
            code: "payment_create_race",
            payment_id: paymentId,
            order_id: orderId,
            status: row.status,
          },
          "payment row changed while the provider was creating it",
        );
        return {
          kind: "rejected",
          error:
            row.status === "manual_review" ? "payment_requires_review" : "invalid_order_transition",
        };
      }

      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!order) {
        throw new Error("order disappeared before the provider result was saved");
      }

      if (order.status !== "new" && order.status !== "payment_pending") {
        await failAttemptRow(tx, row, new Date());
        return {
          kind: "rejected",
          error: order.status === "paid" ? "order_already_paid" : "invalid_order_transition",
        };
      }

      const [other] = await tx
        .select({ status: payments.status })
        .from(payments)
        .where(
          and(
            eq(payments.orderId, orderId),
            ne(payments.id, paymentId),
            inArray(payments.status, ["pending", "manual_review"]),
          ),
        )
        .limit(1);
      if (other) {
        await failAttemptRow(tx, row, new Date());
        return {
          kind: "rejected",
          error:
            other.status === "manual_review" ? "payment_requires_review" : "payment_in_progress",
        };
      }

      const now = new Date();
      const [updated] = await tx
        .update(payments)
        .set({
          status: "pending",
          providerPaymentId: result.providerPaymentId,
          confirmationUrl: result.confirmationUrl,
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId))
        .returning();
      if (!updated) {
        throw new Error("payment update returned no row");
      }

      await tx
        .update(orders)
        .set({ status: "payment_pending", updatedAt: now })
        .where(and(eq(orders.id, orderId), eq(orders.status, "new")));

      return { kind: "saved", row: updated };
    });
  } catch (error) {
    if (isUniqueViolation(error, "payments_order_id_active_unique")) {
      await markPaymentFailedAndClear(paymentId);
      await cancelCreatedProviderPayment(runtime, account, result.providerPaymentId, log);
      log.warn(
        { code: "payment_create_race", payment_id: paymentId, order_id: orderId },
        "another active payment won the unique constraint",
      );
      return { ok: false, status: 409, error: "payment_in_progress" };
    }
    if (isUniqueViolation(error, "payments_provider_payment_id_unique")) {
      // The provider payment id belongs to another local payment. It may be a
      // valid charge, so cancelling it could cancel somebody else's payment.
      await markPaymentFailedAndClear(paymentId);
      log.warn(
        { code: "payment_provider_id_conflict", payment_id: paymentId, order_id: orderId },
        "provider payment id is already linked to another payment",
      );
      return { ok: false, status: 409, error: "payment_in_progress" };
    }
    throw error;
  }

  if (outcome.kind === "rejected") {
    await cancelCreatedProviderPayment(runtime, account, result.providerPaymentId, log);
    return { ok: false, status: 409, error: outcome.error };
  }

  return { ok: true, value: outcome.row };
}

async function quarantineProviderCreateResult(
  paymentId: number,
  orderId: number,
  result: CreateProviderPaymentResult,
  log: PaymentsLogger,
): Promise<{ ok: false; status: 409; error: PaymentErrorCode }> {
  try {
    await requireDb().transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`,
      );

      const [row] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for("update");
      if (!row) {
        throw new Error("payment row disappeared before the provider status was quarantined");
      }
      const retryable =
        row.status === "pending" || (row.status === "failed" && row.providerPaymentId === null);
      if (!retryable) {
        return;
      }

      const now = new Date();
      const [updated] = await tx
        .update(payments)
        .set({
          status: "manual_review",
          providerPaymentId: result.providerPaymentId,
          confirmationUrl: null,
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId))
        .returning();
      if (!updated) {
        throw new Error("payment quarantine update returned no row");
      }

      log.warn(
        {
          code: "payment_provider_unexpected_status",
          payment_id: paymentId,
          order_id: orderId,
          status: result.status,
        },
        "provider create returned a terminal status; payment moved to manual review",
      );
    });
  } catch (error) {
    if (
      isUniqueViolation(error, "payments_order_id_active_unique") ||
      isUniqueViolation(error, "payments_provider_payment_id_unique")
    ) {
      await markPaymentFailedAndClear(paymentId);
      log.warn(
        {
          code: isUniqueViolation(error, "payments_provider_payment_id_unique")
            ? "payment_provider_id_conflict"
            : "payment_create_race",
          payment_id: paymentId,
          order_id: orderId,
        },
        "payment could not be quarantined because of a unique conflict",
      );
      return { ok: false, status: 409, error: "payment_in_progress" };
    }
    throw error;
  }

  return { ok: false, status: 409, error: "payment_requires_review" };
}

async function failAttemptRow(tx: Transaction, row: PaymentRow, now: Date): Promise<void> {
  if (row.status !== "pending" && row.status !== "failed") {
    return;
  }
  await tx
    .update(payments)
    .set({ status: "failed", confirmationUrl: null, updatedAt: now })
    .where(and(eq(payments.id, row.id), inArray(payments.status, ["pending", "failed"])));
}

async function markPaymentFailedAndClear(paymentId: number): Promise<void> {
  await requireDb()
    .update(payments)
    .set({
      status: "failed",
      confirmationUrl: null,
      providerPaymentId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(payments.id, paymentId), inArray(payments.status, ["pending", "failed"])));
}

async function cancelCreatedProviderPayment(
  runtime: PaymentsRuntime,
  account: SellerAccountRow,
  providerPaymentId: string,
  log: PaymentsLogger,
): Promise<void> {
  let token: string;
  try {
    token = decryptAccountToken(runtime, account);
  } catch {
    log.warn({ code: "payment_token_unavailable" }, "provider payment could not be cancelled");
    return;
  }

  try {
    await withProviderTimeout(
      runtime.provider.cancelPayment(token, providerPaymentId),
      runtime.providerTimeoutMs,
    );
  } catch (error) {
    log.warn(
      { code: error instanceof PaymentProviderError ? error.code : "payment_cancel_failed" },
      "provider payment cancellation failed",
    );
  }
}

/**
 * Active payment (`pending`/`manual_review`) wins; otherwise the latest
 * terminal attempt is shown. `null` means the order has no payment yet.
 */
export async function findCurrentPayment(orderId: number): Promise<PaymentRow | null> {
  const db = requireDb();
  const [active] = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.orderId, orderId), inArray(payments.status, ["pending", "manual_review"])),
    )
    .limit(1);
  if (active) {
    return active;
  }

  const [latest] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(1);
  return latest ?? null;
}

export type OrderPaymentLookup = { found: false } | { found: true; payment: OrderPayment | null };

export async function getBuyerOrderPayment(
  userId: number,
  orderId: number,
): Promise<OrderPaymentLookup> {
  const [order] = await requireDb()
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.buyerUserId, userId)))
    .limit(1);
  if (!order) {
    return { found: false };
  }

  const row = await findCurrentPayment(orderId);
  return { found: true, payment: row ? toOrderPayment(row) : null };
}

export async function getSellerOrderPayment(
  userId: number,
  orderId: number,
): Promise<OrderPaymentLookup> {
  const [order] = await requireDb()
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .innerJoin(sellers, eq(shops.sellerId, sellers.id))
    .where(and(eq(orders.id, orderId), eq(sellers.userId, userId)))
    .limit(1);
  if (!order) {
    return { found: false };
  }

  const row = await findCurrentPayment(orderId);
  return { found: true, payment: row ? toSellerOrderPayment(row) : null };
}
