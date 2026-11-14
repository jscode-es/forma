"use client";

import { Button, Icon, Kbd } from "@kivora/nextjs";
import { ChevronRight, Folder, Plus, Save, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveProject, startNewProject, useProjectFlow } from "@/feature/projects";
import { usePaintStore } from "@/feature/paint";
import { useAnimationStore } from "@/feature/animation";
import { useProjectStore } from "@/stores/project-store";
import styles from "../shell.module.css";
import { BrandMark } from "./brand-mark";

export function TopBar({ onOpenInspector }: { onOpenInspector?: () => void }) {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.name);
  const dirty = useProjectStore((s) => s.dirty);
  const paintDirty = usePaintStore((s) => !!s.draft?.engine.dirty);
  const animationDirty = useAnimationStore((s) => s.dirty);
  const busy = useProjectFlow((s) => s.busy);

  return (
    <header className={styles.topBar}>
      <h1 className={styles.brand}>
        <BrandMark size={22} />
        <span>
          forma<span className={styles.brandDot}>.</span>
        </span>
      </h1>
      <span className={styles.eyebrow}>{t("topBar.studio")}</span>
      <span className={styles.divider} />
      <nav className={styles.breadcrumb} aria-label={t("topBar.project")}>
        <Icon icon={Folder} size={15} />
        <span>{t("topBar.workspace")}</span>
        <Icon icon={ChevronRight} size={14} />
        <span className={styles.projectName}>{name ?? t("topBar.untitled")}</span>
        {(dirty || paintDirty || animationDirty) && (
          <span className={styles.dirtyDot} role="status" aria-label={t("topBar.unsaved")} title={t("topBar.unsaved")} />
        )}
      </nav>
      <span className={styles.spacer} />
      <div className={styles.actions}>
        {onOpenInspector && (
          <Button variant="ghost" size="sm" onClick={onOpenInspector}>
            <Icon icon={SlidersHorizontal} size={15} />
            {t("inspector.title")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={startNewProject} disabled={busy}>
          <Icon icon={Plus} size={15} />
          {t("topBar.new")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveProject()}
          disabled={busy || !window.forma}
          title={`${t("topBar.save")} (Ctrl+S)`}
        >
          <Icon icon={Save} size={15} />
          {t("topBar.save")}
          <Kbd>Ctrl S</Kbd>
        </Button>
      </div>
    </header>
  );
}
