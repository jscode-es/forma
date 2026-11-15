"use client";

import { useEffect, useState } from "react";
import { Button, Input, Label, Select } from "@kivora/nextjs";
import { NumberField } from "@/components/number-field";
import { useTranslation } from "react-i18next";
import { useViewerStore } from "@/feature/viewport";
import { displayedVariant, useProjectStore } from "@/stores/project-store";
import { useMaterialsStore } from "../materials-store";
import { editMaterials, inspectMaterials } from "../operations";
import type { MaterialEdit, MaterialInfo, MaterialMap } from "../types";
import styles from "../materials.module.css";

const MAPS: MaterialMap[] = ["albedo", "metallic", "roughness", "normal", "ao"];
const FACTORS = ["metalness", "roughness", "opacity"] as const;

export function MaterialControl() {
  const { t } = useTranslation();
  const source = useProjectStore(displayedVariant);
  const sessionId = useProjectStore((s) => s.sessionId);
  const projectId = useProjectStore((s) => s.id);
  const comparing = useProjectStore((s) => s.comparing);
  const previewVariantId = useProjectStore((s) => s.previewVariantId);
  const isolation = useViewerStore((s) => s.materialIsolation);
  const selection = useMaterialsStore((s) => s.sessionId === sessionId ? s.sources[source.id] : undefined);
  const [inspection, setInspection] = useState<{ key: string; materials: MaterialInfo[]; bytes: Uint8Array } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: "inspectFailed" | "editFailed" | "transparentDataMap" } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${sessionId}:${source.id}`;
  const model = source.model;
  const modelType = model.type;
  const materials = inspection?.key === key ? inspection.materials : [];
  const selected = materials.find((m) => m.index === selection?.selected);
  const draft = selected ? selection?.drafts[selected.index] : undefined;
  const error = failure?.key === key ? failure.message : null;
  const isolated = isolation?.sessionId === sessionId && isolation.variantId === source.id && isolation.materialIndex === selected?.index;
  const api = typeof window === "undefined" ? undefined : window.forma;

  useEffect(() => {
    if (!api || model.type === "default-cube" || (model.type === "asset" && !projectId)) return;
    let active = true;
    const modelSource = model.type === "asset"
      ? { type: "asset" as const, projectId: projectId!, assetId: model.assetId }
      : { type: "staged" as const, stagingId: model.stagingId };
    void api.models.read(modelSource).then(async (bytes) => {
      const inspected = await inspectMaterials(bytes);
      if (!active) return;
      useMaterialsStore.getState().initialize(sessionId, source.id, inspected);
      setInspection({ key, materials: inspected, bytes });
      setFailure((previous) => previous?.key === key ? null : previous);
    }).catch(() => {
      if (active) setFailure({ key, message: "inspectFailed" });
    });
    return () => { active = false; };
  }, [api, key, model, projectId, sessionId, source.id]);

  function currentSource() {
    const current = useProjectStore.getState();
    return current.sessionId === sessionId && displayedVariant(current).id === source.id;
  }

  async function preview(extra: Pick<MaterialEdit, "replaceMap" | "upscale"> = {}, importMap?: MaterialMap) {
    if (!api || !selected || !draft || busy || inspection?.key !== key) return;
    const edit: MaterialEdit = { materialIndex: selected.index, ...draft, ...extra };
    setBusy(true);
    setFailure(null);
    try {
      if (importMap) {
        const imported = await api.references.import();
        if (!imported || !currentSource()) return;
        const bytes = await api.references.read(imported.original, projectId);
        if (!currentSource()) return;
        edit.replaceMap = { map: importMap, bytes };
      }
      const bytes = await editMaterials(inspection.bytes, edit);
      if (!currentSource()) return;
      const label = t(extra.upscale ? "material.upscaleVariant" : importMap ? "material.importVariant" : "material.editVariant", { name: source.label });
      const staged = await api.models.stageBytes(bytes, `${source.label.slice(0, 100)}-materials.glb`);
      if (!currentSource()) return;
      useProjectStore.getState().addVariant({
        label,
        origin: extra.upscale || importMap ? "texture" : "material",
        engineId: null,
        model: staged,
        lods: [],
        params: { materialIndex: selected.index, ...(extra.upscale ? { upscale: extra.upscale.factor } : {}), ...(importMap ? { importedMap: importMap } : {}) },
      }, false, source.id);
    } catch (error) {
      if (currentSource()) setFailure({ key, message: error instanceof Error && error.message === "materials.transparentDataMap" ? "transparentDataMap" : "editFailed" });
    } finally {
      setBusy(false);
    }
  }

  if (modelType === "default-cube") return <span className={styles.hint}>{t("material.needsModel")}</span>;

  const options = materials.map((material) => ({ value: String(material.index), label: material.name || t("material.unnamed", { index: material.index + 1 }) }));
  const availableMaps = selected ? MAPS.filter((map) => selected.maps[map].available) : [];

  return <div className={styles.stack} aria-busy={busy}>
    {error && <span className={styles.error} role="alert">{t(`material.${error}`)}</span>}
    {inspection?.key !== key && !error && <span className={styles.hint}>{t("material.loading")}</span>}
    {inspection?.key === key && materials.length === 0 && <span className={styles.hint}>{t("material.empty")}</span>}
    {selected && draft && <>
      <div className={styles.stack}>
        <Label htmlFor="material-select">{t("material.select")}</Label>
        <Select inputId="material-select" options={options} value={options.find((option) => option.value === String(selected.index))} isSearchable={false} isDisabled={busy}
          menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto"
          styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
          onChange={(option) => { if (option) useMaterialsStore.getState().select(source.id, Number(option.value)); }} />
      </div>
      {!selected.editable && <span className={styles.hint}>{t("material.unsupported")}</span>}
      <div className={styles.field}>
        <Label htmlFor="material-color">{t("material.color")}</Label>
        <Input id="material-color" type="color" className={styles.input} value={draft.color} disabled={busy || !selected.editable}
          onChange={(event) => useMaterialsStore.getState().update(source.id, selected.index, { color: event.target.value })} />
      </div>
      {FACTORS.map((factor) => <div key={factor} className={styles.field}>
        <Label htmlFor={`material-${factor}`}>{t(`material.${factor}`)}</Label>
        <NumberField id={`material-${factor}`} min={0} max={1} step={0.05} className={styles.input} value={draft[factor]} disabled={busy || !selected.editable}
          onValueChange={(value) => useMaterialsStore.getState().update(source.id, selected.index, { [factor]: value })} />
      </div>)}
      <div className={styles.actions}>
        <Button disabled={busy || !selected.editable} onClick={() => void preview()}>{t(busy ? "material.working" : "material.preview")}</Button>
        <Button variant="outline" aria-pressed={isolated} onClick={() => useViewerStore.setState({ materialIsolation: isolated ? null : { sessionId, variantId: source.id, materialIndex: selected.index } })}>{t("material.isolate")}</Button>
        <Button variant="outline" disabled={!previewVariantId} aria-pressed={comparing} onClick={() => useProjectStore.getState().setComparing(!comparing)}>{t("material.compare")}</Button>
      </div>
      {MAPS.map((map) => {
        const info = selected.maps[map];
        return <div key={map} className={styles.map}>
          <div className={styles.field}>
            <strong>{t(`material.maps.${map}`)}</strong>
            <Button variant="outline" size="sm" disabled={busy || !selected.editable || !info.hasUv} onClick={() => void preview({}, map)} aria-label={t("material.importMap", { map: t(`material.maps.${map}`) })}>{t("material.import")}</Button>
          </div>
          <span className={styles.hint}>{info.available ? t("material.dimensions", { width: info.width, height: info.height }) : t("material.absent")}</span>
          {info.available && <span className={styles.hint}>{t(`material.sources.${info.source}`)}</span>}
          {!info.hasUv && <span className={styles.error}>{t("material.missingUv", { channel: info.uvChannel })}</span>}
        </div>;
      })}
      <div className={styles.actions}>
        {([2, 4] as const).map((factor) => <Button key={factor} variant="outline" disabled={busy || !selected.editable || availableMaps.length === 0 || availableMaps.some((map) => Math.max(selected.maps[map].width, selected.maps[map].height) * factor > 4096)}
          onClick={() => void preview({ upscale: { factor, maps: availableMaps } })}>{t("material.upscale", { factor })}</Button>)}
      </div>
    </>}
  </div>;
}
