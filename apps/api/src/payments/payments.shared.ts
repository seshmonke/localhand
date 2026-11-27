import type { OrderPayment, SellerPaymentAccount } from "@localhand/shared";
import type { FastifyBaseLogger } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { payments, sellerPaymentAccounts } from "../db/schema.js";
import type { PaymentsRuntime } from "./context.js";
import { PaymentProviderError } from "./errors.js";

export const PAYMENT_PROVIDER_TIMEOUT_MS = 10_000;

export type Database = ReturnType<typeof requireDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type QueryExecutor = Pick<Database, "select" | "insert" | "update" | "execute">;
export type PaymentRow = typeof payments.$inferSelect;
export type SellerAccountRow = typeof sellerPaymentAccounts.$inferSelect;
export type PaymentsLogger = Pick<FastifyBaseLogger, "info" | "warn" | "error">;

/**
 * Maps a stored payment to the public contract. A confirmation URL is exposed
 * only while the payment is pending, so a terminal row can never leak a stale
 * provider link.
 */
export function toOrderPayment(row: PaymentRow): OrderPayment {
  return {
    id: row.id,
    status: row.status,
    amountKopecks: row.amountKopecks,
    currency: "RUB",
    confirmationUrl: row.status === "pending" ? row.confirmationUrl : null,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}

/** Seller namespace: status and amount without the buyer's payment URL. */
export function toSellerOrderPayment(row: PaymentRow): OrderPayment {
  return { ...toOrderPayment(row), confirmationUrl: null };
}

/**
 * The seller sees only a masked provider account id. The last four characters
 * are enough to tell two accounts apart without exposing the full identifier.
 */
export function maskAccountId(accountId: string): string {
  if (accountId.length <= 4) {
    return "****";
  }
  return `****${accountId.slice(-4)}`;
}

export function toSellerPaymentAccount(row: SellerAccountRow): SellerPaymentAccount {
  return {
    id: row.id,
    provider: row.provider as SellerPaymentAccount["provider"],
    providerAccountId: maskAccountId(row.providerAccountId),
    isTest: row.isTest,
    status: row.status as SellerPaymentAccount["status"],
    expiresAt: row.expiresAt?.toISOString() ?? null,
    connectedAt: row.connectedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function withProviderTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PaymentProviderError("provider_unavailable"));
    }, timeoutMs);
    timer.unref?.();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current !== null && current !== undefined; depth += 1) {
    if (typeof current !== "object") {
      return false;
    }

    const { code, constraint: violated } = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (code === "23505" && violated === constraint) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export function isProviderError(error: unknown, code: string): boolean {
  return error instanceof PaymentProviderError && error.code === code;
}

/**
 * Picks the account version whose token must be used. Payments keep a link to
 * the version that created them; after a reconnect an old pending payment
 * must use the newer active version of the same provider account, otherwise
 * the retained superseded token would be the only option.
 */
export async function loadProviderAccount(
  executor: QueryExecutor,
  accountId: number,
): Promise<SellerAccountRow | null> {
  const [account] = await executor
    .select()
    .from(sellerPaymentAccounts)
    .where(eq(sellerPaymentAccounts.id, accountId))
    .limit(1);
  if (!account) {
    return null;
  }

  const [active] = await executor
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
    .orderBy(desc(sellerPaymentAccounts.id))
    .limit(1);

  return active ?? account;
}

/** Latest visible account version: active wins, otherwise the last error/disabled. */
export async function loadCurrentSellerAccount(sellerId: number): Promise<SellerAccountRow | null> {
  const db = requireDb();
  const [active] = await db
    .select()
    .from(sellerPaymentAccounts)
    .where(
      and(eq(sellerPaymentAccounts.sellerId, sellerId), eq(sellerPaymentAccounts.status, "active")),
    )
    .limit(1);
  if (active) {
    return active;
  }

  const [previous] = await db
    .select()
    .from(sellerPaymentAccounts)
    .where(
      and(
        eq(sellerPaymentAccounts.sellerId, sellerId),
        inArray(sellerPaymentAccounts.status, ["error", "disabled"]),
      ),
    )
    .orderBy(desc(sellerPaymentAccounts.connectedAt), desc(sellerPaymentAccounts.id))
    .limit(1);
  return previous ?? null;
}

export async function markAccountError(
  executor: QueryExecutor,
  accountId: number,
  now: Date,
): Promise<void> {
  await executor
    .update(sellerPaymentAccounts)
    .set({ status: "error", updatedAt: now })
    .where(
      and(eq(sellerPaymentAccounts.id, accountId), eq(sellerPaymentAccounts.status, "active")),
    );
}

export function decryptAccountToken(runtime: PaymentsRuntime, account: SellerAccountRow): string {
  return runtime.cipher.decrypt(account.tokenCiphertext);
}
