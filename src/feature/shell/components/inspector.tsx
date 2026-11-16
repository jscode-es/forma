"use client";

import { useState, type ReactNode } from "react";
import type { ParseKeys } from "i18next";
import { HelpHint } from "@/components/help-hint";
import { ProgressButton } from "@/components/progress-button";
import { NumberField } from "@/components/number-field";
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
import { ACTIVE, canAutoTexture, EngineControl, generateModel, TextureControl, useJobsStore } from "@/feature/jobs";
import { InterchangeControl } from "@/feature/interchange";
import { MaterialControl } from "@/feature/materials";
import { PaintControl, usePaintStore } from "@/feature/paint";
import { RigControl, RigEditorControl, RigWeightsControl } from "@/feature/rigging";
import { AnimationLibraryControl, AnimationEditorControl, AnimationRetargetControl, AnimationTextControl, AnimationVideoControl, useAnimationStore } from "@/feature/animation";
import { MeshInspectControl, RetopologyControl, UvControl, NormalsControl, OcclusionControl } from "@/feature/mesh-tools";
import { useModelsStore } from "@/feature/models";
import { ReferenceProjection, ReferenceReview } from "@/feature/references";
import { ExportControl, LodExportControl, OptimizeControl } from "@/feature/versions";
import { DEFAULT_QUALITY_STEPS, useProjectStore, type Quality } from "@/stores/project-store";
import { currentTab, useWorkspaceStore, type InspectorTab } from "@/stores/workspace-store";
import styles from "../shell.module.css";
import { PLANNED_SECTIONS, SECTION_TABS, type SectionKey } from "../sections";

type SectionDef = { tab: InspectorTab; id: SectionKey; phase?: number; content?: ReactNode; action?: ReactNode };

const QUALITIES: Quality[] = ["fast", "balanced", "high"];

const SECTION_HELP: Partial<Record<SectionKey, ParseKeys[]>> = {
  engine: ["inspector.generateReady"],
  retopology: ["mesh.retopologyPolicy", "mesh.previewHint"],
  optimize: ["optimize.hint"],
  texture: ["texture.hint"],
  materials: ["material.previewHint", "material.upscaleHint"],
  uv: ["mesh.uvPolicy", "mesh.previewHint"],
  normals: ["mesh.bakeHint", "mesh.previewHint"],
  occlusion: ["mesh.occlusionHint", "mesh.previewHint"],
  paint: ["paint.cloneHint", "paint.eyedropperHint", "paint.paintHint", "paint.saveHint"],
  rig: ["rigging.humanoidHint", "rigging.guideHint", "rigging.clipPolicyHint", "rigging.previewHint", "rigging.offsetHint", "rigging.restHint", "rigging.poseHint"],
  weights: ["rigging.weightsHint"],
  presets: ["animation.presetHint"],
  timeline: ["animation.saveHint"],
  retarget: ["animation.retargetHint"],
  video: ["animation.videoHint"],
  projection: ["references.projectionHint"],
};

