"use client";

import { Button } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { activeVariant, useProjectStore } from "@/stores/project-store";
import { ACTIVE, textureModel, textureReferences, useJobsStore } from "../jobs-store";
import { EngineControl } from "./engine-control";
import styles from "../jobs.module.css";

export function TextureControl() {
  const { t } = useTranslation();
  const engineId = useProjectStore((s) => s.textureEngine.id);
  const references = useProjectStore((s) => s.references);
  const model = useProjectStore((s) => activeVariant(s).model);
  const engine = useJobsStore((s) => s.engines.find((e) => e.id === engineId && e.tasks.includes("texture")));
  const busy = useJobsStore((s) => s.jobs.some((j) => ACTIVE.has(j.status) && j.task === "texture"));
  const error = useJobsStore((s) => s.enqueueError);
  const views = references.length > 0 && engine ? textureReferences(engine).map((r) => t(`viewport.presets.${r.view}`)) : [];
  const ready = Boolean(engine?.available && views.length > 0 && model.type !== "default-cube" && !busy);
  return <div className={styles.paramStack}>
    <EngineControl task="texture" />
    <span className={styles.hint}>{views.length > 0 ? t("texture.views", { views: views.join(", ") }) : t("texture.noViews")}</span>
    <Button disabled={!ready} onClick={() => void textureModel()}>{t(busy ? "texture.running" : "texture.run")}</Button>
    {error && <span role="alert" className={styles.error}>{t(`errors.${error}`, { defaultValue: error })}</span>}
  </div>;
}
