/**
 * Single ru catalog for runtime copy.
 *
 * Keys are flat and use the `surface.key` shape. i18next runs with
 * `keySeparator: false`, so the whole key is looked up as-is. Plural forms
 * are the i18next suffixes `_one/_few/_many/_other` for ru.
 */
export const ru = {
  "common.greeting": "Здравствуйте, {{name}}",
  "cart.item": "товар",
  "cart.item_one": "товар",
  "cart.item_few": "товара",
  "cart.item_many": "товаров",
  "cart.item_other": "товара",
} as const;

export type TranslationKey = keyof typeof ru;
