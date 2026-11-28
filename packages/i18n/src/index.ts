import i18next, { type i18n as I18nInstance, type InitOptions, type TFunction } from "i18next";
import { ru, type TranslationKey } from "./resources/ru.js";
import "./types.js";

export const defaultNS = "translation";
export const resources = { ru: { translation: ru } } as const;

/** Shared ru-only defaults. API/SMS consumers use the same options without React. */
export const initOptions = {
  lng: "ru",
  fallbackLng: "ru",
  supportedLngs: ["ru"],
  defaultNS,
  ns: [defaultNS],
  resources,
  keySeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
} satisfies InitOptions;

/** Create a fresh instance so a consumer (web react-i18next) can attach plugins before init. */
export function createI18nInstance(): I18nInstance {
  return i18next.createInstance();
}

export function initI18n(
  instance: I18nInstance = i18n,
  options: InitOptions = {},
): Promise<TFunction> {
  return instance.init({ ...initOptions, ...options });
}

export const i18n = createI18nInstance();
void initI18n();

/** Bound typed translate for non-React callers (API, SMS, shared labels in S4-4). */
export const t = i18n.t.bind(i18n) as TFunction;

export { ru };
export type { TranslationKey };
