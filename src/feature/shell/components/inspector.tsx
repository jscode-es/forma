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
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@kivora/nextjs";
import { Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, EngineControl, generateModel, useJobsStore } from "@/feature/jobs";
import { useProjectStore, type Quality } from "@/stores/project-store";
import { useWorkspaceStore, type InspectorTab } from "@/stores/workspace-store";
import styles from "../shell.module.css";
import { INSPECTOR_TABS, PLANNED_SECTIONS, type SectionKey } from "../sections";
import { HelpHint } from "./help-hint";

type SectionDef = { tab: InspectorTab; id: SectionKey; phase?: number; content?: ReactNode };

const QUALITIES: Quality[] = ["fast", "balanced", "high"];

function QualityControl() {
  const { t } = useTranslation();
  const quality = useProjectStore((s) => s.quality);
  const setQuality = useProjectStore((s) => s.setQuality);

  return (
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
        {error ?? (!ready ? t("inspector.generateHint") : busy ? t("inspector.generateQueued") : t("inspector.generateReady"))}
      </span>
    </div>
  );
}

const SECTIONS: SectionDef[] = [
  { tab: "create", id: "engine", content: <EngineControl /> },
  { tab: "create", id: "quality", content: <QualityControl /> },
  { tab: "create", id: "scale", content: <ScaleControl /> },
  ...INSPECTOR_TABS.flatMap((tab) => PLANNED_SECTIONS[tab].map((s) => ({ tab, ...s }))),
];

export function Inspector({ inSheet = false }: { inSheet?: boolean }) {
  const { t } = useTranslation();
  const tab = useWorkspaceStore((s) => s.inspectorTab);
  const setTab = useWorkspaceStore((s) => s.setInspectorTab);
  const name = useProjectStore((s) => s.name);
  const dirty = useProjectStore((s) => s.dirty);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? SECTIONS.filter((s) => t(`inspector.sections.${s.id}.title`).toLowerCase().includes(needle))
    : SECTIONS.filter((s) => s.tab === tab);

  return (
    <div className={styles.panel}>
      <div className={styles.inspectorHeader} style={inSheet ? { paddingRight: "3rem" } : undefined}>
        <Icon icon={SlidersHorizontal} size={16} />
        <strong>{t("inspector.title")}</strong>
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
            <div className={styles.inspectorTabs} role="tablist" aria-label={t("inspector.title")}>
              {INSPECTOR_TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
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
            <Accordion
              key={needle ? "search" : tab}
              type="multiple"
              defaultValue={visible.slice(0, 3).map((s) => `${s.tab}-${s.id}`)}
            >
              {visible.map((s) => (
                <AccordionItem key={`${s.tab}-${s.id}`} value={`${s.tab}-${s.id}`}>
                  <AccordionTrigger>
                    <span className={styles.sectionTitle}>
                      {t(`inspector.sections.${s.id}.title`)}
                      {needle && <Badge variant="secondary">{t(`inspector.tabs.${s.tab}`)}</Badge>}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className={styles.sectionBody}>
                      <div className={styles.row}>
                        <span className={styles.hint}>{t(`inspector.sections.${s.id}.help`)}</span>
                        <HelpHint text={t(`inspector.sections.${s.id}.help`)} />
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
          )}
        </div>
      </div>

      {tab === "create" && !needle && <GenerateFooter />}
    </div>
  );
}
