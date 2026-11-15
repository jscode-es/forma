"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, Label, Select } from "@kivora/nextjs";
import { NumberField } from "@/components/number-field";
import { useTranslation } from "react-i18next";
import { ACTIVE, enqueueMeshTask, useJobsStore } from "@/feature/jobs";
import { useModelsStore } from "@/feature/models";
import { activeVariant, useProjectStore } from "@/stores/project-store";
import { useMeshToolsStore, type MeshTopology } from "../store";
import styles from "../mesh-tools.module.css";

const TASKS = new Set(["retopology", "uv-unwrap", "normals", "ambient-occlusion"]);
const TOPOLOGY: (keyof MeshTopology)[] = ["vertices", "edges", "faces", "triangles", "degenerateFaces", "boundaryEdges", "nonManifoldEdges", "components"];

function useMeshContext() {
  const source = useProjectStore(activeVariant);
  const sessionId = useProjectStore((state) => state.sessionId);
  const busy = useJobsStore((state) => state.jobs.some((job) => ACTIVE.has(job.status) && TASKS.has(job.task)));
  const available = useJobsStore((state) => state.engines.some((engine) => engine.id === "forma-blender-mesh" && engine.available));
  return { source, sessionId, busy, ready: source.model.type !== "default-cube" && available && !busy };
}

function MeshFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { source, busy } = useMeshContext();
  const error = useJobsStore((state) => state.enqueueError);
  const engines = useJobsStore((state) => state.engines);
  const [runtime, setRuntime] = useState<{ version: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    void useMeshToolsStore.persist.rehydrate();
    void Promise.resolve(window.forma?.system.blender(false)).then((info) => {
      if (current) {
        setRuntime(info ?? null);
        setFailed(false);
      }
    }).catch(() => {
      if (current) setFailed(true);
    }).finally(() => {
      if (current) setChecking(false);
    });
    return () => { current = false; };
  }, [engines]);

  return <div className={styles.stack} aria-busy={busy || checking}>
    <span className={styles.hint}>{t("mesh.source", { name: source.label })}</span>
    <span className={styles.hint}>{t(runtime ? "mesh.blenderReady" : checking ? "mesh.checkingBlender" : "mesh.blenderMissing", { version: runtime?.version })}</span>
    {failed && <span className={styles.error} role="alert">{t("mesh.runtimeFailed")}</span>}
    {source.model.type === "default-cube" && <span className={styles.hint}>{t("mesh.needsModel")}</span>}
    {children}
    {error && <span className={styles.error} role="alert">{error === "mesh-report-invalid" ? t("mesh.invalidReport") : t(`errors.${error}`, { defaultValue: error })}</span>}
  </div>;
}

function ResolutionControl({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const inputId = useId();
  const resolution = useMeshToolsStore((state) => state.resolution);
  const options = (["512", "1024", "2048", "4096"] as const).map((value) => ({ value, label: t("mesh.resolutionValue", { size: value }) }));
  return <div className={styles.stack}>
    <Label htmlFor={inputId}>{t("mesh.resolution")}</Label>
    <Select inputId={inputId} options={options} value={options.find((option) => option.value === resolution)} isSearchable={false} isDisabled={disabled}
      menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      onChange={(option) => { if (option) useMeshToolsStore.getState().setDraft({ resolution: option.value }); }} />
  </div>;
}

export function MeshInspectControl() {
  const { t, i18n } = useTranslation();
  const source = useProjectStore(activeVariant);
  const sessionId = useProjectStore((state) => state.sessionId);
  const busy = useJobsStore((state) => state.jobs.some((job) => ACTIVE.has(job.status) && job.task === "mesh-inspect"));
  const available = useJobsStore((state) => state.engines.some((engine) => engine.available && engine.tasks.includes("mesh-inspect")));
  const error = useJobsStore((state) => state.enqueueError);
  const entry = useMeshToolsStore((state) => state.reports[source.id]);
  const report = entry?.sessionId === sessionId ? entry.report : null;
  useEffect(() => { void useMeshToolsStore.persist.rehydrate(); }, []);
  return <div className={styles.stack} aria-busy={busy}>
    <span className={styles.hint}>{t("mesh.source", { name: source.label })}</span>
    {source.model.type === "default-cube" && <span className={styles.hint}>{t("mesh.needsModel")}</span>}
    <Button disabled={source.model.type === "default-cube" || !available || busy} onClick={() => void enqueueMeshTask("mesh-inspect", {})}>{t(busy ? "mesh.running" : "mesh.inspect")}</Button>
    {report && <>
      <dl className={styles.report} aria-label={t("mesh.report")}>
        {TOPOLOGY.map((key) => <div key={key}><dt>{t(`mesh.topology.${key}`)}</dt><dd>{new Intl.NumberFormat(i18n.language).format(report.source[key])}</dd></div>)}
      </dl>
      {report.warnings.map((warning) => <span key={warning} className={styles.hint}>{t(`mesh.warnings.${warning}`, { defaultValue: t("mesh.reportWarnings") })}</span>)}
    </>}
    {error && <span className={styles.error} role="alert">{error === "mesh-report-invalid" ? t("mesh.invalidReport") : t(`errors.${error}`, { defaultValue: error })}</span>}
  </div>;
}

export function RetopologyControl() {
  const { t } = useTranslation();
  const inputId = useId();
  const { busy, source } = useMeshContext();
  const engine = useJobsStore((state) => state.engines.find((entry) => entry.id === "instant-meshes"));
  const ready = source.model.type !== "default-cube" && engine?.available && !busy;
  const faceBudget = useMeshToolsStore((state) => state.faceBudget);
  const error = useJobsStore((state) => state.enqueueError);
  useEffect(() => { void useMeshToolsStore.persist.rehydrate(); }, []);
  return <div className={styles.stack} aria-busy={busy}>
    <span className={styles.hint}>{t("mesh.source", { name: source.label })}</span>
    <span className={styles.hint}>{t("mesh.instantRuntime")}</span>
    {source.model.type === "default-cube" && <span className={styles.hint}>{t("mesh.needsModel")}</span>}
    {!engine?.available && <Button size="sm" variant="outline" onClick={() => useModelsStore.getState().setOpen(true)}>{t("mesh.activateInstant")}</Button>}
    <Label htmlFor={inputId}>{t("mesh.faceBudget")}</Label>
    <NumberField id={inputId} integer min={128} max={100000} step={1} value={faceBudget} disabled={busy}
      onValueChange={(value) => useMeshToolsStore.getState().setDraft({ faceBudget: value })} />
    <Button disabled={!ready || faceBudget > 100000} onClick={() => void enqueueMeshTask("retopology", { faceBudget, resolution: useMeshToolsStore.getState().resolution })}>{t(busy ? "mesh.running" : "mesh.retopology")}</Button>
    {error && <span className={styles.error} role="alert">{t(`errors.${error}`, { defaultValue: error })}</span>}
  </div>;
}

export function UvControl() {
  const { t } = useTranslation();
  const { source, sessionId, busy, ready } = useMeshContext();
  const resolution = useMeshToolsStore((state) => state.resolution);
  const lastUv = useMeshToolsStore((state) => state.lastUv);
  const template = lastUv?.sessionId === sessionId && (lastUv.variantId === source.id || lastUv.resultVariantId === source.id) ? lastUv : null;
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);
  async function exportTemplate() {
    if (!window.forma || !template) return;
    setExporting(true);
    setFailed(false);
    try {
      await window.forma.jobs.exportFile(template.jobId, template.path);
    } catch {
      setFailed(true);
    } finally {
      setExporting(false);
    }
  }
  return <MeshFrame>
    <ResolutionControl disabled={busy} />
    <Button disabled={!ready} onClick={() => void enqueueMeshTask("uv-unwrap", { resolution })}>{t(busy ? "mesh.running" : "mesh.uv")}</Button>
    <Button variant="outline" disabled={!template || exporting} onClick={() => void exportTemplate()}>{t("mesh.exportTemplate")}</Button>
    {failed && <span className={styles.error} role="alert">{t("mesh.exportFailed")}</span>}
  </MeshFrame>;
}

