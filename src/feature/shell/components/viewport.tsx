"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function Viewport() {
  const { t } = useTranslation();
  const section = useWorkspaceStore((s) => s.section);

  return (
    <main style={{ height: "100%", display: "grid", placeContent: "center" }}>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t(`viewport.${section}.title`)}</EmptyTitle>
          <EmptyDescription>{t(`viewport.${section}.description`)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