function QualityControl() {
  const { t } = useTranslation();
  const quality = useProjectStore((s) => s.quality);
  const setQuality = useProjectStore((s) => s.setQuality);
  const steps = useProjectStore((s) => s.qualitySteps[s.quality]);

  return (
    <div className={styles.sectionBody} style={{ padding: 0, margin: 0 }}>
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
              <NumberField
                id={`quality-steps-${q}`}
                integer
                min={1}
                max={200}
                step={1}
                value={qualitySteps[q]}
                style={{ width: "5.5rem" }}
                onValueChange={(value) => setQualitySteps({ ...qualitySteps, [q]: value })}
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

function PipelineControl() {
  const { t } = useTranslation();
  const autoTexture = useProjectStore((s) => s.autoTexture);
  const gameReady = useProjectStore((s) => s.gameReady);
  const budget = useProjectStore((s) => s.gameBudget);
  useJobsStore((s) => s.engines);
  useProjectStore((s) => s.references);
  const textureReady = canAutoTexture();
  const { setAutoTexture, setGameReady, setGameBudget } = useProjectStore.getState();

  return (
    <div className={styles.sectionBody}>
      <div className={styles.row}>
        <Label htmlFor="pipeline-texture">{t("pipeline.texture")}</Label>
        <Switch id="pipeline-texture" checked={autoTexture && textureReady} disabled={!textureReady} onCheckedChange={setAutoTexture} />
      </div>
      {!textureReady && <span className={styles.hint}>{t("pipeline.textureUnavailable")}</span>}
      <div className={styles.row}>
        <Label htmlFor="pipeline-game">{t("pipeline.game")}</Label>
        <Switch id="pipeline-game" checked={gameReady} onCheckedChange={setGameReady} />
      </div>
      {gameReady && (
        <div className={styles.row}>
          <Label htmlFor="pipeline-budget">{t("pipeline.budget")}</Label>
          <NumberField id="pipeline-budget" integer min={500} max={200000} step={500} value={budget} onValueChange={setGameBudget} style={{ width: "7rem" }} />
        </div>
      )}
    </div>
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
          <NumberField
            id="scale-height"
            min={0.01}
            max={100}
            step={0.1}
            value={height}
            onValueChange={setHeight}
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
  const pipeline = useJobsStore((s) => s.pipeline);
  const job = useJobsStore((s) => s.pipeline ? s.jobs.find((j) => j.id === s.pipeline!.jobId) : s.jobs.find((j) => ACTIVE.has(j.status) && j.engineId === engineId && j.task === "image-to-3d"));
  const error = useJobsStore((s) => s.enqueueError);
  const ready = Boolean(engine?.available);
  const stepProgress = job && ACTIVE.has(job.status) ? job.progress : job ? 1 : 0;
  const progress = pipeline ? (pipeline.step + stepProgress) / pipeline.stages.length : job?.progress;
  const stage = pipeline?.stages[pipeline.step] ?? "generate";
  const label = !pipeline && !job ? t("inspector.generate")
    : job?.status === "queued" && stage === "generate" ? t("inspector.generateQueued")
    : (pipeline?.stages.length ?? 1) === 1 ? t("inspector.generating", { percent: Math.round((progress ?? 0) * 100) })
    : t(`inspector.pipelineStage.${stage}`, { percent: Math.round((progress ?? 0) * 100), step: (pipeline?.step ?? 0) + 1, total: pipeline?.stages.length ?? 1 });

  return (
    <div className={styles.inspectorFooter}>
      <ProgressButton size="lg" disabled={!ready || Boolean(pipeline)} progress={progress} onClick={() => generateModel()}>
        <Icon icon={Sparkles} size={16} />
        {label}
      </ProgressButton>
      {(error || !ready) && <span className={styles.hint} style={{ textAlign: "center", color: error ? "var(--color-destructive)" : undefined }}>
        {error ? t(`errors.${error}`, { defaultValue: error }) : t("inspector.generateHint")}
      </span>}
    </div>
  );
}

function AnimationFooter() {
  const { t } = useTranslation();
  return (
    <div className={styles.inspectorFooter}>
      <Button size="lg" onClick={() => { useWorkspaceStore.getState().setInspectorTab("clips"); useWorkspaceStore.getState().setDockTab("timeline"); }}>
        <Icon icon={Play} size={16} />
        {t("inspector.createAnimation")}
      </Button>
    </div>
  );
}

const SECTIONS: SectionDef[] = [
  { tab: "model", id: "retopology", content: <RetopologyControl /> },
  { tab: "model", id: "inspect", content: <MeshInspectControl /> },
  { tab: "finish", id: "texture", content: <TextureControl /> },
  { tab: "finish", id: "materials", content: <MaterialControl /> },
  { tab: "finish", id: "uv", content: <UvControl /> },
  { tab: "finish", id: "normals", content: <NormalsControl /> },
  { tab: "finish", id: "occlusion", content: <OcclusionControl /> },
  { tab: "finish", id: "paint", content: <PaintControl /> },
  { tab: "rig", id: "rig", content: <><RigControl /><RigEditorControl /></> },
  { tab: "rig", id: "weights", content: <RigWeightsControl /> },
  { tab: "clips", id: "presets", content: <AnimationLibraryControl /> },
  { tab: "clips", id: "timeline", content: <AnimationEditorControl /> },
  { tab: "retarget", id: "retarget", content: <AnimationRetargetControl /> },
  { tab: "capture", id: "video", content: <AnimationVideoControl /> },
  { tab: "capture", id: "textMotion", content: <AnimationTextControl /> },
  { tab: "edit", id: "proportions", content: <ReferenceReview /> },
  { tab: "edit", id: "projection", content: <ReferenceProjection /> },
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
  { tab: "interchange", id: "interchange", content: <InterchangeControl /> },
  { tab: "create", id: "pipeline", content: <PipelineControl /> },
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
  const paintDirty = usePaintStore((s) => !!s.draft?.engine.dirty);
  const animationDirty = useAnimationStore((s) => s.dirty);
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
        <Badge variant="secondary">{dirty || paintDirty || animationDirty ? t("inspector.unsaved") : t("inspector.draft")}</Badge>
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
                  <div className={styles.inspectorSectionHeader}>
                  <AccordionTrigger className={styles.sectionTrigger}>
                    <span className={styles.sectionTitle}>
                      {t(`inspector.sections.${s.id}.title`)}
                      {needle && <Badge variant="secondary">{t(`inspector.tabs.${s.tab}`)}</Badge>}
                    </span>
                  </AccordionTrigger>
                    <div className={styles.sectionActions}>
                      {s.action}
                      <HelpHint label={`${t("common.help")}: ${t(`inspector.sections.${s.id}.title`)}`} text={[t(`inspector.sections.${s.id}.help`), ...(SECTION_HELP[s.id] ?? []).map((key) => t(key))].join("\n\n")} />
                    </div>
                  </div>
                  <AccordionContent>
                    <div className={styles.sectionBody}>
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
