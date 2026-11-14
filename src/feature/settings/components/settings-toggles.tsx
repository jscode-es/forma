"use client";

import { ToggleGroup, ToggleGroupItem } from "@kivora/nextjs";
import type { ColorMode } from "@kivora/theme";
import { useTranslation } from "react-i18next";
import { LOCALES, LOCALE_NAMES, type LocalePreference } from "@/lib/i18n";
import { useSettingsStore } from "@/stores/settings-store";

const THEMES: ColorMode[] = ["system", "light", "dark"];

export function LanguageToggle() {
  const { t } = useTranslation();
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);

  return (
    <ToggleGroup
      type="single"
      value={locale}
      onValueChange={(v) => v && setLocale(v as LocalePreference)}
      aria-label={t("settings.language")}
    >
      <ToggleGroupItem value="system">{t("settings.system")}</ToggleGroupItem>
      {LOCALES.map((l) => (
        <ToggleGroupItem key={l} value={l}>
          {LOCALE_NAMES[l]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(v) => v && setTheme(v as ColorMode)}
      aria-label={t("settings.theme")}
    >
      {THEMES.map((m) => (
        <ToggleGroupItem key={m} value={m}>
          {t(`settings.${m}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
