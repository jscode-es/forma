"use client";

import { Button, Icon, TypographyLarge } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { SECTIONS } from "../sections";

export function SideMenu() {
  const { t } = useTranslation();
  const section = useWorkspaceStore((s) => s.section);
  const setSection = useWorkspaceStore((s) => s.setSection);

  return (
    <nav style={{ height: "100%", padding: "1rem 0.75rem", display: "grid", gap: "1rem", alignContent: "start" }}>
      <TypographyLarge>Forma</TypographyLarge>
      <div style={{ display: "grid", gap: "0.25rem" }}>
        {SECTIONS.map(({ id, icon }) => (
          <Button
            key={id}
            variant={section === id ? "secondary" : "ghost"}
            onClick={() => setSection(id)}
            aria-current={section === id ? "page" : undefined}
            style={{ justifyContent: "flex-start", gap: "0.5rem" }}
          >
            <Icon icon={icon} size={16} />
            {t(`nav.${id}`)}
          </Button>
        ))}
      </div>
    </nav>
  );
}
