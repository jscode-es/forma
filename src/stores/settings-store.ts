import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ColorMode } from "@kivora/theme";
import type { LocalePreference } from "@/lib/i18n";

type SettingsState = {
  locale: LocalePreference;
  theme: ColorMode;
  sdxlStyle: string;
  setSdxlStyle: (style: string) => void;
  onboardingDone: boolean;
  hydrated: boolean;
  setOnboardingDone: (done: boolean) => void;
  setLocale: (locale: LocalePreference) => void;
  setTheme: (theme: ColorMode) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "system",
      theme: "system",
      sdxlStyle: "",
      setSdxlStyle: (sdxlStyle) => set({ sdxlStyle }),
      onboardingDone: false,
      hydrated: false,
      setOnboardingDone: (onboardingDone) => set({ onboardingDone }),
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "forma-settings",
      skipHydration: true,
      partialize: ({ locale, theme, onboardingDone, sdxlStyle }) => ({ locale, theme, onboardingDone, sdxlStyle }),
      onRehydrateStorage: () => () => useSettingsStore.setState({ hydrated: true }),
    },
  ),
);
