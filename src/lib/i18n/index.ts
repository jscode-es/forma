import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export type LocalePreference = Locale | "system";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", es: "Español" };

export function detectLocale(languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages): Locale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split("-")[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return "en";
}

export function resolveLocale(pref: LocalePreference, languages?: readonly string[]): Locale {
  return pref === "system" ? detectLocale(languages) : pref;
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: "en",
  fallbackLng: "en",
  supportedLngs: LOCALES,
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
});

export default i18n;
