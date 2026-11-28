import { createI18nInstance, initI18n as initSharedI18n, initOptions } from "@localhand/i18n";
import { initReactI18next } from "react-i18next";

export const i18n = createI18nInstance();

/** Initialise the web instance with the shared ru catalog and react-i18next plugin. */
export const i18nReady = initSharedI18n(i18n.use(initReactI18next), initOptions);
