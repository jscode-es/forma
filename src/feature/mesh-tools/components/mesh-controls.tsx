"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, Input, Label, Select } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { ACTIVE, enqueueMeshTask, refreshEngines, useJobsStore } from "@/feature/jobs";
import { activeVariant, useProjectStore } from "@/stores/project-store";
import { useMeshToolsStore, type MeshTopology } from "../store";
import styles from "../mesh-tools.module.css";

const TASKS = new Set(["mesh-inspect", "retopology", "uv-unwrap", "normals"]);
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
  const [runtime, setRuntime] = useState<{ version: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    void useMeshToolsStore.persist.rehydrate();
    void Promise.resolve(window.forma?.system.blender(false)).then((info) => {
      if (current) setRuntime(info ?? null);
    }).catch(() => {
      if (current) setFailed(true);
    }).finally(() => {
      if (current) setChecking(false);
    });
    return () => { current = false; };
  }, []);

  async function configure() {
    if (!window.forma) return;
    setChecking(true);
    setFailed(false);
    try {
      const info = await window.forma.system.chooseBlender();
      if (info) setRuntime(info);
      await refreshEngines();
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }

  return <div className={styles.stack} aria-busy={busy || checking}>
    <span className={styles.hint}>{t("mesh.source", { name: source.label })}</span>
    <span className={styles.hint}>{t(runtime ? "mesh.blenderReady" : checking ? "mesh.checkingBlender" : "mesh.blenderMissing", { version: runtime?.version })}</span>
    <Button variant="outline" size="sm" disabled={checking || busy} onClick={() => void configure()}>{t("mesh.configureBlender")}</Button>
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
      menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      onChange={(option) => { if (option) useMeshToolsStore.getState().setDraft({ resolution: option.value }); }} />
  </div>;
}

export function MeshInspectControl() {
  const { t, i18n } = useTranslation();
  const { source, sessionId, busy, ready } = useMeshContext();
  const entry = useMeshToolsStore((state) => state.reports[source.id]);
  const report = entry?.sessionId === sessionId ? entry.report : null;
  return <MeshFrame>
    <Button disabled={!ready} onClick={() => void enqueueMeshTask("mesh-inspect", {})}>{t(busy ? "mesh.running" : "mesh.inspect")}</Button>
    {report && <>
      <dl className={styles.report} aria-label={t("mesh.report")}>
        {TOPOLOGY.map((key) => <div key={key}><dt>{t(`mesh.topology.${key}`)}</dt><dd>{new Intl.NumberFormat(i18n.language).format(report.source[key])}</dd></div>)}
      </dl>
      {report.warnings.map((warning) => <span key={warning} className={styles.hint}>{t(`mesh.warnings.${warning}`, { defaultValue: t("mesh.reportWarnings") })}</span>)}
    </>}
  </MeshFrame>;
}

export function RetopologyControl() {
  const { t } = useTranslation();
  const inputId = useId();
  const { busy, ready } = useMeshContext();
  const faceBudget = useMeshToolsStore((state) => state.faceBudget);
  return <MeshFrame>
    <Label htmlFor={inputId}>{t("mesh.faceBudget")}</Label>
    <Input id={inputId} type="number" min={128} max={2000000} step={1} value={faceBudget} disabled={busy}
      onChange={(event) => {
        const value = Number(event.target.value);
        if (Number.isInteger(value) && value >= 128 && value <= 2000000) useMeshToolsStore.getState().setDraft({ faceBudget: value });
      }} />
    <span className={styles.hint}>{t("mesh.retopologyPolicy")}</span>
    <Button disabled={!ready} onClick={() => void enqueueMeshTask("retopology", { faceBudget })}>{t(busy ? "mesh.running" : "mesh.retopology")}</Button>
    <span className={styles.hint}>{t("mesh.previewHint")}</span>
  </MeshFrame>;
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
    <span className={styles.hint}>{t("mesh.uvPolicy")}</span>
    <Button disabled={!ready} onClick={() => void enqueueMeshTask("uv-unwrap", { resolution })}>{t(busy ? "mesh.running" : "mesh.uv")}</Button>
    <Button variant="outline" disabled={!template || exporting} onClick={() => void exportTemplate()}>{t("mesh.exportTemplate")}</Button>
    {failed && <span className={styles.error} role="alert">{t("mesh.exportFailed")}</span>}
    <span className={styles.hint}>{t("mesh.previewHint")}</span>
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
      menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      onChange={(option) => { if (option) useMeshToolsStore.getState().setDraft({ normalMode: option.value }); }} />
    {mode === "bake" && <>
      <Label htmlFor={highId}>{t("mesh.highVariant")}</Label>
      <Select inputId={highId} options={highOptions} value={highOptions.find((option) => option.value === highVariantId) ?? null} placeholder={t("mesh.chooseHighVariant")} isSearchable={false} isDisabled={busy}
        menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
        onChange={(option) => useMeshToolsStore.getState().setDraft({ highVariantId: option?.value ?? null })} />
      <ResolutionControl disabled={busy} />
      <span className={styles.hint}>{t("mesh.bakeHint")}</span>
    </>}
    <Button disabled={!ready || (mode === "bake" && !highValid)} onClick={() => void enqueueMeshTask("normals", { mode, resolution }, mode === "bake" ? highVariantId! : undefined)}>{t(busy ? "mesh.running" : "mesh.normals")}</Button>
    <span className={styles.hint}>{t("mesh.previewHint")}</span>
  </MeshFrame>;
}
