"use client";

import { useMemo } from "react";
import { Badge, Input, Label, Select, Switch, ToggleGroup, ToggleGroupItem } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import type { EngineParameter, ParameterValue } from "@/lib/forma";
import { useProjectStore } from "@/stores/project-store";
import { localized, useJobsStore } from "../jobs-store";
import styles from "../jobs.module.css";

function ParameterControl({ parameter, value }: { parameter: EngineParameter; value: ParameterValue | undefined }) {
  const { i18n } = useTranslation();
  const setParameter = useProjectStore((s) => s.setEngineParameter);
  const label = localized(parameter.label, i18n.language);
  const inputId = `engine-param-${parameter.id}`;

  if (parameter.type === "boolean") {
    return (
      <div className={styles.paramRow}>
        <Label htmlFor={inputId}>{label}</Label>
        <Switch id={inputId} checked={(value as boolean) ?? parameter.default} onCheckedChange={(v) => setParameter(parameter.id, v)} />
      </div>
    );
  }

  if (parameter.type === "enum") {
    return (
      <div className={styles.paramStack}>
        <Label>{label}</Label>
        <ToggleGroup
          type="single"
          value={(value as string) ?? parameter.default}
          onValueChange={(v) => v && setParameter(parameter.id, v)}
          aria-label={label}
        >
          {parameter.options.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value} size="sm">
              {localized(option.label, i18n.language)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    );
  }

  return (
    <div className={styles.paramRow}>
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type="number"
        min={parameter.min}
        max={parameter.max}
        step={parameter.step ?? (parameter.type === "integer" ? 1 : 0.1)}
        value={(value as number) ?? parameter.default}
        style={{ width: "7rem" }}
        onChange={(e) => {
          const next = Number(e.target.value);
          const valid = Number.isFinite(next) && next >= parameter.min && next <= parameter.max;
          if (valid && (parameter.type === "number" || Number.isInteger(next))) setParameter(parameter.id, next);
        }}
      />
    </div>
  );
}

export function EngineControl() {
  const { t, i18n } = useTranslation();
  const allEngines = useJobsStore((s) => s.engines);
  const engines = useMemo(() => allEngines.filter((e) => e.tasks.includes("image-to-3d")), [allEngines]);
  const selection = useProjectStore((s) => s.engine);
  const setEngine = useProjectStore((s) => s.setEngine);
  const engine = engines.find((e) => e.id === selection.id) ?? null;

  if (engines.length === 0) {
    return (
      <div className={styles.notice}>
        <strong>{t("engine.none")}</strong>
        <span className={styles.hint}>{t("engine.noneHint")}</span>
      </div>
    );
  }

  const options = engines.map((e) => ({
    value: e.id,
    label: e.demo ? `${e.name} · ${t("engine.demo")}` : e.name,
    isDisabled: !e.available,
  }));

  return (
    <div className={styles.paramStack} style={{ gap: "0.75rem" }}>
      <Select
        aria-label={t("inspector.sections.engine.title")}
        options={options}
        value={options.find((o) => o.value === selection.id) ?? null}
        placeholder={t("engine.choose")}
        isSearchable={false}
        onChange={(option) => setEngine(option?.value ?? null)}
      />
      {engine && (
        <>
          <span className={styles.hint}>
            {localized(engine.description, i18n.language)} · {engine.license} · v{engine.version}
          </span>
          {!engine.available && <Badge variant="destructive">{t(`engine.problem.${engine.problem}`, { defaultValue: engine.problem ?? "" })}</Badge>}
          {engine.parameters.map((parameter) => (
            <ParameterControl key={parameter.id} parameter={parameter} value={selection.parameters[parameter.id]} />
          ))}
        </>
      )}
    </div>
  );
}
