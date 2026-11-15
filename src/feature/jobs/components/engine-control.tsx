"use client";

import { useMemo } from "react";
import { Badge, Button, Icon, Input, Label, Popover, PopoverContent, PopoverTrigger, Select, Switch, Textarea, ToggleGroup, ToggleGroupItem } from "@kivora/nextjs";
import { CircleHelp, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EngineParameter, EngineTask, ParameterValue } from "@/lib/forma";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { localized, useJobsStore } from "../jobs-store";
import styles from "../jobs.module.css";

type ParameterProps = {
  parameter: EngineParameter;
  value: ParameterValue | undefined;
  idPrefix: string;
  setParameter: (key: string, value: ParameterValue) => void;
};

function ParameterControl({ parameter, value, idPrefix, setParameter }: ParameterProps) {
  const { i18n } = useTranslation();
  const label = localized(parameter.label, i18n.language);
  const inputId = `${idPrefix}-${parameter.id}`;

  if (parameter.type === "string") {
    return <div className={styles.paramStack}>
      <Label htmlFor={inputId}>{label}</Label>
      <Textarea id={inputId} value={(value as string) ?? parameter.default} maxLength={parameter.maxLength} minRows={3}
        onChange={(event) => setParameter(parameter.id, event.target.value)} />
    </div>;
  }

  if (parameter.type === "boolean") {
    return (
      <div className={styles.paramRow}>
        <Label htmlFor={inputId}>{label}</Label>
        <Switch id={inputId} checked={(value as boolean) ?? parameter.default} onCheckedChange={(v) => setParameter(parameter.id, v)} />
      </div>
    );
  }

  if (parameter.type === "enum") {
    if (parameter.id === "octreeResolution") {
      const options = parameter.options.map((option) => ({ value: option.value, label: localized(option.label, i18n.language) }));
      return <div className={styles.paramStack}>
        <Label htmlFor={inputId}>{label}</Label>
        <Select inputId={inputId} options={options} value={options.find((option) => option.value === (value ?? parameter.default)) ?? null}
          isSearchable={false} menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto"
          styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }} onChange={(option) => option && setParameter(parameter.id, option.value)} />
      </div>;
    }
    return (
      <div className={styles.paramStack}>
        <Label>{label}</Label>
        <ToggleGroup
          type="single"
          attached={false}
          style={{ flexWrap: "wrap" }}
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

export type EngineControlTask = Extract<EngineTask, "image-to-3d" | "text-to-image" | "texture">;

function StyleSettings() {
  const { t } = useTranslation();
  const style = useSettingsStore((state) => state.sdxlStyle);
  const setStyle = useSettingsStore((state) => state.setSdxlStyle);
  return <Popover>
    <PopoverTrigger className={styles.engineHelp} aria-label={t("prompt.styleSettings")} title={t("prompt.styleSettings")}>
      <Icon icon={Settings} size={16} />
    </PopoverTrigger>
    <PopoverContent align="end" style={{ width: "min(24rem, calc(100vw - 2rem))", display: "grid", gap: "0.75rem" }}>
      <Label htmlFor="sdxl-style">{t("prompt.styleLabel")}</Label>
      <Textarea id="sdxl-style" value={style} maxLength={256} minRows={4} placeholder={t("prompt.stylePlaceholder")}
        aria-describedby="sdxl-style-hint" onChange={(event) => setStyle(event.target.value)} />
      <p id="sdxl-style-hint" className={styles.hint}>{t("prompt.styleHint")}</p>
      <Button size="sm" variant="outline" disabled={!style} onClick={() => setStyle("")}>{t("prompt.styleClear")}</Button>
    </PopoverContent>
  </Popover>;
}

export function EngineControl({ task = "image-to-3d" }: { task?: EngineControlTask }) {
  const { t, i18n } = useTranslation();
  const allEngines = useJobsStore((s) => s.engines);
  const engines = useMemo(() => allEngines.filter((e) => e.tasks.includes(task)), [allEngines, task]);
  const forImages = task === "text-to-image";
  const forTextures = task === "texture";
  const selection = useProjectStore((s) => (forTextures ? s.textureEngine : forImages ? s.imageEngine : s.engine));
  const setModelEngine = useProjectStore((s) => s.setEngine);
  const setImageEngine = useProjectStore((s) => s.setImageEngine);
  const setTextureEngine = useProjectStore((s) => s.setTextureEngine);
  const setParameter = useProjectStore((s) => (forTextures ? s.setTextureEngineParameter : forImages ? s.setImageEngineParameter : s.setEngineParameter));
  const setEngine = (id: string | null) => (forTextures ? setTextureEngine({ id, parameters: {} }) : forImages ? setImageEngine({ id, parameters: {} }) : setModelEngine(id));
  const qualitySteps = useProjectStore((s) => (task === "image-to-3d" ? s.qualitySteps[s.quality] : undefined));
  const engine = engines.find((e) => e.id === selection.id) ?? null;
  const hasStyle = forImages && engine?.id === "sdxl-lightning" && engine.parameters.some((parameter) => parameter.id === "stylePrompt" && parameter.type === "string");

  if (engines.length === 0) {
    return (
      <div className={styles.notice}>
        <strong>{t("engine.none")}</strong>
        <span className={styles.hint}>{forImages ? t("prompt.noEngine") : t("engine.activateHint")}</span>
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
      <div className={styles.enginePicker}>
      <Select
        aria-label={forTextures ? t("texture.engine") : forImages ? t("prompt.engine") : t("inspector.sections.engine.title")}
        options={options}
        value={options.find((o) => o.value === selection.id) ?? null}
        placeholder={t("engine.choose")}
        isSearchable={false}
        menuPortalTarget={typeof document === "undefined" ? null : document.body}
        menuPosition="fixed" menuPlacement="auto"
        styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
        onChange={(option) => setEngine(option?.value ?? null)}
      />
      <div className={styles.engineActions}>
      {engine && <Popover key={engine.id}>
        <PopoverTrigger className={styles.engineHelp} aria-label={t("engine.details", { name: engine.name })}>
          <Icon icon={CircleHelp} size={16} />
        </PopoverTrigger>
        <PopoverContent style={{ maxWidth: 320, fontSize: "0.8125rem", lineHeight: 1.5 }}>
          <strong>{engine.name}</strong>
          <p>{localized(engine.description, i18n.language)}</p>
          <p className={styles.hint}>{engine.license} · v{engine.version}</p>
          {forImages && engine.network && <p>{t("prompt.networkHint")}</p>}
          {!forImages && engine.inputs.views.length > 0 && <p className={styles.hint}>
            {t("engine.views", { views: engine.inputs.views.map((view) => t(`viewport.presets.${view}`)).join(", ") })}
          </p>}
        </PopoverContent>
      </Popover>}
      {hasStyle && <StyleSettings />}
      </div>
      </div>
      {engine && (
        <>
          {!engine.available && <Badge variant="destructive">{t(`engine.problem.${engine.problem}`, { defaultValue: engine.problem ?? "" })}</Badge>}
          {engine.parameters
            .filter((parameter) => !parameter.tasks || parameter.tasks.includes(task))
            .filter((parameter) => !(parameter.id === "provider" && parameter.type === "enum" && parameter.options.length === 1))
            .filter((parameter) => !(hasStyle && parameter.id === "stylePrompt"))
            .map((parameter) => (
              <ParameterControl
                key={parameter.id}
                parameter={parameter}
                idPrefix={`engine-param-${task}`}
                setParameter={setParameter}
                value={selection.parameters[parameter.id] ?? (parameter.id === "steps" ? qualitySteps : undefined)}
              />
            ))}
        </>
      )}
    </div>
  );
}
