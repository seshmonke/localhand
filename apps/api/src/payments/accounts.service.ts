import type { PaymentErrorCode, SellerPaymentAccount } from "@localhand/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { orders, payments, sellerPaymentAccounts, sellers, shops } from "../db/schema.js";
import type { PaymentsRuntime } from "./context.js";
import { PaymentProviderError } from "./errors.js";
import {
  decryptAccountToken,
  loadCurrentSellerAccount,
  toSellerPaymentAccount,
  type PaymentsLogger,
} from "./payments.shared.js";
import { assertPaymentAccountAllowed, type PaymentAccountInfo } from "./provider.js";
import { signPaymentState } from "./state.js";

export type SellerPaymentsResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409 | 502; error: PaymentErrorCode };

export async function getSellerIdByUserId(userId: number): Promise<number | null> {
  const [seller] = await requireDb()
    .select({ id: sellers.id })
    .from(sellers)
    .where(eq(sellers.userId, userId))
    .limit(1);
  return seller?.id ?? null;
}

export async function startSellerPaymentConnection(
  sellerId: number,
  runtime: PaymentsRuntime,
  log: PaymentsLogger,
): Promise<SellerPaymentsResult<{ consentUrl: string }>> {
  const state = signPaymentState(runtime.settings.stateSecret, sellerId);

  try {
    const { consentUrl } = await runtime.provider.createConnection(state);
    return { ok: true, value: { consentUrl } };
  } catch (error) {
    log.warn({ code: providerErrorCode(error) }, "payment connect start failed");
    return { ok: false, status: 502, error: "provider_unavailable" };
  }
}

type CompleteConnectionInput = {
  sellerId: number;
  code: string;
  runtime: PaymentsRuntime;
  log: PaymentsLogger;
};

/**
 * Completes the OAuth exchange. The new version is `active` only after the
 * exchange, the live/test guard and the webhook subscription all succeed; a
 * failed subscription writes an `error` row and leaves the existing active
 * version untouched, so its pending payments keep working.
 */
