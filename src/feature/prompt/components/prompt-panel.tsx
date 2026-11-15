"use client";

import { useMemo } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Icon, Label, Switch, Textarea } from "@kivora/nextjs";
import { Check, Expand, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HelpHint } from "@/components/help-hint";
import { requestImages } from "./consent-dialog";
import { ACTIVE, EngineControl, pickCandidate, pickCandidateSet, useJobsStore, type Candidates } from "@/feature/jobs";
import { useBlobUrl } from "@/hooks/use-blob-url";
import type { PromptEntry } from "@/lib/forma";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import styles from "../prompt.module.css";

function Candidate({ candidates, file, index }: { candidates: Candidates; file: Candidates["files"][number]; index: number }) {
  const { t } = useTranslation();
  const url = useBlobUrl(`${candidates.jobId}:${file.path}`, () => window.forma?.jobs.readFile(candidates.jobId, file.path));
  const picked = candidates.picked === file.path;
  const label = file.seed === null ? t("prompt.useImage", { index: index + 1 }) : t("prompt.use", { seed: file.seed });
  const previewTitle = t("prompt.previewTitle", { index: index + 1 });
  const expandLabel = t("prompt.expandImage", { index: index + 1 });

  return (
    <Dialog>
      <div className={styles.candidateCard}>
        <button
          type="button"
          className={`${styles.candidate} ${picked ? styles.picked : ""}`}
          aria-pressed={picked}
          aria-label={label}
          title={label}
          onClick={() => pickCandidate(file.path)}
        >
          {url ? <img src={url} alt="" /> : <span className={styles.placeholder} />}
          <span className={styles.caption}>
            {picked && <Icon icon={Check} size={12} />}
            {picked ? t("prompt.picked") : file.seed === null ? index + 1 : t("prompt.seed", { seed: file.seed })}
          </span>
        </button>
        <DialogTrigger asChild>
          <Button className={styles.expandButton} size="icon" variant="secondary" disabled={!url} aria-label={expandLabel} title={expandLabel}>
            <Icon icon={Expand} size={16} />
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className={styles.imageDialog}>
        <DialogHeader>
          <DialogTitle>{previewTitle}</DialogTitle>
          <DialogDescription className={styles.previewPrompt}>{candidates.prompt}</DialogDescription>
        </DialogHeader>
        {url && <img className={styles.previewImage} src={url} alt={previewTitle} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewThumb({ candidates, file }: { candidates: Candidates; file: Candidates["files"][number] }) {
  const { t } = useTranslation();
  const url = useBlobUrl(`${candidates.jobId}:${file.path}`, () => window.forma?.jobs.readFile(candidates.jobId, file.path));
  const view = t(`viewport.presets.${file.view ?? "front"}`);
  return <figure className={styles.viewThumb}>
    {url ? <img src={url} alt={view} /> : <span className={styles.placeholder} />}
    <figcaption>{view}</figcaption>
  </figure>;
}

function ViewSet({ candidates, set }: { candidates: Candidates; set: number }) {
  const { t } = useTranslation();
  const files = candidates.files.filter((file) => file.set === set);
  const picked = candidates.picked === `set:${set}`;
  const seed = files[0]?.seed ?? null;
  const name = seed === null ? t("prompt.viewSetIndex", { index: set + 1 }) : t("prompt.viewSet", { seed });
  return <div className={`${styles.viewSet} ${picked ? styles.picked : ""}`} role="group" aria-label={name}>
    <div className={styles.viewSetImages}>{files.map((file) => <ViewThumb key={file.path} candidates={candidates} file={file} />)}</div>
    <Button size="sm" variant={picked ? "default" : "outline"} aria-pressed={picked} onClick={() => {
      void pickCandidateSet(set).then(() => useWorkspaceStore.getState().setReferenceTab("multi"));
    }}>
      {picked && <Icon icon={Check} size={14} />}
      {seed === null ? t(picked ? "prompt.viewsPickedIndex" : "prompt.useViewsIndex", { index: set + 1 }) : t(picked ? "prompt.viewsPicked" : "prompt.useViews", { seed })}
    </Button>
  </div>;
}

export function PromptControl() {
  const { t } = useTranslation();
  const prompt = useProjectStore((s) => s.prompt);
  const setPrompt = useProjectStore((s) => s.setPrompt);
  const sessionId = useProjectStore((s) => s.sessionId);
  const multiview = useWorkspaceStore((s) => s.promptMultiview);
  const setMultiview = useWorkspaceStore((s) => s.setPromptMultiview);
  const task = multiview ? "text-to-multiview" : "text-to-image";
  const engineId = useProjectStore((s) => (multiview ? s.multiviewEngine.id : s.imageEngine.id));
  const engine = useJobsStore((s) => s.engines.find((e) => e.id === engineId && e.tasks.includes(task)));
  const job = useJobsStore((s) => s.jobs.find((j) => ACTIVE.has(j.status) && (j.task === "text-to-image" || j.task === "text-to-multiview")));
  const candidates = useJobsStore((s) => (s.candidates?.sessionId === sessionId ? s.candidates : null));
  const ready = Boolean(engine?.available) && prompt.trim().length > 0 && !job;
  const sets = candidates ? [...new Set(candidates.files.flatMap((file) => (file.set === null ? [] : [file.set])))] : [];

  return (
    <div className={styles.stack}>
      <div className={styles.field}>
        <Textarea
          id="prompt-text"
          aria-label={t("prompt.label")}
          value={prompt}
          maxLength={1000}
          minRows={3}
          maxRows={8}
          autoResize
          placeholder={t("prompt.placeholder")}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ready) {
              e.preventDefault();
              requestImages(multiview);
            }
          }}
        />
      </div>
      <div className={styles.switchRow}>
        <Label htmlFor="prompt-multiview">{t("prompt.multiview")}</Label>
        <Switch id="prompt-multiview" checked={multiview} onCheckedChange={setMultiview} />
      </div>
      {multiview && <span className={styles.hint}>{t("prompt.multiviewHint")}</span>}
      <EngineControl task={task} />
      {candidates && sets.length > 0 && (
        <div className={styles.field}>
          <span className={styles.subtitle}>{t("prompt.viewSets")}</span>
          {sets.map((set) => <ViewSet key={set} candidates={candidates} set={set} />)}
        </div>
      )}
      {candidates && sets.length === 0 && candidates.files.length > 0 && (
        <div className={styles.field}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className={styles.subtitle}>{t("prompt.candidates")}</span>
            <HelpHint label={`${t("common.help")}: ${t("prompt.candidates")}`} text={`${t("prompt.pickHint")}\n\n${t("prompt.transparentHint")}`} />
          </div>
          <div className={styles.grid} role="group" aria-label={t("prompt.candidates")}>
            {candidates.files.map((file, index) => (
              <Candidate key={file.path} candidates={candidates} file={file} index={index} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function reuse(entry: PromptEntry) {
  const project = useProjectStore.getState();
  project.setPrompt(entry.text);
  project.setImageEngine({ id: entry.engineId, parameters: { ...entry.params } });
  if (entry.engineId === "sdxl-lightning" && typeof entry.params.stylePrompt === "string") {
    useSettingsStore.getState().setSdxlStyle(entry.params.stylePrompt);
  }
}

export function PromptHistory() {
  const { t, i18n } = useTranslation();
  const prompts = useProjectStore((s) => s.prompts);
  const engines = useJobsStore((s) => s.engines);
  const names = useMemo(() => new Map(engines.map((e) => [e.id, e.name])), [engines]);
  const date = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }), [i18n.language]);

  if (prompts.length === 0) return <p className={styles.hint}>{t("prompt.historyEmpty")}</p>;

  return (
    <ul className={styles.history}>
      {prompts.map((entry) => {
        const details = [
          typeof entry.params.seed === "number" ? t("prompt.seed", { seed: entry.params.seed }) : null,
          typeof entry.params.count === "number" ? t("prompt.images", { count: entry.params.count }) : null,
          names.get(entry.engineId) ?? entry.engineId,
          date.format(new Date(entry.createdAt)),
        ].filter(Boolean);
        return (
          <li key={entry.id} className={styles.entry}>
            <div className={styles.entryText}>
              <span className={styles.promptText}>{entry.text}</span>
              <span className={styles.hint}>{details.join(" · ")}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("prompt.reuseLabel", { text: entry.text.slice(0, 60) })}
              title={t("prompt.reuse")}
              onClick={() => reuse(entry)}
            >
              <Icon icon={RotateCcw} size={14} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
