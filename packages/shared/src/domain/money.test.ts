import { describe, expect, it } from "vitest";
import { formatRubles, kopecks, rublesToKopecks } from "./money.js";

describe("money", () => {
  it("converts rubles to integer kopecks", () => {
    expect(rublesToKopecks(19.99)).toBe(1999);
    expect(rublesToKopecks(0)).toBe(0);
  });

  it("rejects fractional kopecks", () => {
    expect(() => kopecks(10.5)).toThrow();
  });

  it("formats kopecks as rubles", () => {
    expect(formatRubles(kopecks(199900))).toContain("1");
  });
});
