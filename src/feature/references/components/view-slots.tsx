"use client";

import { useTranslation } from "react-i18next";
import { REFERENCE_VIEWS } from "@/stores/project-store";
import { ReferenceSlot } from "./reference-panel";
import styles from "../references.module.css";

export function ViewSlots() {
  const { t } = useTranslation();
  return <div className={styles.list}>
    <div className={styles.viewGrid} role="group" aria-label={t("references.gridLabel")}>
      {REFERENCE_VIEWS.map((view) => <ReferenceSlot key={view} view={view} />)}
    </div>
    <span className={styles.hint}>{t("references.dropHint")}</span>
  </div>;
}
