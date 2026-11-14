"use client";

import { useState, type ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Icon,
  Input,
  InputGroup,
  InputGroupAddon,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@kivora/nextjs";
import { Play, Search, Settings, SlidersHorizontal, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, EngineControl, generateModel, useJobsStore } from "@/feature/jobs";
import { useModelsStore } from "@/feature/models";
import { ExportControl, LodExportControl, OptimizeControl } from "@/feature/versions";
import { DEFAULT_QUALITY_STEPS, useProjectStore, type Quality } from "@/stores/project-store";
import { currentTab, useWorkspaceStore, type InspectorTab } from "@/stores/workspace-store";
import styles from "../shell.module.css";
import { PLANNED_SECTIONS, SECTION_TABS, type SectionKey } from "../sections";
import { HelpHint } from "./help-hint";

type SectionDef = { tab: InspectorTab; id: SectionKey; phase?: number; content?: ReactNode; action?: ReactNode };

const QUALITIES: Quality[] = ["fast", "balanced", "high"];

function QualityControl() {
  const { t } = useTranslation();
  const quality = useProjectStore((s) => s.quality);
  const setQuality = useProjectStore((s) => s.setQuality);
  const steps = useProjectStore((s) => s.qualitySteps[s.quality]);

  return (
    <div className={styles.sectionBody} style={{ padding: 0 }}>
      <ToggleGroup
        type="single"
        value={quality}
        onValueChange={(v) => v && setQuality(v as Quality)}
        aria-label={t("inspector.sections.quality.title")}
        style={{ width: "100%" }}
      >
        {QUALITIES.map((q) => (
          <ToggleGroupItem key={q} value={q} style={{ flex: 1 }}>
            {t(`quality.${q}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className={styles.hint}>{t("quality.selected", { steps })}</span>
    </div>
  );
}

function QualityStepsButton() {
  const { t } = useTranslation();
  const qualitySteps = useProjectStore((s) => s.qualitySteps);
  const setQualitySteps = useProjectStore((s) => s.setQualitySteps);

  return (
    <Popover>
      <PopoverTrigger className={styles.iconAction} aria-label={t("quality.customize")} title={t("quality.customize")}>
        <Icon icon={Settings} size={15} />
      </PopoverTrigger>
      <PopoverContent style={{ width: 240 }}>
        <div className={styles.sectionBody}>
          <strong style={{ fontSize: "0.8125rem" }}>{t("quality.stepsTitle")}</strong>
          {QUALITIES.map((q) => (
            <div key={q} className={styles.row}>
              <Label htmlFor={`quality-steps-${q}`}>{t(`quality.${q}`)}</Label>
              <Input
                id={`quality-steps-${q}`}
                type="number"
                min={1}
                max={200}
                step={1}
                value={qualitySteps[q]}
                style={{ width: "5.5rem" }}
                onChange={(e) => {
                  const value = Math.round(Number(e.target.value));
                  if (Number.isFinite(value) && value >= 1 && value <= 200) setQualitySteps({ ...qualitySteps, [q]: value });
                }}
              />
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setQualitySteps(DEFAULT_QUALITY_STEPS)}>
            {t("quality.reset")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ScaleControl() {
  const { t } = useTranslation();
  const enabled = useProjectStore((s) => s.physicalScale);
  const height = useProjectStore((s) => s.heightMeters);
  const setEnabled = useProjectStore((s) => s.setPhysicalScale);
  const setHeight = useProjectStore((s) => s.setHeightMeters);

  return (
    <div className={styles.sectionBody}>
      <div className={styles.row}>
        <Label htmlFor="physical-scale">{t("scale.apply")}</Label>
        <Switch id="physical-scale" checked={enabled} onCheckedChange={setEnabled} />
      </div>
      {enabled && (
        <div className={styles.row}>
          <Label htmlFor="scale-height">{t("scale.height")}</Label>
          <Input
            id="scale-height"
            type="number"
            min={0.01}
            max={100}
            step={0.1}
            value={height}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value) && value > 0 && value <= 100) setHeight(value);
            }}
            style={{ width: "7rem" }}
          />
        </div>
      )}
    </div>
  );
}

function ManageModelsButton() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={styles.iconAction}
      aria-label={t("models.manage")}
      title={t("models.manage")}
      onClick={() => useModelsStore.getState().setOpen(true)}
    >
      <Icon icon={Settings} size={15} />
    </button>
  );
}

function GenerateFooter() {
  const { t } = useTranslation();
  const engineId = useProjectStore((s) => s.engine.id);
  const engine = useJobsStore((s) => s.engines.find((e) => e.id === engineId));
  const busy = useJobsStore((s) => s.jobs.some((j) => ACTIVE.has(j.status) && j.engineId === engineId));
  const error = useJobsStore((s) => s.enqueueError);
  const ready = Boolean(engine?.available);

  return (
    <div className={styles.inspectorFooter}>
      <Button size="lg" disabled={!ready} onClick={() => generateModel()}>
        <Icon icon={Sparkles} size={16} />
        {t("inspector.generate")}
      </Button>
      <span className={styles.hint} style={{ textAlign: "center", color: error ? "var(--color-destructive)" : undefined }}>
        {error ? t(`errors.${error}`, { defaultValue: error }) : (!ready ? t("inspector.generateHint") : busy ? t("inspector.generateQueued") : t("inspector.generateReady"))}
      </span>
    </div>
  );
}

function AnimationFooter() {
  const { t } = useTranslation();
  return (
    <div className={styles.inspectorFooter}>
      <Button size="lg" disabled>
        <Icon icon={Play} size={16} />
        {t("inspector.createAnimation")}
      </Button>
      <span className={styles.hint} style={{ textAlign: "center" }}>
        {t("common.availableIn", { phase: 15 })}
      </span>
    </div>
  );
}

const SECTIONS: SectionDef[] = [
  {
    tab: "create",
    id: "engine",
    action: <ManageModelsButton />,
    content: <EngineControl />,
  },
  { tab: "create", id: "quality", action: <QualityStepsButton />, content: <QualityControl /> },
  { tab: "model", id: "optimize", content: <OptimizeControl /> },
  { tab: "files", id: "glb", content: <ExportControl /> },
  { tab: "files", id: "lod", content: <LodExportControl /> },
  { tab: "create", id: "scale", content: <ScaleControl /> },
  ...(Object.keys(PLANNED_SECTIONS) as InspectorTab[]).flatMap((tab) => PLANNED_SECTIONS[tab].map((s) => ({ tab, ...s }))),
];

export function Inspector({ inSheet = false }: { inSheet?: boolean }) {
  const { t } = useTranslation();
  const section = useWorkspaceStore((s) => s.section);
  const tab = useWorkspaceStore(currentTab);
  const setTab = useWorkspaceStore((s) => s.setInspectorTab);
  const tabs = SECTION_TABS[section];
  const name = useProjectStore((s) => s.name);
  const dirty = useProjectStore((s) => s.dirty);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? SECTIONS.filter((s) => tabs.includes(s.tab) && t(`inspector.sections.${s.id}.title`).toLowerCase().includes(needle))
    : SECTIONS.filter((s) => s.tab === tab);

  return (
    <aside className={styles.panel} aria-label={t("inspector.title")}>
      <div className={styles.inspectorHeader} style={inSheet ? { paddingRight: "3rem" } : undefined}>
        <Icon icon={SlidersHorizontal} size={16} />
        <h2 className={styles.panelTitle}>{t("inspector.title")}</h2>
        <span className={styles.spacer} />
        <Badge variant="secondary">{dirty ? t("inspector.unsaved") : t("inspector.draft")}</Badge>
      </div>

      <div className={styles.scroll}>
        <div className={styles.inspectorBody}>
          <div className={styles.hint}>
            {t("inspector.activeObject")}{" "}
            <strong style={{ color: "var(--color-foreground)" }}>{name ?? t("topBar.untitled")}</strong>
          </div>

          <InputGroup>
            <InputGroupAddon>
              <Icon icon={Search} size={15} />
            </InputGroupAddon>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("inspector.search")}
              aria-label={t("inspector.search")}
            />
          </InputGroup>

          {!needle && (
            <div
              className={styles.inspectorTabs}
              role="tablist"
              aria-label={t(`nav.${section}`)}
              style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
            >
              {tabs.map((id, index) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`inspector-tab-${id}`}
                  aria-controls="inspector-panel"
                  tabIndex={tab === id ? 0 : -1}
                  onKeyDown={(e) => {
                    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
                    let next = keys[e.key] !== undefined ? (index + keys[e.key] + tabs.length) % tabs.length : -1;
                    if (e.key === "Home") next = 0;
                    if (e.key === "End") next = tabs.length - 1;
                    if (next < 0) return;
                    e.preventDefault();
                    setTab(tabs[next]);
                    document.getElementById(`inspector-tab-${tabs[next]}`)?.focus();
                  }}
                  aria-selected={tab === id}
                  className={`${styles.inspectorTab} ${tab === id ? styles.inspectorTabActive : ""}`}
                  onClick={() => setTab(id)}
                >
                  {t(`inspector.tabs.${id}`)}
                </button>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <p className={styles.hint}>{t("inspector.noResults")}</p>
          ) : (
            <div id="inspector-panel" role="tabpanel" aria-labelledby={needle ? undefined : `inspector-tab-${tab}`}>
            <Accordion
              key={needle ? "search" : tab}
              type="multiple"
              defaultValue={visible.slice(0, 3).map((s) => `${s.tab}-${s.id}`)}
            >
              {visible.map((s) => (
                <AccordionItem key={`${s.tab}-${s.id}`} value={`${s.tab}-${s.id}`}>
                  <AccordionTrigger className={styles.sectionTrigger}>
                    <span className={styles.sectionTitle}>
                      {t(`inspector.sections.${s.id}.title`)}
                      {needle && <Badge variant="secondary">{t(`inspector.tabs.${s.tab}`)}</Badge>}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className={styles.sectionBody}>
                      <div className={styles.row}>
                        <span className={styles.hint}>{t(`inspector.sections.${s.id}.help`)}</span>
                        <span className={styles.sectionActions}>
                          {s.action}
                          <HelpHint text={t(`inspector.sections.${s.id}.help`)} />
                        </span>
                      </div>
                      {s.content}
                      {s.phase && !s.content && (
                        <Badge variant="outline" style={{ justifySelf: "start" }}>
                          {t("common.availableIn", { phase: s.phase })}
                        </Badge>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            </div>
          )}
        </div>
      </div>

      {section === "create3d" && <GenerateFooter />}
      {section === "createAnimation" && <AnimationFooter />}
    </aside>
  );
}
