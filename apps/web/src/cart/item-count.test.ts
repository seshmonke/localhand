import { describe, expect, it } from "vitest";
import { pluralizeItems } from "./item-count.js";

describe("pluralizeItems", () => {
  it.each([
    [0, "0 товаров"],
    [1, "1 товар"],
    [2, "2 товара"],
    [4, "4 товара"],
    [5, "5 товаров"],
    [11, "11 товаров"],
    [21, "21 товар"],
    [22, "22 товара"],
    [25, "25 товаров"],
  ])("formats %i items as %s", (count, expected) => {
    expect(pluralizeItems(count)).toBe(expected);
  });
});
