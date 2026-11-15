"use client";

import { useEffect, useId, useState } from "react";
import { Button, Input, Label, Select } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { displayedVariant, useProjectStore } from "@/stores/project-store";
import { discardPaint, loadPaintMaterials, redoPaint, resumePainting, savePaintVariant, setPaintEnabled, setPaintOptions, startPainting, undoPaint, usePaintStore } from "../store";
import styles from "../paint.module.css";

const TOOLS = ["brush", "clone", "eyedropper", "restore"] as const;

export function PaintControl() {
  const { t } = useTranslation();
  const id = useId();
  const source = useProjectStore(displayedVariant);
  const sessionId = useProjectStore((state) => state.sessionId);
  const { materials, draft, busy: working, blocked, error, enabled, tool, color, radius, opacity } = usePaintStore();
  const busy = working || blocked;
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null);
  const [resolution, setResolution] = useState(1024);
  const sourceKey = `${sessionId}:${source.id}`;
  const selected = materials.find((material) => selection?.key === sourceKey && material.index === selection.index)
    ?? materials.find((material) => material.editable && material.maps.albedo.hasUv)
    ?? materials[0];
  const sameSource = !!draft && draft.sessionId === sessionId && draft.variantId === source.id;
  const controlsDisabled = busy || !sameSource;
  const dirty = !!draft?.engine.dirty;
  const options = materials.map((material) => ({ value: String(material.index), label: material.name || t("paint.unnamed", { index: material.index + 1 }) }));
  const resolutions = [1024, 2048].map((size) => ({ value: String(size), label: t("paint.dimensions", { width: size, height: size }) }));

  useEffect(() => {
    void loadPaintMaterials();
  }, [sessionId, source.id, source.model]);

  return <div className={styles.stack} aria-busy={busy}>
    {error && <span className={styles.error} role="alert">{t(error, { defaultValue: t("paint.failed") })}</span>}
    {!draft && <>
      {source.model.type === "default-cube" ? <span className={styles.hint}>{t("paint.modelRequired")}</span> : <>
        <Label htmlFor={`${id}-material`}>{t("paint.material")}</Label>
        <Select inputId={`${id}-material`} options={options} value={options.find((option) => option.value === String(selected?.index))}
          isSearchable={false} isDisabled={busy} placeholder={t("paint.chooseMaterial")} noOptionsMessage={() => t("paint.empty")}
          menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
          onChange={(option) => { if (option) setSelection({ key: sourceKey, index: Number(option.value) }); }} />
        {!busy && !selected && <span className={styles.hint}>{t("paint.empty")}</span>}
        {selected && !selected.editable && <span className={styles.hint}>{t("paint.unsupportedMaterial")}</span>}
        {selected && !selected.maps.albedo.hasUv && <span className={styles.hint}>{t("paint.unsupportedUv")}</span>}
        {selected?.maps.albedo.available ? <span className={styles.hint}>{t("paint.dimensions", { width: selected.maps.albedo.width, height: selected.maps.albedo.height })}</span> : <>
          <Label htmlFor={`${id}-resolution`}>{t("paint.resolution")}</Label>
          <Select inputId={`${id}-resolution`} options={resolutions} value={resolutions.find((option) => option.value === String(resolution))}
            isSearchable={false} isDisabled={busy}
            menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
            onChange={(option) => { if (option) setResolution(Number(option.value)); }} />
        </>}
      </>}
      <Button disabled={busy || source.model.type === "default-cube" || !selected?.editable || !selected.maps.albedo.hasUv}
        onClick={() => { if (selected) void startPainting(selected.index, resolution); }}>{t(busy ? "paint.working" : "paint.start")}</Button>
    </>}
    {draft && <>
      <span className={styles.hint}>{t("paint.source", { name: draft.sourceLabel })}</span>
      <span className={styles.hint}>{t("paint.dimensions", { width: draft.canvas.width, height: draft.canvas.height })}</span>
      {dirty && <span className={styles.notice} role="status">{t("paint.unsaved")}</span>}
      {!sameSource && <div className={styles.notice}>
        <span>{t("paint.differentSource")}</span>
        <Button variant="outline" disabled={busy} onClick={resumePainting}>{t("paint.resumeSource")}</Button>
      </div>}
      <div className={styles.tools} role="group" aria-label={t("paint.tools")}>
        {TOOLS.map((value) => <Button key={value} size="sm" variant={tool === value ? "default" : "outline"} aria-pressed={tool === value}
          disabled={controlsDisabled} onClick={() => setPaintOptions({ tool: value })}>{t(`paint.${value}`)}</Button>)}
      </div>
      <div className={styles.field}>
        <Label htmlFor={`${id}-color`}>{t("paint.color")}</Label>
        <Input id={`${id}-color`} type="color" className={styles.input} value={color} disabled={controlsDisabled}
          onChange={(event) => setPaintOptions({ color: event.target.value })} />
      </div>
      <div className={styles.field}>
        <Label htmlFor={`${id}-radius`}>{t("paint.radius")}</Label>
        <Input id={`${id}-radius`} type="number" className={styles.input} min={1} max={128} step={1} value={radius} disabled={controlsDisabled}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isInteger(value) && value >= 1 && value <= 128) setPaintOptions({ radius: value });
          }} />
      </div>
      <div className={styles.field}>
        <Label htmlFor={`${id}-opacity`}>{t("paint.opacity")}</Label>
        <Input id={`${id}-opacity`} type="number" className={styles.input} min={0} max={1} step={0.05} value={opacity} disabled={controlsDisabled}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value) && value >= 0 && value <= 1) setPaintOptions({ opacity: value });
          }} />
      </div>
      <div className={styles.actions}>
        <Button variant="outline" disabled={controlsDisabled || !draft.engine.canUndo} onClick={undoPaint}>{t("paint.undo")}</Button>
        <Button variant="outline" disabled={controlsDisabled || !draft.engine.canRedo} onClick={redoPaint}>{t("paint.redo")}</Button>
        <Button variant="outline" disabled={controlsDisabled} onClick={() => setPaintEnabled(!enabled)}>{t(enabled ? "paint.pause" : "paint.resume")}</Button>
      </div>
      {(!enabled || !sameSource) && <span className={styles.hint}>{t("paint.pausedHint")}</span>}
      <div className={styles.actions}>
        <Button disabled={controlsDisabled || !dirty} onClick={() => void savePaintVariant().catch(() => undefined)}>{t(busy ? "paint.working" : "paint.save")}</Button>
        <Button variant="outline" disabled={busy} onClick={discardPaint}>{t("paint.discard")}</Button>
      </div>
    </>}
  </div>;
}
