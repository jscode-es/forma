"use client";

import { Badge, Icon, ToggleGroup, ToggleGroupItem } from "@kivora/nextjs";
import { Box } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore, type ViewMode } from "@/stores/workspace-store";
import styles from "../shell.module.css";

export function Viewport() {
  const { t } = useTranslation();
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const setViewMode = useWorkspaceStore((s) => s.setViewMode);

  return (
    <div className={styles.panel}>
      <div className={styles.viewportHeader}>
        <span className={styles.viewportLabel}>
          <Icon icon={Box} size={16} />
          {t("viewport.preview")}
        </span>
        <span className={styles.divider} />
        <span className={styles.hint}>{t("scene.noModel")}</span>
        <span className={styles.spacer} />
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as ViewMode)}
          aria-label={t("viewport.mode")}
        >
          <ToggleGroupItem value="solid" size="sm">{t("viewport.solid")}</ToggleGroupItem>
          <ToggleGroupItem value="wireframe" size="sm">{t("viewport.wireframe")}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className={styles.viewportCanvas}>
        <Badge variant="outline" className={styles.viewportBadge}>
          {t("common.phase", { phase: 3 })}
        </Badge>
        <div className={styles.viewportEmpty}>
          <span className={styles.eyebrow}>{t("viewport.eyebrow")}</span>
          <span className={styles.viewportTitle}>{t("viewport.title")}</span>
          <span className={styles.hint}>{t("viewport.description")}</span>
        </div>
      </div>
    </div>
  );
}