export function NormalsControl() {
  const { t } = useTranslation();
  const modeId = useId();
  const highId = useId();
  const { source, busy, ready } = useMeshContext();
  const variants = useProjectStore((state) => state.variants);
  const mode = useMeshToolsStore((state) => state.normalMode);
  const highVariantId = useMeshToolsStore((state) => state.highVariantId);
  const resolution = useMeshToolsStore((state) => state.resolution);
  const modes = (["recalculate", "bake"] as const).map((value) => ({ value, label: t(`mesh.modes.${value}`) }));
  const highOptions = variants.filter((variant) => variant.id !== source.id && variant.model.type !== "default-cube").map((variant) => ({ value: variant.id, label: variant.label }));
  const highValid = highOptions.some((option) => option.value === highVariantId);
  return <MeshFrame>
    <Label htmlFor={modeId}>{t("mesh.normalMode")}</Label>
    <Select inputId={modeId} options={modes} value={modes.find((option) => option.value === mode)} isSearchable={false} isDisabled={busy}
      menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      onChange={(option) => { if (option) useMeshToolsStore.getState().setDraft({ normalMode: option.value }); }} />
    {mode === "bake" && <>
      <Label htmlFor={highId}>{t("mesh.highVariant")}</Label>
      <Select inputId={highId} options={highOptions} value={highOptions.find((option) => option.value === highVariantId) ?? null} placeholder={t("mesh.chooseHighVariant")} isSearchable={false} isDisabled={busy}
        menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
        onChange={(option) => useMeshToolsStore.getState().setDraft({ highVariantId: option?.value ?? null })} />
      <ResolutionControl disabled={busy} />
    </>}
    <Button disabled={!ready || (mode === "bake" && !highValid)} onClick={() => void enqueueMeshTask("normals", { mode, resolution }, mode === "bake" ? highVariantId! : undefined)}>{t(busy ? "mesh.running" : "mesh.normals")}</Button>
  </MeshFrame>;
}

export function OcclusionControl() {
  const { t } = useTranslation();
  const samplesId = useId();
  const { busy, ready } = useMeshContext();
  const resolution = useMeshToolsStore((state) => state.resolution);
  const samples = useMeshToolsStore((state) => state.occlusionSamples);
  return <MeshFrame>
    <ResolutionControl disabled={busy} />
    <Label htmlFor={samplesId}>{t("mesh.occlusionSamples")}</Label>
    <NumberField id={samplesId} integer min={8} max={512} step={8} value={samples} disabled={busy}
      onValueChange={(value) => useMeshToolsStore.getState().setDraft({ occlusionSamples: value })} />
    <Button disabled={!ready} onClick={() => void enqueueMeshTask("ambient-occlusion", { resolution, samples })}>{t(busy ? "mesh.running" : "mesh.occlusion")}</Button>
  </MeshFrame>;
}
