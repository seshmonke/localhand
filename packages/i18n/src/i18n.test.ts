import { describe, expect, it } from "vitest";
import { i18n, t } from "./index.js";
import type { TranslationKey } from "./index.js";

describe("@localhand/i18n", () => {
  it("initializes the ru catalog synchronously", () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe("ru");
  });

  it("interpolates named values", () => {
    expect(t("common.greeting", { name: "Анна" })).toBe("Здравствуйте, Анна");
  });

  it("uses ru plural forms for counts", () => {
    expect(t("cart.item", { count: 1 })).toBe("товар");
    expect(t("cart.item", { count: 2 })).toBe("товара");
    expect(t("cart.item", { count: 5 })).toBe("товаров");
  });

  it("rejects unknown keys at the type level", () => {
    // @ts-expect-error unknown key is not part of TranslationKey
    expect("unknown.key" satisfies TranslationKey).toBe("unknown.key");
  });
});
