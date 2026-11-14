import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ColorMode } from "@kivora/theme";
import type { LocalePreference } from "@/lib/i18n";

type SettingsState = {
  locale: LocalePreference;
  theme: ColorMode;
  setLocale: (locale: LocalePreference) => void;
  setTheme: (theme: ColorMode) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "system",
      theme: "system",
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "forma-settings",
      skipHydration: true,
      partialize: ({ locale, theme }) => ({ locale, theme }),
    },
  ),
);
