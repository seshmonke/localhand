import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Seller OAuth `state` is a signed, self-contained token: the callback runs on
 * the same API process but must not trust a value that a browser can replay or
 * forge. Format: `base64url(payload).base64url(hmac)`.
 */
export const PAYMENT_STATE_TTL_MS = 10 * 60 * 1000;
const STATE_VERSION = 1;
const MAX_CLOCK_SKEW_MS = 30 * 1000;

type PaymentStatePayload = {
  v: number;
  sellerId: number;
  issuedAt: number;
};

export type VerifiedPaymentState = {
  sellerId: number;
};

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signPaymentState(secret: string, sellerId: number, now = Date.now()): string {
  if (!Number.isSafeInteger(sellerId) || sellerId <= 0) {
    throw new Error("sellerId must be a positive integer");
  }

  const payload: PaymentStatePayload = { v: STATE_VERSION, sellerId, issuedAt: now };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(secret, encoded)}`;
}

/**
 * Returns the seller id for a valid, unexpired state and `null` otherwise. A
 * wrong HMAC, a malformed payload and an expired state are indistinguishable
 * to the caller: the callback answers one generic 400.
 */
export function verifyPaymentState(
  secret: string,
  state: string,
  now = Date.now(),
): VerifiedPaymentState | null {
  const parts = state.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encoded, signature] = parts;
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(secret, encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") {
    return null;
  }

  const { v, sellerId, issuedAt } = parsed as Record<string, unknown>;
  if (
    v !== STATE_VERSION ||
    typeof sellerId !== "number" ||
    !Number.isSafeInteger(sellerId) ||
    sellerId <= 0 ||
    typeof issuedAt !== "number" ||
    !Number.isSafeInteger(issuedAt)
  ) {
    return null;
  }

  const age = now - issuedAt;
  if (age < -MAX_CLOCK_SKEW_MS || age > PAYMENT_STATE_TTL_MS) {
    return null;
  }

  return { sellerId };
}
