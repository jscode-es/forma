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
          await restoreLastProject().catch(() => undefined);
          await i18n.changeLanguage(resolveLocale(useSettingsStore.getState().locale));
          document.documentElement.lang = i18n.language;
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

  return <KivoraProvider colorMode={theme}>{ready ? children : <Splash />}</KivoraProvider>;
}
