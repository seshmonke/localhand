import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { orderTotalKopecks } from "./money.js";

const MAX = 1_000_000_000_000;

describe("orderTotalKopecks (property-based)", () => {
  it("always equals items + delivery and is not smaller than either part", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX }),
        fc.integer({ min: 0, max: MAX }),
        (items, delivery) => {
          const total = orderTotalKopecks(items, delivery);
          expect(total).toBe(items + delivery);
          expect(total).toBeGreaterThanOrEqual(items);
          expect(total).toBeGreaterThanOrEqual(delivery);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects negative and unsafe parts", () => {
    expect(() => orderTotalKopecks(-1, 0)).toThrow();
    expect(() => orderTotalKopecks(0, -1)).toThrow();
    expect(() => orderTotalKopecks(Number.MAX_SAFE_INTEGER, 1)).toThrow();
  });
});
