"use client";

import { useState } from "react";
import { Button, Icon } from "@kivora/nextjs";
import { Download } from "lucide-react";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/feature/jobs";
import { createDefaultCube } from "@/feature/viewport/engine/models";
import { disposeObject } from "@/feature/viewport/engine/viewer";
import type { ExportResult, ModelSource, SceneModel } from "@/lib/forma";
import { activeVariant, useProjectStore, variantName } from "@/stores/project-store";
import styles from "../versions.module.css";

function sourceOf(model: SceneModel, projectId: string | null): ModelSource | null {
  if (model.type === "staged") return { type: "staged", stagingId: model.stagingId };
  if (model.type === "asset" && projectId) return { type: "asset", projectId, assetId: model.assetId };
  return null;
}

async function cubeBytes(name: string) {
  const cube = createDefaultCube(name);
  try {
    return new Uint8Array((await new GLTFExporter().parseAsync(cube, { binary: true })) as ArrayBuffer);
  } finally {
    disposeObject(cube);
  }
}

function useExport() {
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectId = useProjectStore((s) => s.id);

  async function run(model: SceneModel, name: string) {
    setError(null);
    try {
      const source = sourceOf(model, projectId);
      const bytes = source ? null : await cubeBytes(name);
      const written = await window.forma!.models.export(source, bytes, name);
      if (written) setResult(written);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return { result, error, run };
}

function ExportStatus({ result, error }: { result: ExportResult | null; error: string | null }) {
  const { t } = useTranslation();
  if (error) return <span className={styles.error}>{t(`errors.${error}`, { defaultValue: error })}</span>;
  if (!result) return null;
  return <span className={styles.ok}>{t("export.done", { path: result.path, sha: result.sha256.slice(0, 12) })}</span>;
}

export function ExportControl() {
  const { t, i18n } = useTranslation();
  const active = useProjectStore(activeVariant);
  const preview = useProjectStore((s) => s.previewVariantId);
  const { result, error, run } = useExport();
  const name = variantName(active, t("scene.cube"));
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <div className={styles.stack}>
      <div className={styles.summary}>
        <strong>{t("export.activeVersion", { name })}</strong>
        <span className={styles.hint}>
          {active.triangles !== null ? t("stats.triangles", { value: number.format(active.triangles) }) : "-"}
          {" · "}
          {active.sha256 ? `SHA-256 ${active.sha256.slice(0, 12)}` : t("versions.unsaved")}
        </span>
        {preview && <span className={styles.hint}>{t("export.previewNotExported")}</span>}
      </div>
      <Button disabled={!window.forma} onClick={() => run(active.model, name)}>
        <Icon icon={Download} size={15} />
        {t("export.glb")}
      </Button>
      <ExportStatus result={result} error={error} />
    </div>
  );
}

export function LodExportControl() {
  const { t } = useTranslation();
  const active = useProjectStore(activeVariant);
  const { result, error, run } = useExport();
  const name = variantName(active, t("scene.cube"));

  if (active.lods.length === 0) return <span className={styles.hint}>{t("export.noLods")}</span>;
  return (
    <div className={styles.stack}>
      {active.lods.map((lod, index) => (
        <Button key={index} variant="outline" onClick={() => run(lod, `${name}-lod${index + 1}`)}>
          <Icon icon={Download} size={15} />
          {t("export.lod", { index: index + 1, name: lod.type === "default-cube" ? "" : lod.name })}
        </Button>
      ))}
      <ExportStatus result={result} error={error} />
    </div>
  );
}
