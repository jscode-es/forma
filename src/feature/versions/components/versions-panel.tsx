"use client";

import { Badge, Button, Icon } from "@kivora/nextjs";
import { Check, Eye, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectStore, variantName } from "@/stores/project-store";
import styles from "../versions.module.css";

export function VersionsPanel() {
  const { t, i18n } = useTranslation();
  const variants = useProjectStore((s) => s.variants);
  const activeId = useProjectStore((s) => s.activeVariantId);
  const previewId = useProjectStore((s) => s.previewVariantId);
  const { applyVariant, discardVariant, previewVariant } = useProjectStore.getState();
  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" });
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <ol className={styles.list} aria-label={t("versions.title")}>
      {[...variants].reverse().map((v) => {
        const active = v.id === activeId;
        const params = Object.entries(v.params)
          .map(([key, value]) => `${key} ${value}`)
          .join(" · ");
        return (
          <li key={v.id} className={`${styles.row} ${active ? styles.active : ""} ${v.id === previewId ? styles.preview : ""}`}>
            <div className={styles.main}>
              <div className={styles.title}>
                <strong>{variantName(v, t("scene.cube"))}</strong>
                <Badge variant="outline">{t(`versions.origin.${v.origin}`)}</Badge>
                {active && <Badge variant="secondary">{t("versions.active")}</Badge>}
                {v.id === previewId && <Badge>{t("versions.previewing")}</Badge>}
                {v.lods.length > 0 && <Badge variant="outline">{t("versions.lods", { count: v.lods.length })}</Badge>}
              </div>
              <span className={styles.hint}>
                {v.origin === "default" ? "" : `${time.format(new Date(v.createdAt))} · `}
                {v.triangles !== null ? t("stats.triangles", { value: number.format(v.triangles) }) : "-"}
                {" · "}
                {v.sha256 ? `SHA-256 ${v.sha256.slice(0, 12)}` : v.origin === "default" ? t("versions.builtin") : t("versions.unsaved")}
              </span>
              {params && <span className={styles.params}>{params}</span>}
            </div>
            <div className={styles.actions}>
              {!active && v.id !== previewId && (
                <Button size="sm" variant="ghost" onClick={() => previewVariant(v.id)}>
                  <Icon icon={Eye} size={14} />
                  {t("versions.preview")}
                </Button>
              )}
              {!active && (
                <Button size="sm" variant="ghost" onClick={() => applyVariant(v.id)}>
                  <Icon icon={Check} size={14} />
                  {t("versions.apply")}
                </Button>
              )}
              {!active && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("versions.delete")}
                  title={t("versions.delete")}
                  onClick={() => discardVariant(v.id)}
                >
                  <Icon icon={Trash2} size={14} />
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
