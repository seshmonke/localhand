import { describe, expect, it } from "vitest";
import {
  createQuoteToken,
  hashProductIds,
  verifyQuoteToken,
  type QuoteTokenPayload,
} from "./quote-token.js";

const SECRET = "d3LvR8sQ1nX6pK4mT9wY2cB7hJ5fG0zA";
const NOW = new Date("2026-11-27T16:00:00.000Z");

function payload(overrides: Partial<QuoteTokenPayload> = {}): QuoteTokenPayload {
  return {
    v: 1,
    productHash: hashProductIds([10, 2, 7]),
    cityCode: 44,
    pointCode: "MSK123",
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    shops: [
      {
        shopId: 7,
        tariffCode: "136",
        tariffName: "Посылка склад-ПВЗ",
        priceKopecks: 35_000,
        periodMin: 2,
        periodMax: 4,
      },
      {
        shopId: 8,
        tariffCode: "137",
        tariffName: "Посылка склад-ПВЗ",
        priceKopecks: 41_000,
        periodMin: 3,
        periodMax: 5,
      },
    ],
    ...overrides,
  };
}

describe("hashProductIds", () => {
  it("is order-insensitive and duplicate-insensitive", () => {
    expect(hashProductIds([2, 10, 7])).toBe(hashProductIds([10, 7, 2, 10]));
    expect(hashProductIds([1])).not.toBe(hashProductIds([2]));
  });
});

describe("quote token", () => {
  it("round-trips the signed per-shop payload", () => {
    const token = createQuoteToken(payload(), SECRET);
    expect(verifyQuoteToken(token, SECRET, NOW)).toEqual(payload());
  });

  it("rejects a tampered price or shop", () => {
    const token = createQuoteToken(payload(), SECRET);
    const [body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body ?? "", "base64url").toString("utf8")) as ReturnType<
      typeof payload
    >;
    decoded.shops[0]!.priceKopecks = 1;
    const tamperedBody = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

    expect(verifyQuoteToken(`${tamperedBody}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createQuoteToken(payload({ exp: Math.floor(NOW.getTime() / 1000) - 1 }), SECRET);
    expect(verifyQuoteToken(token, SECRET, NOW)).toBeNull();
  });

  it("rejects another secret and malformed tokens", () => {
    const token = createQuoteToken(payload(), SECRET);
    expect(verifyQuoteToken(token, `${SECRET}-other`, NOW)).toBeNull();
    expect(verifyQuoteToken("not-a-token", SECRET, NOW)).toBeNull();
    expect(verifyQuoteToken("", SECRET, NOW)).toBeNull();
  });

  it("refuses to sign a payload with an invalid shape", () => {
    expect(() => createQuoteToken({ ...payload(), shops: [] }, SECRET)).toThrow();
  });
});
