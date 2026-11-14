"use client";

import { useEffect, useState, type ReactNode } from "react";
import { KivoraProvider } from "@kivora/nextjs";
import i18n, { resolveLocale } from "@/lib/i18n";
import { useSettingsStore } from "@/stores/settings-store";

export default function AppProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    let active = true;
    (async () => {
      await useSettingsStore.persist.rehydrate();
      await i18n.changeLanguage(resolveLocale(useSettingsStore.getState().locale));
      document.documentElement.lang = i18n.language;
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const apply = () => {
      const lng = resolveLocale(locale);
      i18n.changeLanguage(lng);
      document.documentElement.lang = lng;
    };
    apply();
    if (locale !== "system") return;
    window.addEventListener("languagechange", apply);
    return () => window.removeEventListener("languagechange", apply);
  }, [ready, locale]);

  if (!ready) return null;

  return <KivoraProvider colorMode={theme}>{children}</KivoraProvider>;
}
