import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  DELIVERY_QUOTE_TTL_SECONDS,
  DeliveryQuoteTokenPayloadSchema,
  type DeliveryQuoteTokenPayload,
} from "@localhand/shared";

export type QuoteTokenPayload = DeliveryQuoteTokenPayload;

/**
 * Product ids are canonicalized (sorted, unique) before hashing: the cart
 * order must not change the signed quote.
 */
export function hashProductIds(productIds: number[]): string {
  const canonical = [...new Set(productIds)].sort((left, right) => left - right).join(",");
  return createHash("sha256").update(canonical).digest("hex");
}

function canonicalPayload(payload: QuoteTokenPayload): string {
  return JSON.stringify({
    v: payload.v,
    productHash: payload.productHash,
    cityCode: payload.cityCode,
    pointCode: payload.pointCode,
    exp: payload.exp,
    shops: payload.shops.map((shop) => ({
      shopId: shop.shopId,
      tariffCode: shop.tariffCode,
      tariffName: shop.tariffName,
      priceKopecks: shop.priceKopecks,
      periodMin: shop.periodMin,
      periodMax: shop.periodMax,
    })),
  });
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function nowSeconds(now: Date): number {
  return Math.floor(now.getTime() / 1000);
}

function hasValidLifetime(exp: number, now: Date): boolean {
  const current = nowSeconds(now);
  return exp > current && exp <= current + DELIVERY_QUOTE_TTL_SECONDS;
}

export function createQuoteToken(
  payload: QuoteTokenPayload,
  secret: string,
  now: Date = new Date(),
): string {
  const parsed = DeliveryQuoteTokenPayloadSchema.parse(payload);
  if (!hasValidLifetime(parsed.exp, now)) {
    throw new Error("quote token expiry must be within the 10 minute TTL");
  }
  const body = Buffer.from(canonicalPayload(parsed), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyQuoteToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): QuoteTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [body, signature] = parts;
  if (!body || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(body, secret), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const parsed = DeliveryQuoteTokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return null;
  }
  if (!hasValidLifetime(parsed.data.exp, now)) {
    return null;
  }

  return parsed.data;
}
