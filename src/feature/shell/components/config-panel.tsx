"use client";

import { Button, Field, FieldLabel, Separator, Textarea, TypographyLarge } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { SettingsToggles } from "@/feature/settings";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function ConfigPanel() {
  const { t } = useTranslation();
  const section = useWorkspaceStore((s) => s.section);

  return (
    <aside style={{ height: "100%", overflowY: "auto", padding: "1rem", display: "grid", gap: "1rem", alignContent: "start" }}>
      <TypographyLarge>{t(`config.${section}.title`)}</TypographyLarge>
      <Field>
        <FieldLabel>{t("config.prompt")}</FieldLabel>
        <Textarea rows={5} placeholder={t(`config.${section}.promptPlaceholder`)} />
      </Field>
      <Button disabled>{t("config.generate")}</Button>
      <Separator />
      <TypographyLarge>{t("config.preferences")}</TypographyLarge>
      <SettingsToggles />
    </aside>
  );
}
