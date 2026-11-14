"use client";

import { useEffect, useState, type ReactNode } from "react";
import { KivoraProvider } from "@kivora/nextjs";
import { restoreLastProject } from "@/feature/projects";
import { Splash } from "@/feature/shell";
import i18n, { resolveLocale } from "@/lib/i18n";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

const MIN_SPLASH_MS = 800;

export default function AppProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.all([
        (async () => {
          await Promise.all([useSettingsStore.persist.rehydrate(), useWorkspaceStore.persist.rehydrate()]);
          const languages = (await window.forma?.system.info())?.languages;
          if (!active) return;
          await i18n.changeLanguage(resolveLocale(useSettingsStore.getState().locale, languages));
          document.documentElement.lang = i18n.language;
          await restoreLastProject().catch(() => undefined);
        })(),
        new Promise((r) => setTimeout(r, MIN_SPLASH_MS)),
      ]);
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const apply = async () => {
      const languages = locale === "system" ? (await window.forma?.system.info())?.languages : undefined;
      if (!active) return;
      const lng = resolveLocale(locale, languages);
      await i18n.changeLanguage(lng);
      if (!active) return;
      document.documentElement.lang = lng;
    };
    void apply();
    const onLanguageChange = () => { void apply(); };
    if (locale === "system") window.addEventListener("languagechange", onLanguageChange);
    return () => {
      active = false;
      window.removeEventListener("languagechange", onLanguageChange);
    };
  }, [ready, locale]);

  return <KivoraProvider colorMode={theme}>{ready ? children : <Splash />}</KivoraProvider>;
}
