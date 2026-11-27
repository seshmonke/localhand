import { describe, expect, it } from "vitest";
import { calculatePackaging } from "./packaging.js";

describe("calculatePackaging", () => {
  it("sums weight, takes max dimensions and rounds volumetric grams up", () => {
    const packaging = calculatePackaging([
      { weightG: 500, lengthCm: 20, widthCm: 15, heightCm: 10 },
      { weightG: 300, lengthCm: 10, widthCm: 8, heightCm: 6 },
    ]);

    expect(packaging).toEqual({
      weightG: 800,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 10,
    });
  });

  it("uses volumetric weight when it is heavier than the actual weight", () => {
    // 21*14*11 = 3234 cm3 -> 3234/5 = 646.8 g -> ceil 647 g.
    const packaging = calculatePackaging([
      { weightG: 100, lengthCm: 21, widthCm: 14, heightCm: 11 },
    ]);

    expect(packaging.weightG).toBe(647);
  });

  it("keeps the actual weight when it is heavier", () => {
    const packaging = calculatePackaging([
      { weightG: 5000, lengthCm: 20, widthCm: 15, heightCm: 10 },
    ]);

    expect(packaging.weightG).toBe(5000);
  });

  it("rejects an empty package list and non-positive dimensions", () => {
    expect(() => calculatePackaging([])).toThrow();
    expect(() =>
      calculatePackaging([{ weightG: 0, lengthCm: 20, widthCm: 15, heightCm: 10 }]),
    ).toThrow();
    expect(() =>
      calculatePackaging([{ weightG: 500, lengthCm: 0, widthCm: 15, heightCm: 10 }]),
    ).toThrow();
  });
});
