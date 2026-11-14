"use client";

import { Badge, Icon } from "@kivora/nextjs";
import { CircleHelp, ImagePlus, LibraryBig, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "@/stores/workspace-store";
import styles from "../shell.module.css";
import { SECTIONS } from "../sections";
import { HelpHint } from "./help-hint";

export type ShellDialog = "library" | "help" | "settings";

export function SideMenu({ onOpenDialog }: { onOpenDialog: (dialog: ShellDialog) => void }) {
  const { t } = useTranslation();
  const section = useWorkspaceStore((s) => s.section);
  const setSection = useWorkspaceStore((s) => s.setSection);

  const footer = [
    { id: "library" as const, icon: LibraryBig },
    { id: "help" as const, icon: CircleHelp },
    { id: "settings" as const, icon: Settings },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.scroll}>
        <div className={styles.menu}>
          <div>
            <div className={styles.eyebrow}>{t("menu.eyebrow")}</div>
            <div className={styles.menuTitle}>{t("menu.title")}</div>
          </div>

          <nav className={styles.navList} aria-label={t("menu.title")}>
            {SECTIONS.map(({ id, icon }) => (
              <button
                key={id}
                type="button"
                className={`${styles.navItem} ${section === id ? styles.navItemActive : ""}`}
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(id)}
              >
                <Icon icon={icon} size={18} />
                {t(`nav.${id}`)}
              </button>
            ))}
          </nav>

          <section className={styles.block} aria-labelledby="scene-title">
            <div className={styles.blockHeader}>
              <span id="scene-title">{t("scene.title")}</span>
              <span className={styles.hint}>{t("scene.noModel")}</span>
            </div>
            <p className={styles.hint} style={{ margin: 0 }}>
              {t("scene.empty")}
            </p>
          </section>

          <section className={styles.block} aria-labelledby="references-title">
            <div className={styles.blockHeader}>
              <span id="references-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {t("references.title")}
                <HelpHint text={t("references.help")} />
              </span>
              <Badge variant="outline">{t("common.phase", { phase: 6 })}</Badge>
            </div>
            <div className={styles.dropzone}>
              <span className={styles.iconTile}>
                <Icon icon={ImagePlus} size={20} />
              </span>
              <strong style={{ fontSize: "0.875rem" }}>{t("references.dropTitle")}</strong>
              <span className={styles.hint}>{t("references.dropHint")}</span>
            </div>
          </section>
        </div>
      </div>

      <div className={styles.menuFooter}>
        {footer.map(({ id, icon }) => (
          <button key={id} type="button" className={styles.footerButton} onClick={() => onOpenDialog(id)}>
            <Icon icon={icon} size={18} />
            {t(`menu.${id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
