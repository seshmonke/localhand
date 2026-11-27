import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DELIVERY_QUOTE_TTL_SECONDS } from "@localhand/shared";
import { calculatePackaging } from "./packaging.js";
import { createQuoteToken, hashProductIds, verifyQuoteToken } from "./quote-token.js";

const NOW = new Date("2026-11-27T16:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const SECRET = "d3LvR8sQ1nX6pK4mT9wY2cB7hJ5fG0zA";

const positiveCm = fc.integer({ min: 1, max: 300 });
const positiveG = fc.integer({ min: 1, max: 100_000 });

function tokenPayload(exp: number) {
  return {
    v: 1 as const,
    productHash: hashProductIds([1, 2]),
    cityCode: 44,
    cityName: "Москва",
    pointCode: "MSK001",
    pointAddress: "Москва, Тверская 1",
    exp,
    shops: [
      {
        shopId: 7,
        tariffCode: "136",
        tariffName: "Посылка",
        priceKopecks: 35_000,
        periodMin: 2,
        periodMax: 4,
      },
    ],
  };
}

describe("delivery packaging (property-based)", () => {
  it("never bills less than the actual or volumetric weight", () => {
    fc.assert(
      fc.property(positiveG, positiveCm, positiveCm, positiveCm, (weightG, l, w, h) => {
        const packaging = calculatePackaging([{ weightG, lengthCm: l, widthCm: w, heightCm: h }]);
        expect(packaging.weightG).toBeGreaterThanOrEqual(weightG);
        expect(packaging.weightG).toBeGreaterThanOrEqual(Math.ceil((l * w * h) / 5));
      }),
      { numRuns: 100 },
    );
  });

  it("never decreases when another parcel item is added", () => {
    fc.assert(
      fc.property(
        positiveG,
        positiveG,
        positiveCm,
        positiveCm,
        positiveCm,
        (firstG, secondG, l, w, h) => {
          const one = calculatePackaging([
            { weightG: firstG, lengthCm: l, widthCm: w, heightCm: h },
          ]);
          const two = calculatePackaging([
            { weightG: firstG, lengthCm: l, widthCm: w, heightCm: h },
            { weightG: secondG, lengthCm: l, widthCm: w, heightCm: h },
          ]);
          expect(two.weightG).toBeGreaterThanOrEqual(one.weightG);
          expect(two.lengthCm).toBeGreaterThanOrEqual(one.lengthCm);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("quote token (property-based)", () => {
  it("accepts every expiry inside the 10 minute window", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: DELIVERY_QUOTE_TTL_SECONDS }), (offset) => {
        const token = createQuoteToken(tokenPayload(NOW_SECONDS + offset), SECRET, NOW);
        expect(verifyQuoteToken(token, SECRET, NOW)).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("rejects every expiry outside the 10 minute window", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 1, max: 10_000 }).map((offset) => NOW_SECONDS - offset),
          fc
            .integer({ min: DELIVERY_QUOTE_TTL_SECONDS + 1, max: 10_000_000 })
            .map((offset) => NOW_SECONDS + offset),
        ),
        (exp) => {
          expect(() => createQuoteToken(tokenPayload(exp), SECRET, NOW)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects any tampered signature", () => {
    const token = createQuoteToken(tokenPayload(NOW_SECONDS + 60), SECRET, NOW);
    const [body, signature] = token.split(".");
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (suffix) => {
        expect(verifyQuoteToken(`${body}.${suffix}`, SECRET, NOW)).toBeNull();
        expect(verifyQuoteToken(`${body}.${signature}${suffix}`, SECRET, NOW)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
