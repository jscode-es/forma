"use client";

import { Button, Label, Select } from "@kivora/nextjs";
import { NumberField } from "@/components/number-field";
import { useTranslation } from "react-i18next";
import { useViewerStore } from "@/feature/viewport";
import { useBlobUrl } from "@/hooks/use-blob-url";
import { activeImage, useProjectStore } from "@/stores/project-store";
import styles from "../references.module.css";

export function ReferenceProjection() {
  const { t } = useTranslation();
  const references = useProjectStore((s) => s.references);
  const sessionId = useProjectStore((s) => s.sessionId);
  const projection = useViewerStore((s) => s.projection);
  const selected = projection?.sessionId === sessionId && references.some((r) => r.id === projection.referenceId) ? projection : null;
  const options = references.map((r) => ({ value: r.id, label: t(`viewport.presets.${r.view}`) }));
  return <div className={styles.list}>
    <Select aria-label={t("references.projectView")} options={options} isSearchable={false}
      menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      value={options.find((o) => o.value === selected?.referenceId) ?? null}
      onChange={(option) => useViewerStore.setState({ projection: option ? { referenceId: option.value, sessionId, opacity: 0.5, scale: 1, x: 0, y: 0 } : null })} />
    {selected && <>
      {(["opacity", "scale", "x", "y"] as const).map((key) => <div className={styles.row} key={key}>
        <Label htmlFor={`projection-${key}`}>{t(`references.${key}`)}</Label>
        <NumberField id={`projection-${key}`} style={{ width: "6rem" }} value={selected[key]}
          min={key === "opacity" ? 0 : key === "scale" ? 0.1 : -100} max={key === "opacity" ? 1 : key === "scale" ? 5 : 100} step={key === "x" || key === "y" ? 1 : 0.1}
          onValueChange={(value) => useViewerStore.setState({ projection: { ...selected, [key]: value } })} />
      </div>)}
      <Button size="sm" variant="outline" onClick={() => useViewerStore.setState({ projection: { ...selected, scale: 1, x: 0, y: 0, opacity: 0.5 } })}>{t("references.resetAlignment")}</Button>
      <Button size="sm" variant="outline" onClick={() => useViewerStore.setState({ projection: null })}>{t("references.stopProjection")}</Button>
    </>}
  </div>;
}

export function ReferenceOverlay() {
  const projection = useViewerStore((s) => s.projection);
  const sessionId = useProjectStore((s) => s.sessionId);
  const projectId = useProjectStore((s) => s.id);
  const reference = useProjectStore((s) => s.references.find((r) => r.id === projection?.referenceId));
  const source = reference ? activeImage(reference) : null;
  const key = source ? `${sessionId}:${projectId}:${JSON.stringify(source)}` : "none";
  const url = useBlobUrl(key, () => source ? window.forma?.references.read(source, projectId) : undefined);
  const { t } = useTranslation();
  if (!projection || projection.sessionId !== sessionId || !reference || !url) return null;
  return <div className={styles.projection}>
    <img src={url} alt={t("references.projected", { view: t(`viewport.presets.${reference.view}`) })}
      style={{ opacity: projection.opacity, transform: `translate(${projection.x}%, ${projection.y}%) scale(${projection.scale})` }} />
  </div>;
}
