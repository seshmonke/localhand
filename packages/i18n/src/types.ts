import type { ru } from "./resources/ru.js";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    keySeparator: false;
    returnNull: false;
    resources: {
      translation: typeof ru;
    };
  }
}
