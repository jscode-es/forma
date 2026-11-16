"use client";

import { Button } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { displayedVariant, useProjectStore, variantName } from "@/stores/project-store";
import { ACTIVE, textureModel, textureReferences, useJobsStore } from "../jobs-store";
import { EngineControl } from "./engine-control";
import styles from "../jobs.module.css";

export function TextureControl() {
  const { t } = useTranslation();
  const engineId = useProjectStore((s) => s.textureEngine.id);
  const references = useProjectStore((s) => s.references);
  const shown = useProjectStore(displayedVariant);
  const source = useProjectStore((s) => {
    const variant = displayedVariant(s);
    return variant.origin === "texture" ? s.variants.find((v) => v.id === variant.parentId) ?? variant : variant;
  });
  const engine = useJobsStore((s) => s.engines.find((e) => e.id === engineId && e.tasks.includes("texture")));
  const busy = useJobsStore((s) => s.jobs.some((j) => ACTIVE.has(j.status) && j.task === "texture"));
  const error = useJobsStore((s) => s.enqueueError);
  const views = references.length > 0 && engine ? textureReferences(engine).map((r) => t(`viewport.presets.${r.view}`)) : [];
  const ready = Boolean(engine?.available && views.length > 0 && source.model.type !== "default-cube" && !busy);
  const retry = shown.origin === "texture" && source !== shown;

  const run = () => {
    const seed = engine?.parameters.find((p) => p.id === "seed");
    if (retry && seed && seed.type === "integer") {
      useProjectStore.getState().setTextureEngineParameter("seed", seed.min + Math.floor(Math.random() * (seed.max - seed.min + 1)));
    }
    void textureModel(source.id, true);
  };

  return <div className={styles.paramStack}>
    <EngineControl task="texture" />
    <span className={styles.hint}>{views.length > 0 ? t("texture.views", { views: views.join(", ") }) : t("texture.noViews")}</span>
    {source.model.type !== "default-cube" && <span className={styles.hint}>{t(retry ? "texture.retrySource" : "texture.source", { name: variantName(source, t("scene.cube")) })}</span>}
    <Button disabled={!ready} onClick={run}>{t(busy ? "texture.running" : retry ? "texture.retry" : "texture.run")}</Button>
    {error && <span role="alert" className={styles.error}>{t(`errors.${error}`, { defaultValue: error })}</span>}
  </div>;
}