export async function completeSellerPaymentConnection(
  input: CompleteConnectionInput,
): Promise<SellerPaymentsResult<SellerPaymentAccount>> {
  const { sellerId, code, runtime, log } = input;

  let exchange: Awaited<ReturnType<PaymentsRuntime["provider"]["exchangeCode"]>>;
  try {
    exchange = await runtime.provider.exchangeCode(code);
  } catch (error) {
    log.warn({ code: providerErrorCode(error) }, "payment code exchange failed");
    return {
      ok: false,
      status: isInvalidRequest(error) ? 400 : 502,
      error: isInvalidRequest(error) ? "invalid_request" : "provider_unavailable",
    };
  }

  let info: PaymentAccountInfo;
  try {
    info = await runtime.provider.getAccountInfo(exchange.accessToken);
  } catch (error) {
    log.warn({ code: providerErrorCode(error) }, "payment account lookup failed");
    return { ok: false, status: 502, error: "provider_unavailable" };
  }

  const tokenCiphertext = runtime.cipher.encrypt(exchange.accessToken);
  const version = {
    sellerId,
    provider: runtime.provider.name,
    providerAccountId: info.accountId,
    isTest: info.isTest,
    tokenCiphertext,
    tokenKeyVersion: runtime.cipher.currentVersion,
    expiresAt: exchange.expiresAt ?? null,
  };

  try {
    assertPaymentAccountAllowed(runtime.settings.environment, info);
  } catch (error) {
    await insertErrorAccount(version);
    log.warn({ code: providerErrorCode(error) }, "payment account rejected for environment");
    return { ok: false, status: 403, error: "invalid_request" };
  }

  try {
    await runtime.provider.subscribeWebhooks(exchange.accessToken, runtime.webhookUrl);
  } catch (error) {
    await insertErrorAccount(version);
    log.warn({ code: providerErrorCode(error) }, "payment webhook subscription failed");
    return { ok: false, status: 502, error: "provider_unavailable" };
  }

  const db = requireDb();
  const row = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`seller-payments:${sellerId}`}, 0))`,
    );

    const now = new Date();
    await tx
      .update(sellerPaymentAccounts)
      .set({ status: "superseded", updatedAt: now })
      .where(
        and(
          eq(sellerPaymentAccounts.sellerId, sellerId),
          eq(sellerPaymentAccounts.status, "active"),
        ),
      );

    const [created] = await tx
      .insert(sellerPaymentAccounts)
      .values({ ...version, status: "active", connectedAt: now, updatedAt: now })
      .returning();

    if (!created) {
      throw new Error("payment account insert returned no row");
    }
    return created;
  });

  return { ok: true, value: toSellerPaymentAccount(row) };
}

async function insertErrorAccount(version: {
  sellerId: number;
  provider: string;
  providerAccountId: string;
  isTest: boolean;
  tokenCiphertext: Buffer;
  tokenKeyVersion: number;
  expiresAt: Date | null;
}): Promise<void> {
  const now = new Date();
  await requireDb()
    .insert(sellerPaymentAccounts)
    .values({
      ...version,
      status: "error",
      connectedAt: now,
      updatedAt: now,
    });
}

export async function getSellerPaymentAccount(
  userId: number,
): Promise<SellerPaymentAccount | null> {
  const sellerId = await getSellerIdByUserId(userId);
  if (sellerId === null) {
    return null;
  }
  const row = await loadCurrentSellerAccount(sellerId);
  return row ? toSellerPaymentAccount(row) : null;
}

/**
 * Disables the current account version. The token stays in the database for
 * late webhooks and reconcile; provider unsubscribe/revoke are best effort and
 * must not keep the seller connected if the provider is unreachable.
 */
export async function disconnectSellerPaymentAccount(
  userId: number,
  runtime: PaymentsRuntime,
  log: PaymentsLogger,
): Promise<SellerPaymentsResult<SellerPaymentAccount>> {
  const sellerId = await getSellerIdByUserId(userId);
  if (sellerId === null) {
    return { ok: false, status: 404, error: "not_found" };
  }

  const db = requireDb();
  const [activePayment] = await db
    .select({ status: payments.status })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .where(
      and(eq(shops.sellerId, sellerId), inArray(payments.status, ["pending", "manual_review"])),
    )
    .limit(1);

  if (activePayment) {
    return {
      ok: false,
      status: 409,
      error:
        activePayment.status === "manual_review"
          ? "payment_requires_review"
          : "payment_in_progress",
    };
  }

  const current = await loadCurrentSellerAccount(sellerId);
  if (!current) {
    return { ok: false, status: 404, error: "not_found" };
  }

  const now = new Date();
  let updated = current;
  if (current.status !== "disabled") {
    const [row] = await db
      .update(sellerPaymentAccounts)
      .set({ status: "disabled", updatedAt: now })
      .where(eq(sellerPaymentAccounts.id, current.id))
      .returning();
    if (row) {
      updated = row;
    }
  }

  if (current.status !== "disabled") {
    try {
      const token = decryptAccountToken(runtime, current);
      try {
        await runtime.provider.unsubscribeWebhooks(token);
      } catch (error) {
        log.warn({ code: providerErrorCode(error) }, "payment webhook unsubscribe failed");
      }
      try {
        await runtime.provider.revoke(token);
      } catch (error) {
        log.warn({ code: providerErrorCode(error) }, "payment token revoke failed");
      }
    } catch {
      log.warn({ code: "payment_token_unavailable" }, "payment token could not be decrypted");
    }
  }

  return { ok: true, value: toSellerPaymentAccount(updated) };
}

function providerErrorCode(error: unknown): string {
  return error instanceof PaymentProviderError ? error.code : "provider_error";
}

function isInvalidRequest(error: unknown): boolean {
  return error instanceof PaymentProviderError && error.code === "invalid_request";
}
