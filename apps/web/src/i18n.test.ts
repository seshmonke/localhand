import { describe, expect, it } from "vitest";
import { i18n } from "./i18n.js";

describe("web i18n", () => {
  it("uses the shared ru catalog through react-i18next", () => {
    expect(i18n.language).toBe("ru");
    expect(i18n.t("cart.item", { count: 2 })).toBe("товара");
  });
});
