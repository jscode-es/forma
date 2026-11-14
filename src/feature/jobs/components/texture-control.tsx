"use client";

import { Button, Label, Select } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { activeVariant, useProjectStore } from "@/stores/project-store";
import { ACTIVE, textureModel, useJobsStore } from "../jobs-store";
import { EngineControl } from "./engine-control";
import styles from "../jobs.module.css";

export function TextureControl() {
  const { t } = useTranslation();
  const engineId = useProjectStore((s) => s.textureEngine.id);
  const references = useProjectStore((s) => s.references);
  const referenceId = useProjectStore((s) => s.textureReferenceId);
  const model = useProjectStore((s) => activeVariant(s).model);
  const engine = useJobsStore((s) => s.engines.find((e) => e.id === engineId && e.tasks.includes("texture")));
  const busy = useJobsStore((s) => s.jobs.some((j) => ACTIVE.has(j.status) && j.task === "texture"));
  const error = useJobsStore((s) => s.enqueueError);
  const options = references.map((r) => ({ value: r.id, label: `${t(`viewport.presets.${r.view}`)} · ${r.name}` }));
  const ready = Boolean(engine?.available && options.some((r) => r.value === referenceId) && model.type !== "default-cube" && !busy);
  return <div className={styles.paramStack}>
    <EngineControl task="texture" />
    <Label>{t("texture.reference")}</Label>
    <Select aria-label={t("texture.reference")} options={options} value={options.find((o) => o.value === referenceId) ?? null}
      isSearchable={false} menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed"
      styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      onChange={(option) => useProjectStore.getState().setTextureReferenceId(option?.value ?? null)} />
    <Button disabled={!ready} onClick={() => void textureModel()}>{t(busy ? "texture.running" : "texture.run")}</Button>
    <span className={styles.hint}>{t("texture.hint")}</span>
    {error && <span role="alert" className={styles.error}>{t(`errors.${error}`, { defaultValue: error })}</span>}
  </div>;
}
