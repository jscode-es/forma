"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@kivora/nextjs";
import { ChevronRight, Folder, Plus, Save, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "@/stores/project-store";
import styles from "../shell.module.css";
import { BrandMark } from "./brand-mark";

export function TopBar({ onOpenInspector }: { onOpenInspector?: () => void }) {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.name);
  const dirty = useProjectStore((s) => s.dirty);
  const newProject = useProjectStore((s) => s.newProject);
  const [confirmNew, setConfirmNew] = useState(false);

  function handleNew() {
    if (dirty) setConfirmNew(true);
    else newProject();
  }

  return (
    <header className={styles.topBar}>
      <div className={styles.brand}>
        <BrandMark size={22} />
        <span>
          forma<span className={styles.brandDot}>.</span>
        </span>
      </div>
      <span className={styles.eyebrow}>{t("topBar.studio")}</span>
      <span className={styles.divider} />
      <nav className={styles.breadcrumb} aria-label={t("topBar.project")}>
        <Icon icon={Folder} size={15} />
        <span>{t("topBar.workspace")}</span>
        <Icon icon={ChevronRight} size={14} />
        <span className={styles.projectName}>{name ?? t("topBar.untitled")}</span>
        {dirty && <span className={styles.dirtyDot} role="status" aria-label={t("topBar.unsaved")} title={t("topBar.unsaved")} />}
      </nav>
      <span className={styles.spacer} />
      <div className={styles.actions}>
        {onOpenInspector && (
          <Button variant="ghost" size="sm" onClick={onOpenInspector}>
            <Icon icon={SlidersHorizontal} size={15} />
            {t("inspector.title")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleNew}>
          <Icon icon={Plus} size={15} />
          {t("topBar.new")}
        </Button>
        <Button variant="outline" size="sm" disabled title={t("common.availableIn", { phase: 2 })}>
          <Icon icon={Save} size={15} />
          {t("topBar.save")}
        </Button>
      </div>

      <Dialog open={confirmNew} onOpenChange={setConfirmNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("topBar.discardTitle")}</DialogTitle>
            <DialogDescription>{t("topBar.discardDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmNew(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                newProject();
                setConfirmNew(false);
              }}
            >
              {t("topBar.discard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
