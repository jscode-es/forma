"use client";

import { useMemo } from "react";
import { Badge, Button, Icon, Label, Popover, PopoverContent, PopoverTrigger, Select, Switch, Textarea, ToggleGroup, ToggleGroupItem } from "@kivora/nextjs";
import { NumberField } from "@/components/number-field";
import { CircleHelp, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EngineParameter, EngineTask, ParameterValue } from "@/lib/forma";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { localized, useJobsStore, usesStyle } from "../jobs-store";
import styles from "../jobs.module.css";

type ParameterProps = {
  parameter: EngineParameter;
  value: ParameterValue | undefined;
  idPrefix: string;
  setParameter: (key: string, value: ParameterValue) => void;
};

const INLINE_SELECTS = ["octreeResolution", "atlasResolution"];

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
    if (INLINE_SELECTS.includes(parameter.id)) {
      const options = parameter.options.map((option) => ({ value: option.value, label: localized(option.label, i18n.language) }));
      return <div className={styles.paramRow}>
        <Label htmlFor={inputId}>{label}</Label>
        <div style={{ width: "7rem", flexShrink: 0 }}><Select inputId={inputId} options={options} value={options.find((option) => option.value === (value ?? parameter.default)) ?? null}
          isSearchable={false} menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto"
          styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }} onChange={(option) => option && setParameter(parameter.id, option.value)} /></div>
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
      <NumberField
        id={inputId}
        integer={parameter.type === "integer"}
        min={parameter.min}
        max={parameter.max}
        step={parameter.step ?? (parameter.type === "integer" ? 1 : 0.1)}
        value={(value as number) ?? parameter.default}
        style={{ width: "7rem" }}
        onValueChange={(next) => setParameter(parameter.id, next)}
      />
    </div>
  );
}

export type EngineControlTask = Extract<EngineTask, "image-to-3d" | "text-to-image" | "text-to-multiview" | "texture">;

function StyleSettings() {
  const { t } = useTranslation();
  const style = useSettingsStore((state) => state.sdxlStyle);
  const setStyle = useSettingsStore((state) => state.setSdxlStyle);
  return <Popover>
    <PopoverTrigger className={styles.engineHelp} aria-label={t("prompt.styleSettings")} title={t("prompt.styleSettings")}>
      <Icon icon={Settings} size={16} />
    </PopoverTrigger>
    <PopoverContent align="end" style={{ width: "min(32rem, calc(100vw - 2rem))", maxHeight: "80dvh", overflowY: "auto", display: "grid", gap: "0.75rem" }}>
      <Label htmlFor="sdxl-style">{t("prompt.styleLabel")}</Label>
      <Textarea id="sdxl-style" value={style} maxLength={2000} minRows={6} maxRows={14} autoResize showCount placeholder={t("prompt.stylePlaceholder")}
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
  const forViews = task === "text-to-multiview";
  const forImages = task === "text-to-image" || forViews;
  const forTextures = task === "texture";
  const selection = useProjectStore((s) => (forTextures ? s.textureEngine : forViews ? s.multiviewEngine : forImages ? s.imageEngine : s.engine));
  const setModelEngine = useProjectStore((s) => s.setEngine);
  const setImageEngine = useProjectStore((s) => s.setImageEngine);
  const setMultiviewEngine = useProjectStore((s) => s.setMultiviewEngine);
  const setTextureEngine = useProjectStore((s) => s.setTextureEngine);
  const setParameter = useProjectStore((s) => (forTextures ? s.setTextureEngineParameter : forViews ? s.setMultiviewEngineParameter : forImages ? s.setImageEngineParameter : s.setEngineParameter));
  const setEngine = (id: string | null) => (forTextures ? setTextureEngine({ id, parameters: {} }) : forViews ? setMultiviewEngine({ id, parameters: {} }) : forImages ? setImageEngine({ id, parameters: {} }) : setModelEngine(id));
  const engine = engines.find((e) => e.id === selection.id) ?? null;
  const hasStyle = forImages && engine !== null && usesStyle(engine);

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
            .filter((parameter) => !(forImages && engine.network && parameter.id === "consent"))
            .filter((parameter) => !(task === "image-to-3d" && parameter.id === "steps"))
            .map((parameter) => (
              <ParameterControl
                key={parameter.id}
                parameter={parameter}
                idPrefix={`engine-param-${task}`}
                setParameter={setParameter}
                value={selection.parameters[parameter.id]}
              />
            ))}
        </>
      )}
    </div>
  );
}
