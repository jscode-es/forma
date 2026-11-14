"use client";

import { useState } from "react";
import { Button, Icon, Input, Label } from "@kivora/nextjs";
import { Shrink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, engineFor, optimizeModel, useJobsStore } from "@/feature/jobs";
import { activeVariant, useProjectStore } from "@/stores/project-store";
import styles from "../versions.module.css";

type Budgets = { budget: number; lod1: number; lod2: number; lod3: number };

const FIELDS: (keyof Budgets)[] = ["budget", "lod1", "lod2", "lod3"];

export function OptimizeControl() {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState<Budgets>({ budget: 10000, lod1: 0, lod2: 0, lod3: 0 });
  const active = useProjectStore(activeVariant);
  const engines = useJobsStore((s) => s.engines);
  const busy = useJobsStore((s) => s.jobs.some((j) => ACTIVE.has(j.status) && j.task === "optimize"));
  const engine = engines.length > 0 ? engineFor("optimize") : undefined;
  const number = new Intl.NumberFormat(i18n.language);

  const lods = [values.lod1, values.lod2, values.lod3].filter((v) => v > 0);
  const valid =
    values.budget >= 128 && lods.every((v, i) => v >= 128 && v < (i === 0 ? values.budget : lods[i - 1]));
  const canRun = Boolean(engine) && active.model.type !== "default-cube" && valid && !busy;

  return (
    <div className={styles.stack}>
      <span className={styles.hint}>
        {t("optimize.source", {
          name: active.origin === "default" ? t("scene.cube") : active.label,
          triangles: active.triangles !== null ? number.format(active.triangles) : "-",
        })}
      </span>
      {FIELDS.map((field) => (
        <div key={field} className={styles.field}>
          <Label htmlFor={`optimize-${field}`}>{t(`optimize.${field}`)}</Label>
          <Input
            id={`optimize-${field}`}
            type="number"
            min={field === "budget" ? 128 : 0}
            max={2000000}
            step={100}
            value={values[field]}
            style={{ width: "8rem" }}
            onChange={(e) => {
              const next = Math.round(Number(e.target.value));
              if (Number.isFinite(next) && next >= 0 && next <= 2000000) setValues((v) => ({ ...v, [field]: next }));
            }}
          />
        </div>
      ))}
      {!valid && <span className={styles.error}>{t("optimize.invalid")}</span>}
      {active.model.type === "default-cube" && <span className={styles.hint}>{t("optimize.needsModel")}</span>}
      <Button disabled={!canRun} onClick={() => optimizeModel(values)}>
        <Icon icon={Shrink} size={15} />
        {busy ? t("optimize.running") : t("optimize.run")}
      </Button>
      <span className={styles.hint}>{t("optimize.hint")}</span>
    </div>
  );
}
