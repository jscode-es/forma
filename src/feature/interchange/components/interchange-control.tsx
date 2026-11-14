"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Label, Switch, ToggleGroup, ToggleGroupItem } from "@kivora/nextjs";
import { FolderDown, PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, engineFor, errorMessage, packageModel, useJobsStore, type PackageTarget } from "@/feature/jobs";
import type { PackageResult } from "@/lib/forma";
import { activeVariant, useProjectStore } from "@/stores/project-store";
import styles from "../interchange.module.css";

const TARGETS: PackageTarget[] = ["blender", "unity", "godot"];

type Validation = { validator: string; files: Record<string, { errors: number; warnings: number; infos: number; hints: number }> };

export function InterchangeControl() {
  const { t } = useTranslation();
  const variant = useProjectStore(activeVariant);
  const sessionId = useProjectStore((s) => s.sessionId);
  const engines = useJobsStore((s) => s.engines);
  const busy = useJobsStore((s) => s.jobs.some((j) => ACTIVE.has(j.status) && j.task === "export-package"));
  const last = useJobsStore((s) => s.lastPackage);
  const job = useJobsStore((s) => s.jobs.find((j) => j.id === last?.jobId));
  const [target, setTarget] = useState<PackageTarget>("blender");
  const [includeLods, setIncludeLods] = useState(true);
  const [tangents, setTangents] = useState(true);
  const [loaded, setLoaded] = useState<{ jobId: string; data: Validation } | null>(null);
  const [written, setWritten] = useState<{ jobId: string; data: PackageResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = last && last.sessionId === sessionId && last.variantId === variant.id ? last : null;
  const validation = current && loaded?.jobId === current.jobId ? loaded.data : null;
  const result = current && written?.jobId === current.jobId ? written.data : null;
  const ready = engines.length > 0 && Boolean(engineFor("export-package")) && variant.model.type !== "default-cube" && !busy;

  useEffect(() => {
    if (!current || !window.forma) return;
    let active = true;
    window.forma.jobs
      .readFile(current.jobId, "out/validation.json")
      .then((bytes) => active && setLoaded({ jobId: current.jobId, data: JSON.parse(new TextDecoder().decode(bytes)) as Validation }))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [current]);

  async function exportFolder() {
    if (!current) return;
    setError(null);
    try {
      const data = await window.forma!.jobs.exportPackage(current.jobId, current.name);
      if (data) setWritten({ jobId: current.jobId, data });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={styles.stack}>
      <ToggleGroup type="single" value={target} onValueChange={(value) => value && setTarget(value as PackageTarget)} aria-label={t("interchange.target")} style={{ width: "100%" }}>
        {TARGETS.map((value) => (
          <ToggleGroupItem key={value} value={value} style={{ flex: 1 }}>
            {t(`interchange.targets.${value}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className={styles.hint}>{t(`interchange.targetHints.${target}`)}</span>
      <div className={styles.row}>
        <Label htmlFor="package-lods">{t("interchange.includeLods", { count: variant.lods.length })}</Label>
        <Switch id="package-lods" checked={includeLods && variant.lods.length > 0} disabled={variant.lods.length === 0} onCheckedChange={setIncludeLods} />
      </div>
      <div className={styles.row}>
        <Label htmlFor="package-tangents">{t("interchange.tangents")}</Label>
        <Switch id="package-tangents" checked={tangents} onCheckedChange={setTangents} />
      </div>
      <Button disabled={!ready} onClick={() => void packageModel(target, includeLods, tangents)}>
        <Icon icon={PackageCheck} size={15} />
        {busy ? t("interchange.preparing") : t("interchange.prepare")}
      </Button>
      {variant.model.type === "default-cube" && <span className={styles.hint}>{t("interchange.needsModel")}</span>}
      {current && job?.status === "succeeded" && (
        <>
          <ul className={styles.files} aria-label={t("interchange.files")}>
            {job.results.map((file) => {
              const report = validation?.files[file.path.replace(/^out\//, "")];
              return (
                <li key={file.path}>
                  <span>{file.path.replace(/^out\//, "")}</span>
                  {report && <span className={styles.badge}>{t("interchange.valid", { errors: report.errors, warnings: report.warnings })}</span>}
                </li>
              );
            })}
          </ul>
          {validation && <span className={styles.hint}>{t("interchange.validator", { version: validation.validator, target: t(`interchange.targets.${current.target}`) })}</span>}
          <Button variant="outline" onClick={() => void exportFolder()}>
            <Icon icon={FolderDown} size={15} />
            {t("interchange.export")}
          </Button>
        </>
      )}
      {result && <span className={styles.ok}>{t("interchange.done", { path: result.path, files: result.files })}</span>}
      {error && <span className={styles.error}>{t(`errors.${error}`, { defaultValue: error })}</span>}
    </div>
  );
}
